import { connection } from "next/server";
import { getHyp } from "@/lib/hyp";
import type { MockHypGateway } from "@/lib/hyp/client";

/**
 * The mock gateway of a DATA_MODE=memory development server, or null (everywhere else these routes are a 404).
 * Checked by shape, not `instanceof`: the shared singleton may have been created by the page's copy of the module (the
 * dev server bundles route handlers and pages separately), whose class is not this file's.
 */
function devMock(): Pick<MockHypGateway, "calls" | "chargeScript"> | null {
  if (process.env.DATA_MODE !== "memory" || process.env.NODE_ENV === "production") return null;
  const hyp = getHyp() as Partial<MockHypGateway>;
  return Array.isArray(hyp.chargeScript) && Array.isArray(hyp.calls) ? (hyp as MockHypGateway) : null;
}

/** GET /api/dev/hyp — how many token charges the mock gateway has seen (the e2e tests count "exactly one charge"). */
export async function GET() {
  await connection();
  const hyp = devMock();
  if (!hyp) return new Response("not found", { status: 404 });
  const charges = hyp.calls.filter((c) => c.method === "chargeToken");
  const pages = hyp.calls.filter((c) => c.method === "createPaymentPage");
  // the amounts too: the e2e tests check what was charged (a 990 ₪ year, a prorated upgrade), never just that something was
  const lastCharge = (charges.at(-1)?.args as { amount?: number; order?: string } | undefined) ?? null;
  const lastPage = (pages.at(-1)?.args as { Amount?: number; Order?: string } | undefined) ?? null;
  return Response.json(
    { charges: charges.length, queued: hyp.chargeScript.length, lastCharge: lastCharge ? { amount: lastCharge.amount ?? null } : null, lastPage: lastPage ? { amount: lastPage.Amount ?? null, order: lastPage.Order ?? null } : null },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/dev/hyp {"charge": ["4"]} — DATA_MODE=memory development only (404 everywhere else, like /api/dev/outbox):
 * scripts the next token charges of the mock HYP gateway, in order ("0" = approved, any other CCode = declined with it),
 * so the e2e tests can walk the decline path of a one-tap charge (the pay page's upgrade) the way a real card would.
 */
export async function POST(request: Request) {
  await connection();
  const hyp = devMock();
  if (!hyp) return new Response("not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { charge?: unknown } | null;
  const codes = Array.isArray(body?.charge) ? body.charge.filter((c): c is string => typeof c === "string" && /^\d{1,4}$/.test(c)).slice(0, 10) : [];
  hyp.chargeScript.push(...codes);
  return Response.json({ queued: hyp.chargeScript.length }, { headers: { "cache-control": "no-store" } });
}
