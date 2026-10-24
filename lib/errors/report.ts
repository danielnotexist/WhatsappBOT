import type { Db } from "@/lib/db/types";

/**
 * The central error log (migration 0015 app_errors, the admin panel's "תקלות"). `reportError()` is called from
 * instrumentation.ts `onRequestError` and from the main catch points (the WhatsApp pipeline, the job worker, the OAuth
 * returns, billing). It never throws and never stores a secret: tokens, keys, codes in URLs and long opaque strings are
 * replaced before anything is written, the message is cut to 500 characters and the context to a few short values.
 */

export const MAX_MESSAGE = 500;
const MAX_CONTEXT_KEYS = 12;
const MAX_CONTEXT_VALUE = 300;
const HIDDEN = "[הוסתר]";

const PATTERNS: [RegExp, string][] = [
  // Authorization headers and bearer tokens
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${HIDDEN}`],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, HIDDEN],
  // provider keys: sk-…, sk_live_…, re_…, whsec_…, rk_…, pk_…, xox…
  [/\b(?:sk|pk|rk|re|whsec|xox[abpr])[-_][A-Za-z0-9_-]{10,}/g, HIDDEN],
  // secrets in a URL or a form body: ?token=…, &code=…, access_token=…
  [/([?&#;\s](?:token|code|access_token|refresh_token|id_token|key|apikey|api_key|secret|client_secret|password|passp|signature|sig|state|otp)=)[^&\s#"']+/gi, `$1${HIDDEN}`],
  // key: value / key=value in a message
  [/\b(password|passwd|secret|token|api[_-]?key|authorization|cookie|set-cookie)(["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, `$1$2${HIDDEN}`],
  // card-like numbers: 4-4-4-x with one separator, or 13-19 digits in a row (never a part of a uuid)
  [/(?<![\w-])\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}(?![\w-])/g, HIDDEN],
  [/(?<![\w-])\d{13,19}(?![\w-])/g, HIDDEN],
  // long opaque strings (keys, signatures, base64 blobs) — uuids have short groups and stay
  [/[A-Za-z0-9+_=-]{40,}/g, HIDDEN],
];

/** The text without anything that looks like a secret. */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const [re, by] of PATTERNS) out = out.replace(re, by);
  return out;
}

function cut(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** The message of whatever was thrown, scrubbed and cut. */
export function errorMessage(error: unknown): string {
  let text: string;
  if (error instanceof Error) text = error.name && error.name !== "Error" && !error.message.startsWith(error.name) ? `${error.name}: ${error.message}` : error.message;
  else if (typeof error === "string") text = error;
  else {
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      text = String(error);
    }
  }
  return cut(scrubSecrets(text || "unknown error"), MAX_MESSAGE) || "unknown error";
}

/** A few short, scrubbed scalars (no nested objects — nothing large or personal rides along by accident). */
export function cleanContext(context: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!context) return out;
  for (const [k, v] of Object.entries(context).slice(0, MAX_CONTEXT_KEYS)) {
    const key = k.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
    if (!key || v === undefined || v === null) continue;
    if (/password|secret|token|cookie|authorization|api[_-]?key/i.test(key)) {
      out[key] = HIDDEN;
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else out[key] = cut(scrubSecrets(typeof v === "string" ? v : JSON.stringify(v) ?? String(v)), MAX_CONTEXT_VALUE);
  }
  return out;
}

export interface ReportOptions {
  userId?: string | null;
  context?: Record<string, unknown>;
  /** the data layer to write to (tests, the bot's ctx.db); default the process-wide one */
  db?: Db;
}

/**
 * Records an error: one line to the server log and a row in app_errors. Never throws — a failure to record is only
 * logged. `source`: a short stable name ("bot", "jobs", "oauth.google", "billing", "request").
 */
export async function reportError(source: string, error: unknown, opts: ReportOptions = {}): Promise<void> {
  const message = errorMessage(error);
  const name = source.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 60) || "unknown";
  if (process.env.NODE_ENV !== "test") console.error(`[error:${name}] ${message}`);
  try {
    const db = opts.db ?? (await import("@/lib/db")).getDb();
    await db.insertAppError({ source: name, message, user_id: opts.userId ?? null, context: cleanContext(opts.context) });
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.error(`[error:${name}] not recorded:`, (e as Error).message);
  }
}
