import { describe, expect, it } from "vitest";
import type { UserRow } from "@/lib/db/types";
import { BRAND } from "@/lib/brand";
import { agentDraftAwaitsText, parseAgentCommand } from "./commands";
import { AGENT_DRAFT_TTL_MS } from "./policy";

describe("parseAgentCommand — natural requests for a new agent start the create flow (Daniel's live test, 23.10.2026)", () => {
  it("starts the flow for the ways people actually ask", () => {
    for (const t of [
      "אתה יכול ליצור לי סוכן",
      "את יכולה ליצור לי סוכן?",
      "תיצרי לי סוכן",
      "תיצור לי סוכן חדש",
      "אפשר ליצור סוכן?",
      "איך יוצרים סוכן?",
      "אני רוצה ליצור סוכן",
      "רוצה סוכן חדש",
      "להוסיף עוד סוכן",
      "תבני לי סוכן משלי",
      `${BRAND.name}, תיצרי לי סוכן`,
      "סוכן חדש",
      "ליצור סוכן",
    ]) {
      expect(parseAgentCommand(t), t).toEqual({ kind: "new", template: null });
    }
  });

  it("leaves other sentences with the word to the assistant", () => {
    for (const t of ["תזכירי לי לדבר עם סוכן הביטוח", "סוכן הביטוח התקשר", "מה זה סוכן?", "תיצרי לי טיוטה למייל"]) expect(parseAgentCommand(t), t).toBeNull();
  });
});

const now = new Date("2026-10-22T10:00:00Z");
const fresh = new Date(now.getTime() - 60_000).toISOString();
const userWith = (agent_draft: unknown): UserRow =>
  ({ id: "u1", email: "a@b.co", name: null, business_name: null, business_type: null, timezone: "Asia/Jerusalem", morning_time: "07:30", locale: "he", profile: { agent_draft }, created_at: fresh, deleted_at: null }) as UserRow;

describe("agentDraftAwaitsText (billing commands step aside while the flow waits for typed text)", () => {
  it("is true for the steps that take free text: name, instructions, recipients, and editing instructions / addresses", () => {
    for (const step of ["name", "instructions", "recipients"]) expect(agentDraftAwaitsText(userWith({ mode: "new", step, template: null, updatedAt: fresh }), now), step).toBe(true);
    for (const field of ["instructions", "recipients"]) expect(agentDraftAwaitsText(userWith({ mode: "edit", key: "builtin:secretary", field, updatedAt: fresh }), now), field).toBe(true);
  });

  it("is false for button steps, without a draft, and after the draft expired", () => {
    for (const step of ["template", "tools", "choose_tools", "confirm"]) expect(agentDraftAwaitsText(userWith({ mode: "new", step, template: null, updatedAt: fresh }), now), step).toBe(false);
    expect(agentDraftAwaitsText(userWith({ mode: "edit", key: "builtin:secretary", field: "tools", updatedAt: fresh }), now)).toBe(false);
    expect(agentDraftAwaitsText(userWith(null), now)).toBe(false);
    const stale = new Date(now.getTime() - AGENT_DRAFT_TTL_MS - 1).toISOString();
    expect(agentDraftAwaitsText(userWith({ mode: "new", step: "name", template: null, updatedAt: stale }), now)).toBe(false);
  });
});
