import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/brand";
import { meetingSummaryReadyTemplate, morningSummaryTemplate, proactiveAlertTemplate, registerTemplates, reminderTemplate, templateDefinitions, templateParam } from "./templates";

describe("WhatsApp templates", () => {
  it("flattens parameters the way Meta accepts them (no new lines / tabs / 5+ spaces, never empty)", () => {
    expect(templateParam("• 09:00 דיון\n• 12:00 פגישה\n")).toBe("• 09:00 דיון  • 12:00 פגישה");
    expect(templateParam("a\tb      c")).toBe("a b    c");
    expect(templateParam("   ")).toBe("—");
    expect(templateParam("x".repeat(50), 10)).toBe(`${"x".repeat(9)}…`);
    for (const p of morningSummaryTemplate({ dayLabel: "יום ד׳ 21.10", meetings: ["• 09:00 א", "• 12:00 ב"], emails: [], reminders: ["• 14:00 ג"] }).params) {
      expect(p).not.toMatch(/[\n\t]| {5,}/);
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it("builds the reminder template with the reminder id in each quick-reply payload", () => {
    const t = reminderTemplate("11111111-1111-4111-8111-111111111111", "להתקשר לבנק", "יום ב׳ 20.10, 18:40");
    expect(t.name).toBe("reminder");
    expect(t.params).toEqual(["להתקשר לבנק", "יום ב׳ 20.10, 18:40"]);
    expect(t.buttons.map((b) => [b.index, b.subType, b.text])).toEqual([
      [0, "quick_reply", "rem:done:11111111-1111-4111-8111-111111111111"],
      [1, "quick_reply", "rem:hour:11111111-1111-4111-8111-111111111111"],
      [2, "quick_reply", "rem:tmrw:11111111-1111-4111-8111-111111111111"],
    ]);
  });

  it("builds proactive_alert (the alert's action + al:off) and meeting_summary_ready (mt:show:<id> + mt:off)", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const a = proactiveAlertTemplate({ line: "מייל דחוף מ-רו״ח ברק:\nחתימה", actionId: `al:reply:${id}` });
    expect(a).toEqual({
      name: "proactive_alert",
      params: ["מייל דחוף מ-רו״ח ברק:  חתימה"],
      buttons: [
        { index: 0, subType: "quick_reply", text: `al:reply:${id}` },
        { index: 1, subType: "quick_reply", text: "al:off" },
      ],
    });
    const m = meetingSummaryReadyTemplate({ title: "פגישת צוות", summary: "x".repeat(600), summaryId: id });
    expect(m.name).toBe("meeting_summary_ready");
    expect(m.params[0]).toBe("פגישת צוות");
    expect(m.params[1]!.length).toBeLessThanOrEqual(400);
    expect(m.buttons.map((b) => b.text)).toEqual([`mt:show:${id}`, "mt:off"]);
    // the product name is fixed text in the definition, and the quick replies fit WhatsApp's 20 characters
    const defs = templateDefinitions("https://app.example.co.il");
    const body = (name: string) => (defs.find((d) => d.name === name)!.components.find((c) => c.type === "BODY") as { text: string }).text;
    expect(body("proactive_alert")).toBe(`התראה: {{1}}\n\nאפשר לענות כאן, ו${PRODUCT_NAME} תטפל בזה.`);
    expect(body("meeting_summary_ready")).toContain("שום דבר לא נשלח בלי אישור.");
    for (const d of defs) for (const b of ((d.components.find((c) => c.type === "BUTTONS") as { buttons?: { text: string }[] } | undefined)?.buttons ?? [])) expect(b.text.length, b.text).toBeLessThanOrEqual(20);
  });

  it("matches the template JSON in docs/copy/wa-templates.md (body text, category, buttons)", () => {
    const doc = readFileSync(new URL("../../docs/copy/wa-templates.md", import.meta.url), "utf8");
    const docDefs = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!) as { name?: string; category?: string; components?: { type: string; text?: string; buttons?: { type: string; text: string }[] }[] }).filter((d) => d.name);
    const ours = templateDefinitions("https://APP_DOMAIN");
    expect(ours.map((d) => d.name).sort()).toEqual(docDefs.map((d) => d.name!).sort());
    const norm = (s: string | undefined) => (s ?? "").replaceAll(PRODUCT_NAME, "<name>");
    for (const d of docDefs) {
      const o = ours.find((x) => x.name === d.name)!;
      expect(o.category, d.name).toBe(d.category);
      const docBody = d.components!.find((c) => c.type === "BODY")!;
      const ourBody = o.components.find((c) => c.type === "BODY") as { text: string };
      expect(norm(ourBody.text), d.name).toBe(norm(docBody.text));
      const docButtons = d.components!.find((c) => c.type === "BUTTONS")?.buttons?.map((b) => `${b.type}:${b.text}`) ?? [];
      const ourButtons = ((o.components.find((c) => c.type === "BUTTONS") as { buttons?: { type: string; text: string }[] } | undefined)?.buttons ?? []).map((b) => `${b.type}:${b.text}`);
      expect(ourButtons, d.name).toEqual(docButtons);
    }
  });

  it("registers in dry-run mode by default and posts to /{WABA_ID}/message_templates otherwise", async () => {
    const dry = await registerTemplates({ wabaId: "W", accessToken: "T", appUrl: "https://app.example.co.il", names: ["reminder"] });
    expect(dry).toHaveLength(1);
    expect(dry[0]!.status).toBe("dry-run");
    const calls: { url: string; auth: string; body: { name: string } }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization!, body: JSON.parse(String(init.body)) });
      return Response.json({ id: "tpl-1", status: "PENDING" });
    }) as unknown as typeof fetch;
    const real = await registerTemplates({ wabaId: "W", accessToken: "T", appUrl: "https://app.example.co.il", names: ["reminder", "trial_ended_payment"], dryRun: false, fetchImpl });
    expect(real.map((r) => r.status)).toEqual(["PENDING", "PENDING"]);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/W/message_templates");
    expect(calls[0]!.auth).toBe("Bearer T");
    expect(JSON.stringify(calls[1]!.body)).toContain("https://app.example.co.il/pay/{{1}}");
  });
});
