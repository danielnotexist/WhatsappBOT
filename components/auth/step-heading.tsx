import type { ReactNode } from "react";
import { Handwritten } from "@/components/brand/handwritten";
import { cn } from "@/lib/utils";

/**
 * The handwritten line + the serif headline that open every step ("קודם כל" / "מה המייל שלך?").
 * On wide screens the heading sits on the dark stage (StepAside), so the handwritten line turns sage there.
 * `light` sets one word in the light weight — kept for the two moments that carry it (/start and the ready step).
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
    <div className={cn("flex flex-col gap-2.5", className)}>
      <Handwritten tone={onDark ? "sage" : "ink"} className={cn("self-start", !onDark && "lg:text-sage")}>
        {tag}
      </Handwritten>
      <h1
        className={cn(
          "font-bold",
          size === "hero" ? "text-hero leading-[1.04]" : "text-title leading-[1.12] lg:text-[clamp(2.75rem,1.2rem+2.6vw,3.75rem)] lg:leading-[1.06]",
        )}
      >
        {title}
        {light ? <span className="headline-light">{light}</span> : null}
        {after}
      </h1>
    </div>
  );
}
