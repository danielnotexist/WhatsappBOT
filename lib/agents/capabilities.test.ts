import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_TOOLS } from "@/lib/ai/tools";
import type { GoogleClient } from "@/lib/google/client";
import { GOOGLE_SCOPES } from "@/lib/google/oauth";
import { googleTools } from "@/lib/google/tools";
import type { GraphClient } from "@/lib/ms/graph";
import { graphTools } from "@/lib/ms/tools";
import { proFeatureTool } from "@/lib/ai/plan-tools";
import { CAPABILITIES, CAPABILITY_IDS, MAIN_ONLY_TOOLS, TOOL_BUNDLES, capabilityOfTool, capsLine, normalizeCapabilities, toolsForAgent } from "./capabilities";
import { BUILTIN_AGENTS, BUILTIN_ORDER } from "./templates";

const graph = graphTools({ graph: async () => ({}) as GraphClient, timeZone: "Asia/Jerusalem" });
const googleAll = googleTools({ google: async () => ({}) as GoogleClient, timeZone: "Asia/Jerusalem", scopes: [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.driveFile, GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailReadonly], accountEmail: null, gmailReadEnabled: true });
const googleBase = googleTools({ google: async () => ({}) as GoogleClient, timeZone: "Asia/Jerusalem", scopes: [], accountEmail: null });
// pro_feature (lib/ai/plan-tools.ts) joins the list on basic and in the trial: main-only
const ALL_TOOLS = [...BASE_TOOLS, ...graph, ...googleAll, ...googleBase, proFeatureTool("basic")];

describe("capabilities", () => {
  it("every tool (base, Microsoft, Google with any scopes) maps to exactly one capability or is main-only", () => {
    const names = [...new Set(ALL_TOOLS.map((t) => t.name))];
    const unclassified = names.filter((n) => !capabilityOfTool(n) && !MAIN_ONLY_TOOLS.includes(n));
    expect(unclassified).toEqual([]);
    for (const n of names) {
      const owners = CAPABILITY_IDS.filter((c) => CAPABILITIES[c].tools.includes(n));
      expect(owners.length + (MAIN_ONLY_TOOLS.includes(n) ? 1 : 0), n).toBe(1);
    }
    // the map only names tools that exist, so a renamed tool is noticed
    const known = new Set(names);
    for (const c of CAPABILITY_IDS) for (const t of CAPABILITIES[c].tools) expect(known.has(t), `${c} → ${t}`).toBe(true);
  });

  it("matches the capability array of supabase/migrations/0006_agents.sql", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/0006_agents.sql", import.meta.url), "utf8");
    const block = sql.match(/agents_tools_known check \(([\s\S]*?)\)\s*,/)![1]!;
    const ids = [...block.matchAll(/'([a-z.]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...CAPABILITY_IDS]);
  });

  it("templates use known capabilities only; outbound ones are drafts", () => {
    for (const role of BUILTIN_ORDER) for (const c of BUILTIN_AGENTS[role].capabilities) expect(CAPABILITY_IDS).toContain(c);
    expect(CAPABILITY_IDS.filter((c) => CAPABILITIES[c].kind === "outbound")).toEqual(["mail.draft", "mail.forward", "calendar.write"]);
    const outboundTools = ALL_TOOLS.filter((t) => ["mail.draft", "mail.forward", "calendar.write"].includes(capabilityOfTool(t.name) ?? ""));
    expect(outboundTools.every((t) => !t.readOnly)).toBe(true);
  });

  it("filters tools per agent and never hands remember_fact to an agent", () => {
    const everything = toolsForAgent(ALL_TOOLS, CAPABILITY_IDS).map((t) => t.name);
    expect(everything).not.toContain("remember_fact");
    const secretary = toolsForAgent([...BASE_TOOLS, ...graph], BUILTIN_AGENTS.secretary.capabilities).map((t) => t.name);
    expect(secretary).toEqual(expect.arrayContaining(["create_event", "list_events", "update_event", "delete_event", "create_reminder", "set_morning_time", "search_emails", "draft_email"]));
    expect(secretary).not.toContain("get_file_text");
    expect(secretary).not.toContain("forward_email");
    const bookkeeper = toolsForAgent([...BASE_TOOLS, ...graph], BUILTIN_AGENTS.bookkeeper.capabilities).map((t) => t.name);
    expect(bookkeeper).toContain("forward_email");
    expect(bookkeeper).not.toContain("create_event");
    expect(toolsForAgent(ALL_TOOLS, [])).toEqual([]);
  });

  it("gives an agent with mail.read the Gmail read tools (gmail.readonly granted)", () => {
    expect(googleAll.map((t) => t.name)).toEqual(expect.arrayContaining(["gmail_search_emails", "gmail_get_email", "gmail_get_thread", "gmail_awaiting_reply"]));
    const reader = toolsForAgent(googleAll, ["mail.read"]).map((t) => t.name);
    expect(reader).toEqual(expect.arrayContaining(["gmail_search_emails", "gmail_get_email", "gmail_get_thread", "gmail_awaiting_reply"]));
    expect(reader).not.toContain("gmail_draft_email");
  });

  it("normalises and labels capabilities in Hebrew", () => {
    expect(normalizeCapabilities(["morning", "mail.read", "web.search", "mail.read", 3])).toEqual(["mail.read", "morning"]);
    expect(capsLine(["mail.read"])).toBe("קריאת מייל");
    expect(capsLine(["mail.forward", "mail.read", "mail.draft"])).toBe("קריאת מייל, טיוטות מייל והעברת מיילים");
    expect(capsLine([])).toBe("");
  });

  it("offers at most 8 bundles for the WhatsApp list, each a valid list row", () => {
    expect(TOOL_BUNDLES.length).toBeLessThanOrEqual(8);
    for (const b of TOOL_BUNDLES) {
      expect(b.title.length).toBeLessThanOrEqual(24);
      expect(normalizeCapabilities(b.capabilities)).toEqual([...b.capabilities]);
    }
  });
});
