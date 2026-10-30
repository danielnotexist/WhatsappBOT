/**
 * The site's security headers — one source for both places that set them:
 *  - proxy.ts sets them on every response it handles (pages, routes, and any dynamic path, even one ending in .png);
 *  - next.config.ts headers() sets the same values for every path as a backup, so a response the proxy never saw
 *    (a matcher gap, a static file) still carries them.
 * No `@/` imports here: next.config.ts loads this file directly.
 *
 * CSP — why Report-Only (checked against Next 16's guide, node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md):
 * an enforcing CSP without 'unsafe-inline' needs a per-request nonce, and Next applies nonces only during dynamic
 * rendering. This app runs with `cacheComponents` (Partial Prerendering): every page has a static shell built ahead of
 * time whose inline bootstrap scripts can never carry a per-request nonce — the guide states that PPR is incompatible
 * with nonce-based CSP. Enforcing would mean either dropping cacheComponents (every page fully dynamic, no CDN shell)
 * or keeping 'unsafe-inline' (which makes the script policy meaningless). So the policy stays Report-Only, tightened,
 * with reports collected at /api/csp-report; the path to enforcement is hash-based CSP (Next's experimental SRI)
 * once it covers PPR shells.
 */

export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting API group name (`report-to`), declared in the Reporting-Endpoints header. */
export const CSP_REPORT_GROUP = "csp";

export function cspReportOnly(production: boolean): string {
  return [
    "default-src 'self'",
    // 'unsafe-inline' — see above (no nonces under PPR); 'unsafe-eval' only in dev (HMR / React DevTools)
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // every image is ours (public/, the /_next/image optimizer, generated QR codes as data:)
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // the browser talks to no database directly (the Supabase key is server-only)
    "connect-src 'self' https://pay.hyp.co.il",
    // the HYP payment page (if opened in an iframe) — PLAN §4
    "frame-src https://pay.hyp.co.il",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://pay.hyp.co.il https://login.microsoftonline.com https://accounts.google.com",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ");
}

export function securityHeaders(production: boolean): Readonly<Record<string, string>> {
  return {
    "Content-Security-Policy-Report-Only": cspReportOnly(production),
    "Reporting-Endpoints": `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    ...(production ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" } : {}),
  };
}

/**
 * The website chat (/demo/chat) records voice messages: the microphone is allowed for this site on that page only —
 * everywhere else it stays off, like the camera.
 */
export const MIC_PAGES: readonly string[] = ["/demo/chat"];

export function permissionsPolicyWithMic(production: boolean): string {
  return securityHeaders(production)["Permissions-Policy"]!.replace("microphone=()", "microphone=(self)");
}

/** next.config.ts headers(): the same headers on every path (the last matching entry wins, so the mic pages follow). */
export function configHeaders(production: boolean): { source: string; headers: { key: string; value: string }[] }[] {
  const all = Object.entries(securityHeaders(production)).map(([key, value]) => ({ key, value }));
  return [
    { source: "/:path*", headers: all },
    ...MIC_PAGES.map((source) => ({ source, headers: [{ key: "Permissions-Policy", value: permissionsPolicyWithMic(production) }] })),
  ];
}
