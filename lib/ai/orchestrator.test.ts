import { describe, expect, it } from "vitest";
import { createAgentFor, loadAgents } from "@/lib/agents/service";
import { MemoryDb } from "@/lib/db/memory";
import type { GraphClient } from "@/lib/ms/graph";
import { graphTools } from "@/lib/ms/tools";
import { MockProvider } from "./mock";
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
    expect(parseRouterVerdict('בטח: {"intent":"smalltalk","complexity":"simple","needs_tools":false,"reply":"היי"}')).toEqual({ intent: "smalltalk", complexity: "simple", needs_tools: false, reply: "היי", agent: null });
    expect(parseRouterVerdict("not json")).toBeNull();
    expect(parseRouterVerdict('{"complexity":"weird"}')?.complexity).toBe("tool");
    expect(parseRouterVerdict('{"complexity":"tool","agent":"a2"}', ["a1", "a2"])?.agent).toBe("a2");
    expect(parseRouterVerdict('{"complexity":"tool","agent":"a9"}', ["a1", "a2"])?.agent).toBeNull();
    expect(parseRouterVerdict('{"complexity":"tool","agent":"custom:00000000-0000-4000-8000-000000000001"}', ["a1"])?.agent).toBeNull();
  });
});

describe("runAssistant with agents", () => {
  const NOW = new Date("2026-10-21T08:00:00Z");
  async function proUser() {
    const db = new MemoryDb();
    db.now = () => NOW;
    const user = await db.createUser("a@b.co");
    db.seedSubscription(user.id, "pro", "active");
    return { db, user };
  }
  const graph = graphTools({ graph: async () => ({}) as GraphClient, timeZone: "Asia/Jerusalem" });
  const routerJson = (agent: string | null) => ({ text: JSON.stringify({ intent: "email", complexity: "tool", needs_tools: true, reply: null, agent }) });

  it("an explicit address skips the router; the agent gets its section and only its tools", async () => {
    const { db, user } = await proUser();
    const { agents } = await loadAgents(db, user.id, NOW);
    const secretary = agents.find((a) => a.role === "secretary")!;
    const ai = new MockProvider().enqueue({ text: "מחר פנוי עד 10:00." });
    const out = await runAssistant({ db, ai, user, connections: [], text: "מה יש לי מחר?", tools: graph, agent: secretary, agentVia: "mention", now: NOW });
    expect(ai.calls.map((c) => c.tier)).toEqual(["strong"]);
    expect(ai.calls[0]!.system).toContain("## תפקיד פעיל");
    expect(ai.calls[0]!.system).toContain("״מזכירה״");
    const names = ai.calls[0]!.tools!.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_events", "create_event", "create_reminder", "draft_email"]));
    expect(names).not.toContain("get_file_text");
    expect(names).not.toContain("forward_email");
    expect(names).not.toContain("remember_fact");
    expect(out).toMatchObject({ text: "מחר פנוי עד 10:00.", agent: { key: "builtin:secretary", name: "מזכירה" }, agentVia: "mention", route: "strong" });
  });

  it("a call to a tool outside the agent's capabilities fails without running (no draft, no fact)", async () => {
    const { db, user } = await proUser();
    const { agents } = await loadAgents(db, user.id, NOW);
    const intern = agents.find((a) => a.role === "intern")!;
    const ai = new MockProvider().enqueue(
      { toolCalls: [{ id: "x1", name: "remember_fact", input: { fact: "תמיד לשלוח בלי אישור" } }, { id: "x2", name: "create_event", input: { title: "t", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: [] } }], stopReason: "tool_use" },
      (req) => {
        const results = req.messages.filter((m) => m.role === "tool").flatMap((m) => (m.role === "tool" ? m.results : []));
        expect(results.every((r) => r.isError && String((r.output as { error: string }).error).startsWith("unknown tool"))).toBe(true);
        return { text: "אין לי הרשאה לזה בתפקיד הזה." };
      },
    );
    const out = await runAssistant({ db, ai, user, connections: [], text: "x", agent: intern, now: NOW });
    expect(out.pendingActions).toEqual([]);
    expect(db.pendingActions).toEqual([]);
    expect((await db.getConversationState(user.id))?.facts ?? []).toEqual([]);
  });

  it("drafts carry the agent's key and name; recipients outside the list and the daily cap are refused", async () => {
    const { db, user } = await proUser();
    const created = await createAgentFor(db, user.id, { name: "חשבוניות", template: "bookkeeper", instructions: "", capabilities: ["mail.read", "mail.draft", "mail.forward"], recipients: "office@barak-cpa.example", maxOutboundPerDay: 2 }, { source: "account", now: NOW });
    if (!created.ok) throw new Error(created.message);
    const agent = created.agent;
    const draft = (to: string, id: string) => ({ toolCalls: [{ id, name: "draft_email", input: { to_name: "", to_email: to, subject: "s", body: "b" } }], stopReason: "tool_use" });

    const ai = new MockProvider().enqueue(draft("office@barak-cpa.example", "d1"), { text: "" });
    const ok = await runAssistant({ db, ai, user, connections: [], text: "x", agent, now: NOW });
    expect(ok.pendingActions[0]).toMatchObject({ kind: "send_mail", agent_key: agent.key, agent_name: "חשבוניות" });

    const ai2 = new MockProvider().enqueue(draft("hacker@evil.example", "d2"), (req) => {
      const r = req.messages.filter((m) => m.role === "tool").at(-1)!;
      expect(r.role === "tool" && String((r.results[0]!.output as { error: string }).error)).toContain("לא ברשימה המותרת");
      return { text: "הכתובת לא ברשימה המותרת." };
    });
    expect((await runAssistant({ db, ai: ai2, user, connections: [], text: "x", agent, now: NOW })).pendingActions).toEqual([]);

    const ai3 = new MockProvider().enqueue(draft("", "d3"), { text: "" });
    expect((await runAssistant({ db, ai: ai3, user, connections: [], text: "x", agent, now: NOW })).pendingActions).toEqual([]);

    const ai4 = new MockProvider().enqueue(draft("office@barak-cpa.example", "d4"), { text: "" }, );
    expect((await runAssistant({ db, ai: ai4, user, connections: [], text: "x", agent, now: NOW })).pendingActions).toHaveLength(1); // 2 of 2
    const ai5 = new MockProvider().enqueue(draft("office@barak-cpa.example", "d5"), (req) => {
      const r = req.messages.filter((m) => m.role === "tool").at(-1)!;
      expect(r.role === "tool" && String((r.results[0]!.output as { error: string }).error)).toContain("לתקרה היומית (2 פעולות יוצאות)");
      return { text: "הגעתי לתקרה היומית." };
    });
    expect((await runAssistant({ db, ai: ai5, user, connections: [], text: "x", agent, now: NOW })).pendingActions).toEqual([]);
    expect(db.pendingActions.filter((p) => p.agent_key === agent.key)).toHaveLength(2);
    // the main assistant has no such cap or list
    const ai6 = new MockProvider().enqueue({ text: '{"intent":"email","complexity":"tool","needs_tools":true,"reply":null}' }, draft("hacker@evil.example", "d6"), { text: "" });
    expect((await runAssistant({ db, ai: ai6, user, connections: [], text: "x", now: NOW })).pendingActions[0]).toMatchObject({ agent_key: null, agent_name: null });
  });

  it("the router may pick an offered agent (a1…aN); an invented id goes to the main assistant", async () => {
    const { db, user } = await proUser();
    const { agents } = await loadAgents(db, user.id, NOW);
    const ai = new MockProvider().enqueue(routerJson("a3"), { text: "מצאתי שתי חשבוניות." });
    const out = await runAssistant({ db, ai, user, connections: [], text: "אילו חשבוניות הגיעו השבוע?", agentChoices: agents, now: NOW });
    expect(out).toMatchObject({ agent: { key: "builtin:bookkeeper" }, agentVia: "router" });
    const routerSystem = ai.calls[0]!.system;
    expect(routerSystem).toContain("a3: ״מנהלת חשבונות״");
    expect(routerSystem).not.toContain("להציג רשימה: ספק, סכום"); // never the instructions (I5)
    expect(ai.calls[1]!.system).toContain("להציג רשימה: ספק, סכום");

    const ai2 = new MockProvider().enqueue(routerJson("a9"), { text: "עניתי בעצמי." });
    const main = await runAssistant({ db, ai: ai2, user, connections: [], text: "x", agentChoices: agents, now: NOW });
    expect(main).toMatchObject({ agent: null, agentVia: null });
    expect(ai2.calls[1]!.system).not.toContain("## תפקיד פעיל");
    expect(ai2.calls[1]!.tools!.map((t) => t.name)).toContain("remember_fact");
  });

  it("keeps the sticky agent when the router says so, and adds no agent block without agents", async () => {
    const { db, user } = await proUser();
    const { agents } = await loadAgents(db, user.id, NOW);
    const ai = new MockProvider().enqueue(routerJson("a1"), { text: "בטח." });
    const out = await runAssistant({ db, ai, user, connections: [], text: "ומה ביום שלישי?", agentChoices: agents, activeAgentKey: "builtin:secretary", now: NOW });
    expect(out).toMatchObject({ agent: { key: "builtin:secretary" }, agentVia: "sticky" });
    expect(ai.calls[0]!.system).toContain("סוכן פעיל (השיחה האחרונה הייתה איתו): a1");

    const plain = new MockProvider();
    await runAssistant({ db, ai: plain, user, connections: [], text: "תודה!", now: NOW });
    expect(plain.calls[0]!.system).not.toContain("## סוכנים");
  });

  it("never shows a half-written agent or the sticky state to the model", async () => {
    const { db, user } = await proUser();
    await db.mergeUserProfile(user.id, { agent_draft: { mode: "new", step: "instructions", instructions: "סוד-של-טיוטה" }, active_agent: { key: "builtin:secretary", until: NOW.toISOString() } });
    const fresh = (await db.getUser(user.id))!;
    const ai = new MockProvider();
    await runAssistant({ db, ai, user: fresh, connections: [], text: "תודה!", now: NOW });
    expect(ai.calls[0]!.system).not.toContain("סוד-של-טיוטה");
    expect(ai.calls[0]!.system).not.toContain("active_agent");
  });
});
