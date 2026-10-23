import type { AiProvider } from "@/lib/ai/types";
import type { UserRow } from "@/lib/db/types";
import type { GoogleClient } from "@/lib/google/client";
import type { ProactiveDeps } from "@/lib/jobs/proactive";
import type { GraphClient } from "@/lib/ms/graph";

/**
 * The user's two workspaces as the meeting summaries see them (lib/meetings): the client and the grant of the active
 * connection the plan works with (null when not connected, or paused on a one-account plan). Production wiring:
 * lib/meetings/workspace-server.ts; tests hand in fixtures.
 */
export interface MeetingWorkspace {
  microsoft(user: UserRow): Promise<{ graph: GraphClient; accountEmail: string | null; scopes: string[] } | null>;
  google(user: UserRow): Promise<{ google: GoogleClient; accountEmail: string | null; scopes: string[] } | null>;
}

/** What the meeting jobs need on top of a proactive message: the workspaces, the model, the site's URL (consent links). */
export interface MeetingDeps extends ProactiveDeps {
  workspace: MeetingWorkspace;
  /** the summary's model calls (strong + router tiers), already behind the spend guard when one is configured */
  ai: AiProvider;
  appUrl: string;
}
