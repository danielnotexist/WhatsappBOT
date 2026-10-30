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

/**
 * For the POSTs that set the session (login CSRF, security round B): a browser request must say it is same-origin —
 * `Sec-Fetch-Site`, when sent, is same-origin (or none: typed by the user), and `Origin`, when sent, is this host —
 * and the body must be JSON (a cross-site HTML form can only send form / text/plain bodies, and a cross-site fetch
 * with application/json needs a CORS preflight this site never answers). A non-browser client sending neither
 * header has no victim's cookies to abuse. Returns the refusal, or null when the request may go on.
 */
export function refuseCrossSitePost(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  const headers = { "cache-control": "no-store" };
  if ((site !== null && site !== "same-origin" && site !== "none") || !sameOrigin(request)) {
    return Response.json({ ok: false, code: "forbidden", message: "הבקשה נחסמה. אפשר לרענן את הדף ולנסות שוב." }, { status: 403, headers });
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") {
    return Response.json({ ok: false, code: "unsupported", message: "הבקשה נחסמה. אפשר לרענן את הדף ולנסות שוב." }, { status: 415, headers });
  }
  return null;
}
