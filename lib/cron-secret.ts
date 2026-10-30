import { createHash, timingSafeEqual } from "node:crypto";

/** A CRON_SECRET shorter than this is treated as unset (security round B): `openssl rand -base64 24` gives 32. */
export const CRON_SECRET_MIN_LENGTH = 32;

/** The scheduler's secret (GET /api/jobs/tick, the details of /api/health), or null when unset or too short. */
export function cronSecret(source: Record<string, string | undefined> = process.env): string | null {
  const secret = source.CRON_SECRET?.trim() ?? "";
  if (!secret) return null;
  if (secret.length < CRON_SECRET_MIN_LENGTH) {
    console.error(`[cron] CRON_SECRET קצר מדי (${secret.length} תווים; נדרשים ${CRON_SECRET_MIN_LENGTH} לפחות) — הוא לא מתקבל. יצירה: openssl rand -base64 24`);
    return null;
  }
  return secret;
}

/** `Authorization: Bearer <CRON_SECRET>`, compared in constant time (by digest). False when the secret is unusable. */
export function hasCronBearer(request: Request, source: Record<string, string | undefined> = process.env): boolean {
  const secret = cronSecret(source);
  if (!secret) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
