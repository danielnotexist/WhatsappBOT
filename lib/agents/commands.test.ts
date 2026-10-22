import { describe, expect, it } from "vitest";
import type { UserRow } from "@/lib/db/types";
import { agentDraftAwaitsText } from "./commands";
import { AGENT_DRAFT_TTL_MS } from "./policy";

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
