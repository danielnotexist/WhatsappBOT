import { cn } from "@/lib/utils";

/** "עלזה מקלידה…" — three dots in an incoming bubble. The CSS animation stops under reduced motion (globals.css). */
export function TypingDots({ className, label = "עלזה מקלידה" }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex gap-1 self-start rounded-xl rounded-ss-[3px] bg-[var(--wa-in)] px-3 py-3", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[0.4375rem] animate-bounce rounded-full bg-[var(--wa-time)]"
          style={{ animationDelay: `${i * 160}ms`, animationDuration: "1.1s" }}
        />
      ))}
    </div>
  );
}
