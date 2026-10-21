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
    expect(connectRequestProvider("לחבר את המייל", [conn("google", "active")])).toBe("google");
    expect(connectRequestProvider("לחבר את המייל", [conn("google", "active"), conn("microsoft", "expired")])).toBe("microsoft");
    expect(connectRequestProvider("חבר שוב", [conn("google", "expired"), conn("microsoft", "active")])).toBe("google");
    expect(connectRequestProvider("חבר שוב", [conn("google", "expired"), conn("microsoft", "expired")])).toBe("microsoft");
    expect(connectRequestProvider("חבר שוב", [])).toBe("microsoft");
    expect(connectRequestProvider("מה יש לי מחר?", [])).toBeNull();
    expect(connectRequestProvider("חברה שלי שלחה מייל", [])).toBeNull();
    expect(connectRequestProvider("לחבר בין שני הלקוחות", [])).toBeNull();
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
});
