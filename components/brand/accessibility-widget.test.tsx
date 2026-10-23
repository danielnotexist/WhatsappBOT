// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A11Y_INIT_SCRIPT, applySettings, DEFAULT_SETTINGS, normalize, STORAGE_KEY, TOGGLE_ATTRS } from "@/lib/a11y/settings";
import { resetStoreForTests, setSettings } from "@/lib/a11y/store";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { A11yMotion } from "./a11y-motion";
import { AccessibilityWidget } from "./accessibility-widget";

const html = document.documentElement;

function a11yAttrs(): Record<string, string> {
  return Object.fromEntries([...html.attributes].filter((a) => a.name.startsWith("data-a11y-")).map((a) => [a.name, a.value]));
}

function stored(): unknown {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  html.setAttribute("dir", "rtl");
  window.localStorage.clear();
  for (const name of Object.keys(a11yAttrs())) html.removeAttribute(name);
  resetStoreForTests();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});
afterEach(cleanup);

function openMenu() {
  render(<AccessibilityWidget />);
  const button = screen.getByRole("button", { name: "תפריט נגישות" });
  fireEvent.click(button);
  return { button, dialog: screen.getByRole("dialog", { name: "נגישות" }) };
}

describe("AccessibilityWidget", () => {
  it("is a small closed button until clicked", () => {
    render(<AccessibilityWidget />);
    const button = screen.getByRole("button", { name: "תפריט נגישות" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    // bottom of the inline end (the left side in RTL), never the inline start where the support chat sits
    expect(button.className).toContain("end-4");
    expect(button.className).not.toMatch(/(^|\s)start-/);
    expect(screen.queryByRole("dialog")).toBeNull();
    // no live region of its own on every page (pages look up their own role="status")
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens with focus inside, closes with Esc and returns focus to the button", () => {
    const { button, dialog } = openMenu();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", dialog.id);
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes from its close button, a second click on the button, and a click outside", () => {
    const { button } = openMenu();
    fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when focus leaves it with Tab", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { dialog } = openMenu();
    fireEvent.blur(dialog, { relatedTarget: outside });
    expect(screen.queryByRole("dialog")).toBeNull();
    outside.remove();
  });

  it.each([
    ["ניגודיות גבוהה", "contrast"],
    ["הדגשת קישורים", "links"],
    ["גופן קריא", "font"],
    ["עצירת אנימציות", "motion"],
    ["ריווח שורות", "spacing"],
  ] as const)("%s is a switch that sets its <html> attribute and is saved", (label, key) => {
    openMenu();
    const sw = screen.getByRole("switch", { name: label });
    expect(sw).toHaveAttribute("aria-checked", "false");

    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(html).toHaveAttribute(TOGGLE_ATTRS[key], "");
    expect(stored()).toMatchObject({ [key]: true });

    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(html).not.toHaveAttribute(TOGGLE_ATTRS[key]);
    expect(stored()).toBeNull(); // back to the defaults: nothing kept
  });

  it("text size goes up three steps and back, with the bounds disabled", () => {
    openMenu();
    const bigger = screen.getByRole("button", { name: "הגדלת טקסט" });
    const smaller = screen.getByRole("button", { name: "הקטנת טקסט" });
    expect(smaller).toBeDisabled();
    expect(screen.getByRole("group", { name: "הגדלת טקסט" })).toHaveTextContent("100%");

    fireEvent.click(bigger);
    expect(html).toHaveAttribute("data-a11y-text", "1");
    expect(screen.getByRole("status")).toHaveTextContent("גודל הטקסט: 112.5%");
    fireEvent.click(bigger);
    fireEvent.click(bigger);
    expect(html).toHaveAttribute("data-a11y-text", "3");
    expect(bigger).toBeDisabled();
    expect(stored()).toMatchObject({ text: 3 });

    fireEvent.click(smaller);
    expect(html).toHaveAttribute("data-a11y-text", "2");
    fireEvent.click(smaller);
    fireEvent.click(smaller);
    expect(html).not.toHaveAttribute("data-a11y-text");
    expect(smaller).toBeDisabled();
  });

  it("reset clears every setting, the attributes and the saved copy", () => {
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "הגדלת טקסט" }));
    fireEvent.click(screen.getByRole("switch", { name: "ניגודיות גבוהה" }));
    fireEvent.click(screen.getByRole("switch", { name: "ריווח שורות" }));
    expect(Object.keys(a11yAttrs())).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "איפוס הגדרות" }));
    expect(a11yAttrs()).toEqual({});
    expect(stored()).toBeNull();
    expect(screen.getAllByRole("switch").every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("ההגדרות אופסו");
  });

  it("restores saved settings on load and shows them in the menu", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: 2, links: true }));
    openMenu();
    expect(html).toHaveAttribute("data-a11y-text", "2");
    expect(html).toHaveAttribute("data-a11y-links", "");
    expect(screen.getByRole("switch", { name: "הדגשת קישורים" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("group", { name: "הגדלת טקסט" })).toHaveTextContent("125%");
  });

  it("links to the accessibility statement", () => {
    openMenu();
    expect(screen.getByRole("link", { name: "הצהרת נגישות" })).toHaveAttribute("href", "/accessibility");
  });

  it("still works when storage throws (private mode)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    openMenu();
    fireEvent.click(screen.getByRole("switch", { name: "גופן קריא" }));
    expect(html).toHaveAttribute("data-a11y-font", "");
    spy.mockRestore();
  });
});

describe("a11y settings", () => {
  it("normalizes anything read back from storage", () => {
    expect(normalize(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalize({ text: 9, contrast: "yes", font: true, evil: 1 })).toEqual({ ...DEFAULT_SETTINGS, text: 3, font: true });
    expect(normalize({ text: -2 })).toEqual(DEFAULT_SETTINGS);
    expect(normalize({ text: 1.5 })).toEqual(DEFAULT_SETTINGS);
  });

  it("the inline <head> script applies exactly what applySettings does", () => {
    const s = { text: 9, contrast: true, links: false, font: true, motion: true, spacing: false };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    new Function(A11Y_INIT_SCRIPT)();
    const fromScript = a11yAttrs();
    for (const name of Object.keys(fromScript)) html.removeAttribute(name);
    applySettings(normalize(s));
    expect(fromScript).toEqual(a11yAttrs());
    expect(fromScript).toEqual({ "data-a11y-text": "3", "data-a11y-contrast": "", "data-a11y-font": "", "data-a11y-motion": "" });
  });

  it("the inline script ignores bad or missing data without throwing", () => {
    new Function(A11Y_INIT_SCRIPT)();
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => new Function(A11Y_INIT_SCRIPT)()).not.toThrow();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: "3", contrast: 1 }));
    new Function(A11Y_INIT_SCRIPT)();
    expect(a11yAttrs()).toEqual({});
  });
});

describe("A11yMotion", () => {
  function Probe() {
    return <span data-testid="reduce">{String(useReducedMotion())}</span>;
  }

  it("makes useReducedMotion answer true while animations are stopped", () => {
    render(
      <A11yMotion>
        <Probe />
      </A11yMotion>,
    );
    expect(screen.getByTestId("reduce")).toHaveTextContent("false");
    act(() => setSettings({ ...DEFAULT_SETTINGS, motion: true }));
    expect(screen.getByTestId("reduce")).toHaveTextContent("true");
    act(() => setSettings(DEFAULT_SETTINGS));
    expect(screen.getByTestId("reduce")).toHaveTextContent("false");
  });
});
