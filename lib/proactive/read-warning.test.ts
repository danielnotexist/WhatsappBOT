import { describe, expect, it } from "vitest";
import type { ToolContext } from "@/lib/ai/tools";
import { entitlements } from "@/lib/billing/plans";
import { MemoryDb } from "@/lib/db/memory";
import { FIXTURE_GMAIL_NOW, createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GoogleClient } from "@/lib/google/client";
import { gmailReadTools } from "@/lib/google/gmail-tools";
import { graphTools } from "@/lib/ms/tools";
import { proactiveMailbox } from "./__fixtures__/proactive-harness";

const ctx: ToolContext = { db: new MemoryDb(), userId: "u1", now: FIXTURE_GMAIL_NOW, createPending: async () => { throw new Error("read-only"); } };
const WARNING = "⚠️ שימו לב: כתובת השולח דומה ל-shapira-law.co.il אבל אינה זהה; השם בשולח מוכר, אבל המייל הגיע מכתובת אחרת; תשובה למייל תגיע לכתובת אחרת מזו של השולח. כדאי לאמת בטלפון, מול מספר מוכר, לפני כל תשלום, ולא ללחוץ על קישורים במייל.";

function msTools(plan: "pro" | "basic") {
  const { fx, graph } = proactiveMailbox();
  const list = graphTools({ graph: async () => graph, timeZone: "Asia/Jerusalem", connection: { tenant_id: "t", account_email: "dana@levi-law.co.il" }, entitlements: entitlements(plan) });
  const run = (name: string, input: Record<string, unknown>) => list.find((t) => t.name === name)!.run(input, ctx) as Promise<Record<string, unknown>>;
  return { fx, run };
}

describe("the phishing warning when she reads a mail (pro)", () => {
  it("Microsoft get_email: the warning to open the reply with; the known contacts come from Sent Items once", async () => {
    const { fx, run } = msTools("pro");
    const out = await run("get_email", { id: "AAMkPH" });
    expect(out.phishing_warning).toEqual({ say: WARNING, signals: ["lookalike_domain", "display_name_spoof", "reply_to_mismatch", "bank_change", "payment_urgency"] });
    // an ordinary mail: nothing added
    const plain = await run("get_email", { id: "AAMkGm2" });
    expect(plain.phishing_warning).toBeUndefined();
    expect(plain.phishing_signals).toBeUndefined();
    expect(fx.state.calls.filter((c) => c.url.includes("/mailFolders/sentitems/")).length).toBe(1);
  });

  it("Microsoft search_emails: the suspicious one carries the warning in the list", async () => {
    const { run } = msTools("pro");
    const out = (await run("search_emails", { query: "", unread_only: false, limit: 25 })) as { messages: { id: string; phishing_warning?: unknown }[] };
    expect(out.messages.filter((m) => m.phishing_warning).map((m) => m.id)).toEqual(["AAMkPH"]);
  });

  it("basic: no check, nothing added, no Sent Items call", async () => {
    const { fx, run } = msTools("basic");
    expect((await run("get_email", { id: "AAMkPH" })).phishing_warning).toBeUndefined();
    expect(fx.state.calls.some((c) => c.url.includes("/mailFolders/sentitems/"))).toBe(false);
  });

  it("Gmail gmail_get_email: the BEC fixture gm5 (new bank details) is flagged; gm1 is not", async () => {
    const fixture = createGoogleFixture();
    const google = new GoogleClient({ getAccessToken: async () => "ya29", fetchImpl: fixture.fetchImpl });
    const list = gmailReadTools({ google: async () => google, timeZone: "Asia/Jerusalem", accountEmail: "dana.levi@gmail.com", now: () => FIXTURE_GMAIL_NOW, phishing: true });
    const run = (name: string, input: Record<string, unknown>) => list.find((t) => t.name === name)!.run(input, ctx) as Promise<Record<string, unknown>>;
    const gm5 = await run("gmail_get_email", { id: "gm5" });
    expect((gm5.phishing_warning as { say: string }).say).toMatch(/^⚠️ שימו לב: מבקשים לשנות פרטי חשבון בנק לתשלום/);
    expect((await run("gmail_get_email", { id: "gm1" })).phishing_warning).toBeUndefined();
    // the same tools without the entitlement add nothing
    const off = gmailReadTools({ google: async () => google, timeZone: "Asia/Jerusalem", accountEmail: "dana.levi@gmail.com", now: () => FIXTURE_GMAIL_NOW });
    expect(((await off.find((t) => t.name === "gmail_get_email")!.run({ id: "gm5" }, ctx)) as Record<string, unknown>).phishing_warning).toBeUndefined();
  });
});
