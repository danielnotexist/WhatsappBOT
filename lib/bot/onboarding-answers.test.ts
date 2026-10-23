import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { isConnectAck, looksLikeRequest, morningTimeFromText, painFromText, requestSignal } from "./onboarding";

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

  it("free text while a list is open: only a real request counts — typed answers map to the rows", () => {
    expect(looksLikeRequest("תביא לי את המייל האחרון שלי", "list")).toBe(true);
    expect(looksLikeRequest("המייל האחרון בבקשה", "list")).toBe(true);
    for (const t of ["מיילים", "זהו", "07:30", "לא עכשיו", "בסדר", "המייל והיומן שלי", "בעיקר מיילים ויומן", "שבע וחצי בבוקר", "אין צורך", "לא צריך"]) expect(looksLikeRequest(t, "list"), t).toBe(false);
    expect(painFromText("המייל והיומן שלי")).toEqual(["pain_email", "pain_calendar"]);
    expect(painFromText("בעיקר מיילים ויומן")).toEqual(["pain_email", "pain_calendar"]);
    expect(painFromText("למצוא מסמכים")).toEqual(["pain_files"]);
    expect(painFromText("מעקבים ותזכורות")).toEqual(["pain_followup"]);
    expect(painFromText("הכל")).toEqual(["pain_email", "pain_calendar", "pain_followup", "pain_files"]);
    expect(painFromText("זהו")).toBe("done");
    expect(painFromText("בסדר")).toBeNull();
    const times: [string, string | null | undefined][] = [
      ["07:30", "07:30"], ["7:30", "07:30"], ["8", "08:00"], ["ב-8", "08:00"], ["בשמונה", "08:00"], ["שבע וחצי בבוקר", "07:30"], ["שמונה ורבע", "08:15"],
      ["רבע לשמונה", "07:45"], ["תשע", "09:00"], ["לא עכשיו", null], ["אין צורך", null], ["לא צריך", null], ["בלי", null], ["לא תודה", null],
      ["14:00", undefined], ["בערב", undefined], ["תודה", undefined],
    ];
    for (const [t, want] of times) expect(morningTimeFromText(t), t).toBe(want);
  });

  it("content, not the first word: Daniel's wording variants are requests at the name and the business questions (review 23.10.2026)", () => {
    const requests = [
      "המייל האחרון שלי",
      "תזכורת מחר ב-9 להתקשר לרוני",
      "פגישה עם רוני מחר ב-10",
      "קראי את המייל האחרון",
      "קרא לי את המייל",
      "הצג את המיילים",
      "הציגי לי את היומן",
      "רק תגידי לי מה יש לי מחר",
      "רגע, תבדקי אם כהן ענה",
      "אוקיי תביאי לי את המייל",
      "סבבה, מה המייל האחרון",
      "קודם תסכמי לי את המיילים",
      "דחוף תתקשרי לבנק ותזכירי לי",
      "ותביאי לי גם את היומן",
      "@מזכירה מה יש לי מחר",
      "מזכירה, מה יש לי מחר",
      "מנהלת חשבונות: אילו חשבוניות הגיעו",
      "Check my email",
      "what's on my calendar",
      "עזרה",
      "יומן",
      "תוציאי לי את ההסכם של לוי",
      "מעולה, עכשיו מה המייל האחרון",
    ];
    for (const t of requests) {
      expect(looksLikeRequest(t, "business"), t).toBe(true);
      expect(looksLikeRequest(t, "name"), t).toBe(true);
    }
  });

  it("business names that start like a verb or a request word are names; a few weak ones need a second send", () => {
    for (const t of ["תעשיות כהן בע״מ", "תמצית הנהלת חשבונות", "אין סוף עיצובים", "תקשורת ושיווק", "תכנון ובנייה לוי", "תצורה עיצובים", "תעבורה ולוגיסטיקה", "תחבורה חכמה", "תכתובת משפטית", "כהן תכנון", "שבע כוכבים", "בוקר טוב יוגה"]) {
      expect(requestSignal(t, "business"), t).toBeNull();
    }
    // weak: stored on the second identical send (handleOnboarding)
    for (const t of ["מי עדן", "24/7 שירותים", "יומן הבוקר"]) expect(requestSignal(t, "business"), t).toBe("weak");
    // strong: never stored, however often it is sent
    for (const t of ["מה יש לי מחר", "תביאי לי את המייל", "@מזכירה מה יש מחר", "קראי את המייל האחרון"]) expect(requestSignal(t, "business"), t).toBe("strong");
  });

  it("a connection acknowledgement is not an answer", () => {
    for (const t of ["חיברתי", "התחברתי", "עשיתי", "בוצע", "סיימתי", "אוקיי, חיברתי", "יופי חיברתי את זה", "מחובר"]) expect(isConnectAck(t), t).toBe(true);
    for (const t of ["דנה", "משרד כהן", "חיבורים בע״מ"]) expect(isConnectAck(t), t).toBe(false);
  });
});
