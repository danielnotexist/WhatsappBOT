// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_FAQ } from "@/components/brand/landing/content";
import { planComparison } from "@/lib/billing/compare";
import { PLANS } from "@/lib/billing/plans";
import PricingPage, { metadata } from "./page";

// the session hole is request-time (cookies); the prerendered shell is the signed-out one
vi.mock("@/components/auth/by-session", () => ({ BySession: ({ signedOut = null }: { signedOut?: React.ReactNode }) => signedOut }));

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, email: null })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/pricing", () => {
  it("renders the plans, one line for VAT and cancelling, the full comparison behind 'להשוואה המלאה', the plan FAQ and the call to action", async () => {
    render(<PricingPage />);
    await act(async () => {});
    expect(metadata.title).toBe("מחירים");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("מחירים ומסלולים.");
    expect(screen.getByText("10 הודעות ראשונות בחינם, בלי כרטיס אשראי.")).toBeInTheDocument();
    // the header: "מחירים" is this page
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "מחירים" })).toHaveAttribute("aria-current", "page");

    // the two plans on their sheet, each with the systems it connects to (so no separate connections section)
    for (const p of ["basic", "pro"] as const) {
      const card = screen.getByRole("article", { name: PLANS[p].nameHe });
      expect(card).toHaveTextContent(`${PLANS[p].priceIls}₪לחודש`);
      expect(within(card).getByRole("toolbar")).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "החיבורים בכל מסלול." })).toBeNull();
    expect(screen.queryByText(/בבסיסי ובהודעות החינמיות מחברים חשבון אחד/)).toBeNull();
    expect(screen.getByText("המחירים כוללים מע״מ. ביטול בכל רגע.")).toBeInTheDocument();

    // the full comparison: a native disclosure, closed until asked for; /pricing#compare opens it
    const compare = document.getElementById("compare") as HTMLDetailsElement;
    expect(compare.tagName).toBe("DETAILS");
    expect(compare.open).toBe(false);
    expect(compare.querySelector("summary")).toHaveTextContent("להשוואה המלאה");
    expect(within(compare).getByRole("button", { name: "בקשת מערכת" })).toBeInTheDocument();

    // the comparison: plan columns, a row per capability, "כלול" / "לא כלול" / "בקרוב" for screen readers
    const table = within(compare).getByRole("table", { name: "בסיסי מול פרו, יכולת אחרי יכולת" });
    expect(within(table).getAllByRole("columnheader").slice(0, 3).map((c) => c.textContent)).toEqual(["יכולת", `בסיסי${PLANS.basic.priceIls} ₪ לחודש`, `פרו${PLANS.pro.priceIls} ₪ לחודש`]);
    const rows = planComparison().flatMap((s) => s.rows);
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(rows.map((r) => r.label));
    const sharepoint = within(table).getByRole("rowheader", { name: rows.find((r) => r.id === "sharepoint")!.label }).closest("tr")!;
    expect(within(sharepoint).getAllByRole("cell").map((c) => c.textContent)).toEqual(["לא כלול", "כלול"]);
    const meetings = within(table).getByRole("rowheader", { name: "סיכומי פגישות Teams ו-Google Meet" }).closest("tr")!;
    expect(within(meetings).getAllByRole("cell").map((c) => c.textContent)).toEqual(["לא כלול", "כלול"]);
    const zoom = within(table).getByRole("rowheader", { name: "סיכומי פגישות Zoom" }).closest("tr")!;
    expect(within(zoom).getAllByRole("cell").map((c) => c.textContent)).toEqual(["לא כלול", "בקרוב"]);
    for (const s of planComparison()) expect(within(table).getByRole("columnheader", { name: s.title })).toBeInTheDocument();

    // the questions about plans
    const faq = screen.getByRole("region", { name: "שאלות על המסלולים." });
    expect(faq.querySelectorAll("summary")).toHaveLength(PRICING_FAQ.length);
    expect(faq).toHaveTextContent("סיכומי פגישות Zoom וחיבור למערכות העסק, כמו monday.com");

    expect(screen.getAllByRole("link", { name: "בואו נתחיל - לוקח דקה" })[0]).toHaveAttribute("href", "/start");
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });

  it("'/pricing#compare' (the landing's 'להשוואה המלאה') opens the comparison", async () => {
    window.location.hash = "#compare";
    try {
      render(<PricingPage />);
      await act(async () => {});
      expect((document.getElementById("compare") as HTMLDetailsElement).open).toBe(true);
    } finally {
      window.location.hash = "";
    }
  });
});
