import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Up to this many messages the meter is a row of cells, one per message (the 10-message trial); above it, a bar. */
export const MAX_CELLS = 20;

export type MeterLevel = "ok" | "high" | "full";

/** ≥ 90% → high, at or over the limit → full. */
export function meterLevel(used: number, limit: number): MeterLevel {
  if (limit <= 0 || used >= limit) return "full";
  return used / limit >= 0.9 ? "high" : "ok";
}

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

/**
 * How many messages were used out of the plan's allowance (dataviz: a single ratio against a limit → a meter).
 * The track is a lighter step of the fill's own ink; the fill turns to the error colour near and at the limit; the
 * numbers are always written out, so the state never depends on colour. Surface-aware (semantic tokens): it reads on
 * the paper slip and on the dark stage alike.
 */
export function UsageMeter({
  used,
  limit,
  label,
  caption,
  className,
}: {
  used: number;
  limit: number;
  label: string;
  caption?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const safeLimit = Math.max(0, Math.floor(limit));
  const value = Math.max(0, Math.min(Math.floor(used), safeLimit));
  const level = meterLevel(value, safeLimit);
  const fill = level === "ok" ? "bg-foreground" : "bg-destructive";
  const cells = safeLimit > 0 && safeLimit <= MAX_CELLS;
  const pct = safeLimit ? (value / safeLimit) * 100 : 0;

  return (
    <div className={className} data-level={level}>
      <div className="flex items-baseline justify-between gap-4">
        <span id={`${id}-label`} className="text-[0.9375rem] font-semibold">
          {label}
        </span>
        <span className="text-[0.9375rem] text-muted-foreground">
          <b className={cn("text-[1.375rem] leading-none font-bold", level === "ok" ? "text-foreground" : "text-destructive")}>{fmt(value)}</b> מתוך {fmt(safeLimit)}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={`${id}-label`}
        aria-valuemin={0}
        aria-valuemax={safeLimit}
        aria-valuenow={value}
        aria-valuetext={`${fmt(value)} מתוך ${fmt(safeLimit)}`}
        className="mt-3"
      >
        {cells ? (
          <div className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: safeLimit }, (_, i) => (
              <span key={i} data-filled={i < value || undefined} className={cn("h-3.5 flex-1 rounded-[4px]", i < value ? fill : "bg-foreground/12")} />
            ))}
          </div>
        ) : (
          <div className="h-3 overflow-hidden rounded-full bg-foreground/12" aria-hidden="true">
            <span data-fill className={cn("block h-full rounded-full", fill)} style={{ width: value > 0 ? `max(${pct.toFixed(2)}%, 0.375rem)` : "0" }} />
          </div>
        )}
      </div>
      {caption ? <p className="mt-3 text-[0.875rem] leading-relaxed text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
