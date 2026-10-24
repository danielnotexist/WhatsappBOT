import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/brand";
import { ALERT_TYPE_LABEL, OWNER_ALERT_KINDS, chargeReason, isUrgent, ownerAlertContent, ownerAlertMail, ownerDigestMail, renewalNext, type OwnerEvent } from "./owner-alerts";

/** The owner's alert copy: a Hebrew subject, the rows, the deep link into /admin, and the RTL HTML version. */

const APP = "https://alze.example/";
const U = "11111111-1111-4111-8111-111111111111";

const EVENTS: Record<OwnerEvent["type"], OwnerEvent> = {
  signup: { type: "signup", userId: U, email: "dana@example.co.il", name: "דנה לוי", business: "סטודיו דנה", source: { utm_source: "google", utm_medium: "cpc", utm_campaign: "spring", landing: "/pricing" } },
  ticket: { type: "ticket", ticketId: "t-1", subject: "חיוב כפול", fromName: "דנה", fromEmail: "dana@example.co.il", userId: U, excerpt: "חויבתי פעמיים החודש" },
  system_request: { type: "system_request", ticketId: "t-2", subject: "בקשת מערכת: Monday", fromName: "פונה מהאתר", fromEmail: "ron@example.co.il", userId: null },
  payment_failed: { type: "payment_failed", userId: U, email: "dana@example.co.il", name: "דנה לוי", amountIls: 99, reason: "חיוב חודשי: סירוב של חברת האשראי (קוד 4).", ref: "lock-1" },
  charge_unknown: { type: "charge_unknown", userId: U, email: "dana@example.co.il", name: null, amountIls: 129.03, reason: "חיוב בלחיצה בוואטסאפ (שדרוג לפרו): לא התקבלה תשובה מ-HYP.", ref: "appr-1" },
  error_spike: { type: "error_spike", count: 14, threshold: 10, top: [{ source: "bot", count: 9 }, { source: "jobs", count: 5 }], slot: "2026-10-21T12" },
  ai_budget: { type: "ai_budget", threshold: 80, spentUsd: 2.4, budgetUsd: 3, day: "2026-10-21" },
  connection_expired_paid: { type: "connection_expired_paid", userId: U, email: "ron@example.co.il", name: "רון", provider: "microsoft", plan: "פרו", connectionId: "c1", day: "2026-10-21" },
  test: { type: "test", by: "danielnotexist@gmail.com", at: "2026-10-21T09:00:00.000Z" },
};

const EXPECTED: Record<OwnerEvent["type"], { subject: string; href: string; rows: string[] }> = {
  signup: { subject: "נרשם חדש: dana@example.co.il (מקור: google)", href: `https://alze.example/admin/users/${U}`, rows: ["מייל: dana@example.co.il", "שם: דנה לוי", "עסק: סטודיו דנה", "מקור: google / cpc / spring, דף ראשון: /pricing"] },
  ticket: { subject: "פנייה חדשה: חיוב כפול", href: "https://alze.example/admin?tab=tickets#t-t-1", rows: ["מאת: דנה, dana@example.co.il", "נושא: חיוב כפול", "תקציר: חויבתי פעמיים החודש", "משתמש רשום: כן"] },
  system_request: { subject: "בקשת מערכת: Monday", href: "https://alze.example/admin?tab=tickets#t-t-2", rows: ["מאת: פונה מהאתר, ron@example.co.il", "משתמש רשום: לא, או לא מחובר"] },
  payment_failed: { subject: "תשלום נכשל: 99 ₪, דנה לוי", href: `https://alze.example/admin/users/${U}`, rows: ["לקוח: דנה לוי", "מייל: dana@example.co.il", "סכום: 99 ₪", "סיבה: חיוב חודשי: סירוב של חברת האשראי (קוד 4).", "מזהה לבדיקה: lock-1"] },
  charge_unknown: { subject: "חיוב בבדיקה: 129.03 ₪, dana@example.co.il", href: `https://alze.example/admin/users/${U}`, rows: ["מזהה לבדיקה (Order): appr-1"] },
  error_spike: { subject: "קפיצה בתקלות: 14 בשעה האחרונה", href: "https://alze.example/admin?tab=errors", rows: ["bot: 9", "jobs: 5"] },
  ai_budget: { subject: "תקציב AI: 80% מהתקציב היומי", href: "https://alze.example/admin", rows: ["הוצאה: $2.40", "תקציב יומי: $3.00"] },
  connection_expired_paid: { subject: "חיבור פג אצל לקוח משלם: Microsoft 365, רון", href: `https://alze.example/admin/users/${U}`, rows: ["ספק: Microsoft 365", "מסלול: פרו"] },
  test: { subject: "מייל בדיקה מפאנל הניהול", href: "https://alze.example/admin?tab=alerts", rows: ["נשלח על ידי: danielnotexist@gmail.com"] },
};

describe("every event's copy", () => {
  it.each(Object.keys(EVENTS) as OwnerEvent["type"][])("%s: subject, rows and the deep link to /admin", (type) => {
    const e = EVENTS[type];
    const want = EXPECTED[type];
    const c = ownerAlertContent(e, APP);
    expect(c.subject).toBe(want.subject);
    expect(c.link.href).toBe(want.href);
    const m = ownerAlertMail(e, APP);
    expect(m.subject).toBe(want.subject);
    for (const row of want.rows) expect(m.text).toContain(row);
    expect(m.text).toContain(`${c.link.label}: ${want.href}`);
    // the HTML: RTL Hebrew, the link as a button, nothing unescaped
    expect(m.html).toMatch(/^<!doctype html><html lang="he" dir="rtl">/);
    expect(m.html).toContain(`href="${want.href.replace(/&/g, "&amp;")}"`);
    expect(m.html).toContain(`${PRODUCT_NAME} · התראה לבעלים`);
    // house style: neutral phrasing, no slashed gender forms, the short hyphen only
    expect(m.text).not.toMatch(/[א-ת]\/[יה]\b|—|–/);
  });

  it("the source when nothing is known, and empty profile fields", () => {
    const c = ownerAlertMail({ type: "signup", userId: U, email: "x@example.co.il", source: null }, APP);
    expect(c.subject).toBe("נרשם חדש: x@example.co.il (מקור: לא ידוע)");
    expect(c.text).toContain("שם: עוד לא מולא");
    expect(c.text).toContain("מקור: לא ידוע");
  });

  it("the 100% budget mail says that new calls are blocked until midnight", () => {
    const m = ownerAlertMail({ type: "ai_budget", threshold: 100, spentUsd: 3, budgetUsd: 3, day: "2026-10-21" }, APP);
    expect(m.subject).toBe("תקציב AI: התקציב היומי נגמר");
    expect(m.text).toContain("עד חצות");
  });

  it("escapes what came from a person (a ticket subject with markup)", () => {
    const m = ownerAlertMail({ type: "ticket", ticketId: "t", subject: '<img src=x onerror="alert(1)">', fromName: "<b>x</b>", fromEmail: "a@b.co" }, APP);
    expect(m.html).not.toContain("<img");
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;img");
  });

  it("which types skip the quiet hours", () => {
    expect(OWNER_ALERT_KINDS.map((k) => k.type)).toEqual(["signup", "ticket", "system_request", "payment_failed", "charge_unknown", "error_spike", "ai_budget", "connection_expired_paid"]);
    const urgent = (Object.values(EVENTS) as OwnerEvent[]).filter(isUrgent).map((e) => e.type);
    expect(urgent).toEqual(["payment_failed", "charge_unknown", "error_spike", "test"]);
    expect(isUrgent({ ...(EVENTS.ai_budget as Extract<OwnerEvent, { type: "ai_budget" }>), threshold: 100 })).toBe(true);
    for (const k of OWNER_ALERT_KINDS) {
      expect(ALERT_TYPE_LABEL[k.type]).toBe(k.label);
      expect(k.description).not.toMatch(/—|–/);
    }
  });

  it("the reason of a declined charge and what happens next", () => {
    expect(chargeReason("חיוב חודשי", "card", "6")).toBe("חיוב חודשי: הכרטיס לא אושר לחיוב (חסום, פג תוקף או לא תקף) (קוד 6).");
    expect(chargeReason("תשלום ראשון", null, null, "x")).toBe("תשלום ראשון: לא עבר. x");
    expect(renewalNext({ kind: "retry", retryAt: new Date("2026-10-23T05:00:00Z") })).toMatch(/^ניסיון נוסף אוטומטי: .*23\.10.*08:00\.$/);
    expect(renewalNext({ kind: "paused" })).toBe("החשבון הושהה.");
    expect(renewalNext({ kind: "skipped" })).toBeNull();
  });
});

describe("the morning digest", () => {
  const items = [
    { at: "2026-10-21T20:05:00Z", type: "signup" as const, subject: "נרשם חדש: a@example.co.il (מקור: ישיר)", href: "https://alze.example/admin/users/a" },
    { at: "2026-10-21T22:40:00Z", type: "ticket" as const, subject: "פנייה חדשה: שאלה", href: "https://alze.example/admin?tab=tickets#t-1" },
  ];

  it("one mail with every queued alert, its time (Israel), its type and its link", () => {
    const m = ownerDigestMail(items, APP);
    expect(m.subject).toBe("סיכום שעות השקט: 2 התראות");
    expect(m.text).toContain("23:05 · נרשם חדש · נרשם חדש: a@example.co.il (מקור: ישיר)");
    expect(m.text).toContain("01:40 · פנייה חדשה · פנייה חדשה: שאלה");
    expect(m.text).toContain("https://alze.example/admin?tab=tickets#t-1");
    expect(m.text).toContain("להתראות בפאנל: https://alze.example/admin?tab=alerts");
    expect(m.html).toContain('href="https://alze.example/admin?tab=tickets#t-1"');
    expect(ownerDigestMail(items.slice(0, 1), APP).subject).toBe("סיכום שעות השקט: התראה אחת");
  });
});
