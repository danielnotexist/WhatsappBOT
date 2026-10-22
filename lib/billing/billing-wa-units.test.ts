import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { OFFER_LABELS, billButtons, billCopy } from "@/lib/copy/bot-billing";
import { classifyHypFailure, tokefExpired, tokenLast4 } from "@/lib/hyp/codes";
import { formatHeshDesc } from "@/lib/hyp/sign";
import { billingCommandOf } from "./commands";
import { createCardLinkToken, createInvoiceToken, verifyCardLinkToken, verifyInvoiceToken } from "./links";
import { quoteMonth, quoteUpgrade, subtractOneMonth, vatOf } from "./money";
import { chargeAttemptAt } from "./plans";
import { createPayLinkToken } from "./pay-link";
import { parseBillingButton } from "./whatsapp";

describe("billing commands typed in the chat", () => {
  it.each([
    ["קבלה", "invoice"],
    ["קבלות", "invoice"],
    ["הקבלה האחרונה", "invoice"],
    ["אפשר קבלה?", "invoice"],
    ["תשלחי לי את הקבלה בבקשה", "invoice"],
    ["איפה הקבלה?", "invoice"],
    ["קבלה על התשלום", "invoice"],
    [`${BRAND.name}, קבלה בבקשה`, "invoice"],
    [`היי ${BRAND.name} שדרוג`, "upgrade"],
    // "חשבונית" is accepted as a synonym
    ["חשבונית", "invoice"],
    ["החשבוניות האחרונות", "invoice"],
    ["אפשר את החשבונית?", "invoice"],
    ["שדרוג", "upgrade"],
    ["אני רוצה לשדרג לפרו", "upgrade"],
    ["לעבור למסלול פרו", "upgrade"],
    ["לשדרג את המנוי", "upgrade"],
    ["לעבור לבסיסי", "downgrade"],
    ["מעבר למסלול הבסיסי", "downgrade"],
    ["ביטול מנוי", "cancel"],
    ["אני רוצה לבטל את המנוי שלי", "cancel"],
    ["חדש מנוי", "renew"],
    ["חידוש מנוי", "renew"],
    ["עדכון כרטיס", "card"],
    ["לעדכן את כרטיס האשראי", "card"],
    ["ניסיון חוזר", "retry"],
    ["תשלום", "retry"],
    ["מה מצב המנוי?", "status"],
    ["כמה הודעות נשארו לי החודש", "status"],
    ["החזר כספי", "refund"],
  ])("%s → %s", (text, cmd) => {
    expect(billingCommandOf(text)).toBe(cmd);
  });

  it.each([
    "תזכירי לי לבטל את המנוי של נטפליקס",
    "תשלחי לרונית את החשבונית",
    "מה כתוב בחשבונית של כהן?",
    "תשלחי לרונית את הקבלה",
    "קבלה של הספק מאתמול",
    "יש לי שעת קבלה מחר",
    "קבלת קהל ביום ראשון",
    "לעבור על הפרויקט",
    "לעבור על המסמך הבסיסי",
    "תשדרגי את המצגת",
    "שדרוג המטבח עולה כמה?",
    "לבטל את הפגישה",
  ])("leaves %s to the assistant", (text) => {
    expect(billingCommandOf(text)).toBeNull();
  });
});

describe("proration and VAT", () => {
  it("prices the upgrade by whole days left (today counts), VAT included", () => {
    const q = quoteUpgrade("2026-11-10T08:00:00.000Z", new Date("2026-10-20T08:00:00Z"))!;
    expect(q).toMatchObject({ daysLeft: 21, cycleDays: 31, amountIls: 135.48, vatIls: 20.67, nextAmountIls: 299 });
    expect(quoteUpgrade("2026-11-10T08:00:00.000Z", new Date("2026-11-10T07:00:00Z"))).toMatchObject({ daysLeft: 1, amountIls: 6.45 });
    expect(quoteUpgrade("2026-11-10T08:00:00.000Z", new Date("2026-10-10T08:00:00Z"))).toMatchObject({ daysLeft: 31, amountIls: 200 });
    expect(quoteUpgrade("2026-11-10T08:00:00.000Z", new Date("2026-11-10T08:00:00Z"))).toBeNull(); // renewal due
    expect(vatOf(99)).toBe(15.1);
    expect(vatOf(299)).toBe(45.61);
    expect(quoteMonth("pro", new Date("2026-01-31T10:00:00Z"))).toMatchObject({ amountIls: 299, periodEnd: new Date("2026-02-28T10:00:00Z") });
    expect(subtractOneMonth(new Date("2026-03-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("schedules the renewal attempts on days 1, 3, 5 and 7", () => {
    const due = new Date("2026-11-20T10:00:00Z");
    expect([0, 1, 2, 3].map((n) => chargeAttemptAt(due, n).toISOString().slice(0, 10))).toEqual(["2026-11-20", "2026-11-22", "2026-11-24", "2026-11-26"]);
  });

  it("formats invoice lines for Pritim and strips the separators", () => {
    expect(formatHeshDesc([{ description: "מנוי [פרו] ~ חודש", quantity: 1, price: 299 }])).toBe("[0~מנוי פרו חודש~1~299]");
  });
});

describe("HYP codes", () => {
  it("classifies soft failures", () => {
    expect(classifyHypFailure("4")).toBe("declined");
    expect(classifyHypFailure("3")).toBe("declined");
    for (const c of ["1", "2", "5", "6", "15", "447", "997"]) expect(classifyHypFailure(c)).toBe("card");
    for (const c of ["9", "999", "599", "555", ""]) expect(classifyHypFailure(c)).toBe("temporary");
    for (const c of ["901", "902", "996", "400", "401", "300"]) expect(classifyHypFailure(c)).toBe("config");
    expect(classifyHypFailure("343")).toBe("card"); // issuer: no card-not-present permission
  });

  it("checks the card expiry (YYMM) and the last four digits", () => {
    expect(tokefExpired("2610", new Date("2026-10-31T23:00:00Z"))).toBe(false);
    expect(tokefExpired("2610", new Date("2026-11-01T00:00:00Z"))).toBe(true);
    expect(tokefExpired("bad", new Date())).toBe(true);
    expect(tokenLast4("1234567890123454580")).toBe("4580");
  });
});

describe("signed links", () => {
  it("card / invoice tokens carry their purpose, expire and cannot be swapped", () => {
    const key = randomBytes(32);
    const now = new Date();
    const uid = "123e4567-e89b-42d3-a456-426614174000";
    const card = createCardLinkToken(uid, { key, now });
    expect(verifyCardLinkToken(card, { key, now })).toEqual({ userId: uid });
    expect(verifyCardLinkToken(card, { key, now: new Date(now.getTime() + 8 * 86_400_000) })).toBeNull();
    const inv = createInvoiceToken(uid, "408671193", { key, now });
    expect(verifyInvoiceToken(inv, { key, now })).toEqual({ userId: uid, transId: "408671193" });
    expect(verifyInvoiceToken(inv, { key, now: new Date(now.getTime() + 89 * 86_400_000) })).not.toBeNull();
    expect(verifyInvoiceToken(inv, { key, now: new Date(now.getTime() + 91 * 86_400_000) })).toBeNull();
    // purposes are separate: a card link is not an invoice link, a pay link is neither
    expect(verifyInvoiceToken(card, { key, now })).toBeNull();
    expect(verifyCardLinkToken(inv, { key, now })).toBeNull();
    expect(verifyCardLinkToken(createPayLinkToken(uid, { key, now }), { key, now })).toBeNull();
    expect(verifyInvoiceToken(inv, { key: randomBytes(32), now })).toBeNull();
  });
});

describe("billing copy", () => {
  const doc = readFileSync(new URL("../../docs/copy/bot-copy-billing.md", import.meta.url), "utf8");
  const documented = new Set([...doc.matchAll(/^### `([a-z0-9_.]+)`/gm)].map((m) => m[1]));

  it("every id is documented in docs/copy/bot-copy-billing.md, and every documented id exists", () => {
    expect(Object.keys(billCopy).filter((id) => !documented.has(id))).toEqual([]);
    expect([...documented].filter((id) => !(id! in billCopy))).toEqual([]);
  });

  it("the neutral-phrasing check catches slash forms (Hebrew letters are not \\w, so \\b never matched them)", () => {
    const slashForm = /\/[יהת](?![א-ת])/u;
    for (const t of ["שלח/י לי", "שלח/י", "תרצה/י?", "מוכן/ה.", "את/ה"]) expect(t).toMatch(slashForm);
    for (const t of ["https://x.co/pay/abc", "ו/או", "1/2"]) expect(t).not.toMatch(slashForm);
  });

  it("neutral phrasing, no placeholders left, WhatsApp button limits", () => {
    const sample = { amount: "99", vat: "15.10", daysLeft: 3, periodEnd: "יום ג׳ 10.11", nextAmount: "299", last4: "4580", plan: "בסיסי", nextDate: "יום ג׳ 10.11", nextTry: "יום א׳ 22.11", lastTry: "יום ה׳ 26.11", until: "יום ה׳ 26.11", code: "4", resendHint: true, date: "20.10.2026", link: "https://x" };
    for (const [id, fn] of Object.entries(billCopy)) {
      const f = fn as (...a: unknown[]) => string;
      const takesObject = /^\(o[,:)]|^o\s*=>/.test(f.toString());
      const text = id === "bill.invoice_list" ? f([{ date: "20.10.2026", amount: "99", desc: "מנוי", link: "https://x" }]) : takesObject ? f(sample) : f("x");
      expect(text, id).not.toMatch(/\/[יהת](?![א-ת])/u);
      expect(text, id).not.toContain("undefined");
      expect(text, id).not.toMatch(/\{[a-z_]+\}/);
    }
    for (const labels of Object.values(OFFER_LABELS)) for (const t of [labels.yes, labels.no]) expect(t.length).toBeLessThanOrEqual(20);
    for (const b of [...billButtons.retryOrCard("00000000-0000-4000-8000-000000000000"), ...billButtons.card]) {
      expect(b.title.length).toBeLessThanOrEqual(20);
      expect(parseBillingButton(b.id)).not.toBeNull();
    }
    expect(parseBillingButton("bill:ok:not-a-uuid")).toBeNull();
  });
});
