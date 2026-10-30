import { describe, expect, it } from "vitest";
import { AgentDailyCapError } from "./errors";
import { MemoryDb } from "./memory";

describe("MemoryDb", () => {
  it("enforces unique email and cascades on delete", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@b.co");
    await expect(db.createUser("a@b.co")).rejects.toThrow(/duplicate/);
    db.seedConnection(u.id, "microsoft", "a@b.co");
    db.seedSubscription(u.id, "basic", "active");
    db.seedWaIdentity(u.id, "+972501234567");
    await db.createLinkToken(u.id, { id: "00000000-0000-4000-8000-000000000001", tokenHash: "h".repeat(43) }, new Date(Date.now() + 60_000));
    await db.deleteUser(u.id);
    expect(await db.getUser(u.id)).toBeNull();
    expect(await db.listConnections(u.id)).toEqual([]);
    expect(await db.listWaIdentities(u.id)).toEqual([]);
    expect(await db.getSubscription(u.id)).toBeNull();
    expect(await db.latestLinkToken(u.id)).toBeNull();
  });

  it("scopes revoke/unlink to the owner", async () => {
    const db = new MemoryDb();
    const a = await db.createUser("a@b.co");
    const b = await db.createUser("b@b.co");
    const conn = db.seedConnection(a.id, "google", "a@gmail.com");
    const phone = db.seedWaIdentity(a.id, "+972501234567");
    expect(await db.revokeConnection(b.id, conn.id)).toBeNull();
    expect(await db.unlinkWaIdentity(b.id, phone.id)).toBe(false);
    expect((await db.revokeConnection(a.id, conn.id))?.status).toBe("revoked");
    expect(await db.unlinkWaIdentity(a.id, phone.id)).toBe(true);
  });

  it("mirrors enforce_agent_daily_cap: the agent's cap (default 10) since local midnight, without cancelled drafts", async () => {
    const db = new MemoryDb();
    let now = new Date("2026-10-21T20:00:00Z"); // 23:00 in Jerusalem
    db.now = () => now;
    const u = await db.createUser("a@b.co");
    db.seedSubscription(u.id, "pro", "active");
    const agent = await db.createAgent({ user_id: u.id, name: "חשבוניות", role: "custom", tools: ["mail.draft"], permissions: { max_outbound_per_day: 2 } });
    const key = `custom:${agent.id}` as const;
    const draft = () => db.createPendingAction(u.id, "send_mail", {}, new Date(now.getTime() + 600_000), { agentKey: key, agentName: "חשבוניות" });
    const first = await draft();
    await draft();
    const refused = await draft().catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AgentDailyCapError);
    expect((refused as AgentDailyCapError).cap).toBe(2);
    await db.updatePendingAction(first.id, { status: "cancelled" });
    await draft(); // a cancelled draft does not count
    await expect(draft()).rejects.toBeInstanceOf(AgentDailyCapError);
    now = new Date("2026-10-21T21:30:00Z"); // 00:30 the next day in Jerusalem
    await draft();
    for (let i = 0; i < 10; i++) await db.createPendingAction(u.id, "create_event", {}, now, { agentKey: "builtin:secretary", agentName: "מזכירה" });
    await expect(db.createPendingAction(u.id, "create_event", {}, now, { agentKey: "builtin:secretary", agentName: "מזכירה" })).rejects.toBeInstanceOf(AgentDailyCapError);
    for (let i = 0; i < 12; i++) await db.createPendingAction(u.id, "send_mail", {}, now); // the main assistant has no cap
  });

  it("claimBillingApproval mirrors claim_billing_approval(): only while the number is the account's active linked one", async () => {
    const db = new MemoryDb();
    const u = await db.createUser("a@b.co");
    const phone = db.seedWaIdentity(u.id, "+972501234567");
    const a = await db.createBillingApproval({ user_id: u.id, kind: "upgrade", plan: "pro", amount_ils: 10, phone_e164: "+972501234567" });
    await db.unlinkWaIdentity(u.id, phone.id);
    expect(await db.claimBillingApproval(a.id, { userId: u.id, phoneE164: "+972501234567", waMessageId: "wamid.1" })).toBeNull();
    expect((await db.getBillingApproval(a.id))!.status).toBe("pending");
    db.seedWaIdentity(u.id, "+972501234567"); // linked again
    expect((await db.claimBillingApproval(a.id, { userId: u.id, phoneE164: "+972501234567", waMessageId: "wamid.2" }))!.status).toBe("processing");
  });

  it("lowerUsageLimit mirrors lower_plan_limit(): the month's quota down, the remainder never below 0", async () => {
    const db = new MemoryDb();
    db.now = () => new Date("2026-11-20T10:00:00Z");
    const u = await db.createUser("a@b.co");
    db.usage.push({ user_id: u.id, period_start: "2026-11-01", counted_messages: 1000, free_remaining: 2000, plan_limit: 3000 });
    expect(await db.lowerUsageLimit(u.id, 750)).toBe(0);
    expect(await db.lowerUsageLimit(u.id, 750)).toBeNull(); // already there
    expect(db.usage[0]).toMatchObject({ plan_limit: 750, free_remaining: 0 });
  });

  it("finishJob mirrors finish_job() (0022): only a running job, and only the attempt that runs now", async () => {
    const db = new MemoryDb();
    const j = (await db.createJob({ kind: "reminder", user_id: null, run_at: new Date(Date.now() - 1000) }))!;
    expect((await db.finishJob(j.id, "too early"))!.status).toBe("queued"); // not claimed yet: unchanged
    expect(db.jobs[0]!.last_error).toBeNull();
    await db.claimDueJobs(5); // running, attempt 1
    expect((await db.finishJob(j.id, null, null, 2))!.status).toBe("running"); // another attempt: unchanged
    expect((await db.finishJob(j.id, null, null, 1))!.status).toBe("done");
    expect((await db.finishJob(j.id, "error after success", null, 1))!.status).toBe("done");
    expect(db.jobs[0]!.last_error).toBeNull();
    expect(await db.getJob(j.id)).toMatchObject({ id: j.id, status: "done", attempts: 1 });
    expect(await db.getJob("nope")).toBeNull();
  });
});
