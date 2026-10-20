import { describe, expect, it } from "vitest";
import { MockProvider } from "./mock";
import { MemoryDb } from "@/lib/db/memory";
import { parseRouterVerdict, runAssistant } from "./orchestrator";

describe("runAssistant", () => {
  it("answers simple messages from the router without touching the strong model", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider();
    const out = await runAssistant({ db, ai, user, connections: [], text: "תודה!" });
    expect(out.route).toBe("router");
    expect(out.text).toBe("בשמחה. אם צריך משהו — אני כאן.");
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.tier).toBe("router");
    expect(ai.calls[0]!.system).toContain("ה-router");
    expect(ai.calls[0]!.system).toContain("אזור זמן Asia/Jerusalem");
  });

  it("runs the strong model with tools and turns a draft into a pending action", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    await db.updateUserProfile(user.id, { name: "דנה" });
    const ai = new MockProvider();
    const out = await runAssistant({ db, ai, user, connections: [], text: "תנסח מייל לרונית שאני מאשרת את הפגישה" });
    expect(out.route).toBe("strong");
    expect(out.pendingActions).toHaveLength(1);
    expect(out.pendingActions[0]).toMatchObject({ kind: "send_mail", status: "pending" });
    expect(out.text).toBe("הכנתי טיוטה — לשלוח?");
    // router → strong → tool result → strong
    expect(ai.calls.map((c) => c.tier)).toEqual(["router", "strong", "strong"]);
    const toolNames = ai.calls[1]!.tools!.map((t) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(["draft_email", "create_event", "set_morning_time", "remember_fact"]));
    expect((await db.listPendingActions(user.id, "pending"))[0]!.payload).toMatchObject({ to_name: "רונית" });
  });

  it("stops the tool loop after maxRounds and reports unknown tools as errors", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider().enqueue({ text: '{"intent":"other","complexity":"tool","needs_tools":true,"reply":null}' });
    for (let i = 0; i < 5; i++) ai.enqueue({ toolCalls: [{ id: `c${i}`, name: "nope", input: {} }], stopReason: "tool_use" });
    const out = await runAssistant({ db, ai, user, connections: [], text: "x", maxRounds: 2 });
    expect(ai.calls.filter((c) => c.tier === "strong")).toHaveLength(3);
    const toolMsgs = ai.calls[3]!.messages.filter((m) => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThan(0);
    expect(out.text).toContain("לא הצלחתי");
  });

  it("parses router verdicts leniently", () => {
    expect(parseRouterVerdict('בטח: {"intent":"smalltalk","complexity":"simple","needs_tools":false,"reply":"היי"}')).toEqual({ intent: "smalltalk", complexity: "simple", needs_tools: false, reply: "היי" });
    expect(parseRouterVerdict("not json")).toBeNull();
    expect(parseRouterVerdict('{"complexity":"weird"}')?.complexity).toBe("tool");
  });
});
