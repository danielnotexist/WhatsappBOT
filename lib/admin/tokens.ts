import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";

/**
 * The admin panel's own cookies (/admin, lib/admin/auth.ts). Stateless and signed with the "admin" sub-key of
 * TOKEN_ENC_KEY, each bound to the signed-in user's id, all `path=/admin`, httpOnly, SameSite=Strict:
 *   - wb_admin_gate — the owner was recognised by email (GET /admin/enter). Lets proxy.ts show /admin at all;
 *                     everyone else gets a real 404 there. 12 hours.
 *   - wb_admin_code — a one-time code was mailed to the owner: the code's MAC, so only this browser can use it. 10 minutes.
 *   - wb_admin      — the code was right: the panel is open. 12 hours.
 * The demo's sign-in code (123456, lib/demo.ts) signs anyone in as any email, so the email alone never opens the panel.
 * Dependency-light on purpose: proxy.ts imports it.
 */
export const ADMIN_COOKIE = "wb_admin";
export const ADMIN_GATE_COOKIE = "wb_admin_gate";
export const ADMIN_CODE_COOKIE = "wb_admin_code";
export const ADMIN_TTL_SECONDS = 12 * 3600;
export const ADMIN_CODE_TTL_SECONDS = 10 * 60;
export const ADMIN_PATH = "/admin";
/** the route that recognises the owner and sets the gate cookie (exempt from the proxy gate) */
export const ADMIN_ENTER_PATH = "/admin/enter";

type Kind = "a" | "g" | "c";
const NO_EXTRA = "-";

function mac(key: Buffer, data: string): string {
  return hmac(key, data).toString("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function create(kind: Kind, userId: string, ttlSeconds: number, extra: string, opts: { key?: Buffer; now?: Date }): string {
  const key = opts.key ?? derivedKey("admin");
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + ttlSeconds;
  const payload = `${kind}1.${userId}.${exp}.${extra}`;
  return `${payload}.${mac(key, payload)}`;
}

function verify(kind: Kind, token: string | undefined | null, userId: string, opts: { key?: Buffer; now?: Date }): { exp: number; extra: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== `${kind}1`) return null;
  const [, id, expStr, extra, sig] = parts as [string, string, string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{1,12}$/.test(expStr) || !/^[A-Za-z0-9_-]{1,64}$/.test(extra)) return null;
  const key = opts.key ?? derivedKey("admin");
  if (!same(mac(key, parts.slice(0, 4).join(".")), sig)) return null;
  if (id !== userId) return null;
  const exp = Number(expStr);
  if (exp * 1000 <= (opts.now ?? new Date()).getTime()) return null;
  return { exp, extra };
}

/** The panel is open for this user (wb_admin). */
export function createAdminToken(userId: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number } = {}): string {
  return create("a", userId, opts.ttlSeconds ?? ADMIN_TTL_SECONDS, NO_EXTRA, opts);
}

export function verifyAdminToken(token: string | undefined | null, userId: string, opts: { key?: Buffer; now?: Date } = {}): boolean {
  return verify("a", token, userId, opts) !== null;
}

/** The owner was recognised (wb_admin_gate). */
export function createGateToken(userId: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number } = {}): string {
  return create("g", userId, opts.ttlSeconds ?? ADMIN_TTL_SECONDS, NO_EXTRA, opts);
}

export function verifyGateToken(token: string | undefined | null, userId: string, opts: { key?: Buffer; now?: Date } = {}): boolean {
  return verify("g", token, userId, opts) !== null;
}

function codeMac(key: Buffer, userId: string, exp: number, code: string): string {
  return mac(key, `code:${userId}:${exp}:${code}`).slice(0, 43);
}

/** A mailed code's challenge (wb_admin_code): the code itself is never in it, only its MAC. */
export function createCodeToken(userId: string, code: string, opts: { key?: Buffer; now?: Date; ttlSeconds?: number } = {}): string {
  const key = opts.key ?? derivedKey("admin");
  const exp = Math.floor((opts.now ?? new Date()).getTime() / 1000) + (opts.ttlSeconds ?? ADMIN_CODE_TTL_SECONDS);
  const payload = `c1.${userId}.${exp}.${codeMac(key, userId, exp, code)}`;
  return `${payload}.${mac(key, payload)}`;
}

/** The challenge is genuine, this user's and not expired: `matches(code)` checks a typed code against it. */
export function readCodeToken(token: string | undefined | null, userId: string, opts: { key?: Buffer; now?: Date } = {}): { exp: number; matches: (code: string) => boolean } | null {
  const v = verify("c", token, userId, opts);
  if (!v) return null;
  const key = opts.key ?? derivedKey("admin");
  return { exp: v.exp, matches: (code: string) => same(codeMac(key, userId, v.exp, code), v.extra) };
}

/** Cookie attributes of all three: the panel's path only, never sent anywhere else. */
export function adminCookieOptions(maxAge: number, secure: boolean = process.env.NODE_ENV === "production") {
  return { httpOnly: true, sameSite: "strict" as const, secure, path: ADMIN_PATH, maxAge };
}

/** /admin and everything under it, except the enter route. */
export function isGatedAdminPath(pathname: string): boolean {
  if (pathname !== ADMIN_PATH && !pathname.startsWith(`${ADMIN_PATH}/`)) return false;
  return pathname !== ADMIN_ENTER_PATH;
}
