export interface CliArgs {
  dryRun: boolean;
  runId: string | undefined;
  models: string[] | undefined;
  limit: number | undefined;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  dataset: string | undefined;
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
  return {
    dryRun: flags.get('dry-run') === 'true',
    runId: flags.get('run-id'),
    models: models ? models.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    limit: limit ? num(limit, 0) || undefined : undefined,
    concurrency: num(flags.get('concurrency') ?? process.env.EVAL_CONCURRENCY, 4),
    timeoutMs: num(flags.get('timeout') ?? process.env.EVAL_TIMEOUT_MS, 90_000),
    retries: num(flags.get('retries') ?? process.env.EVAL_RETRIES, 3),
    dataset: flags.get('dataset'),
    help: flags.get('help') === 'true',
  };
}

export const HELP = `
שימוש:
  npm run eval     -- [--dry-run] [--run-id ID] [--models a,b] [--limit N] [--concurrency 4] [--timeout 90000] [--retries 3]
  npm run judge    -- [--dry-run] [--run-id ID] [--limit N]
  npm run report   -- [--run-id ID]
  npm run pipeline -- [--dry-run] [--run-id ID] [--models a,b] [--limit N]

--dry-run   מריץ את כל הצינור עם ספק mock (בלי מפתחות, בלי עלות)
--run-id    מזהה ריצה (ברירת מחדל: חותמת זמן; ב-dry-run מקבל קידומת dry-)
--models    רשימת מזהי מודלים מתוך models.json (מופרדים בפסיק)
--limit     מספר הודעות מקסימלי מהדאטהסט (לבדיקות)
`;
