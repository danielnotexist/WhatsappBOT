import { z } from "zod";
import { demoHasSupabase, isDemo } from "@/lib/demo";

/**
 * משתני סביבה — ולידציה עם zod, מפוצל לשרת/לקוח.
 *
 * - `serverEnv()` נקרא רק בשרת (Route Handlers, Server Actions, proxy). הוא עצל (lazy)
 *   כדי ש-`next build` יעבור גם בלי סודות, ונכשל עם הודעה ברורה בקריאה הראשונה אם חסר משהו.
 * - `clientEnv` מכיל רק משתני `NEXT_PUBLIC_*` (מוטמעים בבאנדל של הדפדפן).
 * - `checkServerEnv()` מחזיר רשימת שמות חסרים (בלי ערכים) — ל-/api/health ולסקריפטים.
 *
 * הרשימה המלאה + מאיפה מביאים כל ערך: ראו `.env.example`.
 */

const nonEmpty = z.string().trim().min(1);

/** מפתח AES-256 בקידוד base64 (32 בייט בדיוק). יצירה: `openssl rand -base64 32` */
export const base64Key32 = nonEmpty.refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "TOKEN_ENC_KEY חייב להיות base64 של 32 בייט בדיוק (openssl rand -base64 32)" },
);

export const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ---- האפליקציה ----
  APP_URL: z.url({ message: "APP_URL חייב להיות URL מלא, למשל https://app.example.co.il" }),

  // ---- Supabase (Frankfurt) ----
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,

  // ---- הצפנת טוקני OAuth (AES-256-GCM) ----
  TOKEN_ENC_KEY: base64Key32,

  // ---- WhatsApp Cloud API (Meta) ----
  WA_PHONE_NUMBER_ID: nonEmpty,
  /** המספר הציבורי של הבוט בפורמט E.164 בלי "+" (ל-wa.me), למשל 972501234567 */
  WA_PUBLIC_NUMBER: z.string().regex(/^[1-9][0-9]{7,14}$/, {
    message: "WA_PUBLIC_NUMBER חייב להיות ספרות בלבד בפורמט בינלאומי בלי +, למשל 972501234567",
  }),
  WA_ACCESS_TOKEN: nonEmpty,
  WA_VERIFY_TOKEN: nonEmpty,
  META_APP_SECRET: nonEmpty,

  // ---- Microsoft 365 (Entra, multi-tenant) ----
  MS_CLIENT_ID: nonEmpty,
  MS_CLIENT_SECRET: nonEmpty,
  MS_TENANT: nonEmpty.default("common"),

  // ---- Google ----
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
  /** קריאת Gmail (scope מוגבל) — false עד שעוברים CASA. ראו docs/google-setup.md */
  GOOGLE_GMAIL_READ_ENABLED: z.preprocess((v) => (v === "" ? undefined : v), z.stringbool().default(false)),

  // ---- AI / תמלול / תמונות ----
  ANTHROPIC_API_KEY: nonEmpty,
  SONIOX_API_KEY: nonEmpty,
  OPENROUTER_API_KEY: nonEmpty,

  // ---- HYP Pay (יעד שריג) ----
  HYP_MASOF: nonEmpty,
  HYP_KEY: nonEmpty,
  HYP_PASSP: nonEmpty,

  // ---- Upstash QStash ----
  QSTASH_TOKEN: nonEmpty,
  QSTASH_CURRENT_SIGNING_KEY: nonEmpty,
  QSTASH_NEXT_SIGNING_KEY: nonEmpty,

  // ---- Resend (OTP במייל) ----
  RESEND_API_KEY: nonEmpty,
});

/**
 * מצב נתונים: "supabase" (ברירת מחדל) או "memory" — שכבת נתונים בזיכרון + מיילר לקונסול, לפיתוח/בדיקות בלי Supabase ו-Resend.
 * לא מותר ב-production — חוץ ממצב הדגמה (`DEMO_MODE=1`, lib/demo.ts): שם Supabase אם הוגדר (SUPABASE_*), אחרת זיכרון,
 * גם ב-production. DATA_MODE מפורש גובר גם בהדגמה.
 */
export const dataModeSchema = z.enum(["supabase", "memory"]).default("supabase");
export type DataMode = z.infer<typeof dataModeSchema>;

export function dataMode(source: Record<string, string | undefined> = process.env): DataMode {
  if (isDemo(source)) {
    return dataModeSchema.parse(source.DATA_MODE?.trim() || (demoHasSupabase(source) ? "supabase" : "memory"));
  }
  const mode = dataModeSchema.parse(source.DATA_MODE || undefined);
  if (mode === "memory" && source.NODE_ENV === "production") {
    throw new Error("DATA_MODE=memory אסור ב-production — הסירו את המשתנה או הגדירו supabase.");
  }
  return mode;
}

/**
 * Outbound integrations (WhatsApp, AI, Microsoft, Google, HYP, mail, STT, queue) use their mocks: in DATA_MODE=memory
 * (dev/tests) and always in DEMO_MODE=1 — also when the demo keeps its data in Supabase and whatever keys exist.
 */
export function integrationsMocked(source: Record<string, string | undefined> = process.env): boolean {
  return isDemo(source) || dataMode(source) === "memory";
}

/**
 * דורש קבוצת משתנים ספציפית (למשל רק Supabase) וזורק EnvError בעברית עם השמות החסרים.
 * מאפשר לכל מודול לדרוש רק מה שהוא צריך, במקום את כל הסכמה.
 */
export function requireEnv<K extends keyof ServerEnv>(
  keys: readonly K[],
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Pick<ServerEnv, K> {
  const issues: z.core.$ZodIssue[] = [];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const result = serverSchema.shape[key].safeParse(source[key]);
    if (result.success) out[key] = result.data;
    else issues.push(...result.error.issues.map((issue) => ({ ...issue, path: [key, ...issue.path] })));
  }
  if (issues.length) throw new EnvError(issues);
  return out as Pick<ServerEnv, K>;
}

export const clientSchema = z.object({
  /** כתובת האתר כפי שהדפדפן רואה אותה (אופציונלי; בשרת משתמשים ב-APP_URL). */
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

export class EnvError extends Error {
  readonly missing: string[];

  constructor(issues: z.core.$ZodIssue[]) {
    const missing = [...new Set(issues.map((issue) => issue.path.map(String).join(".")))];
    super(
      `משתני סביבה חסרים או לא תקינים: ${missing.join(", ")}. ` +
        "ראו .env.example להסבר מאיפה מביאים כל ערך.",
    );
    this.name = "EnvError";
    this.missing = missing;
  }
}

/**
 * מריץ את הסכמה על אובייקט סביבה נתון (ברירת מחדל: process.env).
 * מיוצא כדי לאפשר בדיקות; בקוד האפליקציה השתמשו ב-`serverEnv()`.
 */
export function parseServerEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues);
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

/** משתני השרת, מאומתים ושמורים ב-cache. זורק EnvError אם חסר משהו. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() זמין רק בצד השרת — אל תייבאו אותו לקומפוננטות לקוח.");
  }
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}

/** מחזיר אילו משתני שרת חסרים/לא תקינים — שמות בלבד, בלי ערכים. */
export function checkServerEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { ok: boolean; missing: string[] } {
  const result = serverSchema.safeParse(source);
  if (result.success) return { ok: true, missing: [] };
  return {
    ok: false,
    missing: [...new Set(result.error.issues.map((issue) => issue.path.map(String).join(".")))],
  };
}

/**
 * משתני הלקוח. חייבים להיקרא כ-`process.env.NEXT_PUBLIC_X` מילולית כדי ש-Next יטמיע אותם בבאנדל.
 */
export const clientEnv: ClientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
});

/** שמות כל משתני השרת — לסקריפטים ולתיעוד. */
export const SERVER_ENV_KEYS = Object.keys(serverSchema.shape) as (keyof ServerEnv)[];
