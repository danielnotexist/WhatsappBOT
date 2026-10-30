import { timingSafeEqual } from "node:crypto";
import { derivedKey, hmac } from "@/lib/auth/keys";

/**
 * The result line an action or a callback hands to the next page in its address (`?notice=` / `?error=`) — the personal
 * area, /pay/<token>, /start/connect. The text is ours, and so is a signature over it (`fs=`, HMAC with the "internal"
 * sub-key): a page shows the line only when the signature matches, so a crafted link (`/account?error=pay 99 ₪ to…`)
 * cannot put words in our mouth on the real domain. An unsigned or altered line is simply not shown.
 */
export type FlashKind = "notice" | "error";
export const FLASH_SIG_PARAM = "fs";

export function flashSig(kind: FlashKind, text: string, key: Buffer = derivedKey("internal")): string {
  return hmac(key, `flash:${kind}:${text}`).subarray(0, 16).toString("base64url");
}

/**
 * Sets `kind=text` and its signature on the address (and drops the other kind, so only one line travels). With no key
 * to sign with (a misconfigured server) the line travels unsigned — the redirect still happens, the page just omits it.
 */
export function setFlash(params: URLSearchParams, kind: FlashKind, text: string, key?: Buffer): void {
  params.delete(kind === "notice" ? "error" : "notice");
  params.delete(FLASH_SIG_PARAM);
  params.set(kind, text);
  try {
    params.set(FLASH_SIG_PARAM, flashSig(kind, text, key));
  } catch (e) {
    console.warn("[flash] not signed:", (e as Error).message);
  }
}

/** `?kind=text&fs=…` for a path that has no query yet. */
export function flashQuery(kind: FlashKind, text: string, key?: Buffer): string {
  const params = new URLSearchParams();
  setFlash(params, kind, text, key);
  return params.toString();
}

type Search = Record<string, string | string[] | undefined> | URLSearchParams;

/** The signed line of the address, or null (none, unsigned, altered — or no key to check with). Errors first. */
export function readFlash(search: Search, opts: { kinds?: readonly FlashKind[]; key?: Buffer } = {}): { kind: FlashKind; text: string } | null {
  const get = (name: string): string | null => {
    if (search instanceof URLSearchParams) return search.get(name);
    const v = search[name];
    return typeof v === "string" ? v : null;
  };
  const sig = get(FLASH_SIG_PARAM);
  if (!sig) return null;
  for (const kind of opts.kinds ?? (["error", "notice"] as const)) {
    const text = get(kind);
    if (!text) continue;
    try {
      const a = Buffer.from(flashSig(kind, text, opts.key));
      const b = Buffer.from(sig);
      if (a.length === b.length && timingSafeEqual(a, b)) return { kind, text };
    } catch {
      return null;
    }
  }
  return null;
}
