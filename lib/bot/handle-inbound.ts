import "server-only";
import { getAiProvider } from "@/lib/ai";
import { spendGuardFromEnv } from "@/lib/ai/budget";
import { entitlements } from "@/lib/billing/plans";
import { getDb, type Db } from "@/lib/db";
import { getHyp } from "@/lib/hyp";
import { getSttProvider } from "@/lib/stt";
import { getWaSender, type WaSender } from "@/lib/wa";
import type { InboundMessage } from "@/lib/wa/types";
import { activeMicrosoftConnection, graphForConnection, graphForUser } from "@/lib/ms";
import { graphExecutors, graphTools, teamsAvailability } from "@/lib/ms/tools";
import { msHasScope } from "@/lib/ms/oauth";
import { activeGoogleConnection, googleForConnection, googleForUser } from "@/lib/google";
import { providerForAction, routeExecutorsByProvider } from "@/lib/google/dispatch";
import { googleExecutors, googleTools } from "@/lib/google/tools";
import { gmailReadConsentLink } from "@/lib/google/gmail-tools";
import { googleConsentLink } from "@/lib/google/consent";
import { meetingSummaryTool } from "@/lib/meetings/tools";
import { meetingWorkspace } from "@/lib/meetings/workspace-server";
import { connectLinkFor, type BotContext } from "./context";
import { registerExecutor } from "./pending";
import { processInbound } from "./process-inbound";

let executorsRegistered = false;

/**
 * The production bot context: the process-wide singletons (and the Graph/Google tools/executors) for the pure pipeline.
 * `overrides` swap the data layer view and the sender — the website chat (app/api/demo/chat) records the replies of one
 * request instead of sending them, through the very same pipeline.
 */
export function botContext(overrides: { db?: Db; wa?: WaSender } = {}): BotContext {
  const db = overrides.db ?? getDb();
  if (!executorsRegistered) {
    const base = getDb();
    const microsoft = graphExecutors(async (userId) => {
      const user = await base.getUser(userId);
      if (!user) return null;
      const g = await graphForUser(base, user);
      return g ? { graph: g.graph, timeZone: g.timeZone, connection: g.connection } : null;
    });
    const google = googleExecutors(async (userId) => {
      const user = await base.getUser(userId);
      return user ? googleForUser(base, user) : null;
    });
    const ex = routeExecutorsByProvider({ microsoft, google }, (action) => providerForAction(base, action));
    for (const [kind, fn] of Object.entries(ex)) registerExecutor(kind as keyof typeof ex, fn);
    executorsRegistered = true;
  }
  const workspace = meetingWorkspace(db);
  const ctx: BotContext = {
    db,
    meetingWorkspace: workspace,
    wa: overrides.wa ?? getWaSender(),
    ai: getAiProvider(),
    now: () => new Date(),
    appUrl: process.env.APP_URL || "http://localhost:3000",
    stt: getSttProvider,
    hyp: getHyp,
    spend: spendGuardFromEnv(db),
    async extraTools(user, connections, plan) {
      const ms = activeMicrosoftConnection(connections);
      const g = activeGoogleConnection(connections);
      // the plan's services (lib/billing/plans.ts); unknown → pro, and the orchestrator gates by name again
      const ent = entitlements(plan ?? "pro");
      return [
        ...(ms ? graphTools({ graph: async () => graphForConnection(db, ms), timeZone: user.timezone, connection: ms, scopes: ms.scopes, connectLink: () => connectLinkFor(ctx, user.id, "microsoft"), entitlements: ent }) : []),
        ...(g
          ? googleTools({
              google: async () => googleForConnection(db, g),
              timeZone: user.timezone,
              scopes: g.scopes,
              accountEmail: g.account_email,
              gmailConsentLink: () => gmailReadConsentLink(ctx, user.id),
              consentLink: (feature) => googleConsentLink(ctx, user.id, feature),
              entitlements: ent,
            })
          : []),
        // pro: "סיכום של הפגישה האחרונה" (lib/meetings/tools.ts; the orchestrator gates it by name too)
        ...(ent.meetingSummaries && (ms || g) ? [meetingSummaryTool({ workspace, user })] : []),
      ];
    },
    async mailMarker(user) {
      // "לסמן כחשוד" (lib/proactive/actions.ts): Microsoft 365 only, and only with Mail.ReadWrite in the grant
      const ms = activeMicrosoftConnection(await db.listConnections(user.id));
      if (!ms || !msHasScope(ms.scopes, "Mail.ReadWrite")) return null;
      const graph = await graphForConnection(db, ms);
      return { markSuspicious: (messageId: string) => graph.markSuspicious(messageId) };
    },
    onlineMeetingCheck(connections) {
      const ms = activeMicrosoftConnection(connections);
      // only Microsoft can be asked (Google: lib/online-meeting.ts); any failure → unknown, the executor checks again
      return async (provider) => {
        if (provider !== "microsoft" || !ms) return null;
        try {
          return await teamsAvailability(await graphForConnection(db, ms), ms);
        } catch {
          return null;
        }
      };
    },
  };
  return ctx;
}

/** Production entry for one WhatsApp message (the worker). */
export async function handleInbound(message: InboundMessage): Promise<{ handled: boolean; note?: string }> {
  return processInbound(botContext(), message);
}
