import "server-only";
import { createHash, hkdfSync } from "node:crypto";
import { derivedKey } from "@/lib/auth/keys";
import { dateKey, localDateOf } from "@/lib/time/zoned";

/**
 * The anonymous daily visitor id (round plan "אנליטיקה ו-SEO"): sha256(daily salt + IP + User-Agent), hex.
 *   - The salt is derived with HKDF from TOKEN_ENC_KEY (lib/auth/keys.ts derivedKey("analytics")) and the day in
 *     Asia/Jerusalem, so it changes every day and is never stored: the same person is a new id tomorrow, and an id
 *     cannot be traced back to an address without the key.
 *   - Neither the IP nor the User-Agent is stored — only this hash and a device class.
 *   - Server-side funnel steps (no browser in the request: the WhatsApp webhook, the OAuth callback, the payment
 *     return) hash the user id the same way, so a step still counts once per person per day.
 */

/** "YYYY-MM-DD" in Asia/Jerusalem — the row's `day` and the salt's day. */
export function analyticsDay(now: Date = new Date()): string {
  return dateKey(localDateOf(now));
}

export function dailySalt(day: string, key: Buffer = derivedKey("analytics")): Buffer {
  return Buffer.from(hkdfSync("sha256", key, "", `whatsappbot:analytics:salt:${day}`, 32));
}

export function visitorId(salt: Buffer, ip: string, userAgent: string): string {
  return createHash("sha256").update(salt).update("\u0000").update(ip).update("\u0000").update(userAgent).digest("hex");
}

/** A server-side step of a signed-in user: the same daily id shape, from the user id instead of the browser. */
export function userVisitorId(salt: Buffer, userId: string): string {
  return createHash("sha256").update(salt).update("\u0000user\u0000").update(userId).digest("hex");
}

/**
 * Crawlers, link previews, monitors and scripts: not visitors. Matched on the User-Agent before anything is stored.
 * (A real browser's UA never carries these words; an empty UA is a script.)
 */
const BOT_UA =
  /bot\b|bot\/|\(compatible;|googleother|mediapartners|crawl|spider|slurp|archiver|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp\/|skypeuripreview|curl\/|wget|python|httpx|aiohttp|go-http|okhttp|java\/|axios|node-fetch|undici|postman|insomnia|monitor|uptime|pingdom|statuscake|datadog|newrelic|vercel-|scan|probe|feedfetcher|google-inspectiontool|chrome-lighthouse|phantomjs|selenium|puppeteer|playwright/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  return s.length < 10 || BOT_UA.test(s);
}
