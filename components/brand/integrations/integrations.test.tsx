// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import {
  INTEGRATIONS,
  availableIntegrations,
  integrationGroups,
  integrationsForPlan,
} from "@/lib/integrations/catalogue";
import { IntegrationChipRow } from "./chip-row";
import { INTEGRATION_ICONS, OutlookIcon } from "./icons";
import { IntegrationTile, MoreTile } from "./tile";

/** Same rule as components/brand/landing/landing.test.tsx: logical (start/end) classes only. */
const PHYSICAL_CLASS =
  /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|(^|:)(text-left|text-right|float-left|float-right|clear-left|clear-right|border-l|border-r|rounded-l|rounded-r)$/;
const classTokens = (source: string) =>
  [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)]
    .flatMap((m) => (m[1] ?? m[2] ?? "").split(/[\s{}$]+/))
    .filter(Boolean);

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "he");
});
afterEach(cleanup);

describe("sources", () => {
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => join(__dirname, f));

  it.each(files.map((f) => [f.slice(f.indexOf("components")), f]))(
    "%s: logical classes only, no hard-coded brand name",
    (_n, file) => {
      const src = readFileSync(file, "utf8");
      expect(classTokens(src).filter((t) => PHYSICAL_CLASS.test(t))).toEqual([]);
      expect(src.includes(BRAND.name)).toBe(false);
    },
  );

  it("every file that draws third-party marks says they are trademarks used only for 'works with'", () => {
    for (const f of ["icons.tsx", "tile.tsx"])
      expect(readFileSync(join(__dirname, f), "utf8"), f).toMatch(/trademark[\s\S]*works with/i);
    expect(
      readFileSync(
        join(__dirname, "..", "..", "..", "lib", "integrations", "catalogue.ts"),
        "utf8",
      ),
    ).toMatch(/Trademarks[\s\S]*works with/);
  });

  it("the chips island never imports the marks (they are rendered on the server and passed in)", () => {
    const chips = readFileSync(join(__dirname, "chips.tsx"), "utf8");
    expect(chips.startsWith('"use client"')).toBe(true);
    expect(chips).not.toMatch(/from "\.\/(icons|tile)"/);
  });
});

describe("tiles", () => {
  it("every Google and Microsoft product has a drawn mark; the rest at least a monogram", () => {
    for (const i of INTEGRATIONS) {
      if (i.vendor !== "business") expect(INTEGRATION_ICONS[i.id], i.id).toBeDefined();
      else expect(Boolean(INTEGRATION_ICONS[i.id] || i.monogram), i.id).toBe(true);
    }
  });

  it("draws each mark as decorative SVG on a white tile", () => {
    const { container } = render(
      <>
        {INTEGRATIONS.map((i) => (
          <IntegrationTile key={i.id} integration={i} size="lg" />
        ))}
        <MoreTile />
      </>,
    );
    const tiles = container.querySelectorAll("[data-integration-tile]");
    expect(tiles).toHaveLength(INTEGRATIONS.length);
    tiles.forEach((t) => {
      expect(t).toHaveAttribute("aria-hidden", "true");
      expect(t.className).toContain("bg-white");
    });
    const drawn = [...tiles].filter((t) => t.querySelector("svg"));
    expect(drawn).toHaveLength(INTEGRATIONS.filter((i) => INTEGRATION_ICONS[i.id]).length);
    expect(container.querySelector("[data-integration-tile='priority']")).toHaveTextContent("P");
  });

  it("gives every copy of a mark its own gradient ids, and every url(#…) points at an element that exists", () => {
    const { container } = render(
      <>
        <OutlookIcon />
        <OutlookIcon />
        {INTEGRATIONS.map((i) => (
          <IntegrationTile key={i.id} integration={i} />
        ))}
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...container.querySelectorAll("[fill^='url('], [clip-path^='url(']")].map((e) =>
      [e.getAttribute("fill"), e.getAttribute("clip-path")]
        .find((v) => v?.startsWith("url(#"))!
        .slice(5, -1),
    );
    expect(refs.length).toBeGreaterThan(8);
    for (const r of refs) expect(container.querySelector(`[id="${r}"]`), r).not.toBeNull();
  });
});

describe("the chip row (toolbar + tooltips)", () => {
  function renderRow(groups = integrationsForPlan("basic")) {
    render(
      <>
        <p id="row-label">כולל חיבור ל:</p>
        <IntegrationChipRow groups={groups} labelledBy="row-label" tone="paper" />
        <button type="button">אחרי</button>
      </>,
    );
    return screen.getByRole("toolbar", { name: "כולל חיבור ל:" });
  }

  it("names every product, groups them by account and is a single tab stop", () => {
    const bar = renderRow();
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
      availableIntegrations().map((i) => i.name),
    );
    expect(
      within(bar)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Google", "Microsoft 365"]);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("tabindex", "0");
  });

  it("describes each chip with its one-line benefit; the tooltip is hidden until needed", () => {
    const bar = renderRow();
    const gmail = within(bar).getByRole("button", { name: "Gmail" });
    expect(gmail).toHaveAccessibleDescription(INTEGRATIONS.find((i) => i.id === "gmail")!.benefit);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens the tooltip on keyboard focus, moves along the row with the arrows (mirrored in RTL) and closes on Esc", () => {
    const bar = renderRow();
    const [gmail, calendar] = within(bar).getAllByRole("button");
    act(() => gmail!.focus());
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Gmail");
    expect(tip).toHaveTextContent("מסכמת מה מחכה ומנסחת תשובות לאישור");

    // RTL: the next chip is to the left
    fireEvent.keyDown(gmail!, { key: "ArrowLeft" });
    expect(calendar).toHaveFocus();
    expect(calendar).toHaveAttribute("tabindex", "0");
    expect(gmail).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Google Calendar");

    fireEvent.keyDown(calendar!, { key: "ArrowRight" });
    expect(gmail).toHaveFocus();
    fireEvent.keyDown(gmail!, { key: "End" });
    expect(within(bar).getByRole("button", { name: "Microsoft To Do" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(gmail).toHaveFocus(); // wraps

    fireEvent.keyDown(gmail!, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(gmail).toHaveFocus();
  });

  it("toggles on a tap (touch has no hover) and closes on a press outside or when focus leaves the row", () => {
    const bar = renderRow();
    const word = within(bar).getByRole("button", { name: "Word" });
    fireEvent.pointerDown(word);
    fireEvent.click(word);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Word");
    fireEvent.click(word);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(word);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();

    const gmail = within(bar).getByRole("button", { name: "Gmail" });
    act(() => gmail.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "אחרי" }).focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("says 'בקרוב' in the name of a product that is not connected yet, and in its tooltip", () => {
    renderRow(integrationGroups());
    const monday = screen.getByRole("button", { name: "monday.com, בקרוב" });
    act(() => monday.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("בקרוב");
    // meeting links ship with the calendar tools (online_meeting): no "בקרוב" on Teams or Meet
    expect(screen.getByRole("button", { name: "Microsoft Teams" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Meet" })).toBeInTheDocument();
  });
});
