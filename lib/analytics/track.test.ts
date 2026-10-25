import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateSubscription } from "@/lib/billing/subscription";
import { processInbound } from "@/lib/bot/process-inbound";
import { makeHarness } from "@/lib/bot/test-harness";
import { MemoryDb } from "@/lib/db/memory";
import { flushServerEvents, serverEventRow, trackServerEvent } from "./track";
import { dailySalt, userVisitorId } from "./visitor";

beforeEach(() => vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 3).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("the server-side funnel steps (lib/analytics/track.ts)", () => {
  it("a row without path, source or device; the visitor is the user's daily hash", () => {
    const now = new Date("2026-10-25T22:30:00Z"); // 00:30 on the 26th in Israel (winter time, UTC+2)
    const row = serverEventRow("wa_linked", "u1", now);
    expect(row).toEqual({ day: "2026-10-26", visitor: userVisitorId(dailySalt("2026-10-26"), "u1"), user_id: "u1", path: null, referrer_host: null, utm_source: null, utm_medium: null, utm_campaign: null, device: null, event: "wa_linked", at: now.toISOString() });
    expect(serverEventRow("wa_linked", "u1", new Date("2026-10-27T08:00:00Z")).visitor).not.toBe(row.visitor);
    expect(serverEventRow("wa_linked", "u2", now).visitor).not.toBe(row.visitor);
  });

  it("fire and forget: never throws, even when the write fails or there is no key", async () => {
    const db = new MemoryDb();
    vi.spyOn(db, "insertPageEvent").mockRejectedValueOnce(new Error("down"));
    expect(() => trackServerEvent(db, "paid", "u1")).not.toThrow();
    vi.stubEnv("TOKEN_ENC_KEY", "");
    vi.stubEnv("DATA_MODE", "supabase");
    expect(() => trackServerEvent(db, "paid", "u1")).not.toThrow();
    await flushServerEvents();
    expect(db.pageEvents).toEqual([]);
  });

  it("the WhatsApp link records wa_linked for the account", async () => {
    const { ctx, inbound, db } = makeHarness();
    const user = await db.createUser("dana@example.com");
    await db.createLinkToken(user.id, "ABCD-2345", new Date(ctx.now().getTime() + 15 * 60_000));
    expect((await processInbound(ctx, inbound("היי! לקשר את החשבון שלי: ABCD-2345"))).note).toBe("linked");
    await flushServerEvents();
    expect(db.pageEvents).toEqual([expect.objectContaining({ event: "wa_linked", user_id: user.id, path: null })]);
  });

  it("the first payment records paid once; the same redirect again and a later payment do not", async () => {
    const db = new MemoryDb();
    const user = await db.createUser("dana@example.com");
    const input = { plan: "basic" as const, transId: "T1", amountIls: 99, acode: "A1", token: "0505743578473060772", tokef: "3105", invoiceUrl: null, raw: {} };
    const now = new Date("2026-10-20T10:00:00Z");
    await activateSubscription(db, user, input, now);
    await activateSubscription(db, user, input, now); // a refresh of the return page
    await activateSubscription(db, user, { ...input, transId: "T2", plan: "pro" }, now); // already active: not the first payment
    await flushServerEvents();
    expect(db.pageEvents.map((e) => [e.event, e.user_id, e.day])).toEqual([["paid", user.id, "2026-10-20"]]);
  });
});
