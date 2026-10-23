"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { applySettings, DEFAULT_SETTINGS, MAX_TEXT_STEP, TEXT_STEPS, type A11ySettings, type A11yToggle } from "@/lib/a11y/settings";
import { getSettings, setSettings, useA11ySettings } from "@/lib/a11y/store";
import { cn } from "@/lib/utils";

const TOGGLES: { key: A11yToggle; label: string }[] = [
  { key: "contrast", label: "ניגודיות גבוהה" },
  { key: "links", label: "הדגשת קישורים" },
  { key: "font", label: "גופן קריא" },
  { key: "motion", label: "עצירת אנימציות" },
  { key: "spacing", label: "ריווח שורות" },
];

/**
 * The accessibility menu: a small, quiet round button at the bottom of the inline end (the left side in Hebrew), and a
 * small non-modal panel above it. Every setting is a data attribute on <html> handled in app/globals.css, saved in
 * localStorage (lib/a11y). The right side is kept free for the support chat button; `--fab-bottom` (app/globals.css)
 * lifts the button over pinned bars (the "בואו נתחיל" bar on /start, the composer on /demo/chat).
 *
 * Keyboard: the panel takes focus when it opens, Esc closes it and returns focus to the button, and leaving it with Tab
 * closes it too.
 */
export function AccessibilityWidget() {
  const settings = useA11ySettings();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  // The inline script in app/layout.tsx applies the saved settings before paint. In development React's Strict Mode
  // resets <html> attributes on its remount; this puts them back before paint (a no-op in production).
  useLayoutEffect(() => {
    applySettings(getSettings());
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const update = (patch: Partial<A11ySettings>) => setSettings({ ...settings, ...patch });

  const setText = (step: number) => {
    const text = Math.min(Math.max(step, 0), MAX_TEXT_STEP);
    update({ text });
    setAnnouncement(`גודל הטקסט: ${TEXT_STEPS[text]}`);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setAnnouncement("ההגדרות אופסו");
  };

  return (
    <div
      ref={rootRef}
      data-a11y-widget=""
      className="print:hidden"
      onBlur={(e) => {
        // Tab out of the menu closes it (focus stays where it went)
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) close(false);
      }}
    >
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="fixed end-4 bottom-[calc(var(--fab-bottom)_+_3.25rem)] z-40 max-h-[calc(100dvh_-_var(--fab-bottom)_-_4.5rem)] w-[min(18.5rem,calc(100vw_-_2rem))] animate-in overflow-y-auto rounded-[1.25rem] border border-line bg-night-2 p-2 text-cream shadow-stage duration-150 fade-in-0 slide-in-from-bottom-1 focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 ps-3 pe-1 pt-1 pb-2">
            <h2 id={titleId} className="text-[1.0625rem] leading-tight">
              נגישות
            </h2>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="סגירה"
              className="grid size-9 place-items-center rounded-full text-cream-muted transition-colors hover:bg-white/5 hover:text-cream"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.125rem] fill-none stroke-current stroke-2">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <TextSize step={settings.text} onChange={setText} />

          <ul className="mt-1 border-t border-line pt-1">
            {TOGGLES.map((t) => (
              <li key={t.key}>
                <Switch label={t.label} checked={settings[t.key]} onChange={(v) => update({ [t.key]: v })} />
              </li>
            ))}
          </ul>

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-1 pt-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.9375rem] text-cream-muted transition-colors hover:bg-white/5 hover:text-cream"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2">
                <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              איפוס הגדרות
            </button>
            <Link
              href="/accessibility"
              onClick={() => setOpen(false)}
              className="rounded-full px-2.5 py-1.5 text-[0.9375rem] text-cream-muted underline underline-offset-4 transition-colors hover:text-cream"
            >
              הצהרת נגישות
            </Link>
          </div>

          {/* inside the panel, so it exists only while the menu is open (no stray status region on every page) */}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        aria-label="תפריט נגישות"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) return close(true);
          setAnnouncement("");
          setOpen(true);
        }}
        className={cn(
          "fixed end-4 bottom-[var(--fab-bottom)] z-40 grid size-10 place-items-center rounded-full border border-line bg-night-2/90 text-cream-muted shadow-[0_8px_24px_-10px_rgb(0_0_0/0.8)] backdrop-blur-sm transition-colors hover:border-cream-muted/50 hover:text-cream",
          open && "border-cream-muted/50 text-cream",
        )}
      >
        <AccessibilityGlyph className="size-[1.375rem]" />
      </button>
    </div>
  );
}

function TextSize({ step, onChange }: { step: number; onChange: (step: number) => void }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex items-center justify-between gap-2 py-1.5 ps-3 pe-1">
      <span id={labelId} className="text-[0.9375rem]">
        הגדלת טקסט
      </span>
      <span className="flex items-center gap-1">
        <StepButton label="הקטנת טקסט" disabled={step <= 0} onClick={() => onChange(step - 1)}>
          <path d="M6 12h12" strokeLinecap="round" />
        </StepButton>
        <span className="tabular w-[3.75rem] text-center text-[0.875rem] text-cream-muted" dir="ltr">
          {TEXT_STEPS[step]}
        </span>
        <StepButton label="הגדלת טקסט" disabled={step >= MAX_TEXT_STEP} onClick={() => onChange(step + 1)}>
          <path d="M6 12h12M12 6v12" strokeLinecap="round" />
        </StepButton>
      </span>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-line text-cream transition-colors enabled:hover:border-cream-muted/50 enabled:hover:bg-white/5 disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2">
        {children}
      </svg>
    </button>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl py-2 ps-3 pe-2 text-start text-[0.9375rem] transition-colors hover:bg-white/5"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-9 flex-none items-center rounded-full border p-0.5 transition-colors",
          checked ? "justify-end border-sage bg-sage" : "justify-start border-cream-muted/60 bg-transparent",
        )}
      >
        <span className={cn("size-3.5 rounded-full", checked ? "bg-night" : "bg-cream-muted")} />
      </span>
    </button>
  );
}

/** The universal access figure (our own drawing): head, open arms, body, legs. */
export function AccessibilityGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("fill-none stroke-current", className)}>
      <circle cx="12" cy="4.75" r="1.85" fill="currentColor" stroke="none" />
      <path d="M5 8.6c2.3.75 4.65 1.1 7 1.1s4.7-.35 7-1.1" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 9.8v4.4l-2.9 6.1M12 14.2l2.9 6.1" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
