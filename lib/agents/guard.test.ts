import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import type { AgentPermissions } from "@/lib/db/types";
import { dailyCapMessage, guardAgentAction, localDayStart, recipientsOf } from "./guard";
import type { ResolvedAgent } from "./policy";

const NOW = new Date("2026-10-21T20:00:00Z"); // 23:00 in Jerusalem

function agentWith(permissions: AgentPermissions, key: ResolvedAgent["key"] = "builtin:secretary"): ResolvedAgent {
  return {
    key,
    kind: key.startsWith("builtin:") ? "builtin" : "custom",
    role: key.startsWith("builtin:") ? "secretary" : "custom",
    rowId: null,
    name: "מזכירה",
    aliases: [],
    template: "secretary",
    capabilities: ["calendar.read", "calendar.write", "mail.draft"],
    templateInstructions: null,
    userInstructions: null,
    permissions,
    status: "active",
    createdAt: null,
  };
}

async function setup() {
  const db = new MemoryDb();
  db.now = () => NOW;
  const user = await db.createUser("a@b.co");
  return { db, userId: user.id };
}

describe("recipientsOf", () => {
  it("mail and forwards: to + cc, split, lower-cased, without repeats", () => {
    expect(recipientsOf("send_mail", { to_email: "Office@Barak.example", cc: "a@x.co; b@y.co, office@barak.example" })).toEqual(["office@barak.example", "a@x.co", "b@y.co"]);
    expect(recipientsOf("forward_mail", { to_email: "rcpt@cpa.example" })).toEqual(["rcpt@cpa.example"]);
    expect(recipientsOf("send_mail", {})).toEqual([]);
  });

  it("meetings: a new one → its attendees; a change or a cancellation → who is already on it, plus any added", () => {
    expect(recipientsOf("create_event", { attendees: ["Dana@Levi.co.il", "dana@levi.co.il"] })).toEqual(["dana@levi.co.il"]);
    expect(recipientsOf("create_event", { attendees: "not-an-array" })).toEqual([]);
    expect(recipientsOf("update_event", { current_attendees: ["barak@cpa.example"], attendees: ["new@x.co"] })).toEqual(["barak@cpa.example", "new@x.co"]);
    expect(recipientsOf("delete_event", { current_attendees: ["barak@cpa.example"] })).toEqual(["barak@cpa.example"]);
    expect(recipientsOf("delete_event", { id: "e1" })).toEqual([]);
    expect(recipientsOf("share_file", { to_email: "x@y.co" })).toEqual([]);
  });
});

describe("guardAgentAction", () => {
  it("without a recipient list: anything (still a draft for approval), up to the daily cap", async () => {
    const { db, userId } = await setup();
    const free = agentWith({});
    expect(await guardAgentAction(db, userId, free, "send_mail", { to_email: "anyone@x.co" }, NOW)).toBeNull();
    expect(await guardAgentAction(db, userId, free, "delete_event", { id: "e1" }, NOW)).toBeNull(); // nothing to look up
  });

  it("with a list: mail must name an allowed recipient; outsiders and an empty recipient are refused", async () => {
    const { db, userId } = await setup();
    const listed = agentWith({ recipients: ["office@barak.example"] });
    expect(await guardAgentAction(db, userId, listed, "send_mail", { to_email: "Office@Barak.example" }, NOW)).toBeNull();
    expect(await guardAgentAction(db, userId, listed, "send_mail", { to_email: "office@barak.example", cc: "spy@evil.example" }, NOW)).toContain("הנמען spy@evil.example לא ברשימה המותרת לסוכן ״מזכירה״");
    expect(await guardAgentAction(db, userId, listed, "forward_mail", { to_email: "" }, NOW)).toContain("חסרה כתובת נמען");
  });

  it("with a list: a meeting change or cancellation is checked against who is on it — unknown attendees are refused", async () => {
    const { db, userId } = await setup();
    const listed = agentWith({ recipients: ["barak@cpa.example"] });
    expect(await guardAgentAction(db, userId, listed, "create_event", { attendees: ["barak@cpa.example"] }, NOW)).toBeNull();
    expect(await guardAgentAction(db, userId, listed, "create_event", { attendees: ["dana@levi.co.il"] }, NOW)).toContain("dana@levi.co.il לא ברשימה המותרת");
    expect(await guardAgentAction(db, userId, listed, "update_event", { id: "e2", current_attendees: ["barak@cpa.example"] }, NOW)).toBeNull();
    expect(await guardAgentAction(db, userId, listed, "update_event", { id: "e1", current_attendees: [] }, NOW)).toBeNull(); // nobody to notify
    expect(await guardAgentAction(db, userId, listed, "update_event", { id: "e3", current_attendees: ["barak@cpa.example", "client@x.co"] }, NOW)).toContain("client@x.co לא ברשימה המותרת");
    expect(await guardAgentAction(db, userId, listed, "delete_event", { id: "e3", current_attendees: ["client@x.co"] }, NOW)).toContain("client@x.co לא ברשימה המותרת");
    const unknown = await guardAgentAction(db, userId, listed, "delete_event", { id: "e3", subject: "פגישה" }, NOW);
    expect(unknown).toContain("לא הצלחתי לבדוק מי משתתף באירוע");
    expect(unknown).toContain("barak@cpa.example");
    expect(await guardAgentAction(db, userId, listed, "update_event", { id: "e3" }, NOW)).toContain("לא הצלחתי לבדוק מי משתתף באירוע");
  });

  it("the daily cap counts this agent's drafts since local midnight in the user's zone (cancelled ones do not count)", async () => {
    const { db, userId } = await setup();
    const capped = agentWith({ max_outbound_per_day: 2 });
    const draft = (at: Date) => {
      db.now = () => at;
      return db.createPendingAction(userId, "create_event", {}, new Date(at.getTime() + 600_000), { agentKey: "builtin:secretary", agentName: "מזכירה" });
    };
    await draft(new Date("2026-10-20T21:30:00Z")); // 00:30 on the 21st in Jerusalem — today
    const second = await draft(new Date("2026-10-21T19:00:00Z"));
    db.now = () => NOW;
    expect(await guardAgentAction(db, userId, capped, "create_event", {}, NOW)).toBe(dailyCapMessage("מזכירה", 2));
    await db.updatePendingAction(second.id, { status: "cancelled" });
    expect(await guardAgentAction(db, userId, capped, "create_event", {}, NOW)).toBeNull();
    // another agent's drafts are not this agent's
    expect(await guardAgentAction(db, userId, agentWith({ max_outbound_per_day: 1 }, "builtin:intern"), "create_event", {}, NOW)).toBeNull();
    // in New York it is still the 21st's afternoon, but the 00:30 Jerusalem draft was on the 20th there
    expect(await guardAgentAction(db, userId, agentWith({ max_outbound_per_day: 1 }), "create_event", {}, NOW, "America/New_York")).toBeNull();
  });

  it("the default cap is 10", async () => {
    const { db, userId } = await setup();
    for (let i = 0; i < 9; i++) await db.createPendingAction(userId, "send_mail", {}, NOW, { agentKey: "builtin:secretary", agentName: "מזכירה" });
    expect(await guardAgentAction(db, userId, agentWith({}), "send_mail", { to_email: "a@x.co" }, NOW)).toBeNull();
    await db.createPendingAction(userId, "send_mail", {}, NOW, { agentKey: "builtin:secretary", agentName: "מזכירה" });
    expect(await guardAgentAction(db, userId, agentWith({}), "send_mail", { to_email: "a@x.co" }, NOW)).toBe(dailyCapMessage("מזכירה", 10));
  });
});

describe("localDayStart", () => {
  it("is local midnight in the given zone, as an instant", () => {
    expect(localDayStart(NOW, "Asia/Jerusalem").toISOString()).toBe("2026-10-20T21:00:00.000Z"); // IDT, UTC+3
    expect(localDayStart(new Date("2026-10-26T10:00:00Z"), "Asia/Jerusalem").toISOString()).toBe("2026-10-25T22:00:00.000Z"); // IST after the change
    expect(localDayStart(NOW, "America/New_York").toISOString()).toBe("2026-10-21T04:00:00.000Z");
  });
});
