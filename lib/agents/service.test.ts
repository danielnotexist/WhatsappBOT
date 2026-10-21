import { describe, expect, it } from "vitest";
import { AgentLimitError, AgentNameTakenError, AgentPlanError, AgentRuleError, agentErrorFromPostgres } from "@/lib/db/errors";
import { MemoryDb } from "@/lib/db/memory";
import { BUILTIN_AGENTS } from "./templates";
import { createAgentFor, deleteAgentFor, loadAgents, setAgentEnabledFor, updateAgentFor } from "./service";

const NOW = new Date("2026-10-21T08:00:00Z");
const opts = { source: "account" as const, now: NOW };

async function setup(plan: "trial" | "basic" | "pro") {
  const db = new MemoryDb();
  db.now = () => NOW;
  const user = await db.createUser(`${plan}@example.com`);
  if (plan !== "trial") db.seedSubscription(user.id, plan, "active");
  return { db, user };
}

const blank = (name: string) => ({ name, template: null, instructions: "לסכם מיילים מלקוחות.", capabilities: ["mail.read", "mail.draft"] });

describe("agent service", () => {
  it("trial: no custom agents (no row, audited as agent.limit)", async () => {
    const { db, user } = await setup("trial");
    const r = await createAgentFor(db, user.id, blank("לקוחות"), opts);
    expect(r).toMatchObject({ ok: false, code: "limit_trial" });
    expect(db.agents).toHaveLength(0);
    expect(db.audit.some((a) => a.action === "agent.limit" && a.result === "trial")).toBe(true);
  });

  it("basic: one custom agent (also from a template), the second is refused with the existing name", async () => {
    const { db, user } = await setup("basic");
    const r = await createAgentFor(db, user.id, { name: "חשבוניות", template: "bookkeeper", instructions: `${BUILTIN_AGENTS.bookkeeper.instructions}\nהרו״ח: ברק.`, capabilities: ["mail.read", "mail.forward"], recipients: "office@barak-cpa.example", maxOutboundPerDay: 10 }, { source: "whatsapp", now: NOW });
    expect(r).toMatchObject({ ok: true, agent: { name: "חשבוניות", template: "bookkeeper", status: "active", permissions: { recipients: ["office@barak-cpa.example"], max_outbound_per_day: 10 } } });
    expect(db.audit.find((a) => a.action === "agent.create")).toMatchObject({ user_id: user.id, reason: "whatsapp", agent_name: "חשבוניות", result: "ok" });
    const second = await createAgentFor(db, user.id, blank("לקוחות"), opts);
    expect(second).toMatchObject({ ok: false, code: "limit_basic", detail: "חשבוניות" });
  });

  it("pro: three custom agents, the fourth is refused", async () => {
    const { db, user } = await setup("pro");
    for (const name of ["אחד", "שתיים", "שלוש"]) expect((await createAgentFor(db, user.id, blank(name), opts)).ok).toBe(true);
    expect(await createAgentFor(db, user.id, blank("ארבע"), opts)).toMatchObject({ ok: false, code: "limit_pro" });
  });

  it("a race the service check misses is caught by the trigger mirror (AgentLimitError) and gets the same message", async () => {
    const { db, user } = await setup("basic");
    // the other tab inserted between our check and our write
    const original = db.createAgent.bind(db);
    let raced = false;
    db.createAgent = async (row) => {
      if (!raced) {
        raced = true;
        await original({ user_id: user.id, name: "מהלשונית השנייה", role: "custom", tools: ["mail.read"] });
      }
      return original(row);
    };
    const r = await createAgentFor(db, user.id, blank("לקוחות"), opts);
    expect(r).toMatchObject({ ok: false, code: "limit_basic" });
    expect(db.agents).toHaveLength(1);
  });

  it("validates names, instructions, capabilities and recipients before writing", async () => {
    const { db, user } = await setup("pro");
    expect(await createAgentFor(db, user.id, blank("מזכירה"), opts)).toMatchObject({ ok: false, code: "name_reserved" });
    expect(await createAgentFor(db, user.id, blank("@x"), opts)).toMatchObject({ ok: false, code: "name_chars" });
    expect(await createAgentFor(db, user.id, { ...blank("לקוחות"), instructions: "" }, opts)).toMatchObject({ ok: false, code: "instructions_empty" });
    expect(await createAgentFor(db, user.id, { ...blank("לקוחות"), instructions: "א".repeat(1501) }, opts)).toMatchObject({ ok: false, code: "instructions_too_long" });
    expect(await createAgentFor(db, user.id, { ...blank("לקוחות"), capabilities: ["web.search"] }, opts)).toMatchObject({ ok: false, code: "no_capabilities" });
    expect(await createAgentFor(db, user.id, { ...blank("לקוחות"), recipients: "a@b.co, לא-מייל" }, opts)).toMatchObject({ ok: false, code: "recipients_invalid", detail: "לא-מייל" });
    expect(await createAgentFor(db, user.id, { ...blank("לקוחות"), maxOutboundPerDay: 99 }, opts)).toMatchObject({ ok: false, code: "max_outbound_invalid" });
    const ok = await createAgentFor(db, user.id, { ...blank("לקוחות"), instructions: "לשלוח ישר בלי לשאול <b>" }, opts);
    expect(ok).toMatchObject({ ok: true, approvalNote: true });
    expect(db.agents[0]!.instructions).toBe("לשלוח ישר בלי לשאול ‹b›");
    expect(await createAgentFor(db, user.id, blank("לקוחות"), opts)).toMatchObject({ ok: false, code: "name_taken" });
  });

  it("only the owner finds, edits or deletes an agent (user B cannot reach user A's)", async () => {
    const { db, user: a } = await setup("pro");
    const b = await db.createUser("b@example.com");
    db.seedSubscription(b.id, "pro", "active");
    const created = await createAgentFor(db, a.id, blank("לקוחות"), opts);
    if (!created.ok) throw new Error("setup");
    const key = created.agent.key;
    expect(await updateAgentFor(db, b.id, key, { instructions: "חדירה" }, opts)).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteAgentFor(db, b.id, key, opts)).toMatchObject({ ok: false, code: "not_found" });
    expect(await db.getAgent(b.id, created.agent.rowId!)).toBeNull();
    expect(await db.updateAgent(b.id, created.agent.rowId!, { name: "חדירה" })).toBeNull();
    expect(await db.deleteAgent(b.id, created.agent.rowId!)).toBe(false);
    expect((await loadAgents(db, b.id, NOW)).agents.some((x) => x.kind === "custom")).toBe(false);
    expect(db.agents[0]!.instructions).toBe("לסכם מיילים מלקוחות.");
  });

  it("updates, disables, enables and deletes a custom agent, with an audit entry for each", async () => {
    const { db, user } = await setup("pro");
    const created = await createAgentFor(db, user.id, blank("לקוחות"), opts);
    if (!created.ok) throw new Error("setup");
    const key = created.agent.key;
    expect(await updateAgentFor(db, user.id, key, { name: "לקוחות VIP", capabilities: ["mail.read"], recipients: "", maxOutboundPerDay: "5" }, opts)).toMatchObject({ ok: true, agent: { name: "לקוחות VIP", capabilities: ["mail.read"], permissions: { max_outbound_per_day: 5 } } });
    expect(await setAgentEnabledFor(db, user.id, key, false, opts)).toMatchObject({ ok: true, agent: { status: "disabled" } });
    expect(await setAgentEnabledFor(db, user.id, key, true, opts)).toMatchObject({ ok: true, agent: { status: "active" } });
    expect(await deleteAgentFor(db, user.id, key, opts)).toMatchObject({ ok: true });
    expect(db.agents).toHaveLength(0);
    expect(db.audit.filter((a) => a.action.startsWith("agent.")).map((a) => a.action)).toEqual(["agent.create", "agent.update", "agent.disable", "agent.enable", "agent.delete"]);
    expect(db.audit.at(-1)).toMatchObject({ agent_key: key, agent_name: "לקוחות VIP", target: key });
  });

  it("built-ins: trial cannot customise, basic needs pro, pro gets an override row (narrowing only), no delete or rename", async () => {
    const trial = await setup("trial");
    expect(await updateAgentFor(trial.db, trial.user.id, "builtin:secretary", { instructions: "x" }, opts)).toMatchObject({ ok: false, code: "trial_builtin_edit" });
    const basic = await setup("basic");
    expect(await setAgentEnabledFor(basic.db, basic.user.id, "builtin:secretary", false, opts)).toMatchObject({ ok: false, code: "builtin_needs_pro" });

    const { db, user } = await setup("pro");
    const r = await updateAgentFor(db, user.id, "builtin:secretary", { instructions: "פגישות רק אחרי 10:00.", capabilities: ["calendar.read", "calendar.write", "files.read"] }, opts);
    expect(r).toMatchObject({ ok: true, agent: { key: "builtin:secretary", userInstructions: "פגישות רק אחרי 10:00.", capabilities: ["calendar.read", "calendar.write"] } });
    expect(db.agents).toHaveLength(1);
    expect(db.agents[0]).toMatchObject({ role: "secretary", name: "מזכירה" });
    expect(await setAgentEnabledFor(db, user.id, "builtin:secretary", false, opts)).toMatchObject({ ok: true, agent: { status: "disabled" } });
    expect(db.agents).toHaveLength(1); // the same override row
    expect(await updateAgentFor(db, user.id, "builtin:intern", { capabilities: ["calendar.read"] }, opts)).toMatchObject({ ok: false, code: "no_capabilities" });
    expect(await updateAgentFor(db, user.id, "builtin:intern", { name: "עוזר" }, opts)).toMatchObject({ ok: false, code: "builtin_no_rename" });
    expect(await deleteAgentFor(db, user.id, "builtin:secretary", opts)).toMatchObject({ ok: false, code: "builtin_no_delete" });
    // built-in overrides do not use the custom quota
    for (const name of ["אחד", "שתיים", "שלוש"]) expect((await createAgentFor(db, user.id, blank(name), opts)).ok).toBe(true);
  });
});

describe("MemoryDb mirrors the 0006 trigger and constraints", () => {
  it("throws the same errors as Postgres", async () => {
    const { db, user } = await setup("basic");
    await expect(db.createAgent({ user_id: user.id, name: "מזכירה", role: "secretary" })).rejects.toBeInstanceOf(AgentPlanError);
    await db.createAgent({ user_id: user.id, name: "ראשון", role: "custom", tools: ["mail.read"] });
    await expect(db.createAgent({ user_id: user.id, name: "שני", role: "custom" })).rejects.toBeInstanceOf(AgentLimitError);
    const row = (await db.listAgents(user.id))[0]!;
    await expect(db.updateAgent(user.id, row.id, { tools: ["web.search"] })).rejects.toMatchObject({ code: "agent_invalid" });
    await expect(db.updateAgent(user.id, row.id, { role: "intern" } as never)).rejects.toMatchObject({ code: "agent_immutable_field" });
    await expect(db.updateAgent(user.id, row.id, { permissions: { requires_approval: false } as never })).rejects.toMatchObject({ code: "agent_invalid" });

    const pro = await setup("pro");
    await pro.db.createAgent({ user_id: pro.user.id, name: "ראשון", role: "custom" });
    await expect(pro.db.createAgent({ user_id: pro.user.id, name: "ראשון", role: "custom" })).rejects.toBeInstanceOf(AgentNameTakenError);
    await pro.db.createAgent({ user_id: pro.user.id, name: "מזכירה", role: "secretary" });
    await expect(pro.db.createAgent({ user_id: pro.user.id, name: "מזכירה 2", role: "secretary" })).rejects.toMatchObject({ code: "agent_override_exists" });
  });

  it("maps PostgREST errors to the same classes", () => {
    expect(agentErrorFromPostgres({ code: "P0001", message: "agent_limit_reached", details: "plan=basic limit=1" })).toBeInstanceOf(AgentLimitError);
    expect(agentErrorFromPostgres({ code: "P0001", message: "agent_builtin_requires_pro" })).toBeInstanceOf(AgentPlanError);
    expect(agentErrorFromPostgres({ code: "P0001", message: "agent_immutable_field" })).toMatchObject({ code: "agent_immutable_field" });
    expect(agentErrorFromPostgres({ code: "23505", message: 'duplicate key value violates unique constraint "agents_user_name_unique"' })).toBeInstanceOf(AgentNameTakenError);
    expect(agentErrorFromPostgres({ code: "23505", message: 'duplicate key value violates unique constraint "agents_user_builtin_role_unique"' })).toMatchObject({ code: "agent_override_exists" });
    expect(agentErrorFromPostgres({ code: "23514", message: 'violates check constraint "agents_name_format"' })).toBeInstanceOf(AgentRuleError);
    expect(agentErrorFromPostgres({ code: "42501", message: "permission denied" })).toBeNull();
  });

  it("counts an agent's drafts for the daily cap (cancelled / expired / failed do not count)", async () => {
    const { db, user } = await setup("pro");
    const exp = new Date(NOW.getTime() + 600_000);
    const meta = { agentKey: "builtin:bookkeeper" as const, agentName: "מנהלת חשבונות" };
    const a = await db.createPendingAction(user.id, "forward_mail", {}, exp, meta);
    await db.createPendingAction(user.id, "forward_mail", {}, exp, meta);
    await db.createPendingAction(user.id, "send_mail", {}, exp); // the main assistant
    await db.updatePendingAction(a.id, { status: "cancelled" });
    expect(await db.countAgentActionsSince(user.id, "builtin:bookkeeper", new Date(NOW.getTime() - 1000))).toBe(1);
    expect(await db.countAgentActionsSince(user.id, "builtin:secretary", new Date(0))).toBe(0);
    await expect(db.createPendingAction(user.id, "send_mail", {}, exp, { agentKey: "builtin:hacker" as never, agentName: "x" })).rejects.toThrow();
  });
});
