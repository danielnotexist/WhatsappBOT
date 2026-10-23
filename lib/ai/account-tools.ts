import type { AssistantFlow, Tool, ToolContext } from "./tools";

/**
 * Account tools for the main assistant (never an agent — lib/agents/capabilities.ts MAIN_ONLY_TOOLS): they start the
 * deterministic flows that "שדרוג" and "סוכן חדש" start, so a request in any wording ends in the real offer or the real
 * create flow — never in "אין לי כלי לזה" or an invented instruction. The pipeline runs the flow after the turn and the
 * flow's own messages are the answer (the model's text is not sent, like a pending action).
 */
const STARTED_NOTE = "המערכת שולחת עכשיו את ההמשך בהודעה נפרדת. לא לכתוב סכומים, קישורים או הוראות — לכל היותר משפט קצר אחד.";

function startFlow(ctx: ToolContext, flow: AssistantFlow) {
  if (!ctx.requestFlow) return { status: "unavailable", note: "אפשר להציע לכתוב את הפקודה במילה אחת." };
  ctx.requestFlow(flow);
  return { status: "started", note: STARTED_NOTE };
}

export const startUpgradeTool: Tool = {
  name: "start_upgrade",
  description:
    "מפעיל את תהליך השדרוג או ההצטרפות למנוי, כמו הפקודה \"שדרוג\": במסלול הבסיסי עם כרטיס שמור — הצעה עם הסכום וכפתור אישור בלחיצה; בניסיון או בלי כרטיס שמור — קישור לדף התשלום המאובטח. להפעיל בכל בקשה לשדרג, לעבור לפרו, להפעיל מנוי או לשלם, בכל ניסוח.",
  readOnly: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(_input, ctx) {
    return startFlow(ctx, "upgrade");
  },
};

export const startAgentCreationTool: Tool = {
  name: "start_agent_creation",
  description:
    "מתחיל את יצירת הסוכן בוואטסאפ, כמו הפקודה \"סוכן חדש\": בדיקת המכסה של המסלול, ואז בחירת תבנית, שם, הנחיות וכלים בכפתורים. להפעיל כשמבקשים ליצור, לבנות או להוסיף סוכן.",
  readOnly: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(_input, ctx) {
    return startFlow(ctx, "new_agent");
  },
};

export const ACCOUNT_TOOLS: Tool[] = [startUpgradeTool, startAgentCreationTool];
