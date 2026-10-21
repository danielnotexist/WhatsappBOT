import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BubbleSide = "in" | "out";

/**
 * A WhatsApp message bubble. "out" = the user (green, end side), "in" = עלזה (start side).
 * In RTL the user's messages sit on the left, as in a Hebrew WhatsApp.
 */
export function Bubble({
  side,
  time,
  children,
  reaction,
  label,
  className,
}: {
  side: BubbleSide;
  time?: string;
  children: ReactNode;
  /** a reaction under the bubble (✅ — עלזה's "got it") */
  reaction?: string;
  /** accessible text when the visible content is not text (voice note) */
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        "relative max-w-[86%] rounded-xl px-2.5 pt-1.5 pb-5 text-[0.875rem] leading-[1.45] break-words whitespace-pre-line shadow-[0_1px_0.5px_rgb(0_0_0/0.25)]",
        side === "in" ? "self-start rounded-ss-[3px] bg-[var(--wa-in)]" : "self-end rounded-se-[3px] bg-[var(--wa-out)]",
        reaction && "mb-3",
        className,
      )}
    >
      {children}
      {time ? (
        <span className="absolute end-2 bottom-1 inline-flex items-center gap-1 text-[0.6875rem] text-[var(--wa-time)] tabular">
          {time}
          {side === "out" ? (
            <span aria-hidden="true" className="text-[var(--wa-link)]">
              ✓✓
            </span>
          ) : null}
        </span>
      ) : null}
      {reaction ? (
        <span aria-hidden="true" className="absolute -bottom-3.5 start-2 rounded-full bg-[var(--wa-in)] px-1.5 text-[0.75rem] leading-6 shadow-[0_1px_2px_rgb(0_0_0/0.35)]">
          {reaction}
        </span>
      ) : null}
    </div>
  );
}
