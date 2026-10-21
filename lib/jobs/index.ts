import "server-only";
import { getDb } from "@/lib/db";
import { googleForUser } from "@/lib/google";
import { GmailReader } from "@/lib/google/gmail";
import { GOOGLE_SCOPES, hasScope } from "@/lib/google/oauth";
import { graphForUser } from "@/lib/ms";
import { getWaSender } from "@/lib/wa";
import type { JobDeps } from "./run";

/** Production wiring for the scheduled jobs (process-wide db / WhatsApp sender / Graph and Google per user). */
export function getJobDeps(): JobDeps {
  const db = getDb();
  return {
    db,
    wa: getWaSender(),
    now: () => new Date(),
    async graphFor(user) {
      const g = await graphForUser(db, user);
      return g ? { graph: g.graph, accountEmail: g.connection.account_email } : null;
    },
    async googleFor(user) {
      const g = await googleForUser(db, user);
      if (!g) return null;
      // Gmail section only when this connection granted gmail.readonly (lib/google/user-cap.ts)
      const gmail = hasScope(g.connection.scopes, GOOGLE_SCOPES.gmailReadonly) ? new GmailReader(g.google) : null;
      return { google: g.google, gmail, accountEmail: g.connection.account_email };
    },
  };
}
