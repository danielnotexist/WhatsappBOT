import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * הצפנת טוקני OAuth (Microsoft/Google/HYP) לפני שמירה ב-DB — AES-256-GCM.
 *
 * המפתח מגיע מ-`TOKEN_ENC_KEY` (base64 של 32 בייט) שנמצא רק ב-env של Vercel, לא ב-DB (PLAN §2.3).
 * פורמט המחרוזת: `v1.<iv>.<ciphertext>.<tag>` — כל חלק base64url. ה-IV אקראי לכל הצפנה.
 * אפשר (ומומלץ) להעביר `aad` — למשל `${userId}:${provider}` — כדי שטוקן מוצפן של משתמש א'
 * לא יוכל להיות "מושתל" ברשומה של משתמש ב'.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/** ממיר מפתח base64 ל-Buffer ומוודא אורך של 32 בייט. */
export function keyFromBase64(base64Key: string | undefined): Buffer {
  if (!base64Key) {
    throw new TokenCryptoError("TOKEN_ENC_KEY חסר. יצירה: openssl rand -base64 32");
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `TOKEN_ENC_KEY חייב להיות base64 של ${KEY_BYTES} בייט (התקבלו ${key.length}).`,
    );
  }
  return key;
}

/** מפתח חדש לשימוש ב-TOKEN_ENC_KEY (base64). */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

function resolveKey(key?: Buffer | string): Buffer {
  if (Buffer.isBuffer(key)) {
    if (key.length !== KEY_BYTES) {
      throw new TokenCryptoError(`מפתח ההצפנה חייב להיות ${KEY_BYTES} בייט.`);
    }
    return key;
  }
  return keyFromBase64(key ?? process.env.TOKEN_ENC_KEY);
}

export interface TokenCryptoOptions {
  /** מפתח מפורש (Buffer של 32 בייט או base64). ברירת מחדל: process.env.TOKEN_ENC_KEY */
  key?: Buffer | string;
  /** Additional Authenticated Data — נקשר לטקסט המוצפן ונבדק בפענוח (לא נשמר במחרוזת). */
  aad?: string;
}

/** מצפין מחרוזת (טוקן) ומחזיר מחרוזת בטוחה לשמירה ב-DB. */
export function encryptToken(plaintext: string, options: TokenCryptoOptions = {}): string {
  const key = resolveKey(options.key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  if (options.aad) cipher.setAAD(Buffer.from(options.aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/** מפענח מחרוזת שנוצרה ב-`encryptToken`. זורק TokenCryptoError על מפתח שגוי / שינוי בנתונים. */
export function decryptToken(payload: string, options: TokenCryptoOptions = {}): string {
  const key = resolveKey(options.key);
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCryptoError("פורמט טוקן מוצפן לא מוכר.");
  }
  const [, ivB64, ciphertextB64, tagB64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new TokenCryptoError("פורמט טוקן מוצפן לא מוכר.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    if (options.aad) decipher.setAAD(Buffer.from(options.aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // לא מדליפים פרטים — מפתח שגוי, AAD שגוי או ciphertext שנפגע נראים אותו דבר.
    throw new TokenCryptoError("פענוח נכשל: מפתח שגוי או נתונים שהשתנו.");
  }
}

/** האם המחרוזת נראית כמו פלט של encryptToken (בלי לפענח). */
export function isEncryptedToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{22}$/.test(value)
  );
}
