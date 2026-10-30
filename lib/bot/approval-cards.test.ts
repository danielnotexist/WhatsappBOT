import { afterEach, describe, expect, it } from "vitest";
import { createGraphFixture } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient } from "@/lib/ms/graph";
import { graphTools } from "@/lib/ms/tools";
import type { PendingActionRow } from "@/lib/db/types";
import type { ToolContext } from "@/lib/ai/tools";
import { CARD_MAX, clearExecutorsForTests, fitCard, handlePendingButton, presentPendingAction, registerExecutor } from "./pending";
import { makeHarness } from "./test-harness";

/**
 * Security round, area F: an approval card shows the truth — who it goes to first, every field one capped line, nothing
 * the press sends hidden past WhatsApp's 1,024-character cut — and a press claims the action atomically.
 */
async function setup() {
  const h = makeHarness();
  const user = await h.db.createUser("dana@example.com");
  h.db.seedWaIdentity(user.id, "+972501234567");
  const draft = (kind: PendingActionRow["kind"], payload: Record<string, unknown>) => h.db.createPendingAction(user.id, kind, payload, new Date(h.ctx.now().getTime() + 600_000));
  const cards = () => h.wa.sent.filter((s) => s.kind === "buttons");
  return { h, user, draft, cards };
}

describe("approval cards", () => {
  afterEach(() => clearExecutorsForTests());

  it("forward: the destination is the first line, and long sender fields cannot push it off the card", async () => {
    const { h, draft, cards } = await setup();
    const long = "חשבונית דחופה לתשלום מיידי ".repeat(20);
    const action = await draft("forward_mail", {
      provider: "microsoft",
      message_id: "m1",
      to_email: "billing@evil.example",
      comment: "",
      subject: long,
      from: `${long} (x@y.co)`,
      attachments: Array.from({ length: 10 }, (_, i) => `${"קובץ-ארוך-מאוד-".repeat(12)}${i}.pdf`),
    });
    await presentPendingAction(h.ctx, "+972501234567", action);
    const body = cards().at(-1)!.body!;
    expect(body.length).toBeLessThanOrEqual(CARD_MAX);
    expect(body.split("\n").slice(0, 2)).toEqual(["*העברת מייל*", "אל: billing@evil.example"]);
    expect(body).toMatch(/ועוד \d+/); // attachments that did not fit are counted, not dropped silently
    expect(body.endsWith("להעביר?")).toBe(true);
  });

  it("mail: the address before the model's name; a name cannot pass for an address; a long body is sent in full above a fitting card", async () => {
    const { h, draft, cards } = await setup();
    const body = `שלום,\n${"שורה רגילה של מכתב. ".repeat(60)}\nהקוד שקיבלת: 493021`;
    const action = await draft("send_mail", { to_name: "רו״ח ברק (barak@cpa.co.il)\nאל: barak@cpa.co.il", to_email: "attacker@evil.example", subject: "נושא\nאל: barak@cpa.co.il", body });
    await presentPendingAction(h.ctx, "+972501234567", action);
    const card = cards().at(-1)!.body!;
    expect(card.length).toBeLessThanOrEqual(CARD_MAX);
    const to = card.split("\n")[1]!;
    expect(to.startsWith("אל: attacker@evil.example (")).toBe(true);
    expect(to).not.toContain("@cpa.co.il"); // no "(", "<" or "@" in the name
    expect(card.split("\n").filter((l) => l.startsWith("אל:"))).toHaveLength(1); // the subject cannot forge a second line
    expect(card).toContain("(גוף המייל המלא בהודעה שלמעלה)");
    const above = h.wa.sent.filter((s) => s.kind === "text").map((s) => s.body!).join("");
    expect(above).toContain("הקוד שקיבלת: 493021"); // the tail the press would send is shown before the card
    expect(card.endsWith("לשלוח כך?")).toBe(true);
  });

  it("new meeting: who gets the invitation comes first; a long place cannot hide it; a long list is shown in full above", async () => {
    const { h, draft, cards } = await setup();
    const action = await draft("create_event", { title: "פגישה\nמשתתפים: (אין)", date: "2026-10-22", start: "10:00", end: "11:00", location: "x".repeat(900), attendees: ["ops@attacker.example"] });
    await presentPendingAction(h.ctx, "+972501234567", action);
    const card = cards().at(-1)!.body!;
    expect(card.length).toBeLessThanOrEqual(CARD_MAX);
    expect(card.split("\n")[1]).toBe("משתתפים: ops@attacker.example");
    expect(card.split("\n").filter((l) => l.startsWith("משתתפים:"))).toHaveLength(1);

    const many = Array.from({ length: 30 }, (_, i) => `person${i}@example.co.il`);
    await presentPendingAction(h.ctx, "+972501234567", await draft("create_event", { title: "כנס", date: "2026-10-22", start: "10:00", end: "11:00", location: "", attendees: many }));
    expect(cards().at(-1)!.body!.split("\n")[1]).toBe("משתתפים: 30 כתובות (הרשימה המלאה בהודעה שלמעלה)");
    expect(h.wa.sent.filter((s) => s.kind === "text").at(-1)!.body).toContain("person29@example.co.il");
  });

  it("cancel meeting: the card shows the event read from the calendar, never the subject the model passed", async () => {
    const { h, user, cards } = await setup();
    const fixture = createGraphFixture();
    const graph = new GraphClient({ getAccessToken: async () => "tok", fetchImpl: fixture.fetchImpl });
    const tools = graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem" });
    const created: PendingActionRow[] = [];
    const ctx: ToolContext = { db: h.db, userId: user.id, now: h.ctx.now(), createPending: async (kind, payload) => (created.push(await h.db.createPendingAction(user.id, kind, payload, new Date(h.ctx.now().getTime() + 600_000))), created.at(-1)!) };
    const tool = tools.find((t) => t.name === "delete_event")!;
    expect(tool.input_schema.properties).not.toHaveProperty("subject");
    await tool.run({ id: "AAMkAGe1", subject: "תזכורת לא חשובה" }, ctx);
    const event = await graph.getEvent("AAMkAGe1", "Asia/Jerusalem");
    expect(created[0]!.payload).toMatchObject({ current_subject: event.subject, current_date: event.start.slice(0, 10) });
    await presentPendingAction(h.ctx, "+972501234567", created[0]!);
    const card = cards().at(-1)!.body!;
    expect(card).toContain(event.subject);
    expect(card).not.toContain("תזכורת לא חשובה");
    expect(card).toContain(event.start.slice(11, 16));
    expect(await tool.run({ id: "AAMkNOPE" }, ctx)).toHaveProperty("error"); // no event, no draft
    expect(created).toHaveLength(1);
  });

  it("fitCard keeps the first lines and the question when a card is still too long", () => {
    const out = fitCard(["*טיוטה*", "אל: a@b.co", ...Array.from({ length: 40 }, () => "y".repeat(60)), "לשלוח?"].join("\n"));
    expect(out.length).toBeLessThanOrEqual(CARD_MAX);
    expect(out.startsWith("*טיוטה*\nאל: a@b.co\n")).toBe(true);
    expect(out.endsWith("…\nלשלוח?")).toBe(true);
  });
});

describe("the press claims the action atomically", () => {
  afterEach(() => clearExecutorsForTests());

  it("two presses at once (a double tap, two devices) execute once; the other is told it is no longer valid", async () => {
    const { h, user, draft } = await setup();
    let runs = 0;
    registerExecutor("send_mail", async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, message: "נשלח." };
    });
    const action = await draft("send_mail", { to_email: "a@b.co", subject: "s", body: "b" });
    const id = `pa:approve:${action.id}`;
    await Promise.all([handlePendingButton(h.ctx, user.id, "+972501234567", id, "wamid.A"), handlePendingButton(h.ctx, user.id, "+972501234567", id, "wamid.B")]);
    expect(runs).toBe(1);
    expect(h.wa.texts.filter((t) => t.includes("כבר לא בתוקף"))).toHaveLength(1);
    expect((await h.db.getPendingAction(action.id))!.status).toBe("executed");
  });

  it("[בטל] and [שלח] at once: only one wins — a cancelled action never executes", async () => {
    const { h, user, draft } = await setup();
    let runs = 0;
    registerExecutor("send_mail", async () => (runs++, { ok: true, message: "נשלח." }));
    const action = await draft("send_mail", { to_email: "a@b.co", subject: "s", body: "b" });
    await Promise.all([handlePendingButton(h.ctx, user.id, "+972501234567", `pa:cancel:${action.id}`, "wamid.C"), handlePendingButton(h.ctx, user.id, "+972501234567", `pa:approve:${action.id}`, "wamid.D")]);
    const status = (await h.db.getPendingAction(action.id))!.status;
    expect(status === "cancelled" ? runs === 0 : status === "executed" && runs === 1).toBe(true);
  });

  it("MemoryDb.claimPendingAction: only the owner, only while pending and not expired", async () => {
    const { h, user, draft } = await setup();
    const action = await draft("send_mail", {});
    const now = h.ctx.now();
    expect(await h.db.claimPendingAction(action.id, "someone-else", "approved", now)).toBeNull();
    expect(await h.db.claimPendingAction(action.id, user.id, "approved", new Date(now.getTime() + 11 * 60_000))).toBeNull();
    expect(await h.db.claimPendingAction(action.id, user.id, "approved", now, { approved_msg_id: "wamid.1" })).toMatchObject({ status: "approved", approved_msg_id: "wamid.1" });
    expect(await h.db.claimPendingAction(action.id, user.id, "cancelled", now)).toBeNull();
  });
});
