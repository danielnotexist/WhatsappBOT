import { NextResponse, type NextRequest } from "next/server";
import { SOURCE_COOKIE, SOURCE_MAX_AGE, encodeSource, sourceFromVisit } from "@/lib/admin/source";
import { ADMIN_COOKIE, ADMIN_GATE_COOKIE, isGatedAdminPath, verifyAdminToken, verifyGateToken } from "@/lib/admin/tokens";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { DEMO_COPY, isDemo, webChatFlag } from "@/lib/demo";
import { unknownProfessionPath } from "@/lib/seo/professions";
import { isPrivatePath, onVercelAppHost } from "@/lib/seo/site";
import { MIC_PAGES as MIC_PAGE_LIST, cspReportOnly, permissionsPolicyWithMic, securityHeaders } from "@/lib/security-headers";

/**
 * proxy.ts — כותרות אבטחה לכל תשובה (ב-Next 16 הקובץ `middleware.ts` הוחלף ב-`proxy.ts`; אותה פונקציונליות).
 * The values live in lib/security-headers.ts; next.config.ts headers() sets the same ones as a backup. CSP is
 * Report-Only (reports to /api/csp-report) — why it cannot be enforced with nonces under cacheComponents is written
 * there.
 */

const isProduction = process.env.NODE_ENV === "production";

export const CSP_REPORT_ONLY = cspReportOnly(isProduction);
export const SECURITY_HEADERS: Readonly<Record<string, string>> = securityHeaders(isProduction);

export const MIC_PAGES: ReadonlySet<string> = new Set(MIC_PAGE_LIST);
export const PERMISSIONS_POLICY_WITH_MIC = permissionsPolicyWithMic(isProduction);

/**
 * The code cards are static pages that read the address from the URL on the client; with no `?email=` there is nothing
 * to verify, so a page load goes back to the matching email card here — the server's HTML is right with or without JS
 * (the card does the same on the client, as a fallback).
 */
const CODE_CARD_HOME: Readonly<Record<string, string>> = { "/start/code": "/start/email", "/login/code": "/login/email" };

/**
 * Only a page load (a document navigation, or a client that does not say) is sent back. The router's own requests —
 * prefetches of the code card ahead of the address, client navigations — are fetches (`Sec-Fetch-Mode: cors`): a
 * redirect there would teach the router that the code card leads to the email card.
 */
export function codeCardWithoutEmail(request: NextRequest): string | null {
  const home = CODE_CARD_HOME[request.nextUrl.pathname];
  if (!home || request.nextUrl.searchParams.get("email")) return null;
  const mode = request.headers.get("sec-fetch-mode");
  return mode === null || mode === "navigate" ? home : null;
}

/**
 * The website chat exists only in DEMO_MODE (or with WEB_CHAT=1 outside it) and only for a signed-in visitor: otherwise
 * a real 404 here, before the page starts streaming (a notFound() inside the page's Suspense would keep a 200). The page
 * checks again on its own.
 */
export function demoChatHidden(request: NextRequest): boolean {
  if (request.nextUrl.pathname !== "/demo/chat") return false;
  return !(isDemo() || webChatFlag()) || verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value) === null;
}

/**
 * The admin panel (/admin, lib/admin) exists only for the owner: without a valid session and the panel's gate cookie
 * of that same user (set by GET /admin/enter after the email check) or its open-panel cookie, a real 404 here — before
 * the page streams. The page and every action check the owner again in full (lib/admin/auth.ts requireOwner).
 */
export function adminHidden(request: NextRequest): boolean {
  if (!isGatedAdminPath(request.nextUrl.pathname)) return false;
  try {
    const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return true;
    return !verifyGateToken(request.cookies.get(ADMIN_GATE_COOKIE)?.value, session.userId) && !verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value, session.userId);
  } catch {
    return true; // no key to check with: nothing to show
  }
}

/** Paths that never carry a visit's source (the app's own machinery and the panel). */
const NO_SOURCE = /^\/(api|admin|_next|demo|invoice|pay\/card)(\/|$)/;

/**
 * The first page load of a browser without the alze_src cookie (lib/admin/source.ts): where it came from. A document
 * navigation only — never the router's own fetches or prefetches. null when there is nothing to record.
 */
export function visitSource(request: NextRequest): string | null {
  if (request.method !== "GET" || request.cookies.has(SOURCE_COOKIE) || NO_SOURCE.test(request.nextUrl.pathname)) return null;
  const mode = request.headers.get("sec-fetch-mode");
  const dest = request.headers.get("sec-fetch-dest");
  if ((mode !== null && mode !== "navigate") || (dest !== null && dest !== "document") || request.headers.has("next-router-prefetch") || request.headers.has("rsc")) return null;
  const own = [request.nextUrl.hostname.toLowerCase()];
  try {
    if (process.env.APP_URL) own.push(new URL(process.env.APP_URL).hostname.toLowerCase());
  } catch {
    // a bad APP_URL is reported elsewhere
  }
  return encodeSource(sourceFromVisit(request.nextUrl, request.headers.get("referer"), own));
}

export function proxy(request: NextRequest) {
  const home = codeCardWithoutEmail(request);
  const response = home
    ? NextResponse.redirect(new URL(home, request.url))
    : demoChatHidden(request) || adminHidden(request) || unknownProfessionPath(request.nextUrl.pathname)
      ? NextResponse.rewrite(new URL("/_demo-chat-unavailable", request.url)) // no such page → the site's 404
      : NextResponse.next();
  const source = home ? null : visitSource(request);
  if (source) response.cookies.set(SOURCE_COOKIE, source, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge: SOURCE_MAX_AGE });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  if (MIC_PAGES.has(request.nextUrl.pathname)) response.headers.set("Permissions-Policy", PERMISSIONS_POLICY_WITH_MIC);
  // מצב הדגמה (lib/demo.ts): לא לאינדוקס בשום מנוע חיפוש — נבדק בכל בקשה, גם אם ה-build נעשה בלי DEMO_MODE
  // and the private pages (the panel, the personal area, payment, invoice and sign-in links — lib/seo/site.ts), always;
  // and every page while the site answers on Vercel's own *.vercel.app address (lib/seo/site.ts onVercelAppHost)
  if (isDemo() || onVercelAppHost() || isPrivatePath(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", DEMO_COPY.robots);
  return response;
}

export const config = {
  // Everything except Next's own build output and the real files in public/ (brand/) and the app's metadata files.
  // Never "any path ending in .png": a dynamic route such as /pay/<token>.png must still get the headers and gates.
  matcher: [
    "/((?!_next/static/|_next/image(?:/|$)|brand/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|icon\\.png$|apple-icon\\.png$).*)",
  ],
};
