import { describe, expect, it } from "vitest";
import { toolsForAgent } from "@/lib/agents/capabilities";
import type { GoogleClient } from "@/lib/google/client";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES } from "@/lib/google/oauth";
import { googleTools } from "@/lib/google/tools";
import type { GraphClient } from "@/lib/ms/graph";
import { graphTools } from "@/lib/ms/tools";
import { MemoryDb } from "@/lib/db/memory";
import { PLAN_TOOLS, PRO_FEATURE_TOOL, proFeatureTool, toolsForPlan } from "./plan-tools";
import { BASE_TOOLS } from "./tools";

// every provider tool, built as for pro (the default): the orchestrator's gate must hold even then
const ALL = [
  ...BASE_TOOLS,
  ...graphTools({ graph: async () => ({}) as GraphClient, timeZone: "Asia/Jerusalem" }),
  ...googleTools({ google: async () => ({}) as GoogleClient, timeZone: "Asia/Jerusalem", scopes: [...GOOGLE_BASE_SCOPES], accountEmail: null, driveReadEnabled: false }),
];
const names = (tools: { name: string }[]) => tools.map((t) => t.name);

describe("toolsForPlan: the plan's gate by tool name", () => {
  it("basic and the trial: no Tasks / To Do, SharePoint, file creation or drive.readonly consent; pro_feature instead", () => {
    for (const plan of ["basic", "trial"] as const) {
      const kept = names(toolsForPlan(ALL, plan));
      for (const t of Object.keys(PLAN_TOOLS)) expect(kept, `${plan} → ${t}`).not.toContain(t);
      expect(kept).toContain(PRO_FEATURE_TOOL);
      // what basic includes stays: mail, calendar (Meet / Teams), file reading, reminders, the morning summary
      for (const t of ["search_emails", "list_events", "create_event", "search_files", "get_file_text", "gcal_create_event", "gdrive_list_files", "gdrive_get_file_text", "gmail_draft_email", "create_reminder", "set_morning_time", "start_upgrade"]) {
        expect(kept, `${plan} → ${t}`).toContain(t);
      }
    }
  });

  it("pro: the list as it is; unknown plan (outside the pipeline): as it is", () => {
    expect(names(toolsForPlan(ALL, "pro"))).toEqual(names(ALL));
    expect(names(toolsForPlan(ALL, null))).toEqual(names(ALL));
  });

  it("an agent's capability filter runs on the plan's list: a basic agent with 'reminders' and 'files.save' gets neither Tasks nor gdrive_save_doc, and never pro_feature", () => {
    const agentTools = names(toolsForAgent(toolsForPlan(ALL, "basic"), ["reminders", "files.read", "files.save"]));
    expect(agentTools).toEqual(expect.arrayContaining(["create_reminder", "list_reminders", "search_files", "gdrive_list_files"]));
    for (const t of ["gtasks_create_task", "todo_create_task", "gdrive_save_doc", "sharepoint_search", PRO_FEATURE_TOOL]) expect(agentTools, t).not.toContain(t);
    const proAgent = names(toolsForAgent(toolsForPlan(ALL, "pro"), ["reminders", "files.save"]));
    expect(proAgent).toEqual(expect.arrayContaining(["gtasks_create_task", "todo_create_task", "gdrive_save_doc"]));
  });
});

describe("pro_feature: one short answer and the way to pro", () => {
  const ctx = { db: new MemoryDb(), userId: "u", now: new Date(), createPending: async () => Promise.reject(new Error("never")) };

  it("offers only what the plan lacks, and answers in the neutral plan line", async () => {
    const tool = proFeatureTool("basic");
    expect((tool.input_schema.properties as { feature: { enum: string[] } }).feature.enum).toEqual(["second_account", "tasks", "sharepoint", "file_create", "drive_full_read", "proactive"]);
    expect(tool.readOnly).toBe(true);
    const out = (await tool.run({ feature: "sharepoint" }, ctx)) as { status: string; say: string };
    expect(out.status).toBe("not_in_plan");
    expect(out.say).toBe('במסלול פרו (299 ₪ לחודש) יש גם חיפוש וקריאה ב-SharePoint של הארגון. במסלול הבסיסי זה לא כלול. אפשר לכתוב "שדרוג" ואשלח את הפרטים.');
    const trial = (await proFeatureTool("trial").run({ feature: "second_account" }, ctx)) as { say: string };
    expect(trial.say).toContain("יש גם חיבור של Google ושל Microsoft יחד. בתקופת הניסיון זה לא כלול.");
    // an unknown value still answers (the first missing feature), never throws
    expect(((await tool.run({ feature: "x" }, ctx)) as { feature: string }).feature).toBe("second_account");
  });

  it("drive.readonly is part of the gate: a Drive list built for pro with the full read is not offered on basic as such", () => {
    const full = googleTools({ google: async () => ({}) as GoogleClient, timeZone: "Asia/Jerusalem", scopes: [...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.driveReadonly], accountEmail: null, driveReadEnabled: true });
    expect(names(full)).not.toContain("gdrive_read_status");
    expect(names(toolsForPlan(full, "basic"))).toContain(PRO_FEATURE_TOOL);
  });
});
