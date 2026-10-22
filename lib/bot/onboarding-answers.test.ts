import { describe, expect, it } from "vitest";
import { looksLikeRequest } from "./onboarding";

describe("looksLikeRequest — a request that came instead of the name / the business name", () => {
  it("requests and questions are not names", () => {
    for (const t of ["תזכירי לי מחר ב-9 להתקשר לבנק", "תנסחי מייל לדנה שהפגישה זזה ליום ה׳", "מה יש לי מחר?", "מה יש לי מחר", "תבדקי את המייל", "אפשר תזכורת", "יש לי פגישה", "דנה?", "שלחי לרון", "תזכיר לי", "רועי 0501234567", "אני צריכה שתעזרי לי עם המיילים של היום"]) {
      expect(looksLikeRequest(t, "name"), t).toBe(true);
    }
  });

  it("names stay names", () => {
    for (const t of ["דנה", "דנה לוי", "ד״ר יעל כהן", "תמר", "תומר", "תהילה בן דוד", "Dana", "מיכל", "משה"]) expect(looksLikeRequest(t, "name"), t).toBe(false);
  });

  it("business names may be longer and carry digits; requests are still caught", () => {
    for (const t of ["משרד לוי", "סטודיו 54", "כהן ושות׳ עורכי דין", "מרפאת שיניים ד״ר לוי בע״מ"]) expect(looksLikeRequest(t, "business"), t).toBe(false);
    for (const t of ["תנסחי מייל לדנה", "מה יש לי מחר?", "תזכירי לי לשלם חשבונית מחר"]) expect(looksLikeRequest(t, "business"), t).toBe(true);
  });
});
