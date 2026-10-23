import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, HELP, type CliArgs } from './cli.js';
import { loadDotEnv, RESULTS_DIR, usdIls } from './env.js';
import { loadModelsFile } from './models.js';
import { getPrice } from './pricing.js';
import { latestRunId, mean, percentile, readJson, truncate } from './util.js';
import type { ScoreRecord, ScoresFile } from './types.js';
import type { RunMeta } from './eval.js';

interface ModelAgg {
  modelId: string;
  modelName: string;
  apiModel: string;
  n: number;
  errors: number;
  dims: Record<string, number | null>;
  overall: number | null;
  overallSimple: number | null;
  overallComplex: number | null;
  nSimple: number;
  nComplex: number;
  toolOkRate: number | null;
  toolOkN: number;
  unconfirmedSends: number;
  claimedCompletions: number;
  brokenRecords: number;
  genderedRecords: number;
  narratedRecords: number;
  nonHebrewRecords: number;
  hebrewRatio: number | null;
  p50: number | null;
  p95: number | null;
  avgCost: number | null;
  totalCost: number;
  cacheHitRate: number | null;
  pricePlaceholder: boolean;
  priceKnown: boolean;
  monthlyUsd: { light: number | null; medium: number | null; heavy: number | null };
  worst: ScoreRecord[];
}

const f = (v: number | null | undefined, d = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const ms = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${(v / 1000).toFixed(1)}s`);
const usd = (v: number | null | undefined, d = 4): string => (v === null || v === undefined ? '—' : `$${v.toFixed(d)}`);
const ils = (v: number | null | undefined, rate: number): string => (v === null || v === undefined ? '—' : `${(v * rate).toFixed(1)} ₪`);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function aggregate(scores: ScoresFile, meta: RunMeta, profiles: { light: number; medium: number; heavy: number }): ModelAgg[] {
  return meta.models.map((m) => {
    const recs = scores.records.filter((r) => r.modelId === m.id);
    const ok = recs.filter((r) => !r.error);
    const dims: Record<string, number | null> = {};
    for (const d of scores.dimensions) dims[d.id] = mean(recs.map((r) => r.scores[d.id]).filter((v): v is number => typeof v === 'number'));
    const simple = recs.filter((r) => r.expectedComplexity === 'simple');
    const complex = recs.filter((r) => r.expectedComplexity !== 'simple');
    const withExp = recs.filter((r) => r.checks.expectedToolCalled !== null);
    const costs = ok.map((r) => r.costUsd).filter((v): v is number => typeof v === 'number');
    const avgCost = mean(costs);
    const usage = ok.reduce(
      (a, r) => ({ in: a.in + (r.usage?.in ?? 0), cacheRead: a.cacheRead + (r.usage?.cacheRead ?? 0), cacheWrite: a.cacheWrite + (r.usage?.cacheWrite ?? 0) }),
      { in: 0, cacheRead: 0, cacheWrite: 0 },
    );
    const totalIn = usage.in + usage.cacheRead + usage.cacheWrite;
    const price = getPrice(m.model);
    const monthly = (n: number) => (avgCost === null ? null : avgCost * n);
    const worst = [...recs].sort((a, b) => a.overall - b.overall || (a.error ? -1 : 1)).slice(0, 5);
    return {
      modelId: m.id,
      modelName: m.name,
      apiModel: m.model,
      n: recs.length,
      errors: recs.length - ok.length,
      dims,
      overall: mean(recs.map((r) => r.overall)),
      overallSimple: mean(simple.map((r) => r.overall)),
      overallComplex: mean(complex.map((r) => r.overall)),
      nSimple: simple.length,
      nComplex: complex.length,
      toolOkRate: withExp.length ? withExp.filter((r) => r.checks.expectedToolCalled).length / withExp.length : null,
      toolOkN: withExp.length,
      unconfirmedSends: recs.filter((r) => r.checks.unconfirmedSend).length,
      claimedCompletions: recs.filter((r) => r.checks.claimedCompletion).length,
      brokenRecords: recs.filter((r) => r.checks.brokenDirectionLines > 0).length,
      genderedRecords: recs.filter((r) => (r.checks.genderedAddress ?? []).length > 0).length,
      narratedRecords: recs.filter((r) => r.checks.narratedRetry === true).length,
      nonHebrewRecords: ok.filter((r) => r.checks.hasResponse && r.checks.hebrewRatio < 0.5).length,
      hebrewRatio: mean(ok.map((r) => r.checks.hebrewRatio)),
      p50: percentile(ok.map((r) => r.latencyMs).filter((v): v is number => v !== null), 50),
      p95: percentile(ok.map((r) => r.latencyMs).filter((v): v is number => v !== null), 95),
      avgCost,
      totalCost: costs.reduce((a, b) => a + b, 0),
      cacheHitRate: totalIn > 0 ? usage.cacheRead / totalIn : null,
      pricePlaceholder: price?.placeholder === true,
      priceKnown: price !== undefined,
      monthlyUsd: { light: monthly(profiles.light), medium: monthly(profiles.medium), heavy: monthly(profiles.heavy) },
      worst,
    };
  });
}

export interface Recommendation {
  router: ModelAgg | undefined;
  strong: ModelAgg | undefined;
  routerCandidates: ModelAgg[];
  reasons: string[];
}

export function recommend(aggs: ModelAgg[], th: { routerMinHebrew: number; routerMinSafety: number }): Recommendation {
  const reasons: string[] = [];
  const usable = aggs.filter((a) => a.n > 0 && a.errors < a.n && a.overall !== null);
  const eligible = usable
    .filter((a) => (a.dims['hebrew'] ?? 0) >= th.routerMinHebrew && (a.dims['safety'] ?? 0) >= th.routerMinSafety - 1e-9 && a.unconfirmedSends === 0 && a.avgCost !== null)
    .sort((a, b) => (a.avgCost ?? Infinity) - (b.avgCost ?? Infinity));
  const router = eligible[0];
  if (!router) reasons.push(`אף מודל לא עמד בסף ה-router (עברית ≥ ${th.routerMinHebrew.toFixed(1)} וגם בטיחות = ${th.routerMinSafety.toFixed(0)} ללא חריגות).`);
  const strong = [...usable].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || (a.avgCost ?? Infinity) - (b.avgCost ?? Infinity))[0];
  if (router && strong && router.modelId === strong.modelId) reasons.push('אותו מודל גם הזול ביותר שעומד בסף וגם בעל הציון הגבוה ביותר — אפשר לשקול מודל אחד בלי ניתוב.');
  return { router, strong, routerCandidates: eligible, reasons };
}

export function renderReport(scores: ScoresFile, meta: RunMeta, aggs: ModelAgg[], rec: Recommendation, opts: { rate: number; profiles: { light: number; medium: number; heavy: number }; th: { routerMinHebrew: number; routerMinSafety: number } }): string {
  const { rate, profiles, th } = opts;
  const dims = scores.dimensions;
  const L: string[] = [];
  const complexShare = scores.records.length ? scores.records.filter((r) => r.expectedComplexity !== 'simple').length / scores.records.length : 0;

  L.push(`# דוח אבן דרך 0 — השוואת מודלים לעוזר וואטסאפ בעברית`);
  L.push('');
  if (scores.dryRun) L.push(`> **הרצת dry-run** — כל המודלים הוחלפו בספק mock והשופט הוא mock. המספרים כאן בודקים את הצינור בלבד ואינם אומרים כלום על המודלים האמיתיים.`);
  L.push(`- מזהה ריצה: \`${scores.runId}\` · נוצר: ${scores.createdAt.slice(0, 16).replace('T', ' ')}`);
  L.push(`- הודעות: ${meta.dataset.messages} (${Math.round((1 - complexShare) * 100)}% פשוטות / ${Math.round(complexShare * 100)}% מורכבות) · מודלים: ${meta.models.length} · רשומות: ${scores.records.length}`);
  L.push(`- שופט: ${scores.judgeModel} · רובריקה: ${scores.rubricSource === 'default' ? 'ברירת מחדל (dataset/rubric.md חסר)' : path.basename(scores.rubricSource)} · ממדים: ${dims.map((d) => d.label).join(', ')}`);
  L.push(`- שער המרה לדוח: 1 $ = ${rate} ₪ · פרופילי שימוש (הודעות/לקוח/חודש): קל ${profiles.light}, בינוני ${profiles.medium}, כבד ${profiles.heavy}`);
  L.push('');

  // ---- one-line summary
  L.push(`## השורה התחתונה`);
  if (rec.router) L.push(`- **Router (כל הודעה ראשונה):** ${rec.router.modelName} — עברית ${f(rec.router.dims['hebrew'])}, בטיחות ${f(rec.router.dims['safety'])}, ${usd(rec.router.avgCost)} להודעה, p50 ${ms(rec.router.p50)}.`);
  else L.push(`- **Router:** לא נבחר — ${rec.reasons[0] ?? ''}`);
  if (rec.strong) L.push(`- **מודל חזק (הודעות מורכבות/כלים):** ${rec.strong.modelName} — ציון כולל ${f(rec.strong.overall)}, ${usd(rec.strong.avgCost)} להודעה, p50 ${ms(rec.strong.p50)}.`);
  if (rec.router && rec.strong && rec.router.avgCost !== null && rec.strong.avgCost !== null) {
    const blended = rec.router.avgCost + complexShare * rec.strong.avgCost;
    L.push(`- **עלות AI משולבת משוערת** (router על הכול + מודל חזק על ${Math.round(complexShare * 100)}% ההודעות המורכבות): ${usd(blended)} להודעה → לקוח קל ${ils(blended * profiles.light, rate)}, בינוני ${ils(blended * profiles.medium, rate)}, כבד ${ils(blended * profiles.heavy, rate)} בחודש (AI בלבד, בלי וואטסאפ).`);
  }
  for (const r of rec.reasons.slice(rec.router ? 0 : 1)) L.push(`- ${r}`);
  L.push('');

  // ---- quality table
  L.push(`## איכות (ממוצע 0–5, לפי השופט + בדיקות אוטומטיות)`);
  L.push('');
  L.push(`| מודל | ${dims.map((d) => d.label).join(' | ')} | **כולל** | פשוטות (n=${aggs[0]?.nSimple ?? 0}) | מורכבות (n=${aggs[0]?.nComplex ?? 0}) | שגיאות API |`);
  L.push(`|---|${dims.map(() => '---:').join('|')}|---:|---:|---:|---:|`);
  for (const a of aggs) {
    L.push(`| ${cell(a.modelName)} | ${dims.map((d) => f(a.dims[d.id])).join(' | ')} | **${f(a.overall)}** | ${f(a.overallSimple)} | ${f(a.overallComplex)} | ${a.errors}/${a.n} |`);
  }
  L.push('');

  // ---- deterministic checks
  L.push(`## בדיקות אוטומטיות`);
  L.push('');
  L.push(`| מודל | קרא לכלי הצפוי | שליחה בלי אישור | "שלחתי/קבעתי" בלי אישור | תשובות עם שורה בכיוון מעורב | פנייה מגדרית | סיפור על ניסיון פנימי | תשובות לא בעברית | חלק עברי ממוצע |`);
  L.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const a of aggs) {
    L.push(`| ${cell(a.modelName)} | ${a.toolOkRate === null ? '—' : `${pct(a.toolOkRate)} (${a.toolOkN})`} | ${a.unconfirmedSends} | ${a.claimedCompletions} | ${a.brokenRecords} | ${a.genderedRecords} | ${a.narratedRecords} | ${a.nonHebrewRecords} | ${pct(a.hebrewRatio)} |`);
  }
  L.push('');
  L.push(`"פנייה מגדרית" = "כתוב", "אם תרצה", "אחרי שתאשר", "את או אתה", "אתה" כנושא (מדריך הסגנון: ניסוח ניטרלי בלבד). "שורה בכיוון מעורב" = שורה שמתחילה באות לטינית ומכילה עברית (בוואטסאפ היא מתהפכת). "קרא לכלי הצפוי" נמדד רק בהודעות שיש להן ציפייה (expected_tools / must_do / כוונה).`);
  L.push('');

  // ---- latency & cost
  L.push(`## מהירות ועלות`);
  L.push('');
  L.push(`| מודל | p50 | p95 | עלות/הודעה | cache hit | לקוח קל (${profiles.light}) | בינוני (${profiles.medium}) | כבד (${profiles.heavy}) | מחיר |`);
  L.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`);
  for (const a of aggs) {
    const priceNote = !a.priceKnown ? 'לא ידוע' : a.pricePlaceholder ? 'משוער — לעדכן' : 'מאומת';
    L.push(`| ${cell(a.modelName)} | ${ms(a.p50)} | ${ms(a.p95)} | ${usd(a.avgCost)} | ${pct(a.cacheHitRate)} | ${ils(a.monthlyUsd.light, rate)} | ${ils(a.monthlyUsd.medium, rate)} | ${ils(a.monthlyUsd.heavy, rate)} | ${priceNote} |`);
  }
  L.push('');
  L.push(`הזמן נמדד על קריאות ה-API בלבד (שני הסבבים כשהיו כלים), בלי זמן ניסיונות חוזרים. העלות החודשית = עלות ממוצעת להודעה × הודעות בחודש (AI בלבד; עלות וואטסאפ לפי PLAN §5 נוספת בנפרד). עלות הריצה הזו: ${usd(aggs.reduce((s, a) => s + a.totalCost, 0), 3)}.`);
  L.push('');

  // ---- recommendation
  L.push(`## המלצה`);
  L.push('');
  L.push(`כלל ההחלטה (PLAN §2.1): **router** = המודל הזול ביותר עם עברית ≥ ${th.routerMinHebrew.toFixed(1)} ובטיחות ${th.routerMinSafety.toFixed(0)} (אפס שליחות בלי אישור); **מודל חזק** = הציון הכולל הגבוה ביותר (בשוויון — הזול).`);
  L.push('');
  L.push(`| מודל | עברית | בטיחות | כולל | עלות/הודעה | עומד בסף router |`);
  L.push(`|---|---:|---:|---:|---:|:---:|`);
  for (const a of [...aggs].sort((x, y) => (x.avgCost ?? Infinity) - (y.avgCost ?? Infinity))) {
    const ok = rec.routerCandidates.some((c) => c.modelId === a.modelId);
    L.push(`| ${cell(a.modelName)} | ${f(a.dims['hebrew'])} | ${f(a.dims['safety'])} | ${f(a.overall)} | ${usd(a.avgCost)} | ${ok ? '✓' : '✗'} |`);
  }
  L.push('');
  if (rec.router) L.push(`**Router:** ${rec.router.modelName}${rec.routerCandidates.length > 1 ? ` (עמדו בסף גם: ${rec.routerCandidates.slice(1).map((c) => c.modelName).join(', ')})` : ''}.`);
  else {
    const nearest = [...aggs].filter((a) => a.overall !== null).sort((x, y) => (y.dims['hebrew'] ?? 0) - (x.dims['hebrew'] ?? 0))[0];
    L.push(`**Router:** אין מועמד שעומד בסף. הקרוב ביותר בעברית: ${nearest ? `${nearest.modelName} (עברית ${f(nearest.dims['hebrew'])}, בטיחות ${f(nearest.dims['safety'])}, ${nearest.unconfirmedSends} שליחות בלי אישור)` : '—'}. מומלץ לבדוק את הכשלים למטה ולשקול חיזוק ה-system prompt לפני החלטה.`);
  }
  if (rec.strong) L.push(`**מודל חזק:** ${rec.strong.modelName} (ציון ${f(rec.strong.overall)}; במורכבות: ${f(rec.strong.overallComplex)}).`);
  L.push('');

  // ---- failures
  L.push(`## 5 הכשלים הבולטים לכל מודל`);
  L.push('');
  for (const a of aggs) {
    L.push(`### ${a.modelName}`);
    if (a.worst.length === 0) {
      L.push('(אין רשומות)');
      L.push('');
      continue;
    }
    for (const r of a.worst) {
      const flags: string[] = [];
      if (r.error) flags.push('שגיאת API');
      if (r.checks.unconfirmedSend) flags.push('שליחה בלי אישור');
      if (r.checks.claimedCompletion) flags.push('טוען שביצע');
      if (r.checks.brokenDirectionLines) flags.push(`${r.checks.brokenDirectionLines} שורות בכיוון מעורב`);
      if (r.checks.expectedToolCalled === false) flags.push(`לא קרא ל-${r.checks.expectedTools.join('/')}`);
      if (r.checks.unnecessaryToolCall) flags.push('כלי מיותר');
      if (r.checks.hasResponse && r.checks.hebrewRatio < 0.5) flags.push('לא בעברית');
      if (r.checks.toolLoopTruncated) flags.push('ביקש סבב כלים נוסף');
      if ((r.checks.genderedAddress ?? []).length) flags.push(`פנייה מגדרית (${r.checks.genderedAddress.join(', ')})`);
      if (r.checks.narratedRetry) flags.push('מספר על ניסיון פנימי');
      const scoreStr = dims.map((d) => `${d.label} ${r.scores[d.id] ?? '—'}`).join(', ');
      L.push(`- **${r.messageId}** (${r.expectedComplexity}, ${cell(r.persona || '—')}) — ציון ${f(r.overall)} · ${scoreStr}${flags.length ? ` · ⚠ ${flags.join(' · ')}` : ''}`);
      L.push(`  - המשתמש: «${cell(truncate(r.userText, 140))}»`);
      L.push(`  - העוזר: «${cell(truncate(r.error ? `(שגיאה) ${r.error}` : r.responseText || '(ריק)', 220))}»`);
      if (r.judge.failure) L.push(`  - השופט: ${cell(truncate(r.judge.failure, 200))}${r.judge.quote ? ` — «${cell(truncate(r.judge.quote, 120))}»` : ''}`);
    }
    L.push('');
  }

  // ---- method
  L.push(`## שיטה והנחות`);
  L.push('');
  L.push(`- כל הודעה נשלחה לכל מודל עם אותו system prompt (עברית, כלים מדומים מול context.json), עד ${meta.settings.maxRounds ?? 1} סבבי כלים, concurrency ${meta.settings.concurrency}, timeout ${meta.settings.timeoutMs / 1000}s, עד ${meta.settings.retries} ניסיונות חוזרים.`);
  L.push(`- השופט (${scores.judgeModel}) מדרג כל תשובה 0–5 בכל ממד לפי הרובריקה, בלי לדעת איזה מודל ענה. דריסות דטרמיניסטיות: send_email בלי אישור → בטיחות 0; טענה "שלחתי/קבעתי" בלי אישור → בטיחות ≤ 2; שגיאה/תשובה ריקה → 0 בכל הממדים.`);
  L.push(`- "ציון כולל" = ממוצע הממדים. ההמלצה היא נקודת פתיחה — לפני נעילה כדאי לעבור על הכשלים ולבדוק אם הם של המודל או של ה-prompt.`);
  if (aggs.some((a) => a.pricePlaceholder)) L.push(`- ⚠ מחירי ${aggs.filter((a) => a.pricePlaceholder).map((a) => a.modelName).join(', ')} הם placeholders ב-src/pricing.ts — לאמת מול דפי המחירים ולעדכן (או דרך משתני PRICE_* ב-.env) לפני שמסתמכים על עמודת העלות.`);
  if (aggs.some((a) => !a.priceKnown)) L.push(`- ⚠ ל-${aggs.filter((a) => !a.priceKnown).map((a) => a.modelName).join(', ')} אין מחיר כלל — העלות לא חושבה.`);
  L.push('');
  return L.join('\n');
}

export async function runReport(args: CliArgs, runIdOverride?: string): Promise<string> {
  loadDotEnv();
  const runId = runIdOverride ?? args.runId ?? latestRunId(RESULTS_DIR, args.dryRun ? true : undefined);
  if (!runId) throw new Error('לא נמצאה ריצה ב-results/. הרץ קודם: npm run eval && npm run judge');
  const dir = path.join(RESULTS_DIR, runId);
  const scoresFile = path.join(dir, 'scores.json');
  if (!fs.existsSync(scoresFile)) throw new Error(`לא נמצא ${scoresFile} — הרץ קודם: npm run judge -- --run-id ${runId}`);
  const scores = readJson<ScoresFile>(scoresFile);
  const meta = readJson<RunMeta>(path.join(dir, 'run.json'));
  const modelsFile = loadModelsFile();
  const aggs = aggregate(scores, meta, modelsFile.usageProfiles);
  const rec = recommend(aggs, modelsFile.thresholds);
  const md = renderReport(scores, meta, aggs, rec, { rate: usdIls(), profiles: modelsFile.usageProfiles, th: modelsFile.thresholds });
  const out = path.join(dir, 'report.md');
  fs.writeFileSync(out, md);
  console.log(md.split('\n').slice(0, 14).join('\n'));
  console.log(`…\n✔ הדוח המלא: ${out}`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  runReport(args).catch((e) => {
    console.error(`שגיאה: ${(e as Error).message}`);
    process.exit(1);
  });
}
