import { describe, expect, it } from "vitest";
import type { ConnectionRow } from "@/lib/db/types";
import { makeHarness } from "./test-harness";
import { connectRequestProvider, reconnectProviderFor } from "./connect-intent";
import { processInbound } from "./process-inbound";

const conn = (provider: ConnectionRow["provider"], status: ConnectionRow["status"]): ConnectionRow => ({ id: `${provider}-${status}`, user_id: "u", provider, account_email: null, tenant_id: null, scopes: [], status, consent_type: "user", expires_at: null, created_at: "", revoked_at: null });

describe("connect intents", () => {
  it("recognizes connect requests in Hebrew (no ASCII \\b) and picks the provider", () => {
    expect(connectRequestProvider("לחבר את המייל", [])).toBe("microsoft");
    expect(connectRequestProvider("תחבר את היומן", [])).toBe("microsoft");
    expect(connectRequestProvider("לחבר outlook", [])).toBe("microsoft");
    expect(connectRequestProvider("לחבר את גוגל", [])).toBe("google");
    expect(connectRequestProvider("חבר את הג'ימייל שלי", [])).toBe("google");
    expect(connectRequestProvider("לחבר Google Drive", [])).toBe("google");
    // already active: no new link unless "שוב" / "מחדש" — the assistant answers "already connected"
    expect(connectRequestProvider("לחבר את המייל", [conn("google", "active")])).toBeNull();
    expect(connectRequestProvider("לחבר את המייל מחדש", [conn("google", "active")])).toBe("google");
    expect(connectRequestProvider("לחבר שוב את גוגל", [conn("google", "active")])).toBe("google");
    expect(connectRequestProvider("לחבר את גוגל", [conn("google", "active")])).toBeNull();
    expect(connectRequestProvider("לחבר את אאוטלוק", [conn("google", "active")])).toBe("microsoft");
    expect(connectRequestProvider("לחבר את המייל", [conn("google", "active"), conn("microsoft", "expired")])).toBe("microsoft");
    expect(connectRequestProvider("חבר שוב", [conn("google", "expired"), conn("microsoft", "active")])).toBe("google");
    expect(connectRequestProvider("חבר שוב", [conn("google", "expired"), conn("microsoft", "expired")])).toBe("microsoft");
    expect(connectRequestProvider("חבר שוב", [])).toBe("microsoft");
    expect(connectRequestProvider("מה יש לי מחר?", [])).toBeNull();
    expect(connectRequestProvider("חברה שלי שלחה מייל", [])).toBeNull();
    expect(connectRequestProvider("לחבר בין שני הלקוחות", [])).toBeNull();
    for (const t of ["להתחבר לגוגל", "חיבור Outlook", "תתחברי למייל שלי", "לחבר את חשבון הגוגל", "לחבר מחדש את היומן", "חברי את המייל"]) expect(connectRequestProvider(t, []), t).not.toBeNull();
  });

  it("the verb needs a connection object: 'חבר' / 'חברי' as 'a friend' / 'members of' never bring a link (review 23.10.2026)", () => {
    const negatives = [
      "חברי הוועד שלחו לי מייל",
      "חברי הצוות ביקשו לקבוע פגישה ביומן",
      "תחברי בין המייל של כהן לתיק",
      "נחבר את זה ליומן",
      "חבר שלי שלח לי מייל",
      "היי, חבר שלי שלח מייל",
      "חבר מהעבודה שלח לי מייל ביומן",
      "לחבר את זה לתיק של כהן",
    ];
    for (const cs of [[], [conn("microsoft", "active")], [conn("google", "active")]]) {
      for (const t of negatives) expect(connectRequestProvider(t, cs), t).toBeNull();
    }
  });

  it("accepts every spelling of Gmail — geresh, apostrophe, curly quote, none — with or without the verb (Daniel's test)", () => {
    for (const t of ["לחבר את הג׳ימייל", "לחבר את הג'ימייל", "לחבר את הג’ימייל", "לחבר את הגימייל", "לחבר gmail", "לחבר את הגוגל", "תחברי לי את הג׳ימייל", "אני רוצה לחבר את הג׳ימייל", "אפשר לחבר את גוגל?"]) {
      expect(connectRequestProvider(t, []), t).toBe("google");
    }
    // a bare provider name: the answer to "which account?" or a correction right after the other provider's link
    for (const t of ["הג׳ימייל", "ג׳ימייל", "ג'ימייל", "הגימייל", "גימייל", "ג׳י מייל", "Gmail", "gmail.", "גוגל", "Google", "את הג׳ימייל שלי", "גוגל דרייב"]) {
      expect(connectRequestProvider(t, [conn("microsoft", "active")]), t).toBe("google");
    }
    for (const t of ["אאוטלוק", "Outlook", "מיקרוסופט", "Microsoft 365", "אופיס 365"]) expect(connectRequestProvider(t, []), t).toBe("microsoft");
    // already connected: the bare name is a question for the assistant, not a new link
    expect(connectRequestProvider("הג׳ימייל", [conn("google", "active")])).toBeNull();
    expect(connectRequestProvider("אאוטלוק", [conn("microsoft", "active")])).toBeNull();
    // an expired connection is not active: the bare name brings the link
    expect(connectRequestProvider("גוגל", [conn("google", "expired")])).toBe("google");
    for (const t of ["מה חדש בג׳ימייל?", "דרייב", "גוגל אמר שהפגישה בוטלה"]) expect(connectRequestProvider(t, []), t).toBeNull();
  });

  it("hyphenated and two-word Google spellings are the bare provider name too", () => {
    for (const t of ["ג׳י-מייל", "ג'י-מייל", "G-mail", "g-mail", "יומן גוגל", "היומן של גוגל", "גוגל קלנדר", "Google Calendar", "המייל של גוגל", "המייל של Google", "יומן ה-Google שלי"]) {
      expect(connectRequestProvider(t, [conn("microsoft", "active")]), t).toBe("google");
      expect(connectRequestProvider(t, [conn("google", "active")]), t).toBeNull();
    }
    expect(connectRequestProvider("לחבר את הג׳י-מייל", [])).toBe("google");
  });

  it("offers a reconnect only when no live connection can answer", () => {
    expect(reconnectProviderFor("מה יש לי ביומן?", [conn("google", "expired")])).toBe("google");
    expect(reconnectProviderFor("מה יש לי ביומן?", [conn("microsoft", "expired")])).toBe("microsoft");
    expect(reconnectProviderFor("מה יש לי ביומן גוגל?", [conn("microsoft", "expired"), conn("google", "expired")])).toBe("google");
    expect(reconnectProviderFor("מה יש לי ביומן?", [conn("google", "expired"), conn("microsoft", "active")])).toBeNull();
    expect(reconnectProviderFor("תודה רבה", [conn("google", "expired")])).toBeNull();
  });

  it("sends a one-time Google start link from the chat, and a reconnect link when Google expired", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await processInbound(h.ctx, h.inbound("לחבר את גוגל"));
    expect(h.wa.texts.at(-1)).toMatch(/^הנה הקישור לחיבור Google:\nhttps:\/\/app\.example\.co\.il\/api\/auth\/google\/start\?t=/);
    await processInbound(h.ctx, h.inbound("לחבר את המייל"));
    expect(h.wa.texts.at(-1)).toContain("https://app.example.co.il/api/auth/microsoft/start?t=");
    const g = h.db.seedConnection(user.id, "google", "dana.levi@gmail.com");
    await h.db.setConnectionStatus(g.id, "expired");
    await processInbound(h.ctx, h.inbound("מה יש לי ביומן מחר?"));
    expect(h.wa.texts.at(-1)).toContain("החיבור ל-Google פג תוקף");
    expect(h.wa.texts.at(-1)).toContain("/api/auth/google/start?t=");
    expect(h.ai.calls).toHaveLength(0); // no model call for any of these
  });

  it("one account on basic / in the trial: a second one is refused in the chat with the plan line (no link, no model); pro gets the link", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    h.db.seedConnection(user.id, "microsoft", "dana@contoso.co.il");
    expect((await processInbound(h.ctx, h.inbound("לחבר את גוגל"))).note).toBe("second account refused");
    expect(h.wa.texts.at(-1)).toBe(
      'בתקופת הניסיון עובדים עם חשבון אחד, והחשבון המחובר הוא Microsoft 365. במסלול פרו (299 ₪ לחודש) Microsoft 365 ו-Google עובדים יחד. אפשר לכתוב "שדרוג" ואשלח את הפרטים.\nאפשר גם להחליף חשבון: לנתק את Microsoft 365 באזור האישי, ואז לחבר את Google.',
    );
    await h.db.upsertSubscription(user.id, { plan: "basic", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    await processInbound(h.ctx, h.inbound("לחבר את הג׳ימייל"));
    expect(h.wa.texts.at(-1)).toMatch(/^במסלול הבסיסי עובדים עם חשבון אחד/);
    expect(h.wa.texts.join("\n")).not.toContain("/api/auth/google/start");
    // reconnecting the account in force still works
    await processInbound(h.ctx, h.inbound("לחבר מחדש את המייל"));
    expect(h.wa.texts.at(-1)).toContain("/api/auth/microsoft/start?t=");
    await h.db.upsertSubscription(user.id, { plan: "pro" });
    await processInbound(h.ctx, h.inbound("לחבר את גוגל"));
    expect(h.wa.texts.at(-1)).toContain("/api/auth/google/start?t=");
    expect(h.ai.calls).toHaveLength(0);
  });

  it("both accounts from before the split on basic: the turn uses the newest only, and the model is told the other is paused", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await h.db.upsertSubscription(user.id, { plan: "basic", status: "active", next_charge_at: "2099-01-01T00:00:00.000Z" });
    h.db.seedConnection(user.id, "microsoft", "dana@contoso.co.il").created_at = "2026-09-01T00:00:00.000Z";
    h.db.seedConnection(user.id, "google", "dana.levi@gmail.com").created_at = "2026-10-01T00:00:00.000Z";
    const seen: string[][] = [];
    h.ctx.extraTools = async (_user, connections, plan) => {
      seen.push([...connections.map((c) => c.provider), String(plan)]);
      return [];
    };
    await processInbound(h.ctx, h.inbound("מה יש לי ביומן מחר?"));
    expect(seen).toEqual([["google", "basic"]]);
    const system = h.ai.calls.at(-1)!.system;
    expect(system).toContain("- Microsoft 365 מחובר אבל מושהה: במסלול הזה עובדים עם חשבון אחד, והפעיל הוא Google.");
    expect(system).not.toContain("- Microsoft 365 מחובר (dana@contoso.co.il)");
    // nothing was disconnected
    expect((await h.db.listConnections(user.id)).map((c) => c.status)).toEqual(["active", "active"]);
  });

  it("'הג׳ימייל' right after a Microsoft link brings the Google link, without the model", async () => {
    const h = makeHarness();
    const user = await h.db.createUser("dana@example.com");
    await h.db.mergeUserProfile(user.id, { onboarding: { step: "done", startedAt: "x" } });
    h.db.seedWaIdentity(user.id, "+972501234567");
    await processInbound(h.ctx, h.inbound("לחבר את המייל"));
    expect(h.wa.texts.at(-1)).toContain("/api/auth/microsoft/start?t=");
    expect((await processInbound(h.ctx, h.inbound("הג׳ימייל"))).note).toBe("connect link");
    expect(h.wa.texts.at(-1)).toMatch(/^הנה הקישור לחיבור Google:\nhttps:\/\/app\.example\.co\.il\/api\/auth\/google\/start\?t=/);
    expect(h.ai.calls).toHaveLength(0);
  });
});
