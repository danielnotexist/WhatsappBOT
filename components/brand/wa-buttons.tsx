"use client";

import { cn } from "@/lib/utils";

/**
 * WhatsApp reply buttons under a message (שלח / ערוך / בטל). Once one is chosen the group locks,
 * like the real thing. `label` names the group for screen readers.
 */
export function WaButtons({
  labels,
  chosen,
  onChoose,
  label = "אישור הטיוטה",
  className,
}: {
  labels: readonly string[];
  chosen?: string | null;
  onChoose?: (label: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("grid w-[86%] self-start overflow-hidden rounded-xl bg-[var(--wa-in)] shadow-[0_1px_0.5px_rgb(0_0_0/0.25)]", className)}>
      {labels.map((l) => (
        <button
          key={l}
          type="button"
          disabled={Boolean(chosen) || !onChoose}
          aria-pressed={chosen === l}
          onClick={() => onChoose?.(l)}
          className={cn(
            "border-t border-white/10 px-3 py-2.5 text-[0.9375rem] font-semibold text-[var(--wa-link)] first:border-t-0 focus-visible:-outline-offset-3 enabled:hover:bg-white/5",
            chosen && chosen !== l && "opacity-45",
            chosen === l && "font-extrabold",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
