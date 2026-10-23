// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_FAQ } from "@/components/brand/landing/content";
import { planComparison } from "@/lib/billing/compare";
import { PLANS } from "@/lib/billing/plans";
import { integrationsForPlan } from "@/lib/integrations/catalogue";
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
  it("renders the plans, the full comparison from the entitlements, every system per plan, the plan FAQ and the call to action", async () => {
    render(<PricingPage />);
    await act(async () => {});
    expect(metadata.title).toBe("מחירים");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("מחירים ומסלולים.");
    // the header: "מחירים" is this page
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "מחירים" })).toHaveAttribute("aria-current", "page");

    // the two plans on their sheet
    for (const p of ["basic", "pro"] as const) expect(screen.getByRole("article", { name: PLANS[p].nameHe })).toHaveTextContent(`${PLANS[p].priceIls}₪לחודש`);

    // the comparison: plan columns, a row per capability, "כלול" / "לא כלול" / "בקרוב" for screen readers
    const table = screen.getByRole("table", { name: "בסיסי מול פרו, יכולת אחרי יכולת" });
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

    // every system each plan connects to, on the night set, by account
    const connections = screen.getByRole("region", { name: "החיבורים בכל מסלול." });
    for (const p of ["basic", "pro"] as const)
      for (const g of integrationsForPlan(p)) {
        expect(within(connections).getAllByRole("toolbar", { name: new RegExp(`^${g.title}`) }).length, `${p} ${g.title}`).toBeGreaterThan(0);
      }
    const names = within(connections)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter(Boolean);
    expect(names).toHaveLength(integrationsForPlan("basic").flatMap((g) => g.items).length + integrationsForPlan("pro").flatMap((g) => g.items).length);
    expect(within(connections).getByRole("button", { name: "בקשת מערכת" })).toBeInTheDocument();
    for (const img of connections.querySelectorAll("img")) expect(decodeURIComponent(img.getAttribute("src")!)).toContain("/brand/integrations/night/");

    // the questions about plans
    const faq = screen.getByRole("region", { name: "שאלות על המסלולים." });
    expect(faq.querySelectorAll("summary")).toHaveLength(PRICING_FAQ.length);
    expect(faq).toHaveTextContent("סיכומי פגישות Zoom וחיבור למערכות העסק, כמו monday.com");

    expect(screen.getAllByRole("link", { name: "בואו נתחיל - לוקח דקה" })[0]).toHaveAttribute("href", "/start");
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });
});
