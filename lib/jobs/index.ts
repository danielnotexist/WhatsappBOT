import "server-only";
import { getAiProvider } from "@/lib/ai";
import { spendGuardFromEnv } from "@/lib/ai/budget";
import { effectivePlan, providerGate } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import type { ConnectionProvider, UserRow } from "@/lib/db/types";
import { googleForUser } from "@/lib/google";
import { GmailReader } from "@/lib/google/gmail";
import { GOOGLE_SCOPES, gmailReadActive, hasScope } from "@/lib/google/oauth";
import { graphForUser } from "@/lib/ms";
import { getWaSender } from "@/lib/wa";
import type { JobDeps } from "./run";

/** Production wiring for the scheduled jobs (process-wide db / WhatsApp sender / Graph and Google per user). */
export function getJobDeps(): JobDeps {
  const db = getDb();
  /** a second account on a one-account plan is paused: the morning summary leaves it out (lib/billing/plans.ts) */
  const paused = async (user: UserRow, provider: ConnectionProvider) => {
    const [sub, connections] = await Promise.all([db.getSubscription(user.id), db.listConnections(user.id)]);
    return providerGate(connections, effectivePlan(sub, new Date())).paused.includes(provider);
  };
  // the proactive checks' cheap model calls (lib/proactive/classify.ts) pass the daily spend cap when one is configured
  // (AI_DAILY_BUDGET_USD — reserved before each call, settled after); no user turn behind them, so no per-user count
  const guard = spendGuardFromEnv(db);
  const ai = guard ? guard.anonymousAi(getAiProvider(), 20_000) : getAiProvider();
  return {
    db,
    wa: getWaSender(),
    now: () => new Date(),
    ai,
    async graphFor(user) {
      if (await paused(user, "microsoft")) return null;
      const g = await graphForUser(db, user);
      return g ? { graph: g.graph, accountEmail: g.connection.account_email, scopes: g.connection.scopes } : null;
    },
    async googleFor(user) {
      if (await paused(user, "google")) return null;
      const g = await googleForUser(db, user);
      if (!g) return null;
      // Gmail section only when this connection granted gmail.readonly (lib/google/user-cap.ts) and the feature is on
      // (GOOGLE_GMAIL_READ_ENABLED=false is a kill switch for every connection)
      const gmail = gmailReadActive() && hasScope(g.connection.scopes, GOOGLE_SCOPES.gmailReadonly) ? new GmailReader(g.google) : null;
      return { google: g.google, gmail, accountEmail: g.connection.account_email };
    },
  };
}
