import "server-only";
import { getAiProvider } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { getSttProvider } from "@/lib/stt";
import { getWaSender } from "@/lib/wa";
import type { InboundMessage } from "@/lib/wa/types";
import { activeMicrosoftConnection, graphForConnection, graphForUser } from "@/lib/ms";
import { graphExecutors, graphTools } from "@/lib/ms/tools";
import type { BotContext } from "./context";
import { registerExecutor } from "./pending";
import { processInbound } from "./process-inbound";

let executorsRegistered = false;

/** Production entry: wires the process-wide singletons (and the Graph tools/executors) into the pure pipeline. */
export async function handleInbound(message: InboundMessage): Promise<{ handled: boolean; note?: string }> {
  const db = getDb();
  if (!executorsRegistered) {
    const ex = graphExecutors(async (userId) => {
      const user = await db.getUser(userId);
      if (!user) return null;
      const g = await graphForUser(db, user);
      return g ? { graph: g.graph, timeZone: g.timeZone } : null;
    });
    for (const [kind, fn] of Object.entries(ex)) registerExecutor(kind as keyof typeof ex, fn);
    executorsRegistered = true;
  }
  const ctx: BotContext = {
    db,
    wa: getWaSender(),
    ai: getAiProvider(),
    now: () => new Date(),
    appUrl: process.env.APP_URL || "http://localhost:3000",
    stt: getSttProvider,
    async extraTools(user, connections) {
      const conn = activeMicrosoftConnection(connections);
      if (!conn) return [];
      return graphTools({ graph: async () => graphForConnection(db, conn), timeZone: user.timezone });
    },
  };
  return processInbound(ctx, message);
}
