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
} from "@/lib/integrations/catalogue";
import { IntegrationChipRow } from "./chip-row";
import { INTEGRATION_MARK_STYLE, INTEGRATION_TILE } from "@/lib/integrations/tiles";
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

  it("with the switch on 'marks' (the default): the owner's mark in colour straight on the surface - no chip, no picture; a brand-colour monogram plate where there is no clean mark", () => {
    expect(INTEGRATION_MARK_STYLE).toBe("marks");
    for (const tone of ["night", "paper"] as const) {
      const { container, unmount } = render(
        <>
          {INTEGRATIONS.map((i) => (
            <IntegrationTile key={i.id} integration={i} size="lg" tone={tone} />
          ))}
          <MoreTile tone={tone} />
        </>,
      );
      const tiles = container.querySelectorAll("[data-integration-tile]");
      expect(tiles).toHaveLength(INTEGRATIONS.length);
      tiles.forEach((t) => {
        const id = t.getAttribute("data-integration-tile")!;
        expect(t).toHaveAttribute("aria-hidden", "true");
        expect(t).toHaveAttribute("data-mark", "bare");
        // nothing behind the mark: no background, no shadow, no rounded chip
        expect(t.className, id).not.toMatch(/\bbg-|shadow-|rounded/);
        expect(t.querySelector("img"), id).toBeNull();
        expect(t.querySelector("svg"), id).not.toBeNull();
      });
      // Priority, מורנינג and iCount: their letters on a plate of their brand colour
      for (const i of INTEGRATIONS.filter((x) => !INTEGRATION_ICONS[x.id])) {
        const t = container.querySelector(`[data-integration-tile='${i.id}']`)!;
        // drawn by a pseudo-element, never page text (a fragment like "iC" inside a button named "iCount" fails axe)
        expect(t.querySelector("[data-letters]"), i.id).toHaveAttribute("data-letters", i.monogram!.text);
        expect(t, i.id).toHaveTextContent(/^$/);
        expect(t.querySelector(`rect[fill='${i.monogram!.color}']`), i.id).not.toBeNull();
      }
      expect(container.querySelector("img")).toBeNull();
      // the "ועוד בהמשך" tile: an open dashed square with a plus
      expect(container.querySelector("[data-mark='more']")!.className).toContain("border-dashed");
      unmount();
    }
  });

  it("every monogram colour reads on the night stage (not the stage's own dark ink)", () => {
    for (const i of INTEGRATIONS.filter((x) => x.monogram)) expect(i.monogram!.color.toLowerCase(), i.id).not.toBe("#13241c");
  });

  it("with mark='tiles' (the switch back): our own icon tile from the surface's set, decorative, no white chip", () => {
    for (const tone of ["night", "paper"] as const) {
      const { container, unmount } = render(
        <>
          {INTEGRATIONS.map((i) => (
            <IntegrationTile key={i.id} integration={i} size="lg" tone={tone} mark="tiles" />
          ))}
          <MoreTile tone={tone} mark="tiles" />
        </>,
      );
      const tiles = container.querySelectorAll("[data-integration-tile]");
      expect(tiles).toHaveLength(INTEGRATIONS.length);
      tiles.forEach((t) => {
        const id = t.getAttribute("data-integration-tile")!;
        expect(t).toHaveAttribute("aria-hidden", "true");
        expect(t).toHaveAttribute("data-mark", "tile");
        expect(t.className).not.toContain("bg-white");
        expect(t.querySelector("svg")).toBeNull();
        const img = t.querySelector("img")!;
        expect(img).toHaveAttribute("alt", "");
        expect(decodeURIComponent(img.getAttribute("src")!)).toContain(`/brand/integrations/${tone}/${INTEGRATION_TILE[id]}.webp`);
      });
      // the "ועוד בהמשך" tile: the "more" picture of the same set
      const imgs = [...container.querySelectorAll("img")].map((i) => decodeURIComponent(i.getAttribute("src")!));
      expect(imgs.some((s) => s.includes(`/brand/integrations/${tone}/more.webp`))).toBe(true);
      unmount();
    }
  });

  it("with mark='svg' (the switch back): draws each mark as decorative SVG on a white tile", () => {
    const { container } = render(
      <>
        {INTEGRATIONS.map((i) => (
          <IntegrationTile key={i.id} integration={i} size="lg" mark="svg" />
        ))}
        <MoreTile mark="svg" />
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
          <IntegrationTile key={i.id} integration={i} mark="svg" />
        ))}
        {INTEGRATIONS.map((i) => (
          <IntegrationTile key={`bare-${i.id}`} integration={i} mark="marks" />
        ))}
      </>,
    );
    const ids =[...container.querySelectorAll("[id]")].map((e) => e.id);
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
  // the row widget on every available system (what a plan shows is lib/integrations/catalogue.test.ts)
  function renderRow(groups = integrationGroups(availableIntegrations())) {
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

  it("collapsed (the compact price list): the first N chips and a '+K' button that opens the rest in place and closes them again", () => {
    const all = integrationGroups();
    const names = all.flatMap((g) => g.items.map((i) => (i.status === "soon" ? `${i.name}, בקרוב` : i.name)));
    render(<IntegrationChipRow groups={all} label="חיבורים" tone="paper" size="xs" collapsed={8} />);
    const bar = screen.getByRole("toolbar", { name: "חיבורים" });
    const shown = () => within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(shown()).toEqual(names.slice(0, 8));
    const more = screen.getByRole("button", { name: `עוד ${names.length - 8} חיבורים` });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveTextContent(`+${names.length - 8}`);
    // the tab stop moves into the hidden part, then collapsing hands it back to the first chip
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(more).toHaveAccessibleName("פחות חיבורים");
    expect(shown()).toEqual(names);
    act(() => within(bar).getByRole("button", { name: "Microsoft To Do" }).focus());
    fireEvent.click(more);
    expect(shown()).toEqual(names.slice(0, 8));
    expect(within(bar).getAllByRole("button").filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(within(bar).getAllByRole("button")[0]).toHaveAttribute("tabindex", "0");
  });

  it("collapsed with no more than N systems: no '+K' button", () => {
    render(<IntegrationChipRow groups={integrationGroups(availableIntegrations()).slice(0, 1)} label="חיבורים" collapsed={20} />);
    expect(screen.queryByRole("button", { name: /חיבורים$/ })).toBeNull();
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
