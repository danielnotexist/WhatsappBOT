import { PRO_FEATURES, missingProFeatures, type EffectivePlan, type ProFeature } from "@/lib/billing/plans";
import { scopy } from "@/lib/copy/bot-services";
import type { Tool } from "./tools";

/**
 * The plan's say over the model's tools (lib/billing/plans.ts entitlements, Daniel's split of 23.10.2026). The
 * provider tools are built for the plan already (googleTools / graphTools take `entitlements`); this is the last gate
 * in the orchestrator, by name, before the definitions are sent and the lookup that runs them is built — so a pro tool
 * never reaches the model on basic or in the trial, whoever built the list. In its place the main assistant gets
 * `pro_feature`: one short answer that the service is in pro, and the way there ("שדרוג" — the same upgrade flow as
 * start_upgrade). Agents never get it (lib/agents/capabilities.ts MAIN_ONLY_TOOLS), and they only ever see a subset of
 * the filtered list.
 */
export const PLAN_TOOLS: Readonly<Record<string, ProFeature>> = {
  gtasks_list_tasks: "tasks",
  gtasks_create_task: "tasks",
  todo_list_tasks: "tasks",
  todo_create_task: "tasks",
  sharepoint_search: "sharepoint",
  sharepoint_get_file_text: "sharepoint",
  gdrive_save_doc: "file_create",
  // the consent link to drive.readonly (search every Drive file): a read only pro uses
  gdrive_read_status: "drive_full_read",
  // "סיכום של הפגישה האחרונה" (lib/meetings/tools.ts)
  meeting_summary: "meeting_summaries",
};

export const PRO_FEATURE_TOOL = "pro_feature";

/** The tool that answers a request for a service the plan does not include. */
export function proFeatureTool(plan: EffectivePlan, missing: readonly ProFeature[] = missingProFeatures(plan)): Tool {
  const list = missing.map((f) => `${f} = ${PRO_FEATURES[f].label}`).join("; ");
  return {
    name: PRO_FEATURE_TOOL,
    description: `להפעיל כשמבקשים שירות שלא כלול במסלול של המשתמש (${list}). מחזיר מה לומר: להעביר את say כלשונו. אם מבקשים אחר כך לשדרג — start_upgrade.`,
    readOnly: true,
    input_schema: { type: "object", properties: { feature: { type: "string", enum: [...missing], description: "השירות שביקשו" } }, required: ["feature"], additionalProperties: false },
    async run(input) {
      const feature = missing.find((f) => f === input.feature) ?? missing[0]!;
      return { status: "not_in_plan", feature, say: scopy["s.plan.pro_feature"](PRO_FEATURES[feature].label, plan === "trial"), note: "להעביר למשתמש את הטקסט שב-say כלשונו, בלי להוסיף הסבר." };
    },
  };
}

/**
 * The tools of a turn on this plan: the pro tools out (by name), `pro_feature` in when something is missing. Null plan
 * (unknown — outside the pipeline) leaves the list as it is.
 */
export function toolsForPlan(tools: readonly Tool[], plan: EffectivePlan | null): Tool[] {
  if (!plan) return [...tools];
  const missing = new Set(missingProFeatures(plan));
  if (!missing.size) return [...tools];
  const kept = tools.filter((t) => {
    const feature = PLAN_TOOLS[t.name];
    return !feature || !missing.has(feature);
  });
  return [...kept, proFeatureTool(plan, [...missing])];
}
