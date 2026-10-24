/**
 * Runs once when a server instance starts, before it answers anything (Next.js instrumentation).
 * DEMO_MODE=1 next to outbound keys, or without a stable TOKEN_ENC_KEY, refuses to start with a Hebrew message
 * naming the variables (lib/demo.ts). The same check also runs on every `isDemo()`, so nothing slips past it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertDemoSafe, isDemo } = await import("./lib/demo");
  assertDemoSafe();
  if (!isDemo()) return;
  const { liveAiInDemo } = await import("./lib/env");
  console.info(
    liveAiInDemo()
      ? "[demo] DEMO_MODE=1 + LIVE_AI=1 — מצב הדגמה עם AI ותמלול אמיתיים (תחת תקרה יומית). שאר האינטגרציות מדומות, שום דבר לא נשלח החוצה."
      : "[demo] DEMO_MODE=1 — מצב הדגמה: כל האינטגרציות מדומות, שום דבר לא נשלח החוצה.",
  );
}

/**
 * Every server error Next.js catches (a page, a route handler, a server action, the proxy) → the central error log
 * (lib/errors/report.ts: scrubbed of secrets, cut short; the admin panel's "תקלות"). The path is recorded without its
 * query string, which may carry a token. Node.js runtime only; never throws.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportError } = await import("./lib/errors/report");
    const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
    // notFound() / redirect() travel as errors: they are answers, not faults
    if (digest && /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|BAILOUT_TO_CLIENT_SIDE_RENDERING|DYNAMIC_SERVER_USAGE)/.test(digest)) return;
    await reportError(`request.${context.routeType ?? "unknown"}`, error, {
      context: { path: request.path.split("?")[0], method: request.method, route: context.routePath, digest },
    });
  } catch {
    // the log is best effort
  }
}
