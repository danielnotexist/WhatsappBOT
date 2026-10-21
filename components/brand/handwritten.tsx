import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  sage: "text-sage",
  honey: "text-honey",
  ink: "text-ink-muted",
  inherit: "",
} as const;

/**
 * The one handwritten line above a headline (Gveret Levin), slightly turned like a note on paper.
 * Rendered as a <p> by default; it is real text (not an image), so screen readers read it in order.
 */
export function Handwritten({
  children,
  tone = "sage",
  as: Tag = "p",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  as?: ElementType;
  className?: string;
}) {
  return <Tag className={cn("inline-block -rotate-2 font-hand text-hand", tones[tone], className)}>{children}</Tag>;
}
