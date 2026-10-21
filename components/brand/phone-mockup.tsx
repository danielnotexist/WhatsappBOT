import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A phone frame (no brand device) with a screen slot. Sized by width; the screen keeps a 9:19.5 ratio.
 * `label` names the region for screen readers (e.g. "הדגמה של שיחה עם עלזה בוואטסאפ").
 */
export function PhoneMockup({
  children,
  label,
  className,
  screenClassName,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div
      role={label ? "region" : undefined}
      aria-label={label}
      className={cn(
        "relative w-[min(100%,20rem)] rounded-[2.75rem] bg-[#0A120F] p-[0.6875rem] shadow-[0_50px_100px_-40px_rgb(0_0_0/0.85),0_0_0_1px_rgb(239_233_220/0.08),inset_0_0_0_1px_rgb(239_233_220/0.05)]",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex aspect-[9/19.5] flex-col overflow-hidden rounded-[2.125rem] bg-[var(--wa-bg)] text-[var(--wa-fg)]",
          screenClassName,
        )}
      >
        {/* camera island */}
        <div aria-hidden="true" className="absolute inset-x-0 top-2 z-10 mx-auto h-[1.375rem] w-24 rounded-full bg-[#0A120F]" />
        {children}
      </div>
    </div>
  );
}
