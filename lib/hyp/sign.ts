/**
 * HYP Pay (יעד שריג) — בניית בקשות `APISign` (SIGN / VERIFY) בלי רשת.
 * מקור: developers.hyp.co.il/pay → Creating a Payment Page, Transaction Validation, Reference → Actions.
 *
 * זרימה (PLAN §4):
 *  1. שרת: `buildSignUrl(params, creds)` → GET ל-HYP → התשובה היא query string עם `action=pay&...&signature=...`.
 *  2. `paymentPageUrl(signResponse)` → מפנים את הלקוח לדף התשלום (התשובה מצורפת כמו שהיא, באותו סדר).
 *  3. HYP מפנה חזרה ל-success URL עם `Id, CCode, Amount, ACode, Order, Fild1..3, Sign, ...`.
 *  4. שרת: `buildVerifyUrl(redirectQuery, creds)` → GET ל-HYP → `CCode=0` = חתימה תקינה (`isHypSuccess`).
 *
 * כללים: קריאות ל-HYP רק מהשרת (KEY/PassP בשאילתה!), תמיד HTTPS, ולעולם לא ללוג בלי `redactHypQuery`.
 */

export const HYP_PAY_ENDPOINT = "https://pay.hyp.co.il/p/";

export interface HypCredentials {
  /** מספר מסוף (Masof), למשל 0010345518 */
  masof: string;
  /** מפתח API (KEY) */
  key: string;
  /** סיסמת API (PassP) */
  passp: string;
}

export type HypParamValue = string | number | boolean | null | undefined;
export type HypParams = Record<string, HypParamValue>;

/** פרמטרים נפוצים לבקשת SIGN. כל מפתח נוסף מועבר כמו שהוא (ראו Reference → Actions). */
export interface HypSignParams extends HypParams {
  Amount: number | string;
  /** 1 = ₪ (ברירת מחדל ב-HYP), 2 = USD, 3 = EUR, 4 = GBP */
  Coin?: 1 | 2 | 3 | 4;
  /** מזהה ההזמנה אצלנו (למשל user id) — חוזר ב-redirect */
  Order?: string | number;
  Info?: string;
  email?: string;
  cell?: string;
  UserId?: string;
  ClientName?: string;
  ClientLName?: string;
  street?: string;
  city?: string;
  PageLang?: "HEB" | "ENG";
  tmp?: number | string;
  /** מספר תשלומים מקסימלי */
  Tash?: number;
  /** מחזיר UID/UserId וכו' ב-redirect */
  MoreData?: boolean;
  /** חשבונית מס-קבלה אוטומטית במייל (HYP Invoice) */
  SendHesh?: boolean;
  sendHeshSMS?: boolean;
  Pritim?: boolean;
  heshDesc?: string;
  sendemail?: boolean;
  UTF8?: boolean;
  UTF8out?: boolean;
}

export type HypQueryInput =
  string | URLSearchParams | ReadonlyArray<readonly [string, string]> | HypParams;

export class HypError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypError";
  }
}

/** HYP מצפה ל-`True`/`False` לערכים בוליאניים. undefined/null מושמטים. */
export function formatHypValue(value: HypParamValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

/** ממיר כל צורת קלט לרשימת זוגות — תוך שמירה על הסדר המקורי (קריטי ל-VERIFY). */
export function toPairs(input: HypQueryInput): [string, string][] {
  if (typeof input === "string") {
    const qIndex = input.indexOf("?");
    const query = qIndex >= 0 ? input.slice(qIndex + 1) : input;
    return [...new URLSearchParams(query)];
  }
  if (input instanceof URLSearchParams) return [...input];
  if (Array.isArray(input)) {
    return (input as ReadonlyArray<readonly [string, string]>).map(([k, v]) => [k, v]);
  }
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(input as HypParams)) {
    const formatted = formatHypValue(value);
    if (formatted !== undefined) pairs.push([key, formatted]);
  }
  return pairs;
}

/** קידוד query string עם encodeURIComponent (רווח → %20, @ → %40) כפי שמופיע בדוגמאות של HYP. */
export function encodeQuery(pairs: Iterable<readonly [string, string]>): string {
  return [...pairs]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

const SIGN_HEAD = ["action", "What", "Sign", "KEY", "PassP", "Masof"] as const;

/** query string לבקשת `APISign&What=SIGN` (בלי ה-endpoint). */
export function buildSignQuery(params: HypSignParams, creds: HypCredentials): string {
  assertCredentials(creds);
  const head: [string, string][] = [
    ["action", "APISign"],
    ["What", "SIGN"],
    ["Sign", "True"],
    ["KEY", creds.key],
    ["PassP", creds.passp],
    ["Masof", creds.masof],
  ];
  const reserved = new Set<string>(SIGN_HEAD);
  const body = toPairs(params).filter(([key]) => !reserved.has(key));
  return encodeQuery([...head, ...body]);
}

/** URL מלא לבקשת SIGN — לקריאה מהשרת בלבד. */
export function buildSignUrl(params: HypSignParams, creds: HypCredentials): string {
  return `${HYP_PAY_ENDPOINT}?${buildSignQuery(params, creds)}`;
}

export interface HypVerifyOptions {
  /** פרמטרים שלנו ב-success URL (למשל `?u=...`) שאינם שייכים ל-HYP ויש להשמיט. */
  omit?: readonly string[];
}

/**
 * query string לבקשת `APISign&What=VERIFY`: הכותרת + **כל** הפרמטרים שהגיעו ל-success URL,
 * באותו הסדר (דרישה של HYP). הקלט יכול להיות ה-URL המלא, ה-query, URLSearchParams או זוגות.
 */
export function buildVerifyQuery(
  redirect: HypQueryInput,
  creds: HypCredentials,
  options: HypVerifyOptions = {},
): string {
  assertCredentials(creds);
  const head: [string, string][] = [
    ["action", "APISign"],
    ["What", "VERIFY"],
    ["Masof", creds.masof],
    ["KEY", creds.key],
    ["PassP", creds.passp],
  ];
  const omit = new Set<string>([
    "action",
    "What",
    "Masof",
    "KEY",
    "PassP",
    ...(options.omit ?? []),
  ]);
  const pairs = toPairs(redirect).filter(([key]) => !omit.has(key));
  if (!pairs.some(([key]) => key === "Sign")) {
    throw new HypError(
      "ה-redirect לא כולל פרמטר Sign — ודאו ש-Sign=True נשלח ב-SIGN ושהאימות בחתימה מופעל במסוף.",
    );
  }
  return encodeQuery([...head, ...pairs]);
}

/** URL מלא לבקשת VERIFY — לקריאה מהשרת בלבד. */
export function buildVerifyUrl(
  redirect: HypQueryInput,
  creds: HypCredentials,
  options: HypVerifyOptions = {},
): string {
  return `${HYP_PAY_ENDPOINT}?${buildVerifyQuery(redirect, creds, options)}`;
}

/**
 * הופך את תשובת SIGN (query string עם `action=pay` ו-`signature`) ל-URL של דף התשלום.
 * זורק אם התשובה היא שגיאה (למשל `CCode=902`) ולא חתימה.
 */
export function paymentPageUrl(signResponse: string): string {
  const query = signResponse.trim();
  const parsed = parseHypResponse(query);
  if (!parsed.signature || parsed.action !== "pay") {
    throw new HypError(`תשובת SIGN לא תקינה: ${redactHypQuery(query) || "(ריק)"}`);
  }
  return `${HYP_PAY_ENDPOINT}?${query}`;
}

/** מפרסר תשובת HYP (query string) לאובייקט. */
export function parseHypResponse(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body.trim()));
}

/** קוד התשובה (CCode) כמספר, או null אם חסר/לא מספרי. */
export function hypResponseCode(response: string | Record<string, string>): number | null {
  const parsed = typeof response === "string" ? parseHypResponse(response) : response;
  const code = parsed.CCode;
  if (code === undefined || code === "" || !/^\d+$/.test(code)) return null;
  return Number(code);
}

/** `CCode=0` בלבד נחשב הצלחה (גם ב-VERIFY, גם ב-getToken, גם ב-soft). */
export function isHypSuccess(response: string | Record<string, string>): boolean {
  return hypResponseCode(response) === 0;
}

const SENSITIVE_KEYS = ["KEY", "PassP", "CC", "Token", "signature", "Sign"];
const SENSITIVE_RE = new RegExp(`(^|[?&])(${SENSITIVE_KEYS.join("|")})=([^&]*)`, "gi");

/** מסתיר ערכים רגישים (KEY, PassP, CC, Token, חתימות) לפני כתיבה ללוג. */
export function redactHypQuery(queryOrUrl: string): string {
  return queryOrUrl.replace(SENSITIVE_RE, (_match, sep: string, key: string) => `${sep}${key}=***`);
}

function assertCredentials(creds: HypCredentials): void {
  if (!creds.masof || !creds.key || !creds.passp) {
    throw new HypError("חסרים פרטי HYP: HYP_MASOF / HYP_KEY / HYP_PASSP.");
  }
}
