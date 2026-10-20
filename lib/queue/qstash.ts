import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Queue, QueueJob } from "./types";

export const QSTASH_PUBLISH_BASE = "https://qstash.upstash.io/v2/publish";
export const QSTASH_SIGNATURE_HEADER = "upstash-signature";

/** Publishes jobs to Upstash QStash, which POSTs them to our worker with retries and a signature. */
export class QStashQueue implements Queue {
  readonly kind = "qstash" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly token: string, fetchImpl?: typeof fetch, private readonly base = QSTASH_PUBLISH_BASE) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async enqueue(job: QueueJob): Promise<{ id: string }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Upstash-Retries": String(job.retries ?? 3),
      "Upstash-Method": "POST",
    };
    if (job.dedupeId) headers["Upstash-Deduplication-Id"] = job.dedupeId;
    if (job.delaySeconds) headers["Upstash-Delay"] = `${job.delaySeconds}s`;
    const res = await this.fetchImpl(`${this.base}/${job.url}`, { method: "POST", headers, body: JSON.stringify(job.body) });
    if (!res.ok) throw new Error(`QStash publish failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const json = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { id: json.messageId ?? "" };
  }
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

/**
 * Verifies the `Upstash-Signature` JWT (HS256) that QStash sends with every delivery:
 * iss = "Upstash", sub = our URL, exp/nbf, and `body` = base64url(sha256(raw body)).
 * Accepts either the current or the next signing key (key rotation).
 */
export function verifyQStashSignature(
  signature: string | null | undefined,
  rawBody: string | Uint8Array,
  url: string,
  keys: { current: string; next?: string },
  now: number = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!signature) return { ok: false, reason: "missing signature" };
  const parts = signature.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed jwt" };
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: string };
  let payload: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed jwt" };
  }
  if (header.alg !== "HS256") return { ok: false, reason: "unexpected alg" };

  const signingInput = `${h}.${p}`;
  const given = Buffer.from(s, "base64url");
  const matches = [keys.current, keys.next].filter((k): k is string => Boolean(k)).some((k) => {
    const expected = createHmac("sha256", k).update(signingInput).digest();
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!matches) return { ok: false, reason: "bad signature" };

  if (payload.iss !== "Upstash") return { ok: false, reason: "bad issuer" };
  if (payload.sub !== url) return { ok: false, reason: "url mismatch" };
  if (typeof payload.exp === "number" && payload.exp < now) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now) return { ok: false, reason: "not yet valid" };
  const bodyHash = b64url(createHash("sha256").update(rawBody).digest());
  // QStash may encode the body hash with or without padding
  const normalize = (x: string) => x.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (!payload.body || normalize(payload.body) !== normalize(bodyHash)) return { ok: false, reason: "body hash mismatch" };
  return { ok: true };
}

/** Test helper / local tooling: builds a QStash-style JWT for a body. */
export function signQStashJwt(rawBody: string, url: string, key: string, opts: { exp?: number; nbf?: number; iss?: string } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: opts.iss ?? "Upstash",
      sub: url,
      exp: opts.exp ?? now + 300,
      nbf: opts.nbf ?? now - 5,
      iat: now,
      jti: "test",
      body: b64url(createHash("sha256").update(rawBody).digest()),
    }),
  );
  const sig = b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
