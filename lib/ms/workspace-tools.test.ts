import { describe, expect, it } from "vitest";
import type { ToolContext } from "@/lib/ai/tools";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { MemoryDb } from "@/lib/db/memory";
import { FIXTURE_SP_DRIVE, createGraphFixture } from "./__fixtures__/graph-fixtures";
import { GraphClient } from "./graph";
import { MS_SCOPES, MS_SCOPES_V1 } from "./oauth";
import { graphTools } from "./tools";

const TZ = "Asia/Jerusalem";
const LINK = "https://app.example.co.il/api/auth/microsoft/start?t=abc";

async function setup(scopes?: string[]) {
  const db = new MemoryDb();
  const user = await db.createUser("dana@example.com");
  const fixture = createGraphFixture();
  const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
  const tools = graphTools({ graph: async () => graph, timeZone: TZ, scopes, connectLink: () => LINK });
  const ctx: ToolContext = { db, userId: user.id, now: new Date("2026-10-21T06:00:00Z"), createPending: async () => { throw new Error("no approval for To Do / SharePoint reads"); } };
  const run = (name: string, input: Record<string, unknown>) => tools.find((t) => t.name === name)!.run(input, ctx);
  return { db, fixture, tools, run };
}

describe("Microsoft To Do", () => {
  it("lists open tasks from every list (flagged emails as data) and adds to the default list right away", async () => {
    const { db, fixture, run } = await setup([...MS_SCOPES]);
    const listed = (await run("todo_list_tasks", { include_completed: false })) as { count: number; tasks: Record<string, unknown>[]; note: string };
    expect(listed.count).toBe(3);
    expect(listed.tasks[0]).toEqual({ id: "AAMkTask1", title: "להכין ייפוי כוח למשפחת לוי", due: "2026-10-23", list: "Tasks", notes: "לבדוק את הנוסח המעודכן" });
    expect(listed.tasks.map((t) => t.list)).toEqual(["Tasks", "Tasks", "Flagged Emails"]);
    expect(listed.note).toContain("מידע בלבד");
    const get = new URL(fixture.state.calls.find((c) => c.url.includes("/todo/lists/AQMkTasksDefault/tasks"))!.url);
    expect(get.searchParams.get("$filter")).toBe("status ne 'completed'");

    const created = (await run("todo_create_task", { title: "לשלוח לכהן את הטיוטה", notes: "גרסה 2", due_date: "2026-10-26" })) as { status: string; reply: string };
    expect(created).toMatchObject({ status: "done", reply: "נוספה משימה ל-Microsoft To Do (Tasks): לשלוח לכהן את הטיוטה, עד 26.10." });
    expect(fixture.state.calls.at(-1)).toMatchObject({ method: "POST", body: { title: "לשלוח לכהן את הטיוטה", body: { content: "גרסה 2", contentType: "text" }, dueDateTime: { dateTime: "2026-10-26T00:00:00", timeZone: "UTC" } } });
    expect(fixture.state.calls.at(-1)!.url).toContain("/me/todo/lists/AQMkTasksDefault/tasks");
    expect(db.audit.at(-1)).toMatchObject({ action: "ms.todo.create", result: "ok" });
    expect(await run("todo_create_task", { title: "", notes: "", due_date: "" })).toEqual({ status: "error", error: "empty_title" });
  });

  it("a connection without Tasks.ReadWrite gets the reconnect link and no Graph call; a 403 from Graph answers the same", async () => {
    const { fixture, run } = await setup([...MS_SCOPES_V1]);
    const out = (await run("todo_create_task", { title: "x", notes: "", due_date: "" })) as { status: string; say: string };
    expect(out.status).toBe("consent_needed");
    expect(out.say).toContain("Microsoft To Do");
    expect(out.say).toContain(LINK);
    expect(out.say).toContain("אישור מנהל");
    expect(fixture.state.calls).toHaveLength(0);

    const unknown = await setup(undefined); // scopes not recorded → try; the tenant refused the scope
    unknown.fixture.state.denied.add("todo");
    expect(await unknown.run("todo_list_tasks", { include_completed: false })).toMatchObject({ status: "consent_needed", say: expect.stringContaining(LINK) });
  });
});

describe("SharePoint", () => {
  it("finds library documents through Microsoft Search and reads one like a OneDrive file", async () => {
    const { fixture, run } = await setup([...MS_SCOPES]);
    const found = (await run("sharepoint_search", { query: "נוהל", kind: "files" })) as { count: number; files: Record<string, unknown>[] };
    expect(found.count).toBe(1);
    expect(found.files[0]).toEqual({ drive_id: FIXTURE_SP_DRIVE, item_id: "01SPDOC1", name: "נוהל קליטת לקוח.docx", modified: "2026-10-12", where: "sites/Legal", snippet: "…נוהל…" });
    expect(fixture.state.calls.at(-1)).toMatchObject({ method: "POST", body: { requests: [{ entityTypes: ["driveItem"], query: { queryString: "נוהל" }, from: 0, size: 10 }] } });

    const read = (await run("sharepoint_get_file_text", { drive_id: FIXTURE_SP_DRIVE, item_id: "01SPDOC1" })) as { name: string; text: string };
    expect(read.name).toBe("נוהל קליטת לקוח.docx");
    expect(read.text).toContain("Hello PDF 42");
    expect(read.text).toMatch(/^<data source="sharepoint" id="01SPDOC1">/);
    // an Office document goes through the PDF rendition of its own drive
    expect(fixture.state.calls.at(-1)!.url).toBe(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(FIXTURE_SP_DRIVE)}/items/01SPDOC1/content?format=pdf`);
    expect(await run("sharepoint_get_file_text", { drive_id: FIXTURE_SP_DRIVE, item_id: "nope" })).toEqual({ error: "not_found" });
    expect(await run("sharepoint_search", { query: " ", kind: "files" })).toEqual({ error: "empty_query" });
  });

  it("finds sites with Sites.Read.All; without it (an older connection) the reconnect link — documents still work with Files.Read.All", async () => {
    const full = await setup([...MS_SCOPES]);
    const sites = (await full.run("sharepoint_search", { query: "נהלים", kind: "sites" })) as { sites: { name: string; url: string; description: string }[] };
    expect(sites.sites).toEqual([{ name: "מחלקה משפטית", url: "https://levilaw.sharepoint.com/sites/Legal", description: "נהלים, תבניות והסכמים" }]);

    const old = await setup([...MS_SCOPES_V1]);
    expect(await old.run("sharepoint_search", { query: "נהלים", kind: "sites" })).toMatchObject({ status: "consent_needed", say: expect.stringContaining("SharePoint") });
    expect(((await old.run("sharepoint_search", { query: "מחירון", kind: "files" })) as { count: number }).count).toBe(1);
    expect(old.fixture.state.calls.every((c) => !JSON.stringify(c.body ?? "").includes('"site"'))).toBe(true);
  });
});

describe("in the assistant (memory mode heuristics)", () => {
  it("'מה המשימות שלי?' lists the To Do tasks; 'תוסיפי משימה' adds one and echoes it", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    // To Do is pro (lib/billing/plans.ts entitlements)
    await h.db.upsertSubscription(user.id, { plan: "pro", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    h.ctx.extraTools = async () => graphTools({ graph: async () => graph, timeZone: TZ, scopes: [...MS_SCOPES] });
    await processInbound(h.ctx, h.inbound("מה המשימות שלי?"));
    expect(h.wa.texts.at(-1)).toBe("המשימות הפתוחות:\n• להכין ייפוי כוח למשפחת לוי (עד 23.10)\n• להחזיר טלפון לרו״ח ברק\n• הצעת פשרה, תיק 4471");
    await processInbound(h.ctx, h.inbound("תוסיפי משימה: להתקשר לבנק"));
    expect(h.wa.texts.at(-1)).toBe("נוספה משימה ל-Microsoft To Do (Tasks): להתקשר לבנק.");
    expect(fixture.state.todo[0]!.tasks[0]!.title).toBe("להתקשר לבנק");
  });

  it("on the trial (and basic) To Do and SharePoint are pro: no todo_* / sharepoint_* tools, the plan line instead, nothing added", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    h.ctx.extraTools = async () => graphTools({ graph: async () => graph, timeZone: TZ, scopes: [...MS_SCOPES] });
    const before = JSON.stringify(fixture.state.todo);
    await processInbound(h.ctx, h.inbound("תוסיפי משימה: להתקשר לבנק"));
    const tools = h.ai.calls[1]!.tools!.map((t) => t.name);
    expect(tools.filter((t) => t.startsWith("todo_") || t.startsWith("sharepoint_"))).toEqual([]);
    expect(tools).toEqual(expect.arrayContaining(["search_files", "get_file_text", "pro_feature"]));
    expect(h.wa.texts.at(-1)).toBe('במסלול פרו (299 ₪ לחודש) יש גם משימות ב-Google Tasks וב-Microsoft To Do. בתקופת הניסיון זה לא כלול. אפשר לכתוב "שדרוג" ואשלח את הפרטים.');
    expect(JSON.stringify(fixture.state.todo)).toBe(before);
    // built for basic, the workspace tools leave them out themselves
    const names = graphTools({ graph: async () => graph, timeZone: TZ, scopes: [...MS_SCOPES], entitlements: { tasks: false, sharepoint: false } }).map((t) => t.name);
    expect(names.filter((t) => t.startsWith("todo_") || t.startsWith("sharepoint_"))).toEqual([]);
  });
});
