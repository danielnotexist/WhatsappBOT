import { DownloadTooLargeError, readCapped } from "@/lib/http/capped-body";
import { clientIp, getRateLimiter } from "@/lib/rate-limit";

/**
 * POST /api/csp-report — where browsers send Content-Security-Policy-Report-Only violations (lib/security-headers.ts:
 * `report-uri` with application/csp-report, `report-to` with application/reports+json). It only logs a short,
 * redacted line: no database, no mail. Limited per IP and per instance; the body is capped; the answer is always 204.
 * URLs are cut to their origin and first path segment — a document URL can carry a bearer token (/pay/<token>,
 * /invoice/<token>, /login/w/<token>) and must never reach the logs.
 */

export const CSP_REPORT_LIMIT = { perIp: 20, global: 300, windowMs: 60_000 } as const;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS = 5;

const empty = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/** "https://example.com/pay/abc?x=1" → "https://example.com/pay/…"; keywords such as "inline" stay as they are. */
export function redactUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    const first = url.pathname.split("/").filter(Boolean)[0];
    const more = url.pathname.split("/").filter(Boolean).length > 1 || url.search ? "/…" : "";
    return `${url.origin}${first ? `/${first.slice(0, 40)}` : "/"}${more}`;
  } catch {
    return value.replace(/[^\w:.' -]/g, "").slice(0, 40);
  }
}

function clip(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^\w:.' -]/g, "").slice(0, 80) : "";
}

/** The violations in either format, as short log lines. */
export function summarizeReports(body: unknown): string[] {
  const list: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const item of body.slice(0, MAX_REPORTS)) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
        const b = (item as { body?: unknown }).body;
        if (b && typeof b === "object") list.push(b as Record<string, unknown>);
      }
    }
    return list.map((r) => `${clip(r.effectiveDirective)} blocked=${redactUrl(r.blockedURL)} page=${redactUrl(r.documentURL)}`);
  }
  const legacy = body && typeof body === "object" ? (body as { "csp-report"?: unknown })["csp-report"] : undefined;
  if (legacy && typeof legacy === "object") {
    const r = legacy as Record<string, unknown>;
    return [`${clip(r["effective-directive"] ?? r["violated-directive"])} blocked=${redactUrl(r["blocked-uri"])} page=${redactUrl(r["document-uri"])}`];
  }
  return [];
}

export async function POST(request: Request): Promise<Response> {
  const limiter = getRateLimiter();
  if (!limiter.hit(`csp-report:${clientIp(request.headers)}`, CSP_REPORT_LIMIT.perIp, CSP_REPORT_LIMIT.windowMs)) return empty(429);
  if (!limiter.hit("csp-report:all", CSP_REPORT_LIMIT.global, CSP_REPORT_LIMIT.windowMs)) return empty(429);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return empty(413);
  let body: unknown;
  try {
    // read in chunks and stopped past the cap: a chunked upload has no Content-Length to refuse up front
    body = JSON.parse(new TextDecoder().decode(await readCapped(request as unknown as Response, MAX_BODY_BYTES)));
  } catch (e) {
    return empty(e instanceof DownloadTooLargeError ? 413 : 400);
  }
  for (const line of summarizeReports(body)) console.warn(`[csp] ${line}`);
  return empty(204);
}
