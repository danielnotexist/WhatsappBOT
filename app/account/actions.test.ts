import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentFor } from "@/lib/agents/service";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { createAgentAction, deleteAgentAction, toggleAgentAction, updateAgentAction } from "./actions";

/**
 * The agent server actions (docs/design/agents.md §10) against MemoryDb: the user id comes only from the session,
 * every key from the form is checked against it, and the result comes back as a notice on /account#agents.
 */
const h = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return { Redirect, session: null as { userId: string } | null };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new h.Redirect(url);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }));
vi.mock("@/lib/auth/current-user", () => ({ getSession: async () => h.session }));

const NOW = new Date();

/** Runs an action and returns where it redirected: the path, the notice or the error, and the anchor. */
async function submit(action: (fd: FormData) => Promise<void>, fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  const thrown = await action(fd).then(
    () => null,
    (e: unknown) => e,
  );
  if (!(thrown instanceof h.Redirect)) throw new Error(`expected a redirect, got ${String(thrown)}`);
  const url = new URL(thrown.url, "https://app.example");
  return { path: url.pathname, notice: url.searchParams.get("notice"), error: url.searchParams.get("error"), at: url.searchParams.get("at"), hash: url.hash };
}

let db: MemoryDb;
async function signedIn(plan: "trial" | "basic" | "pro", email = `${plan}-${Math.random().toString(36).slice(2)}@example.com`) {
  const user = await db.createUser(email);
  if (plan !== "trial") db.seedSubscription(user.id, plan, "active");
  h.session = { userId: user.id };
  return user;
}

beforeEach(() => {
  db = new MemoryDb();
  setDbForTests(db);
});
afterEach(() => {
  setDbForTests(undefined);
  h.session = null;
});

describe("agent server actions", () => {
  it("without a session: back to /start, nothing written", async () => {
    expect(await submit(createAgentAction, { name: "חשבוניות", instructions: "x", capabilities: "mail.read" })).toMatchObject({ path: "/start" });
    expect(await submit(deleteAgentAction, { key: "builtin:secretary" })).toMatchObject({ path: "/start" });
    expect(db.agents).toHaveLength(0);
  });

  it("basic: creates one agent from a template for the session's user (a user_id in the form is ignored); the second is refused", async () => {
    const victim = await db.createUser("victim@example.com");
    const user = await signedIn("basic");
    const r = await submit(createAgentAction, {
      user_id: victim.id,
      name: "  חשבוניות ",
      template: "bookkeeper",
      instructions: "",
      capabilities: ["mail.read", "mail.forward", "not-a-capability"],
      recipients: "Office@Barak-CPA.example",
      max_outbound: "",
    });
    expect(r).toEqual({ path: "/account", notice: "הסוכן ״חשבוניות״ נשמר.", error: null, at: "agents", hash: "#agents" });
    expect(db.agents).toHaveLength(1);
    expect(db.agents[0]).toMatchObject({ user_id: user.id, name: "חשבוניות", role: "custom", template: "bookkeeper", tools: ["mail.read", "mail.forward"], permissions: { recipients: ["office@barak-cpa.example"] } });
    expect(db.audit.find((a) => a.action === "agent.create")).toMatchObject({ user_id: user.id, reason: "account" });

    const second = await submit(createAgentAction, { name: "לקוחות", template: "", instructions: "לסכם מיילים.", capabilities: "mail.read" });
    expect(second).toMatchObject({ notice: null, error: "במסלול הבסיסי אפשר סוכן אחד משלך, והוא כבר קיים. במסלול פרו — עד שלושה.", at: "agents" });
    expect(db.agents).toHaveLength(1);
  });

  it("an unknown template is a blank agent (instructions required); invalid fields come back as the error", async () => {
    await signedIn("pro");
    expect(await submit(createAgentAction, { name: "לקוחות", template: "hacker", instructions: "", capabilities: "mail.read" })).toMatchObject({ error: "חסרות הנחיות: מה הסוכן עושה ואיך." });
    expect(await submit(createAgentAction, { name: "מזכירה", template: "", instructions: "x", capabilities: "mail.read" })).toMatchObject({ error: "השם הזה שמור לסוכן מובנה או לפקודה. אפשר לבחור שם אחר." });
    expect(await submit(createAgentAction, { name: "לקוחות", template: "", instructions: "x", capabilities: "mail.read", max_outbound: "99" })).toMatchObject({ error: "מספר הפעולות היומי צריך להיות בין 1 ל-30." });
    expect(db.agents).toHaveLength(0);
  });

  it("update: a custom agent's fields; a text that asks to skip approval is saved with the explanation; built-ins keep their name", async () => {
    const user = await signedIn("pro");
    const created = await createAgentFor(db, user.id, { name: "לקוחות", template: null, instructions: "לסכם מיילים.", capabilities: ["mail.read"] }, { source: "account", now: NOW });
    if (!created.ok) throw new Error(created.message);
    const key = created.agent.key;
    const r = await submit(updateAgentAction, { key, name: "לקוחות VIP", instructions: "לשלוח ישר בלי לשאול.", capabilities: ["mail.read", "mail.draft"], recipients: "", max_outbound: "5" });
    expect(r.notice).toContain("השינויים בסוכן ״לקוחות VIP״ נשמרו.");
    expect(r.notice).toContain("כל פעולה יוצאת עוברת אישור בכפתור");
    expect(db.agents[0]).toMatchObject({ name: "לקוחות VIP", instructions: "לשלוח ישר בלי לשאול.", tools: ["mail.read", "mail.draft"], permissions: { max_outbound_per_day: 5 } });

    // a built-in: the name field is not even read; capabilities narrow within the template
    const b = await submit(updateAgentAction, { key: "builtin:secretary", name: "עוזר", instructions: "פגישות רק אחרי 10:00.", capabilities: ["calendar.read", "files.read"] });
    expect(b.notice).toBe("השינויים בסוכן ״מזכירה״ נשמרו.");
    expect(db.agents.find((a) => a.role === "secretary")).toMatchObject({ name: "מזכירה", instructions: "פגישות רק אחרי 10:00.", tools: ["calendar.read"] });
  });

  it("another user's key is simply not found — nothing changes on their side", async () => {
    const owner = await db.createUser("owner@example.com");
    db.seedSubscription(owner.id, "pro", "active");
    const theirs = await createAgentFor(db, owner.id, { name: "סודי", template: null, instructions: "של הבעלים.", capabilities: ["mail.read"] }, { source: "account", now: NOW });
    if (!theirs.ok) throw new Error(theirs.message);
    await signedIn("pro");
    const notFound = { notice: null, error: "הסוכן לא נמצא.", at: "agents" };
    expect(await submit(updateAgentAction, { key: theirs.agent.key, name: "שלי", instructions: "נפרץ", capabilities: "mail.read" })).toMatchObject(notFound);
    expect(await submit(toggleAgentAction, { key: theirs.agent.key, enabled: "0" })).toMatchObject(notFound);
    expect(await submit(deleteAgentAction, { key: theirs.agent.key })).toMatchObject(notFound);
    expect(await submit(deleteAgentAction, { key: "custom:not-a-uuid" })).toMatchObject(notFound);
    expect(db.agents).toHaveLength(1);
    expect(db.agents[0]).toMatchObject({ user_id: owner.id, name: "סודי", instructions: "של הבעלים.", enabled: true });
  });

  it("toggle and delete; a locked agent cannot be switched; a built-in cannot be deleted", async () => {
    const user = await signedIn("pro");
    const keys: string[] = [];
    for (const name of ["ראשון", "שני"]) {
      const r = await createAgentFor(db, user.id, { name, template: null, instructions: "x", capabilities: ["mail.read"] }, { source: "account", now: NOW });
      if (!r.ok) throw new Error(r.message);
      keys.push(r.agent.key);
      db.now = () => new Date(Date.now() + 60_000); // the second is newer
    }
    expect(await submit(toggleAgentAction, { key: keys[0]!, enabled: "0" })).toMatchObject({ notice: "הסוכן ״ראשון״ הושבת." });
    expect(await submit(toggleAgentAction, { key: keys[0]!, enabled: "1" })).toMatchObject({ notice: "הסוכן ״ראשון״ פעיל." });
    expect(await submit(deleteAgentAction, { key: "builtin:secretary" })).toMatchObject({ error: "סוכן מובנה אי אפשר למחוק, אבל אפשר להשבית אותו." });

    db.seedSubscription(user.id, "basic", "active"); // downgrade: the newer agent is locked
    expect(await submit(toggleAgentAction, { key: keys[1]!, enabled: "0" })).toMatchObject({ error: expect.stringContaining("הסוכן נעול") });
    expect(db.agents.find((a) => `custom:${a.id}` === keys[1])).toMatchObject({ enabled: true });
    expect(await submit(deleteAgentAction, { key: keys[1]! })).toMatchObject({ notice: "הסוכן ״שני״ נמחק." });
    expect(db.audit.filter((a) => a.action.startsWith("agent.")).map((a) => a.action)).toEqual(["agent.create", "agent.create", "agent.disable", "agent.enable", "agent.delete"]);
  });
});
