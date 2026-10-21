import type { ReactNode } from "react";
import { Handwritten } from "@/components/brand/handwritten";
import { cn } from "@/lib/utils";

/**
 * The handwritten line + the serif headline that open every step ("קודם כל" / "מה המייל שלך?").
 * `light` marks the word set in the light weight (honey on dark, ink on paper).
 */
export function StepHeading({
  tag,
  title,
  light,
  after,
  onDark = false,
  className,
  size = "title",
}: {
  tag: string;
  title: ReactNode;
  light?: string;
  after?: ReactNode;
  onDark?: boolean;
  className?: string;
  size?: "title" | "hero";
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Handwritten tone={onDark ? "sage" : "ink"} className="self-start">
        {tag}
      </Handwritten>
      <h1 className={cn("font-bold", size === "hero" ? "text-hero" : "text-title")}>
        {title}
        {light ? <span className="headline-light">{light}</span> : null}
        {after}
      </h1>
    </div>
  );
}
