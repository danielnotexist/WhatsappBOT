import { connection, NextResponse } from "next/server";
import { trackVisitorEvent } from "@/lib/analytics/track";
import { getDb } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { normalizeReferralCode } from "@/lib/referrals/code";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from "@/lib/referrals/constants";

const isProduction = process.env.NODE_ENV === "production";

/**
 * /r/<code> — a friend's personal "חבר מביא חבר" link (lib/referrals). Keeps the code in a first-party cookie
 * (alze_ref: 30 days, httpOnly, SameSite=Lax) for the sign-up of this browser (lib/auth/otp.ts signIn attaches it to a
 * new user), records a `referral_visit` (lib/analytics — the anonymous daily id, nothing about the person) and sends
 * the visitor to the home page with any utm_* of the link. An unknown or malformed code still lands on the home page,
 * just without the cookie. Never a page of its own (robots: /r is private, lib/seo/site.ts).
 */
export async function GET(request: Request, ctx: RouteContext<"/r/[code]">) {
  await connection();
  const { code: raw } = await ctx.params;
  const url = new URL(request.url);
  const dest = new URL("/", process.env.APP_URL || url.origin);
  for (const [k, v] of url.searchParams) if (/^utm_[a-z]{1,10}$/.test(k) && v) dest.searchParams.set(k, v.slice(0, 120));
  const response = NextResponse.redirect(dest, 302);
  response.headers.set("cache-control", "no-store");

  const code = normalizeReferralCode(raw);
  if (!code) return response;
  const db = getDb();
  let known = true;
  try {
    known = Boolean(await db.findReferralCode(code));
  } catch (e) {
    // the database is down: keep the code anyway — the sign-up checks it again
    console.warn("[referrals] code not checked:", (e as Error).message);
  }
  if (!known) return response;
  response.cookies.set(REFERRAL_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge: REFERRAL_COOKIE_MAX_AGE });
  try {
    trackVisitorEvent(db, "referral_visit", {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
      headers: request.headers,
      path: "/r",
      referrer: request.headers.get("referer"),
      utm: { utm_source: url.searchParams.get("utm_source"), utm_medium: url.searchParams.get("utm_medium"), utm_campaign: url.searchParams.get("utm_campaign") },
    });
  } catch (e) {
    // the count is best effort: the visitor still lands with the cookie
    console.warn("[referrals] visit not counted:", (e as Error).message);
  }
  return response;
}
