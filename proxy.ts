import { NextResponse } from "next/server";

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

export function proxy() {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // הכול חוץ מנכסים סטטיים (כדי לא להעמיס על קבצי CSS/JS/תמונות)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
