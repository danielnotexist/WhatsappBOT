import { AlarmClock, Bot, CreditCard, LogIn, MessageCircle, Plug, Send, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { CATEGORY_LABEL, STATUS_LABEL, type AuditCategory, type EventStatus, type TimelineEvent } from "@/lib/admin/audit-labels";
import { clockOf } from "@/lib/admin/days";
import { formatAgo } from "@/lib/admin/view";
import { cn } from "@/lib/utils";
import { Ltr } from "./parts";

/**
 * The activity timeline's pieces (the user card's "פעילות" and /admin/users/<id>/activity): a category is an icon in
 * its own colour — from the palette we already have (WhatsApp green, the link blue, honey, sage…) — and always its
 * name for screen readers; a result is a word with a dot, never colour alone.
 */

const CATEGORY_LOOK: Record<AuditCategory, { icon: LucideIcon; color: string }> = {
  login: { icon: LogIn, color: "var(--alze-cream)" },
  whatsapp: { icon: MessageCircle, color: "var(--wa-green)" },
  connections: { icon: Plug, color: "var(--wa-link)" },
  billing: { icon: CreditCard, color: "var(--alze-honey)" },
  reminders: { icon: AlarmClock, color: "var(--alze-sage)" },
  agents: { icon: Bot, color: "var(--alze-dust)" },
  on_behalf: { icon: Send, color: "var(--alze-moss)" },
  admin: { icon: ShieldCheck, color: "var(--alze-cream-muted)" },
  errors: { icon: TriangleAlert, color: "var(--alze-error-on-dark)" },
};

export function categoryStyle(c: AuditCategory): CSSProperties {
  return { "--cat": CATEGORY_LOOK[c].color } as CSSProperties;
}

export function CategoryIcon({ category, size = "md" }: { category: AuditCategory; size?: "sm" | "md" }) {
  const Icon = CATEGORY_LOOK[category].icon;
  return (
    <span
      style={categoryStyle(category)}
      className={cn(
        "relative grid flex-none place-items-center rounded-full bg-[color-mix(in_oklab,var(--cat)_14%,var(--alze-night))] text-[var(--cat)] ring-1 ring-[color-mix(in_oklab,var(--cat)_32%,transparent)]",
        size === "sm" ? "size-7" : "size-9",
      )}
    >
      <Icon aria-hidden="true" className={size === "sm" ? "size-3.5" : "size-4"} />
      <span className="sr-only">{CATEGORY_LABEL[category]}: </span>
    </span>
  );
}

const STATUS_DOT: Record<EventStatus, string> = {
  ok: "bg-sage",
  cancelled: "border-[1.5px] border-cream-muted",
  failed: "bg-destructive",
  review: "bg-honey",
  pending: "bg-honey/60",
};

export function StatusPill({ status }: { status: EventStatus }) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.75rem] leading-5 whitespace-nowrap",
        status === "failed" ? "bg-destructive/12 text-cream" : status === "ok" ? "text-cream-muted" : "bg-cream/6 text-cream",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 flex-none rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * One event. Full: the time first (a log reads by the clock), the icon on the day's line, the words with the detail
 * and the raw reason under them, the result at the end. Compact (the user card): no clock, "לפני 3 שעות" under the words.
 */
export function EventRow({ e, tz, compact = false, now }: { e: TimelineEvent; tz: string; compact?: boolean; now?: Date }) {
  return (
    <li className={cn("grid min-w-0 items-start gap-x-3", compact ? "grid-cols-[auto_minmax(0,1fr)_auto] py-2" : "grid-cols-[2.75rem_auto_minmax(0,1fr)_auto] py-2.5")}>
      {compact ? null : (
        <time dateTime={e.at} className="pt-2 text-[0.8125rem] text-cream-muted tabular">
          {clockOf(e.at, tz)}
        </time>
      )}
      <CategoryIcon category={e.category} size={compact ? "sm" : "md"} />
      <div className={cn("min-w-0", compact ? "pt-0.5" : "pt-1.5")}>
        <p className={cn("leading-snug text-cream", compact ? "truncate text-[0.9375rem]" : "text-[1rem]")} title={e.action ?? undefined}>
          {e.label}
          {e.detail && !compact ? <span className="text-cream-muted">, {/^[\x20-\x7e]+$/.test(e.detail) ? <Ltr>{e.detail}</Ltr> : e.detail}</span> : null}
        </p>
        {compact ? (
          <p className="mt-0.5 text-[0.8125rem] text-cream-muted">
            <time dateTime={e.at}>{formatAgo(e.at, now)}</time>
          </p>
        ) : null}
        {e.reason && !compact ? (
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-cream-muted [overflow-wrap:anywhere]">
            <Ltr>{e.reason}</Ltr>
          </p>
        ) : null}
      </div>
      <div className={compact ? "pt-0.5" : "pt-1.5"}>
        <StatusPill status={e.status} />
      </div>
    </li>
  );
}
