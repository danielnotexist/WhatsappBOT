import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAssistant } from "@/lib/ai/orchestrator";
import { clearExecutorsForTests, registerExecutor } from "@/lib/bot/pending";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient } from "./graph";
import { graphExecutors, graphTools } from "./tools";

describe("Graph tools in the assistant", () => {
  beforeEach(() => process.env.TOKEN_ENC_KEY || (process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")));
  afterEach(() => clearExecutorsForTests());

  it("lets the strong model search mail, read a file and draft a reply; the approved draft goes out through Graph", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    const conn = h.db.seedConnection(user.id, "microsoft", "dana@levi-law.co.il");
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const tools = graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem" });
    h.ctx.extraTools = async () => tools;
    registerExecutor("send_mail", graphExecutors(async () => ({ graph, timeZone: "Asia/Jerusalem" })).send_mail);

    // scripted model: router → tool call search_emails → get_email → draft_email → final line
    h.ai.enqueue(
      { text: '{"intent":"email","complexity":"tool","needs_tools":true,"reply":null}' },
      { toolCalls: [{ id: "c1", name: "search_emails", input: { query: "שפירא", unread_only: false, limit: 5 } }], stopReason: "tool_use" },
      (req) => {
        const res = req.messages.find((m) => m.role === "tool")!;
        expect(res.role === "tool" && (res.results[0]!.output as { count: number }).count).toBe(1);
        return { toolCalls: [{ id: "c2", name: "get_email", input: { id: "AAMkAGm1" } }], stopReason: "tool_use" };
      },
      (req) => {
        const last = req.messages.filter((m) => m.role === "tool").at(-1)!;
        const body = last.role === "tool" ? (last.results[0]!.output as { body: string }).body : "";
        expect(body).toContain("הצעת פשרה");
        return { toolCalls: [{ id: "c3", name: "draft_email", input: { to_name: "עו״ד שפירא", to_email: "office@shapira-law.co.il", subject: "Re: הצעת פשרה, תיק 4471", body: "שלום,\nמקבלים את ההצעה. חוזה עד חמישי.\nדנה" } }], stopReason: "tool_use" };
      },
      { text: "הכנתי טיוטה." },
    );
    await processInbound(h.ctx, h.inbound("מה שפירא כתב? תכין תשובה שמקבלים את ההצעה"));
    const draft = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    expect(draft.body).toContain("office@shapira-law.co.il");
    expect(h.ai.calls[1]!.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["search_emails", "get_email", "list_events", "search_files", "get_file_text", "update_event", "delete_event", "draft_email"]));
    const id = draft.buttons![0]!.id.split(":")[2]!;
    await processInbound(h.ctx, h.button(`pa:approve:${id}`, "שלח"));
    expect(h.wa.texts.at(-1)).toBe("נשלח לעו״ד שפירא. אעדכן כשתגיע תשובה.");
    expect(fixture.state.sent).toHaveLength(1);
    expect(fixture.state.sent[0]).toMatchObject({ message: { subject: "Re: הצעת פשרה, תיק 4471", toRecipients: [{ emailAddress: { address: "office@shapira-law.co.il" } }] } });
    expect((await h.db.getPendingAction(id))!.status).toBe("executed");
    void conn;
  });

  it("forward_email only creates a forward_mail draft; the approved draft goes out through POST …/forward", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    h.ctx.extraTools = async () => graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem" });
    registerExecutor("forward_mail", graphExecutors(async () => ({ graph, timeZone: "Asia/Jerusalem" })).forward_mail);
    h.ai.enqueue(
      { text: '{"intent":"email","complexity":"tool","needs_tools":true,"reply":null}' },
      { toolCalls: [{ id: "f1", name: "forward_email", input: { message_id: "AAMkAGm1", to_email: "office@barak-cpa.example", comment: "לטיפולך" } }], stopReason: "tool_use" },
      { text: "הכנתי העברה." },
    );
    await processInbound(h.ctx, h.inbound("תעבירי את ההצעה של שפירא לרו״ח"));
    const draft = h.wa.sent.filter((s) => s.kind === "buttons").at(-1)!;
    expect(draft.body).toContain("*העברת מייל*");
    expect(draft.body).toContain("נושא: הצעת פשרה, תיק 4471");
    expect(draft.body).toContain("קבצים: הצעת פשרה 4471.pdf");
    expect(draft.body).toContain("אל: office@barak-cpa.example");
    expect(draft.buttons!.map((b) => b.title)).toEqual(["העבר", "ערוך", "בטל"]);
    expect(fixture.state.calls.some((c) => c.url.includes("/forward"))).toBe(false); // nothing left before the press
    const id = draft.buttons![0]!.id.split(":")[2]!;
    expect((await h.db.getPendingAction(id))!.kind).toBe("forward_mail");
    await processInbound(h.ctx, h.button(`pa:approve:${id}`, "העבר"));
    expect(h.wa.texts.at(-1)).toBe("הועבר אל office@barak-cpa.example.");
    expect(fixture.state.sent.at(-1)).toMatchObject({ forward: "AAMkAGm1", comment: "לטיפולך", toRecipients: [{ emailAddress: { address: "office@barak-cpa.example" } }] });

    // a missing recipient never becomes a draft
    const tool = graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem" }).find((t) => t.name === "forward_email")!;
    const out = await tool.run({ message_id: "AAMkAGm1", to_email: "", comment: "" }, { db: h.db, userId: user.id, now: new Date(), createPending: async () => { throw new Error("must not draft"); } });
    expect(out).toMatchObject({ status: "error", error: "invalid_recipient" });
  });

  it("reads Office files through the PDF rendition and reports expired connections without throwing", async () => {
    const db = (await import("@/lib/db/memory")).MemoryDb;
    const mem = new db();
    const user = await mem.createUser("a@b.co");
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const tools = graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem" });
    const ai = new (await import("@/lib/ai/mock")).MockProvider().enqueue(
      { text: '{"intent":"files","complexity":"tool","needs_tools":true,"reply":null}' },
      { toolCalls: [{ id: "f1", name: "search_files", input: { query: "כהן" } }], stopReason: "tool_use" },
      { toolCalls: [{ id: "f2", name: "get_file_text", input: { id: "01ITEM1" } }], stopReason: "tool_use" },
      (req) => {
        const last = req.messages.filter((m) => m.role === "tool").at(-1)!;
        const out = last.role === "tool" ? (last.results[0]!.output as { text: string; name: string }) : { text: "", name: "" };
        return { text: `בקובץ ${out.name} כתוב: ${out.text.trim()}` };
      },
    );
    const out = await runAssistant({ db: mem, ai, user, connections: [], text: "מה כתוב בהסכם של כהן?", tools });
    // the file's text reaches the model as data (lib/ai/untrusted.ts), with the untrusted note
    expect(out.text).toBe('בקובץ הסכם כהן.docx כתוב: <data source="onedrive" id="01ITEM1">\nHello PDF 42\n</data>');

    const expired = new GraphClient({ getAccessToken: async () => "expired", fetchImpl: fixture.fetchImpl });
    const t2 = graphTools({ graph: async () => expired, timeZone: "Asia/Jerusalem" });
    const r = await t2.find((t) => t.name === "search_emails")!.run({ query: "", unread_only: false, limit: 5 }, { db: mem, userId: user.id, now: new Date(), createPending: async () => { throw new Error("no"); } });
    expect(r).toEqual({ error: "connection_expired" });
  });
});
