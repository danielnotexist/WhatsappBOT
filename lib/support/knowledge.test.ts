import { describe, expect, it } from "vitest";
import { PLANS, TRIAL_MESSAGES } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import { KNOWLEDGE, knowledgeAnswer, knowledgeText, matchKnowledge, normalizeQuestion } from "./knowledge";
import { SUPPORT_COPY, SUPPORT_SUGGESTIONS } from "./types";

const topic = (q: string) => matchKnowledge(q)?.entry.id ?? null;

describe("the support knowledge base", () => {
  it("every chip is a question of the knowledge base, answered as is", () => {
    for (const chip of SUPPORT_SUGGESTIONS) {
      const hit = matchKnowledge(chip);
      expect(hit, chip).not.toBeNull();
      expect(hit!.entry.question).toBe(chip);
    }
    expect(SUPPORT_SUGGESTIONS[0]).toBe(`מה ${BRAND.name} עושה?`);
  });

  it("prices, allowances and agents come from lib/billing/plans.ts", () => {
    const pricing = KNOWLEDGE.find((e) => e.id === "pricing")!.answer;
    expect(pricing).toContain(`${TRIAL_MESSAGES} ההודעות הראשונות בחינם, בלי כרטיס אשראי`);
    expect(pricing).toContain(`${PLANS.basic.priceIls} ₪ לחודש`);
    expect(pricing).toContain(`${PLANS.pro.priceIls} ₪ לחודש`);
    expect(pricing).toContain("750");
    expect(pricing).toContain("3,000");
    expect(pricing).toContain("מע״מ (18%)");
    const plans = KNOWLEDGE.find((e) => e.id === "plans")!.answer;
    expect(plans).toContain(`עד ${PLANS.pro.customAgents} סוכנים משלך`);
    const agents = KNOWLEDGE.find((e) => e.id === "agents")!.answer;
    expect(agents).toContain("מזכירה, מתמחה ומנהלת חשבונות");
  });

  it("security says only what the docs say: the EU (Frankfurt), never servers in Israel", () => {
    const security = KNOWLEDGE.find((e) => e.id === "security")!.answer;
    expect(security).toContain("באיחוד האירופי, בפרנקפורט");
    expect(security).toContain("לא משמשים לאימון מודלים");
    for (const e of KNOWLEDGE) expect(e.answer, e.id).not.toMatch(/בישראל|בארץ|שרתים ישראלים/);
  });

  it("site voice: the short hyphen only, no gendered address forms, no exclamation marks, short answers", () => {
    const all = [...KNOWLEDGE.flatMap((e) => [e.question, e.answer]), ...Object.values(SUPPORT_COPY), ...SUPPORT_SUGGESTIONS];
    for (const t of all) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(t, t).not.toMatch(/\S\/י\b|תרצה|אתה |\bאת יכול|שלח\/י|!/);
    }
    for (const e of KNOWLEDGE) expect(e.answer.length, e.id).toBeLessThan(520);
    expect(new Set(KNOWLEDGE.map((e) => e.id)).size).toBe(KNOWLEDGE.length);
  });

  it("the system prompt's grounding lists every entry", () => {
    const text = knowledgeText();
    for (const e of KNOWLEDGE) expect(text).toContain(`## ${e.question}\n${e.answer}`);
  });
});

describe("matchKnowledge — the deterministic answer", () => {
  it.each([
    ["כמה עולה המנוי?", "pricing"],
    ["מה המחירים?", "pricing"],
    ["איך נרשמים?", "connect"],
    ["צריך להתקין אפליקציה?", "connect"],
    ["איפה נשמר המידע שלי?", "security"],
    ["והמיילים שלי מוצפנים?", "security"],
    ["זה עובד עם גוגל?", "accounts"],
    ["זה עובד עם Outlook?", "accounts"],
    ["מה ההבדל בין המסלולים בסיסי ופרו", "plans"],
    ["יש תקופת ניסיון בחינם?", "trial"],
    ["מה זה סוכנים?", "agents"],
    ["איך מקבלים חשבונית?", "receipt"],
    ["אפשר לבטל מתי שרוצים?", "cancel"],
    ["אפשר לשלוח הודעה קולית?", "voice"],
    ["היא רואה את הקבוצות שלי?", "whatsapp"],
    ["משהו נשלח בלי אישור שלי?", "approval"],
    ["איך מוחקים את החשבון?", "delete"],
    ["יש לי בעיה עם החיבור ל-Outlook", "support"],
    ["אני רוצה לדבר עם נציג", "support"],
    ["חויבתי פעמיים", "support"],
    ["מה זה סיכום בוקר?", "features"],
  ])("%s → %s", (q, id) => {
    expect(topic(q)).toBe(id);
  });

  it("normalizes niqqud, punctuation and quote marks", () => {
    expect(normalizeQuestion("  כַּמָּה   זֶה עוֹלֶה?! ")).toBe("כמה זה עולה");
    expect(normalizeQuestion('מע"מ')).toBe("מע״מ");
    expect(topic("כַּמָּה זֶה עוֹלֶה")).toBe("pricing");
  });

  it("off-topic → the 'not sure' line, the chips and the ticket offer", () => {
    for (const q of ["מה מזג האוויר מחר?", "כתבי לי שיר", "asdf", "?"]) {
      const a = knowledgeAnswer(q);
      expect(a, q).toEqual({ answer: SUPPORT_COPY.fallback, ticket: true, suggestions: [...SUPPORT_SUGGESTIONS], topic: null });
    }
    expect(SUPPORT_COPY.fallback).toBe("לא בטוחה שהבנתי - אפשר לבחור נושא או לפתוח פנייה.");
  });

  it("an account problem offers a ticket; a topic answer does not", () => {
    expect(knowledgeAnswer("יש לי תקלה").ticket).toBe(true);
    expect(knowledgeAnswer("כמה זה עולה?")).toMatchObject({ ticket: false, suggestions: [], topic: "pricing" });
  });
});
