import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * אימות webhooks של WhatsApp Cloud API (Meta).
 *
 * Meta חותמת כל POST ב-HMAC-SHA256 על גוף הבקשה **הגולמי** עם ה-App Secret,
 * ושולחת `X-Hub-Signature-256: sha256=<hex>`. חובה לחשב על ה-bytes המקוריים
 * (`await request.text()` / `arrayBuffer()`), לא על JSON שעבר parse ו-stringify.
 */

export const META_SIGNATURE_HEADER = "x-hub-signature-256";
const PREFIX = "sha256=";

/** מחשב את ערך הכותרת הצפוי (`sha256=<hex>`). */
export function computeMetaSignature(rawBody: string | Uint8Array, appSecret: string): string {
  return PREFIX + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

/**
 * השוואה בזמן קבוע בין החתימה שהתקבלה לחתימה המחושבת.
 * מחזיר false על כותרת חסרה, פורמט לא תקין או אי-התאמה — לעולם לא זורק.
 */
export function verifyMetaSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const header = signatureHeader.trim();
  if (!header.toLowerCase().startsWith(PREFIX)) return false;
  const received = header.slice(PREFIX.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;

  const expected = computeMetaSignature(rawBody, appSecret).slice(PREFIX.length);
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * אימות ה-GET הראשוני של Meta בעת רישום ה-webhook (hub.mode / hub.verify_token / hub.challenge).
 * מחזיר את ה-challenge להחזרה כ-200 text/plain, או null אם יש לענות 403.
 */
export function verifyMetaWebhookChallenge(
  searchParams: URLSearchParams,
  verifyToken: string,
): string | null {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge || !verifyToken) return null;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(verifyToken, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge;
}
