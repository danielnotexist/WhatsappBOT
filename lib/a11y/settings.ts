/**
 * The accessibility menu's settings (components/brand/accessibility-widget.tsx). Each one is a data attribute on
 * <html>; app/globals.css does the rest. Saved per browser in localStorage, and applied before the first paint by
 * A11Y_INIT_SCRIPT (an inline <script> in app/layout.tsx), so a reload never flashes the default look.
 */
export type A11ySettings = {
  /** Text size step: 0 = as designed, 1..TEXT_STEPS.length-1 = larger. */
  text: number;
  contrast: boolean;
  links: boolean;
  /** A plain system sans (Arial) instead of Varela Round. */
  font: boolean;
  /** Stop animations and transitions (CSS, motion, Lenis, confetti). */
  motion: boolean;
  spacing: boolean;
};

export type A11yToggle = Exclude<keyof A11ySettings, "text">;

/** Root font sizes per step (the whole site is in rem, so everything grows together). */
export const TEXT_STEPS = ["100%", "112.5%", "125%", "150%"] as const;
export const MAX_TEXT_STEP = TEXT_STEPS.length - 1;

export const STORAGE_KEY = "alze:a11y";

export const DEFAULT_SETTINGS: A11ySettings = Object.freeze({
  text: 0,
  contrast: false,
  links: false,
  font: false,
  motion: false,
  spacing: false,
});

/** The attribute each toggle sets on <html> (present = on). */
export const TOGGLE_ATTRS: Readonly<Record<A11yToggle, string>> = {
  contrast: "data-a11y-contrast",
  links: "data-a11y-links",
  font: "data-a11y-font",
  motion: "data-a11y-motion",
  spacing: "data-a11y-spacing",
};
export const TEXT_ATTR = "data-a11y-text";

const TOGGLES = Object.keys(TOGGLE_ATTRS) as A11yToggle[];

/** Anything read back from storage, made safe: unknown keys dropped, wrong types back to the default. */
export function normalize(raw: unknown): A11ySettings {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof s.text === "number" && Number.isInteger(s.text) ? Math.min(Math.max(s.text, 0), MAX_TEXT_STEP) : 0;
  const out: A11ySettings = { ...DEFAULT_SETTINGS, text };
  for (const k of TOGGLES) out[k] = s[k] === true;
  return out;
}

export function isDefault(s: A11ySettings): boolean {
  return s.text === 0 && TOGGLES.every((k) => !s[k]);
}

/** Writes the settings onto <html> (removes what is off). */
export function applySettings(s: A11ySettings, root: HTMLElement = document.documentElement): void {
  if (s.text > 0) root.setAttribute(TEXT_ATTR, String(s.text));
  else root.removeAttribute(TEXT_ATTR);
  for (const k of TOGGLES) {
    if (s[k]) root.setAttribute(TOGGLE_ATTRS[k], "");
    else root.removeAttribute(TOGGLE_ATTRS[k]);
  }
}

export function readStored(): A11ySettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS; // private mode, blocked storage, bad JSON
  }
}

export function writeStored(s: A11ySettings): void {
  try {
    if (isDefault(s)) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: the setting still applies to this page
  }
}

/**
 * The same as readStored() + applySettings(), as a self-contained script for <head> (runs while the HTML is parsed,
 * before React). Built from the constants above so the two can never drift (a test runs it against applySettings).
 */
export const A11Y_INIT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(!r)return;var s=JSON.parse(r);if(!s||typeof s!=="object")return;var d=document.documentElement;var t=s.text;if(typeof t==="number"&&t%1===0&&t>0)d.setAttribute(${JSON.stringify(TEXT_ATTR)},String(Math.min(t,${MAX_TEXT_STEP})));var a=${JSON.stringify(TOGGLE_ATTRS)};for(var k in a){if(s[k]===true)d.setAttribute(a[k],"")}}catch(e){}})()`;
