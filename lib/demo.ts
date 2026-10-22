/**
 * מצב הדגמה — `DEMO_MODE=1` (round plan §1): the whole site works on Vercel serverless with nothing sent anywhere.
 * "Staging" semantics: the data can be real, nothing outbound is.
 *   - Data: Supabase when SUPABASE_* is configured (persistent across serverless instances — supabase-js over HTTPS,
 *     no long-lived connections); otherwise the in-memory db, production included, with user ids derived from the
 *     email (lib/auth/demo-user.ts) so every instance agrees on them. See lib/env.ts `dataMode()`.
 *   - Integrations: every outbound factory returns its mock — WA sender, AI, Microsoft, Google, HYP, mailer, STT,
 *     queue — whatever keys exist (lib/env.ts `integrationsMocked()`). With `LIVE_AI=1` the model (Anthropic) and the
 *     speech-to-text (OpenRouter) are real and everything else stays mocked (lib/env.ts `liveAiInDemo()` / `aiMocked()`
 *     / `sttMocked()`), under a daily spend cap and a per-user daily message cap (lib/ai/budget.ts). The /demo/chat page
 *     talks to the same pipeline as WhatsApp (app/api/demo/chat).
 *   - Sign-in: the code DEMO_OTP_CODE works for any email, statelessly (lib/auth/otp.ts `fixedCode`); the user row
 *     itself is created/found normally (in Supabase it persists). On the memory store only, the session also carries
 *     the email, so an instance that never saw the user recreates it (lib/auth/current-user.ts).
 *   - OAuth: /api/auth/{microsoft,google}/start write a fixture connection through the normal data layer and return
 *     through the returnTo rule (lib/auth/demo-connect.ts).
 *   - Public face: `X-Robots-Tag` (proxy.ts), robots metadata and a site-wide strip (app/layout.tsx).
 *
 * Refuses to run next to anything that can reach the outside world on its own: WA_ACCESS_TOKEN, HYP_KEY, HYP_PASSP,
 * MS_CLIENT_SECRET, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, QSTASH_TOKEN — and without a stable TOKEN_ENC_KEY (sessions
 * must verify on every instance). Checked at boot (instrumentation.ts) and on every `isDemo()`. The AI keys
 * (ANTHROPIC_API_KEY, OPENROUTER_API_KEY) are allowed: they only answer the requests we make, nothing reaches a person,
 * and without LIVE_AI=1 they are not used at all.
 *
 * Dependency-free on purpose: lib/env.ts and proxy.ts import it.
 */

type EnvSource = Record<string, string | undefined>;

/** The sign-in code of the demo, for every address. Shown on the code card. */
export const DEMO_OTP_CODE = "123456";

/** Keys that would let the demo send something real (messages, mail, charges, OAuth, queued calls). */
export const DEMO_FORBIDDEN_KEYS = [
  "WA_ACCESS_TOKEN",
  "HYP_KEY",
  "HYP_PASSP",
  "MS_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "QSTASH_TOKEN",
] as const;

/** The raw switch: DEMO_MODE=1 (or "true"). Does not validate — use `isDemo()`. */
export function demoFlag(source: EnvSource = process.env): boolean {
  const value = source.DEMO_MODE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** A Supabase project is configured (any of its server variables) — the demo then keeps its data there. */
export function demoHasSupabase(source: EnvSource = process.env): boolean {
  return ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].some((key) => Boolean(source[key]?.trim()));
}

export class DemoConfigError extends Error {
  /** names only, never values */
  readonly forbidden: string[];
  readonly missing: string[];

  constructor(problems: { forbidden: string[]; missing: string[] }) {
    const parts: string[] = [];
    if (problems.forbidden.length) {
      parts.push(
        `מצב ההדגמה (DEMO_MODE=1) לא עולה ליד מפתחות ששולחים דברים באמת: ${problems.forbidden.join(", ")}. ` +
          "להסיר אותם מהסביבה, או לכבות את DEMO_MODE כדי לעבור למצב האמיתי (docs/deploy.md).",
      );
    }
    if (problems.missing.length) {
      parts.push(
        `מצב ההדגמה דורש ${problems.missing.join(", ")} קבוע (base64 של 32 בייט), כדי שה-session יעבוד בכל השרתים. ` +
          "יצירה: openssl rand -base64 32",
      );
    }
    super(parts.join(" "));
    this.name = "DemoConfigError";
    this.forbidden = problems.forbidden;
    this.missing = problems.missing;
  }
}

function isBase64Key32(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    return Buffer.from(value.trim(), "base64").length === 32;
  } catch {
    return false;
  }
}

/** What stops the demo from starting (names only). Empty lists when DEMO_MODE is off. */
export function demoProblems(source: EnvSource = process.env): { forbidden: string[]; missing: string[] } {
  if (!demoFlag(source)) return { forbidden: [], missing: [] };
  const forbidden = DEMO_FORBIDDEN_KEYS.filter((key) => Boolean(source[key]?.trim()));
  const missing = isBase64Key32(source.TOKEN_ENC_KEY) ? [] : ["TOKEN_ENC_KEY"];
  return { forbidden, missing };
}

/** Throws a Hebrew DemoConfigError when DEMO_MODE=1 sits next to outbound keys or lacks TOKEN_ENC_KEY. No-op otherwise. */
export function assertDemoSafe(source: EnvSource = process.env): void {
  const problems = demoProblems(source);
  if (problems.forbidden.length || problems.missing.length) throw new DemoConfigError(problems);
}

/** True in the demo. Re-checks the safety rules each time (cheap), so a misconfigured demo fails on first use. */
export function isDemo(source: EnvSource = process.env): boolean {
  if (!demoFlag(source)) return false;
  assertDemoSafe(source);
  return true;
}

/** The demo's words: the strip on every page, the note on the code card, and the robots rule. */
export const DEMO_COPY = {
  strip: "גרסת הדגמה - שום דבר לא נשלח באמת",
  codeNote: `בגרסת ההדגמה הקוד הוא ${DEMO_OTP_CODE}`,
  robots: "noindex, nofollow",
} as const;
