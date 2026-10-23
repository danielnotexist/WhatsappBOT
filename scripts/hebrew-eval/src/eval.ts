import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, HELP, type CliArgs } from './cli.js';
import { loadDotEnv, requireEnv, RESULTS_DIR } from './env.js';
import { loadDataset } from './dataset.js';
import { loadModelsFile, selectModels, PROVIDER_ENV } from './models.js';
import { createProvider } from './providers/index.js';
import { ProviderError } from './providers/http.js';
import type { NeutralMessage, Provider, ToolResult } from './providers/types.js';
import { buildSystemPrompt, TOOL_DEFS } from './system-prompt.js';
import { executeTool } from './mock-tools.js';
import { explicitConfirmation } from './checks.js';
import { appendJsonl, pMap, readJson, readJsonl, sleep, timestampId, writeJson, mean } from './util.js';
import { ESTIMATE_PROFILES, SpendLedger, estimateUsd } from './spend.js';
import fs from 'node:fs';
import type { DatasetMessage, EvalContext, EvalRecord, ModelRun, ToolCallRecord, Usage } from './types.js';

export interface RunMeta {
  runId: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt?: string;
  models: { id: string; name: string; provider: string; model: string }[];
  dataset: { messages: number; sources: { messages: string; context: string; rubric: string | undefined } };
  settings: { concurrency: number; timeoutMs: number; retries: number; maxRounds?: number };
}

const addUsage = (a: Usage, b: Usage): Usage => ({ in: a.in + b.in, out: a.out + b.out, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });

async function withRetry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<{ value: T; attempts: number }> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return { value: await fn(), attempts: attempt };
    } catch (e) {
      const pe = e instanceof ProviderError ? e : undefined;
      const retryable = pe ? pe.retryable : false;
      if (!retryable || attempt > retries) throw e;
      const backoff = Math.max(pe?.retryAfterMs ?? 0, 1000 * 2 ** (attempt - 1)) + Math.random() * 500;
      console.warn(`  ↻ ${label}: ניסיון ${attempt} נכשל (${(e as Error).message.slice(0, 120)}) — ממתין ${Math.round(backoff)}ms`);
      await sleep(backoff);
    }
  }
}

/** One message against one model: up to `maxRounds` tool round-trips (default 4), like the product's tool loop. */
export async function runMessage(
  provider: Provider,
  message: DatasetMessage,
  system: string,
  context: EvalContext,
  opts: { timeoutMs: number; retries: number; maxRounds?: number },
): Promise<{ run: ModelRun; attempts: number }> {
  const maxRounds = Math.max(1, opts.maxRounds ?? 4);
  const userConfirmed = explicitConfirmation(message);
  const messages: NeutralMessage[] = [{ role: 'user', content: message.text }];
  const label = `${provider.id}/${message.id}`;
  const r1 = await withRetry(() => provider.run(system, messages, TOOL_DEFS, { timeoutMs: opts.timeoutMs }), opts.retries, label);
  let attempts = r1.attempts;
  let usage = r1.value.usage;
  let cost = r1.value.costUsd;
  let text = r1.value.text;
  let latencyMs = r1.value.latencyMs;
  let rounds = 1;
  let stopReason = r1.value.stopReason;
  let toolLoopTruncated = false;
  const toolCalls: ToolCallRecord[] = [];

  let last = r1.value;
  while (last.toolCalls.length > 0) {
    if (rounds >= maxRounds + 1) {
      toolLoopTruncated = true; // still asking for tools after the last allowed round: record, don't execute
      for (const c of last.toolCalls) toolCalls.push({ id: c.id, name: c.name, input: c.input, round: rounds });
      break;
    }
    const round = rounds;
    const results: ToolResult[] = last.toolCalls.map((c) => {
      const ex = executeTool(c.name, c.input, context, userConfirmed, { smallHours: message.small_hours === true });
      toolCalls.push({ id: c.id, name: c.name, input: c.input, result: ex.output, round });
      return { id: c.id, name: c.name, output: ex.output, isError: ex.isError };
    });
    messages.push({ role: 'assistant', content: last.text, toolCalls: last.toolCalls, raw: last.raw });
    messages.push({ role: 'tool', results });
    const next = await withRetry(() => provider.run(system, messages, TOOL_DEFS, { timeoutMs: opts.timeoutMs }), opts.retries, `${label}#${round + 1}`);
    attempts += next.attempts - 1;
    rounds++;
    usage = addUsage(usage, next.value.usage);
    cost = cost === null || next.value.costUsd === null ? null : cost + next.value.costUsd;
    text = next.value.text || text;
    latencyMs += next.value.latencyMs;
    stopReason = next.value.stopReason;
    last = next.value;
  }

  return {
    run: { text, toolCalls, usage, latencyMs, firstRoundLatencyMs: r1.value.latencyMs, costUsd: cost, rounds, stopReason, toolLoopTruncated },
    attempts,
  };
}

export async function runEval(args: CliArgs): Promise<string> {
  loadDotEnv();
  const modelsFile = loadModelsFile();
  const models = selectModels(modelsFile, args.models);
  if (!args.dryRun) {
    requireEnv(models.map((m) => PROVIDER_ENV[m.provider]).filter((v): v is string => Boolean(v)));
  }
  const dataset = loadDataset({ dir: args.dataset, limit: args.limit, ids: args.ids });
  const runId = args.runId ?? timestampId(args.dryRun ? 'dry-' : '');
  const outDir = path.join(RESULTS_DIR, runId);
  const ledger = new SpendLedger(outDir, 'eval', args.dryRun ? undefined : args.budgetUsd);
  const systemFor = (message: DatasetMessage) => buildSystemPrompt(dataset.context, message);
  const providers = models.map((m) => createProvider(m, { dryRun: args.dryRun }));

  // Re-running with the same --run-id (other models / subset) merges into the existing run.json.
  const metaFile = path.join(outDir, 'run.json');
  const previous = fs.existsSync(metaFile) ? readJson<RunMeta>(metaFile) : undefined;
  const newModels = models.map((m) => ({ id: m.id, name: m.name, provider: args.dryRun ? 'mock' : m.provider, model: m.model }));
  const mergedModels = [...(previous?.models ?? []).filter((m) => !newModels.some((n) => n.id === m.id)), ...newModels];
  const meta: RunMeta = {
    runId,
    dryRun: args.dryRun,
    startedAt: previous?.startedAt ?? new Date().toISOString(),
    models: mergedModels,
    dataset: { messages: Math.max(previous?.dataset.messages ?? 0, dataset.messages.length), sources: dataset.sources },
    settings: { concurrency: args.concurrency, timeoutMs: args.timeoutMs, retries: args.retries, maxRounds: args.maxRounds },
  };
  writeJson(metaFile, meta);

  console.log(`▶ ריצה ${runId}${args.dryRun ? ' (dry-run, ספק mock)' : ''}: ${dataset.messages.length} הודעות × ${models.length} מודלים, concurrency=${args.concurrency}`);
  console.log(`  דאטהסט: ${dataset.sources.messages}`);

  // resume support: skip (model, message) pairs already in the jsonl
  const done = new Map<string, Set<string>>();
  for (const p of providers) {
    const existing = readJsonl<EvalRecord>(path.join(outDir, `${p.id}.jsonl`)).filter((r) => !r.error && !(args.redoTruncated && r.result?.toolLoopTruncated));
    done.set(p.id, new Set(existing.map((r) => r.message.id)));
  }

  const tasks: { provider: Provider; message: DatasetMessage }[] = [];
  for (const message of dataset.messages) for (const provider of providers) if (!done.get(provider.id)?.has(message.id)) tasks.push({ provider, message });
  if (tasks.length === 0) console.log('  כל הרשומות כבר קיימות — אין מה להריץ (מחק את תיקיית הריצה כדי להריץ מחדש).');
  if (!args.dryRun) {
    const estimate = tasks.reduce((s, t) => s + estimateUsd(t.provider.model, 1, ESTIMATE_PROFILES.evalMessage), 0);
    ledger.assertEstimate(`${tasks.length} קריאות`, estimate);
  }
  let stoppedByBudget = false;

  let completed = 0;
  const t0 = Date.now();
  await pMap(
    tasks,
    async ({ provider, message }) => {
      const record: EvalRecord = {
        runId,
        modelId: provider.id,
        modelName: provider.name,
        message,
        attempts: 1,
        ts: new Date().toISOString(),
        dryRun: args.dryRun,
      };
      if (ledger.exceeded()) {
        stoppedByBudget = true;
        return; // nothing appended → the pair stays pending and can be resumed with the same --run-id
      }
      try {
        const { run, attempts } = await runMessage(provider, message, systemFor(message), dataset.context, { timeoutMs: args.timeoutMs, retries: args.retries, maxRounds: args.maxRounds });
        record.result = run;
        record.attempts = attempts;
        ledger.add(run.costUsd);
      } catch (e) {
        record.error = (e as Error).message;
        console.warn(`  ✗ ${provider.id}/${message.id}: ${record.error.slice(0, 200)}`);
      }
      appendJsonl(path.join(outDir, `${provider.id}.jsonl`), record);
      completed++;
      if (completed % 10 === 0 || completed === tasks.length) {
        console.log(`  … ${completed}/${tasks.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    },
    args.concurrency,
  );

  meta.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, 'run.json'), meta);

  // short summary
  for (const p of providers) {
    const recs = readJsonl<EvalRecord>(path.join(outDir, `${p.id}.jsonl`));
    const ok = recs.filter((r) => r.result);
    const lat = mean(ok.map((r) => r.result!.latencyMs));
    const cost = ok.reduce((s, r) => s + (r.result!.costUsd ?? 0), 0);
    console.log(`  ${p.id}: ${ok.length}/${recs.length} הצליחו, latency ממוצע ${lat === null ? '—' : Math.round(lat)}ms, עלות $${cost.toFixed(4)}`);
  }
  if (!args.dryRun) console.log(`  הוצאה מצטברת לריצה: $${ledger.total.toFixed(3)}`);
  if (stoppedByBudget) throw new Error(ledger.budgetMessage());
  console.log(`✔ תוצאות: ${outDir}`);
  return runId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  runEval(args).catch((e) => {
    console.error(`שגיאה: ${(e as Error).message}`);
    process.exit(1);
  });
}
