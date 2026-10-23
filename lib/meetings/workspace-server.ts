import "server-only";
import { effectivePlan, providerGate } from "@/lib/billing/plans";
import type { ConnectionProvider, Db, UserRow } from "@/lib/db/types";
import { googleForUser } from "@/lib/google";
import { graphForUser } from "@/lib/ms";
import type { MeetingWorkspace } from "./workspace";

/** Production MeetingWorkspace: the active connections in force (a paused second account is left out). */
export function meetingWorkspace(db: Db): MeetingWorkspace {
  const paused = async (user: UserRow, provider: ConnectionProvider) => {
    const [sub, connections] = await Promise.all([db.getSubscription(user.id), db.listConnections(user.id)]);
    return providerGate(connections, effectivePlan(sub, new Date())).paused.includes(provider);
  };
  return {
    async microsoft(user) {
      if (await paused(user, "microsoft")) return null;
      const g = await graphForUser(db, user);
      return g ? { graph: g.graph, accountEmail: g.connection.account_email, scopes: g.connection.scopes } : null;
    },
    async google(user) {
      if (await paused(user, "google")) return null;
      const g = await googleForUser(db, user);
      return g ? { google: g.google, accountEmail: g.connection.account_email, scopes: g.connection.scopes } : null;
    },
  };
}
