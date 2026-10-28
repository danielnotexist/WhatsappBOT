// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FRAME, HEADER_BAR } from "./frame";
import { PAGE_ENTER, PAGE_EXIT, WORDMARK_TRANSITION_NAME } from "./page-transition";
import { Wordmark } from "./wordmark";

vi.mock("next/link", () => ({ default: ({ href, transitionTypes, ...rest }: Record<string, unknown>) => <a href={String(href)} data-transition-types={JSON.stringify(transitionTypes ?? null)} {...rest} /> }));

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..");
const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The body of every `@media (<query>) { … }` block (brace-matched), in order. */
function mediaBlocks(query: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media (${query})`, from);
    if (at < 0) return out;
    const open = css.indexOf("{", at);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) break;
    }
    out.push(css.slice(open + 1, i));
    from = i;
  }
}

describe("the wordmark is the page transition's anchor", () => {
  it("the header's wordmark carries view-transition-name alze-wordmark; going home is a back navigation", () => {
    const { container } = render(<Wordmark />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/");
    expect(link.style.viewTransitionName).toBe(WORDMARK_TRANSITION_NAME);
    expect(link.hasAttribute("data-wordmark")).toBe(true);
    expect(link.getAttribute("data-transition-types")).toBe('["nav-back"]');
  });

  it("a second wordmark on the page (the footer's) does not, so the name is never duplicated", () => {
    const { container } = render(<Wordmark anchor={false} />);
    expect(container.querySelector("a")!.style.viewTransitionName).toBe("");
    expect(container.querySelector("[data-wordmark]")).toBeNull();
    expect(read("components/brand/landing/footer.tsx")).toContain("<Wordmark anchor={false} />");
  });

  it("every page header sits on the same frame (the landing's 84rem grid), so the wordmark is on the same pixel", () => {
    expect(HEADER_BAR.startsWith(FRAME)).toBe(true);
    expect(read("components/brand/landing/ui.ts")).toContain("export const CONTAINER = FRAME;");
    for (const file of ["components/brand/landing/header.tsx", "components/auth/signup-shell.tsx", "app/account/page.tsx", "app/(legal)/layout.tsx", "app/(auth)/connect/[provider]/page.tsx", "app/pay/_components/pay-ui.tsx"]) {
      expect(read(file), file).toMatch(/<header className=\{(cn\()?HEADER_BAR/);
    }
    // the split sign-in screen has no full-width header: its column starts on the same frame edge
    expect(read("app/(auth)/login/page.tsx")).toContain("lg:ps-[max(3rem,calc((100cqw-84rem)/2+3rem))]");
  });

  it("each page puts its transition before any DOM node (React runs enter / exit only there)", () => {
    const pages = ["app/page.tsx", "app/pricing/page.tsx", "app/for/[profession]/page.tsx", "app/(auth)/login/page.tsx", "app/account/page.tsx", "app/(legal)/layout.tsx", "app/pay/_components/pay-ui.tsx", "app/(auth)/connect/[provider]/page.tsx"];
    for (const file of pages) expect(read(file), file).toMatch(/return \(\s*<PageTransition>/);
    expect(read("components/auth/signup-shell.tsx")).toMatch(/<ShellSessionProvider[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<PageTransition>/);
  });

  it("enter / exit classes by navigation type: back drifts the other way, anything else is forward", () => {
    expect(PAGE_ENTER).toEqual({ "nav-back": "page-in-back", default: "page-in" });
    expect(PAGE_EXIT).toEqual({ "nav-back": "page-out-back", default: "page-out" });
  });
});

describe("the page transition's CSS", () => {
  it("holds the wordmark still: no group animation, the old snapshot never drawn, the new one at once", () => {
    expect(css).toMatch(/::view-transition-group\(alze-wordmark\)\s*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/::view-transition-old\(alze-wordmark\)\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/::view-transition-new\(alze-wordmark\)\s*\{[^}]*animation:\s*none/);
  });

  it("pins the overlay to the physical origin (React's 0×0 overlay sits off-screen in a right-to-left page otherwise)", () => {
    expect(css).toMatch(/::view-transition\s*\{[^}]*left:\s*0;[^}]*right:\s*auto;/);
  });

  it("moves only with prefers-reduced-motion: no-preference, and never under the site's 'עצירת אנימציות'", () => {
    const motion = mediaBlocks("prefers-reduced-motion: no-preference").join("\n");
    for (const cls of [".page-out", ".page-out-back", ".page-in", ".page-in-back"]) {
      expect(motion).toContain(`html:not([data-a11y-motion])::view-transition-${cls.includes("out") ? "old" : "new"}(${cls})`);
    }
    // outside that block nothing names the page classes or runs the page keyframes
    const outside = mediaBlocks("prefers-reduced-motion: no-preference").reduce((rest, block) => rest.replace(block, ""), css);
    expect(outside).not.toMatch(/\.page-(in|out)/);
    expect(outside).not.toMatch(/animation:[^;]*alze-page-/);
    expect(outside).not.toMatch(/@view-transition/);
    // every page rule inside it is guarded by the site's switch
    for (const m of motion.matchAll(/([^{}]*::view-transition-(?:old|new)\([^)]*\)[^{}]*)\{/g)) {
      for (const selector of m[1]!.split(",")) expect(selector.trim(), selector).toMatch(/^html:not\(\[data-a11y-motion\]\)::view-transition-/);
    }
  });

  it("is about a third of a second: 180ms out, 260ms in after 60ms, 360ms of movement", () => {
    const motion = mediaBlocks("prefers-reduced-motion: no-preference").join("\n");
    const entries = [...motion.matchAll(/(\d+)ms\s+(?:cubic-bezier\([^)]*\)|var\([^)]*\))(?:\s+(\d+)ms)?\s+both\s+(alze-page-[a-z-]+)/g)].map((m) => ({ name: m[3]!, end: Number(m[1]) + Number(m[2] ?? 0) }));
    expect(entries.map((e) => e.name).sort()).toEqual(["alze-page-drift-out", "alze-page-fade-in", "alze-page-fade-out", "alze-page-rise-in"]);
    // the whole hand-over ends between 280 and 380ms; nothing waits longer than it moves
    const end = Math.max(...entries.map((e) => e.end));
    expect(end).toBeGreaterThanOrEqual(280);
    expect(end).toBeLessThanOrEqual(380);
    // ease-out on the movement
    expect(motion).toMatch(/360ms var\(--alze-vt-ease\) both alze-page-rise-in/);
    expect(css).toMatch(/--alze-vt-ease:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  });

  it("reduced motion (the device's setting and the site's switch): no transition CSS runs — nothing animates, the old page is not drawn", () => {
    const reduce = mediaBlocks("prefers-reduced-motion: reduce").join("\n");
    expect(reduce).toMatch(/::view-transition-group\(\*\),\s*::view-transition-image-pair\(\*\),\s*::view-transition-new\(\*\)\s*\{\s*animation:\s*none !important;/);
    expect(reduce).toMatch(/::view-transition-old\(\*\)\s*\{\s*display:\s*none !important;/);
    expect(reduce).not.toMatch(/alze-page-/);
    expect(css).toMatch(/html\[data-a11y-motion\]::view-transition-group\(\*\),\s*html\[data-a11y-motion\]::view-transition-image-pair\(\*\),\s*html\[data-a11y-motion\]::view-transition-new\(\*\)\s*\{\s*animation:\s*none !important;/);
    expect(css).toMatch(/html\[data-a11y-motion\]::view-transition-old\(\*\)\s*\{\s*display:\s*none !important;/);
  });

  it("keeps the night behind everything: the canvas wears the stage's colour, the scrollbar gutter is reserved", () => {
    expect(css).toMatch(/html \{[^}]*scrollbar-gutter:\s*stable;[^}]*background-color:\s*color-mix\(in srgb, var\(--alze-night\) 97\.7%, white\);/);
  });
});
