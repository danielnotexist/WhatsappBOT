import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { MascotAvatar } from "./mascot";

export type SnippetLine = { bold?: boolean; text: string };

/**
 * One WhatsApp message from עלזה, as a small card (no phone frame): profile photo, name, the message with WhatsApp's
 * *bold* lines, and the time. Used where a whole phone would be too much (the sign-in panel). Illustrative: exposed as
 * one figure with a caption-like label.
 */
export function ChatSnippet({ lines, time, label, className, footer }: { lines: SnippetLine[]; time: string; label: string; className?: string; footer?: ReactNode }) {
  return (
    <figure aria-label={label} className={cn("m-0 w-[19rem] max-w-full overflow-hidden rounded-[1.375rem] bg-[var(--wa-bg)] text-[var(--wa-fg)] shadow-[0_30px_60px_-28px_rgb(0_0_0/0.65)]", className)}>
      <div className="flex items-center gap-2.5 bg-[var(--wa-head)] px-3.5 py-2.5">
        <MascotAvatar sizes="32px" className="size-8 flex-none" />
        <span className="min-w-0 leading-tight">
          <b className="block text-[0.9375rem]">{BRAND.name}</b>
          <small className="block text-[0.75rem] text-[var(--wa-time)]">מחוברת</small>
        </span>
      </div>
      <div className="px-3 pt-3 pb-3.5">
        <div className="relative rounded-xl rounded-ss-[3px] bg-[var(--wa-in)] px-3 pt-2 pb-5 text-[0.8125rem] leading-[1.5]">
          {lines.map((l, i) =>
            l.text === "" ? (
              <span key={i} aria-hidden="true" className="block h-2" />
            ) : (
              <span key={i} className={cn("block", l.bold && "font-bold")}>
                {l.text}
              </span>
            ),
          )}
          <span className="absolute end-2 bottom-1 text-[0.6875rem] text-[var(--wa-meta-in)] tabular">{time}</span>
        </div>
        {footer}
      </div>
    </figure>
  );
}
