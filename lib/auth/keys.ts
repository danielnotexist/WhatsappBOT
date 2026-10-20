import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { keyFromBase64 } from "@/lib/crypto";
import { globalSingleton } from "@/lib/global-singleton";

/**
 * Sub-keys derived from TOKEN_ENC_KEY with HKDF, so one secret in Vercel covers token encryption,
 * session signing and OTP hashing without three env vars. Different `info` → independent keys.
 */
export type KeyPurpose = "session" | "otp" | "internal";

function masterKey(): Buffer {
  const fromEnv = process.env.TOKEN_ENC_KEY;
  if (fromEnv) return keyFromBase64(fromEnv);
  // Dev convenience only: DATA_MODE=memory may run without TOKEN_ENC_KEY (sessions die with the process).
  if (process.env.DATA_MODE === "memory" && process.env.NODE_ENV !== "production") {
    return globalSingleton("dev-master-key", () => {
      console.warn("[auth] TOKEN_ENC_KEY חסר — נוצר מפתח זמני לזיכרון בלבד (DATA_MODE=memory).");
      return randomBytes(32);
    });
  }
  throw new Error("משתני סביבה חסרים או לא תקינים: TOKEN_ENC_KEY. יצירה: openssl rand -base64 32");
}

export function derivedKey(purpose: KeyPurpose, master: Buffer = masterKey()): Buffer {
  return Buffer.from(hkdfSync("sha256", master, "", `whatsappbot:${purpose}`, 32));
}

export function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
