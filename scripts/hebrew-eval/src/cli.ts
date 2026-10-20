export interface CliArgs {
  dryRun: boolean;
  runId: string | undefined;
  models: string[] | undefined;
  limit: number | undefined;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  dataset: string | undefined;
  /** only these dataset ids (comma-separated) — e.g. a stratified subset for an expensive model */
  ids: string[] | undefined;
  /** hard spend cap in USD for the whole run (eval + judge share results/<run>/spend.json) */
  budgetUsd: number | undefined;
  /** max tool round-trips per message (default 4 — the product loops too) */
  maxRounds: number;
  /** re-run records whose tool loop was truncated in an earlier (shorter) run */
  redoTruncated: boolean;
  help: boolean;
}

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else {
      flags.set(a.slice(2), 'true');
    }
  }
  const models = flags.get('models');
  const limit = flags.get('limit');
  const ids = flags.get('ids');
  const budget = flags.get('budget');
  return {
    dryRun: flags.get('dry-run') === 'true',
    runId: flags.get('run-id'),
    models: models ? models.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    limit: limit ? num(limit, 0) || undefined : undefined,
    concurrency: num(flags.get('concurrency') ?? process.env.EVAL_CONCURRENCY, 4),
    timeoutMs: num(flags.get('timeout') ?? process.env.EVAL_TIMEOUT_MS, 90_000),
    retries: num(flags.get('retries') ?? process.env.EVAL_RETRIES, 3),
    dataset: flags.get('dataset'),
    ids: ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    budgetUsd: budget ? num(budget, 0) || undefined : undefined,
    maxRounds: num(flags.get('max-rounds') ?? process.env.EVAL_MAX_ROUNDS, 4),
    redoTruncated: flags.get('redo-truncated') === 'true',
    help: flags.get('help') === 'true',
  };
}

export const HELP = `
שימוש:
  npm run eval     -- [--dry-run] [--run-id ID] [--models a,b] [--limit N] [--ids msg-001,msg-002] [--budget 3] [--concurrency 4] [--timeout 90000] [--retries 3]
  npm run judge    -- [--dry-run] [--run-id ID] [--limit N] [--budget 3]
  npm run report   -- [--run-id ID]
  npm run pipeline -- [--dry-run] [--run-id ID] [--models a,b] [--limit N]

--dry-run   מריץ את כל הצינור עם ספק mock (בלי מפתחות, בלי עלות)
--run-id    מזהה ריצה (ברירת מחדל: חותמת זמן; ב-dry-run מקבל קידומת dry-)
--models    רשימת מזהי מודלים מתוך models.json (מופרדים בפסיק)
--limit     מספר הודעות מקסימלי מהדאטהסט (לבדיקות)
--ids       רק הודעות עם המזהים האלה (למשל תת-קבוצה למודל יקר); אפשר להריץ שוב עם אותו --run-id למודלים נוספים
--max-rounds  כמה סבבי כלים מותרים להודעה (ברירת מחדל 4). --redo-truncated מריץ מחדש רשומות שנקטעו בריצה קודמת
--budget    תקרת הוצאה בדולרים לכל הריצה (eval + judge יחד, נשמר ב-results/<run>/spend.json). הערכה מראש + עצירה קשה תוך כדי
`;
