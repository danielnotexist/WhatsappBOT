import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/brand";
import type { AgentRow } from "@/lib/db/types";
import { resolveAgents } from "./policy";
import { parseAgentAddress } from "./routing";

const U = "11111111-1111-4111-8111-111111111111";
const custom = (name: string, id: string): AgentRow => ({ id, user_id: U, name, role: "custom", template: null, instructions: null, tools: ["mail.read"], permissions: {}, enabled: true, created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-01T08:00:00Z" });
const agents = resolveAgents(U, [custom("חשבוניות", "00000000-0000-4000-8000-000000000001"), custom("מנהלת", "00000000-0000-4000-8000-000000000002")], "pro");

describe("parseAgentAddress", () => {
  it("@name at the start", () => {
    expect(parseAgentAddress("@מזכירה מה יש לי מחר?", agents)).toMatchObject({ kind: "agent", agent: { name: "מזכירה" }, rest: "מה יש לי מחר?", via: "mention" });
    expect(parseAgentAddress("  @חשבוניות: מה הגיע השבוע", agents)).toMatchObject({ kind: "agent", agent: { name: "חשבוניות" }, rest: "מה הגיע השבוע" });
    expect(parseAgentAddress("@מזכירה", agents)).toMatchObject({ kind: "agent", rest: "" });
  });

  it("matches the longest name first and the aliases", () => {
    expect(parseAgentAddress("@מנהלת חשבונות תעבירי את החשבונית", agents)).toMatchObject({ agent: { role: "bookkeeper" }, rest: "תעבירי את החשבונית" });
    expect(parseAgentAddress("@מנהלת מה חדש", agents)).toMatchObject({ agent: { name: "מנהלת" }, rest: "מה חדש" });
    expect(parseAgentAddress("@הנהלת חשבונות מה פתוח", agents)).toMatchObject({ agent: { role: "bookkeeper" }, rest: "מה פתוח" });
    expect(parseAgentAddress("@המזכירה מחר?", agents)).toMatchObject({ agent: { role: "secretary" }, rest: "מחר?" });
  });

  it("סוכן: name / סוכן name, …", () => {
    expect(parseAgentAddress("סוכן: מתמחה תמצאי את ההסכם של כהן", agents)).toMatchObject({ agent: { role: "intern" }, rest: "תמצאי את ההסכם של כהן", via: "command" });
    expect(parseAgentAddress("סוכן מתמחה, תמצאי את ההסכם", agents)).toMatchObject({ agent: { role: "intern" }, rest: "תמצאי את ההסכם", via: "command" });
    expect(parseAgentAddress("סוכן: שיווק תכתבי פוסט", agents)).toEqual({ kind: "unknown", name: "שיווק", rest: "תכתבי פוסט" });
    expect(parseAgentAddress("סוכן ביטוח התקשר אליי", agents)).toBeNull(); // not an address: no colon, no known name
    expect(parseAgentAddress("סוכנים", agents)).toBeNull();
  });

  it("a name that starts with ״סוכן ״ is reachable by vocative too (voice notes), and by @ / סוכן:", () => {
    const withPrefix = resolveAgents(U, [custom("סוכן ביטוח", "00000000-0000-4000-8000-000000000004"), custom("ביטוח", "00000000-0000-4000-8000-000000000005")], "pro");
    expect(parseAgentAddress("סוכן ביטוח, מה חדש?", withPrefix)).toMatchObject({ kind: "agent", agent: { name: "סוכן ביטוח" }, rest: "מה חדש?", via: "vocative" });
    expect(parseAgentAddress("סוכן ביטוח", withPrefix)).toMatchObject({ kind: "agent", agent: { name: "סוכן ביטוח" }, rest: "", via: "vocative" });
    expect(parseAgentAddress("@סוכן ביטוח מה חדש", withPrefix)).toMatchObject({ agent: { name: "סוכן ביטוח" }, rest: "מה חדש", via: "mention" });
    expect(parseAgentAddress("סוכן: סוכן ביטוח מה חדש", withPrefix)).toMatchObject({ agent: { name: "סוכן ביטוח" }, via: "command" });
    expect(parseAgentAddress("סוכן: ביטוח מה חדש", withPrefix)).toMatchObject({ agent: { name: "ביטוח" }, via: "command" });
    expect(parseAgentAddress("סוכן ביטוח התקשר אליי", withPrefix)).toMatchObject({ agent: { name: "ביטוח" }, via: "command" }); // the command form, as before
    expect(parseAgentAddress("סוכן ביטוח, מה חדש?", agents)).toBeNull(); // without such an agent: ordinary text
  });

  it("vocative (voice notes): name, … / name: … / the name alone", () => {
    expect(parseAgentAddress("מזכירה, מה יש לי מחר?", agents)).toMatchObject({ agent: { role: "secretary" }, rest: "מה יש לי מחר?", via: "vocative" });
    expect(parseAgentAddress("חשבוניות: מה פתוח", agents)).toMatchObject({ agent: { name: "חשבוניות" }, rest: "מה פתוח", via: "vocative" });
    expect(parseAgentAddress("מזכירה?", agents)).toMatchObject({ agent: { role: "secretary" }, rest: "" });
    expect(parseAgentAddress("מזכירה חדשה התחילה אצלנו היום", agents)).toBeNull();
  });

  it("folds niqqud and quote forms", () => {
    expect(parseAgentAddress("@מְזַכִּירָה מחר", agents)).toMatchObject({ agent: { role: "secretary" }, rest: "מחר" });
    const quoted = resolveAgents(U, [custom("רו״ח ברק", "00000000-0000-4000-8000-000000000003")], "pro");
    expect(parseAgentAddress('@רו"ח ברק מה חדש', quoted)).toMatchObject({ agent: { name: "רו״ח ברק" }, rest: "מה חדש" });
    expect(parseAgentAddress("@רו’’ח ברק מה חדש", quoted)).toBeTruthy();
  });

  it("an unknown @name is reported (not passed to the model); @ mid-sentence is not an address", () => {
    expect(parseAgentAddress("@שיווק תכתבי פוסט", agents)).toEqual({ kind: "unknown", name: "שיווק", rest: "תכתבי פוסט" });
    expect(parseAgentAddress("תעבירי ל-@מזכירה את זה", agents)).toBeNull();
    expect(parseAgentAddress("מייל ל-dana@levi.co.il", agents)).toBeNull();
    expect(parseAgentAddress("@ 10 בבוקר", agents)).toBeNull();
    // a word that cannot be a name is not an address either (an e-mail address, a handle with symbols)
    expect(parseAgentAddress("@user@x.com מה זה?", agents)).toBeNull();
    expect(parseAgentAddress("@dana_levi תעני לה", agents)).toBeNull();
    expect(parseAgentAddress("@10 בבוקר יש פגישה", agents)).toBeNull(); // no letter: a time, not a name
    expect(parseAgentAddress("סוכן: 2 מה חדש", agents)).toBeNull();
    expect(parseAgentAddress("@Marketing תכתבי פוסט", agents)).toEqual({ kind: "unknown", name: "Marketing", rest: "תכתבי פוסט" });
  });

  it("back to the main assistant: @product, product name as vocative, סיום only while sticky", () => {
    expect(parseAgentAddress(`@${PRODUCT_NAME} מה יש לי מחר`, agents)).toEqual({ kind: "main", rest: "מה יש לי מחר" });
    expect(parseAgentAddress(`${PRODUCT_NAME}, תודה`, agents)).toEqual({ kind: "main", rest: "תודה" });
    expect(parseAgentAddress("סיום", agents, { sticky: true })).toEqual({ kind: "main", rest: "" });
    expect(parseAgentAddress("סיום", agents)).toBeNull();
  });
});
