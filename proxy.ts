import { NextResponse, type NextRequest } from "next/server";
import { SOURCE_COOKIE, SOURCE_MAX_AGE, encodeSource, sourceFromVisit } from "@/lib/admin/source";
import { ADMIN_COOKIE, ADMIN_GATE_COOKIE, isGatedAdminPath, verifyAdminToken, verifyGateToken } from "@/lib/admin/tokens";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { DEMO_COPY, isDemo, webChatFlag } from "@/lib/demo";
import { unknownProfessionPath } from "@/lib/seo/professions";
import { isPrivatePath, onVercelAppHost } from "@/lib/seo/site";

/**
 * proxy.ts — כותרות אבטחה לכל תשובה (ב-Next 16 הקובץ `middleware.ts` הוחלף ב-`proxy.ts`; אותה פונקציונליות).
 *
 * CSP מופעל כרגע במצב Report-Only בלבד: הדפדפן מדווח ל-console על הפרות אבל לא חוסם.
 * לפני השקה (אבן דרך 7): לעבור ל-`Content-Security-Policy` עם nonce (ראו docs/ של Next → "Content Security Policy")
 * ולהוסיף `report-to` לנקודת קצה שאוספת דיווחים.
 */

const isProduction = process.env.NODE_ENV === "production";

export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline' נדרש כל עוד אין nonce; 'unsafe-eval' רק ב-dev (HMR / React DevTools)
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://pay.hyp.co.il",
  // דף התשלום של HYP (אם ייפתח ב-iframe) — PLAN §4
  "frame-src https://pay.hyp.co.il",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://pay.hyp.co.il https://login.microsoftonline.com https://accounts.google.com",
  "object-src 'none'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy-Report-Only": CSP_REPORT_ONLY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
  ...(isProduction
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
    : {}),
};

/**
 * The website chat (/demo/chat, DEMO_MODE only) records voice messages: the microphone is allowed for this site on that
 * page only — everywhere else it stays off, like the camera.
 */
export const MIC_PAGES: ReadonlySet<string> = new Set(["/demo/chat"]);
export const PERMISSIONS_POLICY_WITH_MIC = SECURITY_HEADERS["Permissions-Policy"]!.replace("microphone=()", "microphone=(self)");

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
  // הכול חוץ מנכסים סטטיים (כדי לא להעמיס על קבצי CSS/JS/תמונות)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
