import { describe, expect, it, vi } from "vitest";
import { createAgentFor, loadAgents, updateAgentFor } from "@/lib/agents/service";
import { MemoryDb } from "@/lib/db/memory";
import { createGraphFixture } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient } from "@/lib/ms/graph";
import { graphTools } from "@/lib/ms/tools";
import { MockProvider } from "./mock";
import { ROUTER_SCHEMA, distinctButtons, parseRouterVerdict, runAssistant } from "./orchestrator";

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

  it("tells the model only the active connections, the newest per provider — no half-active second account (Daniel's test)", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const old = db.seedConnection(user.id, "microsoft", "old@levi-law.co.il");
    const expired = db.seedConnection(user.id, "google", "expired@gmail.com");
    await db.setConnectionStatus(expired.id, "expired");
    db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
    await db.mergeUserProfile(user.id, { oauth_pending: { microsoft: { state: "s", verifier: "v", started_at: "2026-10-23T00:40:00Z" } } });
    const ai = new MockProvider().enqueue({ text: '{"intent":"meta","complexity":"simple","needs_tools":false,"reply":"יש חיבור אחד."}' });
    await runAssistant({ db, ai, user: (await db.getUser(user.id))!, connections: await db.listConnections(user.id), text: "כמה חיבורים יש לי?" });
    const system = ai.calls[0]!.system;
    expect(system).toContain("- Microsoft 365 מחובר (dana@levi-law.co.il):");
    expect(system).not.toContain(old.account_email!);
    expect(system).not.toContain("expired@gmail.com");
    expect(system).toContain("- Google לא מחובר.");
    expect(system).not.toContain("oauth_pending");
  });

  it("collects the flows the account tools request, and suppresses nothing else", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider().enqueue(
      { text: '{"intent":"account","complexity":"tool","needs_tools":true,"reply":null}' },
      { toolCalls: [{ id: "c1", name: "start_upgrade", input: {} }, { id: "c2", name: "start_upgrade", input: {} }], stopReason: "tool_use" },
      { text: "" },
    );
    const out = await runAssistant({ db, ai, user, connections: [], text: "רוצה לעבור לגרסה הגדולה" });
    expect(out.flows).toEqual(["upgrade"]);
    expect(out.text).toBe(""); // no "לא הצלחתי" filler: the flow is the answer
  });

  it("never sends the router's own reply on the account, upgrade, agents or permissions — the strong model answers (review 23.10.2026)", async () => {
    const cases: [string, string][] = [
      ['{"intent":"account","complexity":"simple","needs_tools":false,"reply":"לא, אני לא יכולה ליצור סוכנים.","agent":null}', "אתה יכול ליצור לי סוכן"],
      ['{"intent":"account","complexity":"simple","needs_tools":false,"reply":"כתוב \'מנוי פרו\' ואשלח לך את דף השדרוג.","agent":null}', "אני רוצה לשדרג למנוי פרו"],
      ['{"intent":"meta","complexity":"simple","needs_tools":false,"reply":"יש לי גישה חלקית לדרייב.","agent":null}', "תהיה לך גישה לדרייב ולמיט?"],
      ['{"intent":"smalltalk","complexity":"simple","needs_tools":false,"reply":"בשמחה. אם תרצה, אפשר להתחיל בסיכום הבוקר.","agent":null}', "תודה רבה!"],
      ['{"intent":"smalltalk","complexity":"simple","needs_tools":false,"reply":"בשמחה, דניאל. אני כאן כשתצטרך.","agent":null}', "תודה רבה!"],
    ];
    for (const [verdict, text] of cases) {
      const db = new MemoryDb();
      const user = await db.createUser("a@b.co");
      const ai = new MockProvider().enqueue({ text: verdict }, { text: "תשובה מהמודל החזק." });
      const out = await runAssistant({ db, ai, user, connections: [], text });
      expect(out.route, text).toBe("strong");
      expect(out.text, text).toBe("תשובה מהמודל החזק.");
      expect(ai.calls.map((c) => c.tier), text).toEqual(["router", "strong"]);
    }
    // a neutral thank-you reply is still the router's
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider().enqueue({ text: '{"intent":"smalltalk","complexity":"simple","needs_tools":false,"reply":"בשמחה. אם יעלה משהו, אני כאן.","agent":null}' });
    expect((await runAssistant({ db, ai, user, connections: [], text: "תודה רבה!" })).route).toBe("router");
  });

  it("asks the router for its verdict as structured output (a JSON schema), never plain text", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const ai = new MockProvider();
    await runAssistant({ db, ai, user, connections: [], text: "תודה!" });
    expect(ai.calls[0]!.json).toBe(true);
    expect(ai.calls[0]!.jsonSchema).toEqual(ROUTER_SCHEMA);
    expect(ROUTER_SCHEMA).toMatchObject({ additionalProperties: false, required: ["intent", "complexity", "needs_tools", "reply", "agent"] });
  });

  it("sends the user's message once: the stored inbound row is left out of the history (review 23.10.2026)", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    await db.insertMessage({ user_id: user.id, direction: "in", type: "text", text: "שלום" });
    await db.insertMessage({ user_id: user.id, direction: "out", type: "text", text: "היי" });
    const row = (await db.insertMessage({ user_id: user.id, direction: "in", type: "text", text: "@מזכירה מה יש לי מחר?" }))!;
    const ai = new MockProvider().enqueue({ text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null,"agent":null}' }, { text: "מחר פנוי." });
    await runAssistant({ db, ai, user, connections: [], text: "מה יש לי מחר?", inboundId: row.id });
    for (const call of ai.calls) {
      expect(call.messages).toEqual([
        { role: "user", content: "שלום" },
        { role: "assistant", content: "היי" },
        { role: "user", content: "מה יש לי מחר?" },
      ]);
    }
  });

  it("a flow with another answer in the same message keeps the text; a flow alone does not (review 23.10.2026)", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("a@b.co");
    const long = "המייל האחרון: רונית כהן, ״הסכם שכירות — טיוטה שנייה״, היום ב-08:12. היא מבקשת הערות עד יום ראשון. את פרטי השדרוג שולחת המערכת עכשיו.";
    const ai = new MockProvider().enqueue(
      { text: '{"intent":"email","complexity":"tool","needs_tools":true,"reply":null,"agent":null}' },
      { toolCalls: [{ id: "c1", name: "list_reminders", input: {} }, { id: "c2", name: "start_upgrade", input: {} }], stopReason: "tool_use" },
      { text: long },
    );
    const both = await runAssistant({ db, ai, user, connections: [], text: "תביאי לי את המייל האחרון ואיך משדרגים?" });
    expect(both.flows).toEqual(["upgrade"]);
    expect(both.textBeyondFlows).toBe(true);
    const ai2 = new MockProvider().enqueue(
      { text: '{"intent":"account","complexity":"tool","needs_tools":true,"reply":null,"agent":null}' },
      { toolCalls: [{ id: "c1", name: "start_upgrade", input: {} }], stopReason: "tool_use" },
      { text: long },
    );
    expect((await runAssistant({ db, ai: ai2, user, connections: [], text: "איך משדרגים?" })).textBeyondFlows).toBe(false);
  });

  it("reply buttons: at most 3, distinct ids and distinct titles", () => {
    expect(distinctButtons([{ id: "a", title: "ליום ש׳ 24.10" }, { id: "b", title: "ליום ש׳ 24.10" }, { id: "a", title: "x" }, { id: "c", title: "y" }, { id: "d", title: "z" }, { id: "e", title: "w" }])).toEqual([
      { id: "a", title: "ליום ש׳ 24.10" },
      { id: "c", title: "y" },
      { id: "d", title: "z" },
    ]);
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

  it("an agent limited to a list: moving or cancelling a meeting is checked against the people already on it", async () => {
    const { db, user } = await proUser();
    const fixture = createGraphFixture();
    const client = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const tools = graphTools({ graph: async () => client, timeZone: "Asia/Jerusalem" });
    const move = (id: string, callId: string) => ({ id: callId, name: "update_event", input: { id, subject: "", date: "2026-10-22", start: "12:00", end: "13:00", location: "" } });
    const cancel = (id: string, callId: string) => ({ id: callId, name: "delete_event", input: { id, subject: "x" } });
    const outputs = (req: { messages: { role: string; results?: { output: unknown }[] }[] }) => req.messages.filter((m) => m.role === "tool").at(-1)!.results!.map((r) => r.output as { status?: string; error?: string });

    const listed = await updateAgentFor(db, user.id, "builtin:secretary", { recipients: "barak@cpa-barak.co.il" }, { source: "account", now: NOW });
    if (!listed.ok) throw new Error(listed.message);
    const ai = new MockProvider().enqueue({ toolCalls: [move("AAMkAGe2", "u1"), cancel("AAMkAGe1", "c1"), cancel("AAMkNOPE", "c2")], stopReason: "tool_use" }, (req) => {
      const [moved, cancelled, missing] = outputs(req);
      expect(moved).toMatchObject({ status: "pending_approval" }); // the only attendee is on the list
      expect(cancelled).toMatchObject({ status: "pending_approval" }); // nobody to notify
      expect(missing!.error).toBeTruthy(); // the event cannot be read → no draft
      return { text: "" };
    });
    const out = await runAssistant({ db, ai, user, connections: [], text: "x", tools, agent: listed.agent, now: NOW });
    expect(out.pendingActions.map((p) => [p.kind, p.payload.current_attendees])).toEqual([
      ["update_event", ["barak@cpa-barak.co.il"]],
      ["delete_event", []],
    ]);

    const other = await updateAgentFor(db, user.id, "builtin:secretary", { recipients: "office@other.example" }, { source: "account", now: NOW });
    if (!other.ok) throw new Error(other.message);
    const ai2 = new MockProvider().enqueue({ toolCalls: [move("AAMkAGe2", "u2"), cancel("AAMkAGe2", "c3")], stopReason: "tool_use" }, (req) => {
      for (const o of outputs(req)) expect(o.error).toContain("הנמען barak@cpa-barak.co.il לא ברשימה המותרת לסוכן ״מזכירה״");
      return { text: "הפגישה כוללת משתתף שלא ברשימה." };
    });
    expect((await runAssistant({ db, ai: ai2, user, connections: [], text: "x", tools, agent: other.agent, now: NOW })).pendingActions).toEqual([]);

    // the main assistant keeps no attendee list: a move reads the meeting once (its draft names it), a cancellation not at all
    const reads = () => fixture.state.calls.filter((c) => c.method === "GET" && c.url.includes("/me/events/")).length;
    const before = reads();
    const ai3 = new MockProvider().enqueue({ text: '{"intent":"calendar","complexity":"tool","needs_tools":true,"reply":null}' }, { toolCalls: [move("AAMkAGe2", "u3"), cancel("AAMkAGe1", "c4")], stopReason: "tool_use" }, { text: "" });
    const main = await runAssistant({ db, ai: ai3, user, connections: [], text: "x", tools, now: NOW });
    // the main assistant's tools run side by side: the move's read lets the cancellation land first
    expect(main.pendingActions.map((p) => [p.kind, "current_attendees" in p.payload]).sort()).toEqual([
      ["delete_event", false],
      ["update_event", false],
    ]);
    expect(reads()).toBe(before + 1);
  });

  it("parallel draft calls in one response cannot pass the daily cap: drafts are created one at a time", async () => {
    const { db, user } = await proUser();
    const created = await createAgentFor(db, user.id, { name: "חשבוניות", template: "bookkeeper", instructions: "", capabilities: ["mail.read", "mail.draft", "mail.forward"], recipients: "office@barak-cpa.example", maxOutboundPerDay: 2 }, { source: "account", now: NOW });
    if (!created.ok) throw new Error(created.message);
    const agent = created.agent;
    const inserts = vi.spyOn(db, "createPendingAction");
    const toolCalls = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: "draft_email", input: { to_name: "", to_email: "office@barak-cpa.example", subject: `חשבונית ${i}`, body: "b" } }));
    const ai = new MockProvider().enqueue({ toolCalls, stopReason: "tool_use" }, (req) => {
      const r = req.messages.filter((m) => m.role === "tool").at(-1)!;
      const results = r.role === "tool" ? r.results : [];
      expect(results.filter((x) => !x.isError)).toHaveLength(2);
      expect(results.filter((x) => x.isError).map((x) => (x.output as { error: string }).error)).toEqual([
        "הסוכן ״חשבוניות״ הגיע לתקרה היומית (2 פעולות יוצאות). לא נוצרה טיוטה; התקרה מתאפסת בחצות.",
        "הסוכן ״חשבוניות״ הגיע לתקרה היומית (2 פעולות יוצאות). לא נוצרה טיוטה; התקרה מתאפסת בחצות.",
      ]);
      return { text: "הכנתי שתיים; הגעתי לתקרה היומית." };
    });
    const out = await runAssistant({ db, ai, user, connections: [], text: "להעביר את כל החשבוניות לרו״ח", agent, now: NOW });
    expect(out.pendingActions).toHaveLength(2);
    expect(db.pendingActions.filter((p) => p.agent_key === agent.key)).toHaveLength(2);
    expect(inserts).toHaveBeenCalledTimes(2); // the guard refused the other two before any insert
  });

  it("two turns at the same time cannot pass the daily cap either: the database refuses the late draft", async () => {
    const { db, user } = await proUser();
    const created = await createAgentFor(db, user.id, { name: "חשבוניות", template: null, instructions: "x", capabilities: ["mail.draft"], maxOutboundPerDay: 1 }, { source: "account", now: NOW });
    if (!created.ok) throw new Error(created.message);
    const agent = created.agent;
    const errors: string[] = [];
    const turn = (id: string) =>
      new MockProvider().enqueue({ toolCalls: [{ id, name: "draft_email", input: { to_name: "", to_email: "a@b.co", subject: "s", body: "b" } }], stopReason: "tool_use" }, (req) => {
        const r = req.messages.filter((m) => m.role === "tool").at(-1)!;
        if (r.role === "tool" && r.results[0]!.isError) errors.push((r.results[0]!.output as { error: string }).error);
        return { text: "" };
      });
    const [a, b] = await Promise.all([runAssistant({ db, ai: turn("t1"), user, connections: [], text: "x", agent, now: NOW }), runAssistant({ db, ai: turn("t2"), user, connections: [], text: "x", agent, now: NOW })]);
    expect(a.pendingActions.length + b.pendingActions.length).toBe(1);
    expect(db.pendingActions.filter((p) => p.agent_key === agent.key)).toHaveLength(1);
    expect(errors).toEqual(["הסוכן ״חשבוניות״ הגיע לתקרה היומית (1 פעולות יוצאות). לא נוצרה טיוטה; התקרה מתאפסת בחצות."]);
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
