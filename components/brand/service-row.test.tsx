// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectionServices, previewServices, type ReadGates } from "@/lib/connections/services";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, normalizeScopes } from "@/lib/google/oauth";
import { MS_SCOPES, MS_SCOPES_V1 } from "@/lib/ms/oauth";
import { ServiceGlyph } from "./service-icons";
import { ServiceRow } from "./service-row";

beforeEach(() => document.documentElement.setAttribute("dir", "rtl"));
afterEach(cleanup);

const googleViews = (gates?: ReadGates) => connectionServices({ provider: "google", scopes: normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly]) }, { gates });
const tooltipOf = (el: HTMLElement) => document.getElementById(el.getAttribute("aria-describedby")!)!;
const shown = (el: HTMLElement) => !tooltipOf(el).parentElement!.hidden;

describe("ServiceRow", () => {
  it("renders one named control per service in a labelled list; each is described by its tooltip", () => {
    render(<ServiceRow services={googleViews()} label="שירותים ב-Google" />);
    const list = screen.getByRole("list", { name: "שירותים ב-Google" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    const gmail = screen.getByRole("button", { name: "Gmail - מחובר" });
    expect(tooltipOf(gmail)).toHaveAttribute("role", "tooltip");
    // the name is not repeated in the description: what works / what is missing
    expect(gmail).toHaveAccessibleDescription("קריאה, חיפוש וסיכום של מיילים, ושליחה אחרי אישור");
    // drive.readonly is missing and the read is open → a link to the incremental consent, with its action line
    const drive = screen.getByRole("link", { name: "Google Drive - צריך אישור נוסף" });
    expect(drive).toHaveAttribute("href", "/api/auth/google/start?feature=drive_read");
    expect(drive).toHaveAccessibleDescription("כרגע רק קבצים שנוצרו דרכי. חיפוש בכל ה-Drive מחכה לאישור לחיצה פותחת את האישור ב-Google");
    expect(screen.getByRole("link", { name: "Google Docs - צריך אישור נוסף" })).toHaveAccessibleDescription("קריאה של מסמכים קיימים לחיצה פותחת את האישור ב-Google");
    expect(screen.getAllByRole("link")).toHaveLength(4); // Drive, Docs, Sheets, Slides
    expect(screen.getByText("4 שירותים מחכים לאישור נוסף")).toBeInTheDocument();
    // tooltips start hidden (no layout, no overflow)
    for (const b of [...screen.getAllByRole("button"), ...screen.getAllByRole("link")]) expect(shown(b)).toBe(false);
  });

  it("shows the tooltip on hover and keeps it while the pointer is on the bubble; one at a time", () => {
    render(<ServiceRow services={googleViews()} label="שירותים ב-Google" />);
    const gmail = screen.getByRole("button", { name: "Gmail - מחובר" });
    const cal = screen.getByRole("button", { name: "יומן Google - מחובר" });
    fireEvent.pointerEnter(gmail.parentElement!, { pointerType: "mouse" });
    expect(shown(gmail)).toBe(true);
    expect(within(tooltipOf(gmail)).getByText("Gmail - מחובר")).toBeVisible();
    // moving onto the bubble stays inside the item
    fireEvent.pointerEnter(tooltipOf(gmail), { pointerType: "mouse" });
    expect(shown(gmail)).toBe(true);
    fireEvent.pointerEnter(cal.parentElement!, { pointerType: "mouse" });
    expect(shown(gmail)).toBe(false);
    expect(shown(cal)).toBe(true);
    fireEvent.pointerLeave(cal.parentElement!, { pointerType: "mouse" });
    expect(shown(cal)).toBe(false);
  });

  it("shows it on keyboard focus, hides it on blur, and Esc closes it without moving focus", () => {
    render(<ServiceRow services={googleViews()} label="שירותים ב-Google" />);
    const tasks = screen.getByRole("button", { name: "Google Tasks - מחובר" });
    act(() => tasks.focus());
    expect(shown(tasks)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(shown(tasks)).toBe(false);
    expect(tasks).toHaveFocus();
    act(() => tasks.blur());
    act(() => tasks.focus());
    expect(shown(tasks)).toBe(true);
    act(() => tasks.blur());
    expect(shown(tasks)).toBe(false);
  });

  it("touch: a tap toggles a tooltip; on a 'needs approval' icon the first tap explains, the second follows the link", () => {
    render(<ServiceRow services={googleViews()} label="שירותים ב-Google" />);
    const gmail = screen.getByRole("button", { name: "Gmail - מחובר" });
    const tap = (el: HTMLElement) => {
      fireEvent.pointerDown(el, { pointerType: "touch" });
      act(() => el.focus());
      return fireEvent.click(el);
    };
    tap(gmail);
    expect(shown(gmail)).toBe(true);
    tap(gmail);
    expect(shown(gmail)).toBe(false);

    const docs = screen.getByRole("link", { name: "Google Docs - צריך אישור נוסף" });
    expect(tap(docs)).toBe(false); // default prevented: no navigation yet
    expect(shown(docs)).toBe(true);
    expect(within(tooltipOf(docs)).getByText("לחיצה פותחת את האישור ב-Google")).toBeInTheDocument();
    expect(tap(docs)).toBe(true); // the second tap navigates
    // a tap elsewhere closes
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(shown(docs)).toBe(false);
  });

  it("a mouse click on a needs-approval icon goes straight to the consent", () => {
    render(<ServiceRow services={googleViews()} label="שירותים ב-Google" />);
    const sheets = screen.getByRole("link", { name: "Google Sheets - צריך אישור נוסף" });
    fireEvent.pointerDown(sheets, { pointerType: "mouse" });
    expect(fireEvent.click(sheets)).toBe(true);
  });

  it("marks each state by shape as well as colour: solid tile, a honey dot, a dashed tile", () => {
    const { container } = render(<ServiceRow services={googleViews({ gmail_read: "open", drive_read: "cap_reached" })} label="שירותים ב-Google" />);
    expect(screen.getByRole("button", { name: "Google Docs - לא זמין" })).toHaveAttribute("data-status", "unavailable");
    expect(screen.getByRole("button", { name: "Google Drive - מחובר" })).toHaveAccessibleDescription("קבצים שנוצרו או נפתחו דרכי, ושמירת מסמכים");
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelectorAll("[data-status=connected]").length).toBe(4);
    expect(container.querySelector("[data-status=unavailable]")!.className).toContain("border-dashed");
    // the products' official marks in colour, straight on the surface: no picture, no white chip, no sage tile
    for (const icon of container.querySelectorAll<HTMLElement>("[data-status]")) {
      expect(icon.querySelector("[data-glyph] svg")).not.toBeNull();
      expect(icon.querySelector("img")).toBeNull();
      expect(icon.className).not.toMatch(/\bbg-white\b|\bbg-sage\b/);
    }
    expect(container.querySelector("[data-status=connected]")!.className).not.toMatch(/opacity-\d/);    expect(screen.queryByText(/מחכים לאישור נוסף|מחכה לאישור נוסף/)).toBeNull();
  });

  it("Microsoft: an older connection asks for To Do and SharePoint through the normal connect (one line about the admin)", () => {
    render(<ServiceRow services={connectionServices({ provider: "microsoft", scopes: [...MS_SCOPES_V1] })} label="שירותים ב-Microsoft 365" />);
    const todo = screen.getByRole("link", { name: "Microsoft To Do - צריך אישור נוסף" });
    expect(todo).toHaveAttribute("href", "/api/auth/microsoft/start");
    expect(todo).toHaveAccessibleDescription("הצגה והוספה של משימות לחיצה פותחת חיבור מחדש ב-Microsoft. בארגון ייתכן שיידרש אישור מנהל");
    expect(screen.getByText("2 שירותים מחכים לאישור נוסף")).toBeInTheDocument();
    cleanup();
    render(<ServiceRow services={connectionServices({ provider: "microsoft", scopes: [...MS_SCOPES] })} label="שירותים ב-Microsoft 365" />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Outlook - מחובר", "יומן Outlook - מחובר", "OneDrive - מחובר", "SharePoint - מחובר", "Microsoft To Do - מחובר", "קבצי Word, Excel ו-PowerPoint - מחובר"]);
  });

  it("draws every glyph on the 24px grid, decorative only", () => {
    for (const icon of ["mail", "calendar", "tasks", "folder", "doc", "sheet", "slides", "cloud", "sites", "files"] as const) {
      const { container } = render(<ServiceGlyph icon={icon} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      cleanup();
    }
  });

  it("on basic: the pro services are 'במסלול פרו' links to the upgrade, never a consent; Drive stays connected with what basic has", () => {
    const views = connectionServices({ provider: "google", scopes: normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly]) }, { plan: "basic", upgradeHref: "/pay/tok" });
    render(<ServiceRow services={views} label="שירותים ב-Google" />);
    const tasks = screen.getByRole("link", { name: "Google Tasks - במסלול פרו" });
    expect(tasks).toHaveAttribute("href", "/pay/tok");
    expect(tasks).toHaveAttribute("data-status", "pro_only");
    expect(tasks).toHaveAccessibleDescription("הצגה והוספה של משימות לחיצה פותחת את השדרוג לפרו");
    for (const name of ["Google Docs", "Google Sheets", "Google Slides"]) expect(screen.getByRole("link", { name: `${name} - במסלול פרו` })).toHaveAttribute("href", "/pay/tok");
    expect(screen.getByRole("button", { name: "Google Drive - מחובר" })).toHaveAccessibleDescription("קבצים שנפתחו דרכי. חיפוש בכל ה-Drive ושמירת מסמכים: במסלול פרו");
    expect(screen.queryByText(/מחכים לאישור נוסף|מחכה לאישור נוסף/)).toBeNull();
    expect(screen.getAllByRole("link").every((a) => !a.getAttribute("href")!.startsWith("/api/auth"))).toBe(true);
  });

  it("an account that is not connected: its services faded, as buttons named 'Gmail - יתחבר עם Google' that only explain", () => {
    render(<ServiceRow services={previewServices("google", { plan: "trial" })} label="שירותים שיתחברו עם Google" />);
    const list = screen.getByRole("list", { name: "שירותים שיתחברו עם Google" });
    const gmail = within(list).getByRole("button", { name: "Gmail - יתחבר עם Google" });
    expect(gmail).toHaveAttribute("data-status", "preview");
    expect(gmail.className).toContain("[&_[data-glyph]]:opacity-45");
    expect(gmail).toHaveAccessibleDescription("קריאה, חיפוש וסיכום של מיילים, ושליחה אחרי אישור");
    expect(within(list).getByRole("button", { name: "Google Tasks - יתחבר עם Google" })).toHaveAccessibleDescription("הצגה והוספה של משימות. במסלול פרו");
    expect(within(list).queryAllByRole("link")).toHaveLength(0);
    // hover shows the paper tooltip with its name
    fireEvent.pointerEnter(gmail.closest("li")!, { pointerType: "mouse" });
    expect(shown(gmail)).toBe(true);
    expect(tooltipOf(gmail).parentElement).toHaveTextContent("Gmail - יתחבר עם Google");
    // no "waiting for approval" line under a preview
    expect(screen.queryByText(/לאישור נוסף/)).toBeNull();
  });

  it("uses logical (RTL-safe) classes only and respects reduced motion", () => {
    const PHYSICAL = /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r)-|(^|:)(text-left|text-right)$/;
    for (const file of ["service-row.tsx", "service-icons.tsx"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      const tokens = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].flatMap((m) => (m[1] ?? m[2] ?? "").split(/[\s{}$]+/));
      expect(tokens.filter((t) => PHYSICAL.test(t)), file).toEqual([]);
    }
    const row = readFileSync(join(__dirname, "service-row.tsx"), "utf8");
    expect(row).toContain("motion-safe:animate-in");
    expect(row).toContain("motion-reduce:transition-none");
  });
});
