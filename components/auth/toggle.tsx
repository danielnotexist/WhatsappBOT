"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** An accessible on/off switch (role="switch"). The thumb moves to the inline end when on (RTL-aware). */
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
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-[1rem] font-semibold">
          {label}
        </label>
        {hint ? <span className="text-[0.875rem] text-muted-foreground">{hint}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-8 w-14 flex-none items-center rounded-full border-2 border-input transition-colors duration-200",
          checked ? "bg-primary" : "bg-transparent",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-[inset-inline-start,background-color] duration-200",
            checked ? "start-[calc(100%-1.5rem)] bg-primary-foreground" : "start-1 bg-input",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? "1" : "0"} /> : null}
    </div>
  );
}
