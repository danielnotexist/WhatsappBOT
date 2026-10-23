// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccessibilityPage from "./page";

afterEach(cleanup);

describe("/accessibility (הצהרת נגישות)", () => {
  it("renders the statement with the standard, the menu, the limits and the contact section", () => {
    render(<AccessibilityPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("הצהרת נגישות");
    for (const h of ["רמת הנגישות", "תפריט הנגישות באתר", "מגבלות ידועות", "פנייה בנושא נגישות"]) {
      expect(screen.getByRole("heading", { level: 2, name: new RegExp(h) })).toBeInTheDocument();
    }
    const text = document.body.textContent ?? "";
    expect(text).toContain("5568");
    expect(text).toContain("התשע\"ג-2013");
    for (const fn of ["הגדלת טקסט", "ניגודיות גבוהה", "הדגשת קישורים", "גופן קריא", "עצירת אנימציות", "ריווח שורות", "איפוס הגדרות"]) {
      expect(text).toContain(fn);
    }
    expect(text).toContain("וואטסאפ");
    // site text uses the short hyphen only
    expect(text).not.toMatch(/[–—]/);
  });
});
