import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The admin panel's building blocks, in "לילה ירוק": quiet hairlines on the night stage, honey only where it means something. */

/** A titled part of a tab. The h2 is the landmark's name. */
export function Panel({ id, title, lead, action, className, children }: { id: string; title: string; lead?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={cn("min-w-0 scroll-mt-24", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-[1.375rem] leading-tight font-bold">
            {title}
          </h2>
          {lead ? <p className="mt-1 max-w-[40rem] text-[0.9375rem] leading-relaxed text-cream-muted">{lead}</p> : null}
        </div>
        {action ? <div className="flex-none">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A figure with its label: the overview's headline numbers (proportional figures at this size). */
export function Stat({ label, value, note, tone = "plain" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "plain" | "warn" | "error" }) {
  return (
    <div className="min-w-0 py-4">
      <dt className="text-[0.875rem] text-cream-muted">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-2">
        {tone !== "plain" ? <span aria-hidden="true" className={cn("size-2 flex-none translate-y-[-0.2em] rounded-full", tone === "warn" ? "bg-honey" : "bg-destructive")} /> : null}
        <span className="text-[1.875rem] leading-none font-semibold text-cream">{value}</span>
      </dd>
      {note ? <dd className="mt-1.5 text-[0.8125rem] text-cream-muted">{note}</dd> : null}
    </div>
  );
}

/** A table that scrolls inside itself on a narrow screen — never the page. */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey sm:mx-0 sm:px-0">
      {children}
    </div>
  );
}

export const th = "px-3 py-2.5 text-start text-[0.8125rem] font-normal whitespace-nowrap text-cream-muted first:ps-0";
export const td = "px-3 py-3 align-top first:ps-0";

/** A small state word with a dot: ok (sage), warn (honey), error, off. Never colour alone — the word says it. */
export function Pill({ tone, children }: { tone: "ok" | "warn" | "error" | "off"; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8125rem] text-cream">
      <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", tone === "ok" ? "bg-sage" : tone === "warn" ? "bg-honey" : tone === "error" ? "bg-destructive" : "border-[1.5px] border-cream-muted")} />
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[0.9375rem] text-cream-muted">{children}</p>;
}

/** The result of an action, at the top of the tab (?notice= / ?error=). */
export function Notice({ kind, text }: { kind: "notice" | "error"; text: string }) {
  const error = kind === "error";
  return (
    <p role={error ? "alert" : "status"} className={cn("mb-6 rounded-2xl border px-4 py-3 text-[0.9375rem]", error ? "border-destructive/45 bg-destructive/10" : "border-sage/35 bg-sage/10")}>
      {text}
    </p>
  );
}

export function UserLink({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <Link href={`/admin/users/${id}` as Route} className={cn("rounded-sm text-cream underline decoration-cream-muted/40 underline-offset-4 hover:decoration-honey", className)}>
      {children}
    </Link>
  );
}

/** A Latin string (an email, a number, an id) inside Hebrew text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}

/** The site's support-chat bubbles, compact: the visitor in honey at the inline end, עלזה on the night card. */
export function Turns({ turns, assistantName }: { turns: { role: "user" | "assistant"; text: string }[]; assistantName: string }) {
  return (
    <ol className="grid gap-2">
      {turns.map((t, i) => (
        <li key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
          <p
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed whitespace-pre-line",
              t.role === "user" ? "rounded-ee-md bg-honey text-night" : "rounded-es-md bg-night-2 text-cream ring-1 ring-line",
            )}
          >
            <span className="sr-only">{t.role === "user" ? "הפונה: " : `${assistantName}: `}</span>
            {t.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
