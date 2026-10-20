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
import { appendJsonl, pMap, readJsonl, sleep, timestampId, writeJson, mean } from './util.js';
import type { DatasetMessage, EvalContext, EvalRecord, ModelRun, ToolCallRecord, Usage } from './types.js';

export interface RunMeta {
  runId: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt?: string;
  models: { id: string; name: string; provider: string; model: string }[];
  dataset: { messages: number; sources: { messages: string; context: string; rubric: string | undefined } };
  settings: { concurrency: number; timeoutMs: number; retries: number };
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

/** One message against one model: up to one tool round-trip. */
export async function runMessage(
  provider: Provider,
  message: DatasetMessage,
  system: string,
  context: EvalContext,
  opts: { timeoutMs: number; retries: number },
): Promise<{ run: ModelRun; attempts: number }> {
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

  if (r1.value.toolCalls.length > 0) {
    const results: ToolResult[] = r1.value.toolCalls.map((c) => {
      const ex = executeTool(c.name, c.input, context, userConfirmed);
      toolCalls.push({ id: c.id, name: c.name, input: c.input, result: ex.output, round: 1 });
      return { id: c.id, name: c.name, output: ex.output, isError: ex.isError };
    });
    messages.push({ role: 'assistant', content: r1.value.text, toolCalls: r1.value.toolCalls, raw: r1.value.raw });
    messages.push({ role: 'tool', results });
    const r2 = await withRetry(() => provider.run(system, messages, TOOL_DEFS, { timeoutMs: opts.timeoutMs }), opts.retries, label + '#2');
    attempts += r2.attempts - 1;
    rounds = 2;
    usage = addUsage(usage, r2.value.usage);
    cost = cost === null || r2.value.costUsd === null ? null : cost + r2.value.costUsd;
    text = r2.value.text || r1.value.text;
    latencyMs += r2.value.latencyMs;
    stopReason = r2.value.stopReason;
    if (r2.value.toolCalls.length > 0) {
      toolLoopTruncated = true; // 1 round-trip max: record what it wanted, don't execute
      for (const c of r2.value.toolCalls) toolCalls.push({ id: c.id, name: c.name, input: c.input, round: 2 });
    }
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
  const dataset = loadDataset({ dir: args.dataset, limit: args.limit });
  const runId = args.runId ?? timestampId(args.dryRun ? 'dry-' : '');
  const outDir = path.join(RESULTS_DIR, runId);
  const system = buildSystemPrompt(dataset.context);
  const providers = models.map((m) => createProvider(m, { dryRun: args.dryRun }));

  const meta: RunMeta = {
    runId,
    dryRun: args.dryRun,
    startedAt: new Date().toISOString(),
    models: models.map((m) => ({ id: m.id, name: m.name, provider: args.dryRun ? 'mock' : m.provider, model: m.model })),
    dataset: { messages: dataset.messages.length, sources: dataset.sources },
    settings: { concurrency: args.concurrency, timeoutMs: args.timeoutMs, retries: args.retries },
  };
  writeJson(path.join(outDir, 'run.json'), meta);

  console.log(`▶ ריצה ${runId}${args.dryRun ? ' (dry-run, ספק mock)' : ''}: ${dataset.messages.length} הודעות × ${models.length} מודלים, concurrency=${args.concurrency}`);
  console.log(`  דאטהסט: ${dataset.sources.messages}`);

  // resume support: skip (model, message) pairs already in the jsonl
  const done = new Map<string, Set<string>>();
  for (const p of providers) {
    const existing = readJsonl<EvalRecord>(path.join(outDir, `${p.id}.jsonl`)).filter((r) => !r.error);
    done.set(p.id, new Set(existing.map((r) => r.message.id)));
  }

  const tasks: { provider: Provider; message: DatasetMessage }[] = [];
  for (const message of dataset.messages) for (const provider of providers) if (!done.get(provider.id)?.has(message.id)) tasks.push({ provider, message });
  if (tasks.length === 0) console.log('  כל הרשומות כבר קיימות — אין מה להריץ (מחק את תיקיית הריצה כדי להריץ מחדש).');

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
      try {
        const { run, attempts } = await runMessage(provider, message, system, dataset.context, { timeoutMs: args.timeoutMs, retries: args.retries });
        record.result = run;
        record.attempts = attempts;
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
