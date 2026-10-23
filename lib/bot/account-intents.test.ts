import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/billing/plans";
import { activateSubscription } from "@/lib/billing/subscription";
import { MockHypGateway } from "@/lib/hyp/client";
import type { RecordedSend } from "@/lib/wa/sender";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

/**
 * Daniel's live test (23.10.2026), excerpt 2: "איזה מנוי אני", "אתה יכול ליצור לי סוכן", "אני רוצה לשדרג למנוי פרו" /
 * "מנוי פרו" / "אני רוצה לשדרוג מה הבעיה אחי" — each one must end in the real data or the real flow: the plan status,
 * the agent-creation flow, the one-tap upgrade approval or the pay link. Never "אין לי כלי לשדרג".
 */
type H = ReturnType<typeof makeHarness>;
const PHONE = "+972501234567";
const TOKEN = "1234567890123454580"; // a HYP token ends with the card's last four digits

async function user(h: H, plan: "trial" | "basic" | "pro") {
  const created = await h.db.createUser(`${plan}@example.com`);
  await h.db.mergeUserProfile(created.id, { onboarding: { step: "done", startedAt: "x" } });
  h.db.seedWaIdentity(created.id, PHONE);
  if (plan !== "trial") {
    const hyp = new MockHypGateway("https://app.example.co.il");
    h.ctx.hyp = () => hyp;
    await activateSubscription(h.db, created, { plan, transId: "T0", amountIls: PLANS[plan].priceIls, acode: null, token: TOKEN, tokef: "3012", invoiceUrl: null, raw: {} }, new Date("2026-10-10T08:00:00Z"));
  }
  return (await h.db.getUser(created.id))!;
}

const tool = { text: JSON.stringify({ intent: "account", complexity: "tool", needs_tools: true, reply: null }) };
const visible = (h: H): RecordedSend[] => h.wa.sent.filter((s) => s.kind !== "read" && s.kind !== "reaction");
const counted = async (h: H, userId: string) => (await h.db.getCurrentUsage(userId))?.counted_messages ?? 0;

describe("plan status from data", () => {
  it("'איזה מנוי אני' on the trial: the messages left and the way to a plan — no model, not counted", async () => {
    const h = makeHarness();
    const u = await user(h, "trial");
    await processInbound(h.ctx, h.inbound("שאלה ראשונה"));
    expect((await processInbound(h.ctx, h.inbound("איזה מנוי אני"))).note).toBe("billing command");
    const text = h.wa.texts.at(-1)!;
    expect(text).toContain("מסלול: תקופת ניסיון — נשארו 9 מתוך 10 הודעות.");
    expect(text).toContain("בסיסי 99 ₪ (עד 750 הודעות בחודש) או פרו 299 ₪ (עד 3,000 הודעות");
    expect(text).toMatch(/https:\/\/app\.example\.co\.il\/pay\/\S+/);
    // only the first question went to the model (router + strong)
    expect(h.ai.calls.every((c) => !c.messages.some((m) => m.role === "user" && m.content === "איזה מנוי אני"))).toBe(true);
    expect(await counted(h, u.id)).toBe(1);
  });

  it("'מה המסלול שלי?' on a paid plan: the plan, the usage and the next charge", async () => {
    const h = makeHarness();
    await user(h, "basic");
    await processInbound(h.ctx, h.inbound("מה המסלול שלי?"));
    expect(h.wa.texts.at(-1)).toContain("מסלול: בסיסי");
    expect(h.wa.texts.at(-1)).toContain("חיוב הבא: יום ג׳ 10.11, 99 ₪");
  });

  it("the model knows the plan too: the account section is in its system prompt", async () => {
    const h = makeHarness();
    await user(h, "basic");
    h.ai.enqueue(tool, { text: "המסלול שלך בסיסי, 99 ₪ לחודש." });
    await processInbound(h.ctx, h.inbound("אני על הבסיסי או על משהו אחר? תסבירי"));
    expect(h.ai.calls[0]!.system).toContain("- מסלול: בסיסי (99 ₪ לחודש), פעיל. נשארו 749 מתוך 750 הודעות החודש (ההודעה הנוכחית כבר נספרה). החיוב הבא: יום ג׳ 10.11.");
    expect(h.ai.calls[1]!.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["start_upgrade", "start_agent_creation"]));
  });
});

describe("upgrade requests reach the real one-tap flow", () => {
  it.each(["אני רוצה לשדרג למנוי פרו", "מנוי פרו", "לשדרג לפרו", "איך משדרגים?"])("basic with a saved card: '%s' → the prorated offer with an approve button", async (text) => {
    const h = makeHarness();
    await user(h, "basic");
    expect((await processInbound(h.ctx, h.inbound(text))).note).toBe("billing command");
    const offer = visible(h).at(-1)!;
    expect(offer.kind).toBe("buttons");
    expect(offer.body).toContain("*שדרוג למסלול פרו*");
    expect(offer.buttons!.some((b) => b.id.startsWith("bill:ok:"))).toBe(true);
    expect(h.ai.calls).toHaveLength(0);
  });

  it("trial: 'אני רוצה לשדרג למנוי פרו' → the secure pay page", async () => {
    const h = makeHarness();
    await user(h, "trial");
    await processInbound(h.ctx, h.inbound("אני רוצה לשדרג למנוי פרו"));
    expect(h.wa.texts.at(-1)).toMatch(/דף תשלום מאובטח:\nhttps:\/\/app\.example\.co\.il\/pay\//);
  });

  it("any other wording: the model calls start_upgrade and the pipeline sends the very same offer (the model's text is not sent)", async () => {
    const h = makeHarness();
    const u = await user(h, "basic");
    h.ai.enqueue(tool, { toolCalls: [{ id: "c1", name: "start_upgrade", input: {} }], stopReason: "tool_use" }, { text: "שולחת את פרטי השדרוג." });
    expect((await processInbound(h.ctx, h.inbound("אני רוצה לשדרוג מה הבעיה אחי"))).note).toBe("replied");
    const offer = visible(h).at(-1)!;
    expect(offer.kind).toBe("buttons");
    expect(offer.body).toContain("*שדרוג למסלול פרו*");
    expect(offer.buttons!.some((b) => b.id.startsWith("bill:ok:"))).toBe(true);
    expect(h.wa.texts).not.toContain("שולחת את פרטי השדרוג.");
    expect(await h.db.listBillingApprovals(u.id, { kinds: ["upgrade"], statuses: ["pending"] })).toHaveLength(1);
    const toolResult = h.ai.calls[2]!.messages.find((m) => m.role === "tool");
    expect(toolResult && toolResult.role === "tool" && toolResult.results[0]!.output).toMatchObject({ status: "started" });
  });
});

describe("agent creation requests start the real flow", () => {
  it("'אתה יכול ליצור לי סוכן' → the template list (pro), no model", async () => {
    const h = makeHarness();
    await user(h, "pro");
    expect((await processInbound(h.ctx, h.inbound("אתה יכול ליצור לי סוכן"))).note).toBe("agent new");
    const list = visible(h).at(-1)!;
    expect(list.kind).toBe("list");
    expect(list.sections![0]!.rows.map((r) => r.id)).toEqual(expect.arrayContaining(["ag:tpl:secretary", "ag:tpl:intern", "ag:tpl:bookkeeper"]));
    expect(h.ai.calls).toHaveLength(0);
  });

  it("'אפשר ליצור סוכן?' on the trial → the plan's answer with the pay link, not 'אי אפשר'", async () => {
    const h = makeHarness();
    await user(h, "trial");
    await processInbound(h.ctx, h.inbound("אפשר ליצור סוכן?"));
    expect(h.wa.texts.at(-1)).toContain("סוכן משלך נפתח עם מנוי");
  });

  it("any other wording: the model calls start_agent_creation and the flow starts", async () => {
    const h = makeHarness();
    await user(h, "pro");
    h.ai.enqueue(tool, { toolCalls: [{ id: "c1", name: "start_agent_creation", input: {} }], stopReason: "tool_use" }, { text: "מתחילות." });
    await processInbound(h.ctx, h.inbound("בא לי עוזר נוסף שיטפל רק בחשבוניות של הספקים"));
    const list = visible(h).at(-1)!;
    expect(list.kind).toBe("list");
    expect(list.sections![0]!.rows.map((r) => r.id)).toContain("ag:tpl:bookkeeper");
    expect(h.wa.texts).not.toContain("מתחילות.");
  });
});
