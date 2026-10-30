import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { derivedKey, hmac, signedTokenParts } from "@/lib/auth/keys";
import type { Db } from "@/lib/db/types";

/**
 * Connect links sent in chat: /api/auth/{microsoft|google}/start?t=<token> (PLAN §1 "חיבור מהשיחה").
 * The token is signed (HMAC, session sub-key) and carries the user id, the provider, the expiry, its purpose and a
 * random nonce:
 *  - `user`  — the user's own consent: 30 minutes and single use (the nonce is burned at the start route, 0021
 *              connect_link_consume). The start route binds the flow to the browser that opened it (lib/auth/connect-cookie.ts).
 *  - `admin` — Microsoft's tenant-wide admin consent, forwarded to the IT admin: it connects no mailbox, so it may be
 *              opened more than once within its 3 days, and it is refused for anything but `admin=1`.
 */
export const CONNECT_LINK_TTL_SECONDS = 30 * 60;
export const ADMIN_CONNECT_LINK_TTL_SECONDS = 3 * 24 * 3600;

export type ConnectLinkProvider = "microsoft" | "google";
export type ConnectLinkPurpose = "user" | "admin";

export interface ConnectLink {
  userId: string;
  provider: ConnectLinkProvider;
  purpose: ConnectLinkPurpose;
  nonce: string;
  /** unix seconds */
  exp: number;
}

export function createConnectLinkToken(userId: string, provider: ConnectLinkProvider, opts: { key?: Buffer; now?: Date; purpose?: ConnectLinkPurpose } = {}): string {
  const key = opts.key ?? derivedKey("session");
  const purpose = opts.purpose ?? "user";
  if (purpose === "admin" && provider !== "microsoft") throw new Error("admin connect links are Microsoft only");
  const ttl = purpose === "admin" ? ADMIN_CONNECT_LINK_TTL_SECONDS : CONNECT_LINK_TTL_SECONDS;
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + ttl;
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(`${userId}.${provider}.${exp}.${purpose}.${nonce}`).toString("base64url");
  return `${payload}.${hmac(key, `connect:${payload}`).toString("base64url")}`;
}

/** Signature, shape and expiry only — nothing consumed (the start route burns a `user` link with consumeConnectLink). */
export function verifyConnectLinkToken(token: string | null | undefined, opts: { key?: Buffer; now?: Date } = {}): ConnectLink | null {
  const parts = signedTokenParts(token);
  if (!parts) return null;
  const { payload, sig } = parts;
  const key = opts.key ?? derivedKey("session");
  const expected = hmac(key, `connect:${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const m = Buffer.from(payload, "base64url").toString("utf8").match(/^([0-9a-f-]{36})\.(microsoft|google)\.(\d+)\.(user|admin)\.([A-Za-z0-9_-]{16,})$/);
  if (!m || Number(m[3]) * 1000 <= (opts.now ?? new Date()).getTime()) return null;
  if (m[4] === "admin" && m[2] !== "microsoft") return null;
  return { userId: m[1]!, provider: m[2] as ConnectLinkProvider, exp: Number(m[3]), purpose: m[4] as ConnectLinkPurpose, nonce: m[5]! };
}

/** Burns a `user` link: true only the first time (an `admin` link is not single use and always passes). */
export async function consumeConnectLink(db: Db, link: ConnectLink): Promise<boolean> {
  if (link.purpose !== "user") return true;
  return db.consumeConnectLink(createHash("sha256").update(link.nonce).digest("base64url"), link.userId, new Date(link.exp * 1000));
}
