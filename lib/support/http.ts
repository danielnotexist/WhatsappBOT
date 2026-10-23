import type { SupportErrorResponse } from "./types";

/** The Hebrew error lines of the two support routes (app/api/support/chat, app/api/support/ticket). */
export const SUPPORT_ERRORS: Record<SupportErrorResponse["code"], string> = {
  bad_request: "ההודעה ריקה או לא תקינה.",
  too_long: "ההודעה ארוכה מדי.",
  invalid: "חסרים פרטים בטופס.",
  forbidden: "אין הרשאה.",
  rate_limited: "הרבה הודעות ברצף. אפשר לנסות שוב בעוד כמה דקות.",
  server_error: "משהו נתקע בדרך. אפשר לנסות שוב.",
};

const STATUS: Record<SupportErrorResponse["code"], number> = {
  bad_request: 400,
  too_long: 400,
  invalid: 400,
  forbidden: 403,
  rate_limited: 429,
  server_error: 500,
};

export const NO_STORE = { "cache-control": "no-store" } as const;

export function supportFail(code: SupportErrorResponse["code"], message: string = SUPPORT_ERRORS[code], extra: Pick<SupportErrorResponse, "fields"> = {}): Response {
  return Response.json({ ok: false, code, message, ...extra } satisfies SupportErrorResponse, { status: STATUS[code], headers: NO_STORE });
}

/** A JSON body of at most `max` bytes (whatever Content-Length says), or null. */
export async function readJson(request: Request, max: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  const text = await request.text().catch(() => null);
  if (text === null || text.length > max) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
