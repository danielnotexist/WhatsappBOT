"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "מה הסוכן עושה ואיך": a textarea with a live character count against the 1,500 limit. Works without JavaScript too
 * (maxLength stops typing; the server checks again — lib/agents/service.ts).
 */
export function InstructionsField({ label, hint, defaultValue, max, required = false }: { label: string; hint: string; defaultValue: string; max: number; required?: boolean }) {
  const id = useId();
  const hintId = useId();
  const [count, setCount] = useState([...defaultValue].length);
  const near = count > max * 0.9;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name="instructions"
        defaultValue={defaultValue}
        maxLength={max}
        required={required}
        rows={6}
        dir="auto"
        aria-describedby={hintId}
        onChange={(e) => setCount([...e.target.value].length)}
        className="min-h-36 w-full resize-y rounded-field border-2 border-cream-muted/60 bg-night px-4 py-3 text-[1rem] leading-relaxed text-cream transition-[border-color,box-shadow] duration-150 focus-visible:border-honey focus-visible:shadow-[0_0_0_4px_rgb(231_182_92/0.18)] focus-visible:outline-none"
      />
      <p id={hintId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.875rem] text-cream-muted">
        <span>{hint}</span>
        <span className={cn("tabular whitespace-nowrap", near && "text-honey")}>
          {count.toLocaleString("he-IL")} מתוך {max.toLocaleString("he-IL")}
        </span>
      </p>
    </div>
  );
}
