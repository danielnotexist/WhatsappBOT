import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardTones, contrastPairs, contrastRatio, cssVar, palette, waMockup, type PaletteName } from "./tokens";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("design tokens (לילה ירוק)", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("every text/background and UI pair meets WCAG AA", () => {
    const failures = contrastPairs
      .map((p) => ({ ...p, ratio: Math.round(contrastRatio(p.fg, p.bg) * 100) / 100 }))
      .filter((p) => p.ratio < p.min)
      .map((p) => `${p.label}: ${p.ratio} < ${p.min}`);
    expect(failures).toEqual([]);
  });

  it("every card tone has readable text and muted text", () => {
    for (const [name, tone] of Object.entries(cardTones)) {
      expect(contrastRatio(tone.fg, tone.bg), name).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tone.muted, tone.bg), `${name} muted`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("app/globals.css declares exactly the palette values", () => {
    for (const name of Object.keys(palette) as PaletteName[]) {
      const m = css.match(new RegExp(`${cssVar(name)}:\\s*(#[0-9A-Fa-f]{6});`));
      expect(m?.[1]?.toUpperCase(), cssVar(name)).toBe(palette[name].toUpperCase());
    }
  });

  it("the WhatsApp mockup colours in CSS match", () => {
    const names: Record<keyof typeof waMockup, string> = { bg: "--wa-bg", in: "--wa-in", out: "--wa-out", fg: "--wa-fg", head: "--wa-head", link: "--wa-link", time: "--wa-time", chip: "--wa-chip", metaIn: "--wa-meta-in", metaOut: "--wa-meta-out" };
    for (const [k, v] of Object.entries(names)) {
      expect(css.match(new RegExp(`${v}:\\s*(#[0-9A-Fa-f]{6});`))?.[1]?.toUpperCase(), v).toBe(waMockup[k as keyof typeof waMockup]);
    }
  });

  it("dark is the default colour scheme and light cards opt out of shadcn dark: utilities", () => {
    expect(css).toMatch(/:root\s*{[^}]*--background:\s*var\(--alze-night\)/);
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *):not(:where(.surface-light, .surface-light *)));");
  });

  it("reduced motion lands every animation and transition in the same frame (zero durations and delays)", () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{[^}]*\}/.exec(css)?.[0] ?? "";
    for (const rule of ["animation-duration: 0s !important", "animation-delay: 0s !important", "transition-duration: 0s !important", "transition-delay: 0s !important"]) {
      expect(block).toContain(rule);
    }
    // a tiny non-zero duration paints the old value for one frame (every element transitions `all` by default)
    expect(block).not.toMatch(/0\.0\d*m?s/);
  });
});
