import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { keyFromBase64 } from "@/lib/crypto";
import { demoFlag } from "@/lib/demo";
import { globalSingleton } from "@/lib/global-singleton";

/**
 * Sub-keys derived from TOKEN_ENC_KEY with HKDF, so one secret in Vercel covers token encryption,
 * session signing and OTP hashing without three env vars. Different `info` → independent keys.
 */
export type KeyPurpose = "session" | "otp" | "internal" | "demo" | "admin" | "analytics" | "sso" | "link" | "ledger" | "audit";

function masterKey(): Buffer {
  const fromEnv = process.env.TOKEN_ENC_KEY;
  if (fromEnv) return keyFromBase64(fromEnv);
  // The demo runs on several serverless instances: a per-process key would log everyone out on every hop.
  if (demoFlag()) {
    throw new Error("מצב ההדגמה (DEMO_MODE=1) דורש TOKEN_ENC_KEY קבוע, כדי שה-session יעבוד בכל השרתים. יצירה: openssl rand -base64 32");
  }
  // Dev convenience only: DATA_MODE=memory may run without TOKEN_ENC_KEY (sessions die with the process).
  if (process.env.DATA_MODE === "memory" && process.env.NODE_ENV !== "production") {
    return globalSingleton("dev-master-key", () => {
      console.warn("[auth] TOKEN_ENC_KEY חסר — נוצר מפתח זמני לזיכרון בלבד (DATA_MODE=memory).");
      return randomBytes(32);
    });
  }
  throw new Error("משתני סביבה חסרים או לא תקינים: TOKEN_ENC_KEY. יצירה: openssl rand -base64 32");
}

/**
 * SESSION_EPOCH (optional, a whole number): folded into the "session" sub-key only. Raising it (unset → "2") changes the
 * key that signs session cookies and every session-bound link (WhatsApp login, connect, pay, card, invoice and offer
 * links), so all of them stop verifying at once — the "sign everyone out" switch. Unset, "0" or "1" keep today's key.
 * TOKEN_ENC_KEY itself, and so the stored OAuth / HYP tokens it encrypts, are untouched.
 */
export function sessionEpoch(source: Record<string, string | undefined> = process.env): number {
  const raw = source.SESSION_EPOCH?.trim();
  if (!raw) return 1;
  if (!/^\d{1,6}$/.test(raw)) throw new Error("SESSION_EPOCH חייב להיות מספר שלם (למשל 2). העלאה שלו מנתקת את כל ה-sessions.");
  return Math.max(1, Number(raw));
}

export function derivedKey(purpose: KeyPurpose, master: Buffer = masterKey()): Buffer {
  const epoch = purpose === "session" ? sessionEpoch() : 1;
  const info = epoch > 1 ? `whatsappbot:${purpose}:epoch${epoch}` : `whatsappbot:${purpose}`;
  return Buffer.from(hkdfSync("sha256", master, "", info, 32));
}

export function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/**
 * `<base64url payload>.<base64url HMAC-SHA256>` and nothing else: exactly one dot, only base64url characters and a
 * 43-character signature. Base64url decoding skips foreign characters, so a lax split would also accept
 * `<token>.png` or a signature with junk around it (security round B). null when the shape is off.
 */
export function signedTokenParts(token: string | null | undefined): { payload: string; sig: string } | null {
  if (!token) return null;
  const m = /^([A-Za-z0-9_-]{1,2048})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return m ? { payload: m[1]!, sig: m[2]! } : null;
}
