import { cn } from "@/lib/utils";

/** what a tile or tag stands on: the night stage or the paper price sheet */
export type TileTone = "night" | "paper";

/** "בקרוב" next to a system that is not connected yet (kept apart from the marks: the chips island imports it). */
export function SoonTag({ tone = "night", className }: { tone?: TileTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center rounded-full border px-2 py-px text-[0.75rem] leading-[1.45] font-semibold",
        tone === "night" ? "border-sage/40 text-sage" : "border-ink/25 text-ink-muted",
        className,
      )}
    >
      בקרוב
    </span>
  );
}
