import fs from 'node:fs';
import path from 'node:path';
import { computeCost, getPrice } from './pricing.js';
import type { Usage } from './types.js';

/**
 * Spend ledger — one JSON file per run (results/<run-id>/spend.json) shared by eval and judge,
 * so a `--budget` cap applies to the whole run (every invocation, every phase).
 */
export interface SpendFile {
  totalUsd: number;
  phases: Record<string, number>;
  updatedAt: string;
}

export class SpendLedger {
  private file: string;
  private data: SpendFile;

  constructor(runDir: string, private phase: string, private budgetUsd: number | undefined) {
    this.file = path.join(runDir, 'spend.json');
    this.data = fs.existsSync(this.file)
      ? (JSON.parse(fs.readFileSync(this.file, 'utf8')) as SpendFile)
      : { totalUsd: 0, phases: {}, updatedAt: new Date().toISOString() };
    this.data.phases[phase] ??= 0;
  }

  get total(): number {
    return this.data.totalUsd;
  }

  add(usd: number | null | undefined): void {
    if (!usd || !Number.isFinite(usd)) return;
    this.data.totalUsd += usd;
    this.data.phases[this.phase] = (this.data.phases[this.phase] ?? 0) + usd;
    this.data.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  /** true when a budget is set and the running total already exceeds it. */
  exceeded(): boolean {
    return this.budgetUsd !== undefined && this.data.totalUsd >= this.budgetUsd;
  }

  /** Throws (Hebrew) when the up-front estimate for the planned calls would blow the cap. */
  assertEstimate(label: string, estimateUsd: number): void {
    if (this.budgetUsd === undefined) return;
    const projected = this.data.totalUsd + estimateUsd;
    console.log(`  תקציב: $${this.budgetUsd.toFixed(2)} · הוצא עד כה $${this.data.totalUsd.toFixed(3)} · הערכה ל-${label}: $${estimateUsd.toFixed(3)} → צפוי $${projected.toFixed(3)}`);
    if (projected > this.budgetUsd) {
      throw new Error(
        `ההערכה ל-${label} ($${estimateUsd.toFixed(2)}) + מה שכבר הוצא ($${this.data.totalUsd.toFixed(2)}) חורגת מהתקציב $${this.budgetUsd.toFixed(2)}. צמצם עם --models / --limit / --ids או הגדל --budget.`,
      );
    }
  }

  budgetMessage(): string {
    return `התקציב ($${this.budgetUsd?.toFixed(2)}) נוצל — הריצה נעצרה אחרי $${this.data.totalUsd.toFixed(3)}. אפשר להמשיך מאותו --run-id עם --budget גדול יותר.`;
  }
}

/** Rough per-call usage profiles for the up-front estimate (tokens). Conservative on purpose. */
export const ESTIMATE_PROFILES = {
  /** one dataset message incl. an average of ~1.6 rounds (tool round) */
  evalMessage: { in: 1400, out: 600, cacheRead: 9000, cacheWrite: 300 } as Usage,
  /** one judge call: rubric cached, message + response + tool results uncached */
  judgeRecord: { in: 1500, out: 300, cacheRead: 9000, cacheWrite: 100 } as Usage,
};

export function estimateUsd(modelId: string, calls: number, profile: Usage): number {
  if (!getPrice(modelId)) return 0;
  return (computeCost(modelId, profile) ?? 0) * calls;
}
