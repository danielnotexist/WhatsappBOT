import { INTERNAL_SIGNATURE_HEADER, verifyInternal } from "./local";
import { QSTASH_SIGNATURE_HEADER, verifyQStashSignature } from "./qstash";

/**
 * Who may deliver a queued job to an internal route (/api/wa/worker, /api/jobs/run):
 *   - QStash configured (QSTASH_CURRENT_SIGNING_KEY) → the Upstash-Signature JWT must verify for this URL + body;
 *   - otherwise (the local queue) → the x-internal-signature HMAC over time + path + body, within 5 minutes.
 * Returns a 401 response to send back, or null when the delivery is genuine.
 */
export function rejectUnverifiedDelivery(request: Request, raw: string, path: string): Response | null {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  if (currentKey) {
    const url = new URL(path, process.env.APP_URL || request.url).toString();
    const v = verifyQStashSignature(request.headers.get(QSTASH_SIGNATURE_HEADER), raw, url, { current: currentKey, next: process.env.QSTASH_NEXT_SIGNING_KEY?.trim() });
    return v.ok ? null : new Response(`invalid signature: ${v.reason}`, { status: 401 });
  }
  if (!verifyInternal(request.headers.get(INTERNAL_SIGNATURE_HEADER), new URL(request.url).pathname, raw)) {
    return new Response("invalid internal signature", { status: 401 });
  }
  return null;
}
