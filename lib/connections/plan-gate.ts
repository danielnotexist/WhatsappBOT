import { createPayLinkToken } from "@/lib/billing/pay-link";
import { effectivePlan, entitlements, mayConnect, type EffectivePlan } from "@/lib/billing/plans";
import type { ConnectionProvider, Db } from "@/lib/db/types";
import type { GoogleFeature } from "@/lib/google/oauth";

/**
 * The plan's gate on the OAuth start routes (/api/auth/{google,microsoft}/start), server side: the split of 23.10.2026
 * (lib/billing/plans.ts entitlements) is enforced where a connection or a scope is asked for, not only in the UI.
 *   - "second_account": a one-account plan (basic, the trial) already works with the other provider;
 *   - "pro_feature":    an incremental consent for a pro-only Google scope (drive.readonly, Tasks).
 * A refusal lands on the personal pay page with a fixed notice code (`?why=` — never text from the URL): the upgrade
 * face for an active basic plan, the plan choice otherwise (app/pay/[token]/page.tsx).
 */
export type PlanGateReason = "second_account" | "pro_feature";

export const PLAN_GATE_REASONS: readonly PlanGateReason[] = ["second_account", "pro_feature"];

export function isPlanGateReason(x: unknown): x is PlanGateReason {
  return typeof x === "string" && (PLAN_GATE_REASONS as readonly string[]).includes(x);
}

/** Why this plan may not start this connect (null = it may). Pure: unit-tested in plan-gate.test.ts. */
export function planGate(
  plan: EffectivePlan,
  connections: Parameters<typeof mayConnect>[0],
  provider: ConnectionProvider,
  feature: GoogleFeature | null = null,
): PlanGateReason | null {
  if (!mayConnect(connections, plan, provider)) return "second_account";
  const e = entitlements(plan);
  if (feature === "drive_read" && !e.driveFullRead) return "pro_feature";
  if (feature === "tasks" && !e.tasks) return "pro_feature";
  return null;
}

/** The user's plan in force and connections, and the gate for this start. */
export async function planGateFor(db: Db, userId: string, provider: ConnectionProvider, feature: GoogleFeature | null = null, now = new Date()): Promise<{ plan: EffectivePlan; reason: PlanGateReason | null }> {
  const [sub, connections] = await Promise.all([db.getSubscription(userId), db.listConnections(userId)]);
  const plan = effectivePlan(sub, now);
  return { plan, reason: planGate(plan, connections, provider, feature) };
}

/** Where a refused start goes: the personal pay page (7-day link, no session needed) with the reason's notice. */
export function planGateUrl(appUrl: string, userId: string, reason: PlanGateReason): string {
  const url = new URL(`/pay/${createPayLinkToken(userId)}`, appUrl);
  url.searchParams.set("why", reason);
  return url.toString();
}
