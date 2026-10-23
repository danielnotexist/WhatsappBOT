/**
 * A browser's POST must come from this site: an Origin header, when present, has to be this host (the request's own,
 * the Host header, or APP_URL's). No Origin (a same-origin GET-style client, curl) passes — the session cookie is
 * SameSite=Lax, and routes without a session add their own limits. Shared by app/api/demo/chat and app/api/support/*.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return host === new URL(request.url).host || host === request.headers.get("host") || (Boolean(process.env.APP_URL) && host === new URL(process.env.APP_URL!).host);
  } catch {
    return false;
  }
}
