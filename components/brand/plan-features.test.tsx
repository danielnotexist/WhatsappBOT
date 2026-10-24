// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { planFeatures, ZOOM_SOON_LINE } from "@/lib/billing/plans";
import { contrastPairs, contrastRatio, palette } from "@/lib/design/tokens";
import { Pricing } from "./landing/pricing";
import { FEATURE_MARKS, PlanFeatureList } from "./plan-features";

afterEach(cleanup);

const lead = (li: HTMLElement) => li.querySelector<HTMLElement>("[data-feature-lead]");
const marksOf = (li: HTMLElement) => [...li.querySelectorAll("[data-feature-mark]")].map((m) => m.getAttribute("data-feature-mark"));

describe("the feature lines' leading pictures", () => {
  it("every line of both plans has chosen its picture (product marks or the check)", () => {
    const ids = [...planFeatures("basic").lines, ...planFeatures("pro").lines, ZOOM_SOON_LINE].map((l) => l.id).filter((id) => id !== ZOOM_SOON_LINE.id);
    for (const id of ids) expect(Object.hasOwn(FEATURE_MARKS, id), id).toBe(true);
  });

  it("without `lead` the list is as before (the pay page, the upgrade offer, the personal area)", () => {
    const { container } = render(<PlanFeatureList lines={planFeatures("pro").lines} />);
    expect(container.querySelector("[data-feature-lead]")).toBeNull();
  });

  it("the products lead with their own marks, the rest with a check; decorative, and 'בקרוב' stays", () => {
    render(<PlanFeatureList lines={planFeatures("pro").lines} lead="ink" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(planFeatures("pro").lines.length);
    for (const li of items) expect(lead(li)).toHaveAttribute("aria-hidden", "true");
    const byText = (t: string) => screen.getByText(t).closest("li")!;
    expect(marksOf(byText("חיבור של Google ו-Microsoft יחד"))).toEqual(["google", "microsoft"]);
    expect(marksOf(byText("משימות ב-Google Tasks וב-Microsoft To Do"))).toEqual(["google-tasks", "todo"]);
    expect(marksOf(byText("סיכומי פגישות Teams ו-Google Meet"))).toEqual(["teams", "google-meet"]);
    expect(marksOf(byText("חיפוש ב-SharePoint, בספריות המסמכים של הארגון"))).toEqual(["sharepoint"]);
    for (const t of ["התראות יזומות ואזהרות פישינג"]) {
      const li = byText(t);
      expect(lead(li)).toHaveAttribute("data-feature-lead", "check");
      // on the honey: an ink circle with a honey check
      expect(li.querySelector("[data-feature-check]")!.className).toMatch(/\bbg-ink\b/);
      expect(li.querySelector("[data-feature-check]")!.className).toMatch(/\btext-honey\b/);
    }
    // every mark is drawn (an svg), none is empty
    for (const m of document.querySelectorAll("[data-feature-mark]")) expect(m.querySelector("svg"), m.getAttribute("data-feature-mark")!).not.toBeNull();
    const business = screen.getAllByRole("listitem").find((li) => li.hasAttribute("data-soon"))!;
    expect(business).toHaveTextContent("בקרוב");
    expect(marksOf(business)).toEqual(["monday"]);
  });

  it("basic on the paper: mail, calendar, files and voice notes with their marks, the agents with a moss check", () => {
    render(<PlanFeatureList lines={planFeatures("basic").lines} lead="moss" />);
    const li = (id: string) => screen.getByText(planFeatures("basic").lines.find((l) => l.id === id)!.text).closest("li")!;
    expect(marksOf(li("account"))).toEqual(["google", "microsoft"]);
    expect(marksOf(li("mail"))).toEqual(["gmail", "outlook"]);
    expect(marksOf(li("calendar"))).toEqual(["google-calendar", "outlook"]);
    expect(marksOf(li("files"))).toEqual(["google-drive", "onedrive"]);
    expect(marksOf(li("routine"))).toEqual(["whatsapp"]);
    const check = li("agents").querySelector("[data-feature-check]")!;
    expect(check.className).toMatch(/\bbg-moss\b/);
    expect(check.className).toMatch(/\btext-ink\b/);
  });
});

describe("the two price cards", () => {
  it("basic is the cream paper, pro the honey card with ink type; both lead every line", () => {
    render(<Pricing />);
    const basic = screen.getByRole("article", { name: "בסיסי" });
    const pro = screen.getByRole("article", { name: "פרו" });
    expect(basic).toHaveAttribute("data-plan-surface", "paper");
    expect(basic.className).toMatch(/\balze-paper-grain\b/);
    expect(pro).toHaveAttribute("data-plan-surface", "honey");
    expect(pro.className).toMatch(/\bbg-honey\b/);
    expect(pro.className).toMatch(/\btext-ink\b/);
    expect(within(pro).getByText("כל מה שבבסיסי, ובנוסף:")).toBeInTheDocument();
    for (const card of [basic, pro]) {
      const items = within(card).getAllByRole("listitem").filter((li) => !li.closest("[role=toolbar]"));
      expect(items.length).toBeGreaterThan(0);
      for (const li of items) expect(lead(li), li.textContent!).not.toBeNull();
    }
    expect(pro.querySelectorAll("[data-feature-check]").length).toBeGreaterThan(0);
    for (const c of pro.querySelectorAll("[data-feature-check]")) expect(c.className).toMatch(/\bbg-ink\b/);
    for (const c of basic.querySelectorAll("[data-feature-check]")) expect(c.className).toMatch(/\bbg-moss\b/);
  });

  it("the honey card's type and checks pass the contrast checks (lib/design/tokens.ts)", () => {
    const labels = contrastPairs.map((p) => p.label);
    for (const l of ["ink on honey (pro plan card)", "ink muted on honey (pro plan card)", "honey check in the ink circle", "ink check in the moss circle (paper card)"]) expect(labels).toContain(l);
    expect(contrastRatio(palette.ink, palette.honey)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.inkMuted, palette.honey)).toBeGreaterThanOrEqual(4.5);
  });
});
