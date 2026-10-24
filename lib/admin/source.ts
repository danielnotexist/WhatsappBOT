import type { SignupSource } from "@/lib/db/types";

/**
 * Where a visitor came from (round plan: the admin panel's "מקור הרשמה"). proxy.ts writes the alze_src cookie on the
 * first page load that has none — the UTM parameters, the referring site, the landing page and the time — and the
 * sign-in (lib/auth/otp.ts) copies it to a user created from that browser. First touch only: a later visit with other
 * parameters never overwrites it. Dependency-free: proxy.ts imports it.
 */
export const SOURCE_COOKIE = "alze_src";
export const SOURCE_MAX_AGE = 90 * 24 * 3600;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const KEYS = new Set<string>([...UTM_KEYS, "ref", "landing", "at"]);
const MAX_VALUE = 120;

const clean = (v: string | null | undefined): string | undefined => {
  if (typeof v !== "string") return undefined;
  // printable text only, one line, capped
  const t = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_VALUE);
  return t || undefined;
};

/** The source of this page load. `ownHosts`: this site's hosts (a referrer from them is not a source). */
export function sourceFromVisit(url: URL, referer: string | null, ownHosts: readonly string[], now: Date = new Date()): SignupSource {
  const out: SignupSource = {};
  for (const k of UTM_KEYS) {
    const v = clean(url.searchParams.get(k));
    if (v) out[k] = v;
  }
  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (host && !ownHosts.includes(host)) out.ref = clean(host);
    } catch {
      // not a URL: no referrer
    }
  }
  out.landing = clean(url.pathname) ?? "/";
  out.at = now.toISOString();
  return out;
}

export function encodeSource(source: SignupSource): string {
  return Buffer.from(JSON.stringify(source), "utf8").toString("base64url");
}

/** The cookie's value back as a source, or null when it is missing or not ours (only known keys, short strings). */
export function decodeSource(value: string | null | undefined): SignupSource | null {
  if (!value || value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!KEYS.has(k) || typeof v !== "string") continue;
      const c = clean(v);
      if (c) out[k] = c;
    }
    return Object.keys(out).length ? (out as SignupSource) : null;
  } catch {
    return null;
  }
}

/** The source from a Cookie request header (route handlers, the OTP verify). */
export function sourceFromCookieHeader(header: string | null | undefined): SignupSource | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SOURCE_COOKIE) return decodeSource(decodeURIComponent(part.slice(i + 1).trim()));
  }
  return null;
}

/** A short Hebrew-friendly label of a source for the panel: the utm source, else the referring site, else "ישיר". */
export function sourceLabel(source: SignupSource | null | undefined): string {
  if (!source) return "לא ידוע";
  return source.utm_source ?? source.ref ?? "ישיר";
}
