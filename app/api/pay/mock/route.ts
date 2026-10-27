import { connection } from "next/server";
import { hypMocked } from "@/lib/env";

/** A one-page placeholder PDF for the mock invoice link (ASCII only — no fonts needed). */
function mockInvoicePdf(transId: string): Uint8Array {
  const line = `Mock invoice (HYP PrintHesh stand-in) - transaction ${transId.replace(/[^0-9A-Za-z-]/g, "")}`;
  const stream = `BT /F1 12 Tf 24 70 Td (${line}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length ${stream.length}>>stream`,
    stream,
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

/**
 * DATA_MODE=memory / DEMO_MODE=1 only: stands in for HYP's hosted payment page. "Pays" immediately and redirects to
 * /api/pay/return with the query HYP would send (Id, CCode, Amount, ACode, Order, Sign) — CCode=600 for a J2 card
 * check (card update). `?invoice=<transId>` stands in for the PrintHesh invoice link (a placeholder PDF).
 */
export async function GET(request: Request) {
  // request-time: otherwise Cache Components prerenders this GET at build (a frozen 404 or a frozen redirect)
  await connection();
  if (!hypMocked()) return new Response("not found", { status: 404 });
  // The server action's redirect() reaches this same-origin URL as a client-side (RSC) navigation, which cannot follow
  // a route handler (the address bar would keep this URL). Answer it with a plain page so the router falls back to a
  // full load — like the real HYP page, which is always a full, cross-origin navigation.
  if (request.headers.get("rsc") === "1") {
    return new Response("", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const invoice = url.searchParams.get("invoice");
  if (invoice) {
    return new Response(mockInvoicePdf(invoice) as unknown as BodyInit, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="invoice-${invoice.replace(/\D/g, "")}.pdf"` } });
  }
  const ret = new URL("/api/pay/return", process.env.APP_URL || url.origin);
  ret.searchParams.set("Id", String(Date.now()).slice(-9));
  ret.searchParams.set("CCode", url.searchParams.get("decline") ? "6" : url.searchParams.get("J5") === "J2" ? "600" : "0");
  ret.searchParams.set("Amount", url.searchParams.get("Amount") ?? "99");
  ret.searchParams.set("ACode", "0001234");
  ret.searchParams.set("Order", url.searchParams.get("Order") ?? "");
  ret.searchParams.set("Sign", "mock");
  return Response.redirect(ret.toString(), 303);
}
