"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * An accessible on/off switch (role="switch"). Off: a pale track with a white thumb at the inline start; on: the track
 * fills with ink and the thumb slides to the inline end with a small overshoot (RTL-aware, logical insets only).
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  name,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  name?: string;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-[1rem] leading-snug font-semibold">
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="text-[0.875rem] leading-snug text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-8 w-[3.25rem] flex-none cursor-pointer items-center rounded-full border-2 transition-[background-color,border-color] duration-200",
          checked ? "border-primary bg-primary" : "border-input bg-foreground/[0.07] hover:bg-foreground/[0.12]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 size-[1.375rem] -translate-y-1/2 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.28)] transition-[inset-inline-start,background-color] duration-250 ease-[cubic-bezier(0.3,1.45,0.55,1)] motion-reduce:transition-none",
            checked ? "start-[calc(100%-1.5rem)] bg-primary-foreground" : "start-[0.1875rem] bg-white",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? "1" : "0"} /> : null}
    </div>
  );
}
