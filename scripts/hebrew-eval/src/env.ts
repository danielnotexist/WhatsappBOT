import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const RESULTS_DIR = path.join(ROOT, 'results');
export const DATASET_DIR = path.join(ROOT, 'dataset');

/** Load ./.env if present (Node 22 built-in; no dotenv dependency). */
export function loadDotEnv(): void {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn(`אזהרה: לא הצלחתי לקרוא את ${file}: ${(e as Error).message}`);
  }
}

export class MissingEnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      [
        'חסרים משתני סביבה הנדרשים להרצה מול ספקי ה-API:',
        ...missing.map((m) => `  • ${m}`),
        '',
        'מה לעשות: צור קובץ .env בתיקיית scripts/hebrew-eval (ראה .env.example) והוסף את המפתחות,',
        'או הרץ עם --dry-run כדי לבדוק את הצינור בלי מפתחות ובלי עלות,',
        'או צמצם את רשימת המודלים עם --models כך שרק ספקים עם מפתח ירוצו.',
      ].join('\n'),
    );
    this.name = 'MissingEnvError';
  }
}

/** Fail fast: every required env var must be non-empty. */
export function requireEnv(vars: string[]): void {
  const missing = [...new Set(vars)].filter((v) => !process.env[v] || process.env[v]!.trim() === '');
  if (missing.length > 0) throw new MissingEnvError(missing);
}

export function usdIls(): number {
  const n = Number(process.env.USD_ILS);
  return Number.isFinite(n) && n > 0 ? n : 3.7;
}
