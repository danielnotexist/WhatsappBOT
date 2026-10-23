import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { looksLikeRequest } from "./onboarding";

describe("looksLikeRequest — a request that came instead of the name / the business name", () => {
  it("requests and questions are not names", () => {
    for (const t of ["תזכירי לי מחר ב-9 להתקשר לבנק", "תנסחי מייל לדנה שהפגישה זזה ליום ה׳", "מה יש לי מחר?", "מה יש לי מחר", "תבדקי את המייל", "אפשר תזכורת", "יש לי פגישה", "דנה?", "שלחי לרון", "תזכיר לי", "רועי 0501234567", "אני צריכה שתעזרי לי עם המיילים של היום"]) {
      expect(looksLikeRequest(t, "name"), t).toBe(true);
    }
  });

  it("names stay names", () => {
    for (const t of ["דנה", "דנה לוי", "ד״ר יעל כהן", "תמר", "תומר", "תהילה בן דוד", "Dana", "מיכל", "משה", "Daniel Cohen", "אני דנה", "קוראים לי דנה", "לאה", "ליאור"]) expect(looksLikeRequest(t, "name"), t).toBe(false);
  });

  it("business names may be longer and carry digits; requests are still caught", () => {
    for (const t of ["משרד לוי", "סטודיו 54", "כהן ושות׳ עורכי דין", "מרפאת שיניים ד״ר לוי בע״מ", "משרד עו״ד לוי", "כהן רואי חשבון", "תמר עיצובים", "תדמית פלוס", "לוי ושות׳", "אבי כהן - ייעוץ מס"]) {
      expect(looksLikeRequest(t, "business"), t).toBe(false);
    }
    for (const t of ["תנסחי מייל לדנה", "מה יש לי מחר?", "תזכירי לי לשלם חשבונית מחר"]) expect(looksLikeRequest(t, "business"), t).toBe(true);
  });

  it("catches the requests of Daniel's live test and the common Hebrew request shapes (23.10.2026)", () => {
    const requests = [
      // excerpt 1: answered instead of "מה שם העסק?" and at the pain list
      "תביא לי את המייל האחרון שקיבלתי",
      "תביא לי את המייל האחרון שלי",
      "תביאי לי את המייל האחרון",
      // second-person imperatives / futures, both genders
      "תבדוק מה רונית כתבה",
      "תשלחי לכהן את ההצעה",
      "תזכיר לי לאכול",
      "תקבעי פגישה עם אבי ביום ג׳",
      "תנסח תשובה לרונית",
      "תחפש את ההסכם של לוי",
      "תראה לי את היומן",
      "תגידי מה יש לי היום",
      "תעבירי לי את המייל של רונית",
      "תסדר לי את היומן",
      // question words, "?" and "אפשר…"
      "מתי הפגישה עם כהן",
      "איפה ההסכם של לוי",
      "איך מחברים את המייל",
      "למה לא קיבלתי סיכום",
      "האם יש לי פגישות מחר",
      "איזה מנוי אני",
      "אפשר לראות את המיילים",
      "יש משהו חדש במייל",
      "המייל של רונית הגיע?",
      // infinitives and pronoun + wish
      "לחבר את המייל",
      "לשדרג למנוי פרו",
      "אתה יכול ליצור לי סוכן",
      "את יכולה לבדוק את היומן",
      "אני רוצה לשדרג",
      // a greeting or the assistant's name first
      "היי, תביאי לי את המייל האחרון",
      `${BRAND.name}, מה יש לי מחר`,
    ];
    for (const t of requests) {
      expect(looksLikeRequest(t, "business"), t).toBe(true);
      expect(looksLikeRequest(t, "name"), t).toBe(true);
      expect(looksLikeRequest(t, "list"), t).toBe(true);
    }
  });

  it("free text while a list is open: three words or more is a request; a short typed answer is not", () => {
    expect(looksLikeRequest("תביא לי את המייל האחרון שלי", "list")).toBe(true);
    expect(looksLikeRequest("המייל האחרון בבקשה", "list")).toBe(true);
    for (const t of ["מיילים", "זהו", "07:30", "לא עכשיו", "בסדר"]) expect(looksLikeRequest(t, "list"), t).toBe(false);
  });
});
