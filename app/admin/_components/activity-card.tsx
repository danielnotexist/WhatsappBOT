import { SquareArrowOutUpLeft } from "lucide-react";
import { Cta } from "@/components/brand/cta";
import { CATEGORY_LABEL, CATEGORY_ORDER, categoryCounts, type TimelineEvent } from "@/lib/admin/audit-labels";
import type { ChatMessage } from "@/lib/admin/conversation";
import { clockOf, dayChipLabel, dayKeyOf } from "@/lib/admin/days";
import { ADMIN_TZ, formatAgo, formatInt, formatUsd } from "@/lib/admin/view";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { CategoryIcon, EventRow, categoryStyle } from "./activity-parts";
import { Empty, Panel } from "./parts";

const TIMELINE_PREVIEW = 5;
const MONTH_MS = 30 * 86_400_000;

/**
 * "פעילות" on the user's card: the conversation and the timeline in a few lines each, and the way to both in full —
 * each opens in its own tab (the card stays where it was). Messages arrive newest first.
 */
export function ActivityCard({ userId, messages, inbound30d, cost30d, timeline, now }: { userId: string; messages: ChatMessage[]; inbound30d: number; cost30d: number; timeline: TimelineEvent[]; now: Date }) {
  const last = messages[0];
  const recent = timeline.filter((e) => now.getTime() - Date.parse(e.at) <= MONTH_MS);
  const counts = categoryCounts(recent);
  const tz = ADMIN_TZ;
  return (
    <Panel id="activity" title="פעילות" lead="השיחה בוואטסאפ וציר הפעולות, בקצרה. המלאים נפתחים בחלון חדש." className="mt-16">
      <div className="grid min-w-0 overflow-hidden rounded-card border border-line bg-night-2/40 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="activity-chat-title" className="flex min-w-0 flex-col gap-5 p-5 sm:p-6 lg:border-e lg:border-line">
          <h3 id="activity-chat-title" className="text-[1.0625rem] font-semibold text-cream">
            השיחה בוואטסאפ
          </h3>
          {messages.length ? (
            <ol aria-label="ההודעות האחרונות" className="grid min-w-0 flex-1 content-end gap-1.5 rounded-2xl bg-[var(--wa-bg)] p-3 ring-1 ring-line">
              {messages
                .slice()
                .reverse()
                .map((m) => (
                  <li key={m.id} className={cn("flex min-w-0 items-center gap-2", m.out ? "justify-start" : "flex-row-reverse justify-start")}>
                    <p className={cn("min-w-0 max-w-[82%] truncate rounded-lg px-2.5 py-1 text-[0.875rem] text-[var(--wa-fg)]", m.out ? "bg-[var(--wa-out)]" : "bg-[var(--wa-in)]")}>
                      <span className="sr-only">{m.out ? `${BRAND.name}: ` : "הלקוח: "}</span>
                      {m.type === "audio" ? <span className="text-[var(--wa-meta-in)]">קולית: </span> : null}
                      {m.text || m.transcript || (m.type === "audio" ? "הודעה קולית" : "בלי טקסט")}
                    </p>
                    <time dateTime={m.at} className="flex-none text-[0.6875rem] text-[var(--wa-time)] tabular">
                      {dayKeyOf(m.at, tz) === dayKeyOf(now.toISOString(), tz) ? clockOf(m.at, tz) : dayChipLabel(dayKeyOf(m.at, tz), now, tz)}
                    </time>
                  </li>
                ))}
            </ol>
          ) : (
            <Empty>עוד אין הודעות.</Empty>
          )}
          <dl className="grid grid-cols-3 gap-3 border-y border-line py-3">
            <Figure label="נכנסות ב-30 יום" value={formatInt(inbound30d)} />
            <Figure label="ההודעה האחרונה" value={last ? formatAgo(last.at, now) : "-"} />
            <Figure label="עלות AI ב-30 יום" value={formatUsd(cost30d)} />
          </dl>
          <div className="mt-auto">
            <Cta tone="honey" size="sm" href={`/admin/users/${userId}/conversation`} external>
              פתיחת השיחה המלאה
              <SquareArrowOutUpLeft aria-hidden="true" className="size-4 ltr:-scale-x-100" />
              <span className="sr-only">(בחלון חדש)</span>
            </Cta>
          </div>
        </section>

        <section aria-labelledby="activity-timeline-title" className="flex min-w-0 flex-col gap-5 border-t border-line p-5 sm:p-6 lg:border-t-0">
          <h3 id="activity-timeline-title" className="text-[1.0625rem] font-semibold text-cream">
            ציר הפעולות
          </h3>
          {timeline.length ? (
            <ol aria-label="הפעולות האחרונות" className="-my-2 grid min-w-0">
              {timeline.slice(0, TIMELINE_PREVIEW).map((e) => (
                <EventRow key={e.id} e={e} tz={tz} now={now} compact />
              ))}
            </ol>
          ) : (
            <Empty>אין פעולות ביומן.</Empty>
          )}
          <div className="border-y border-line py-3">
            <p className="text-[0.8125rem] text-cream-muted">ב-30 הימים האחרונים</p>
            {recent.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => (
                  <li key={c} style={categoryStyle(c)} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 ps-0.5 pe-2.5 text-[0.8125rem] text-cream">
                    <CategoryIcon category={c} size="sm" />
                    <span aria-hidden="true">{CATEGORY_LABEL[c]}</span>
                    <span className="text-cream-muted tabular">{formatInt(counts[c])}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[0.875rem] text-cream-muted">לא היו פעולות.</p>
            )}
          </div>
          <div className="mt-auto">
            <Cta tone="ghost" size="sm" href={`/admin/users/${userId}/activity`} external>
              ציר הפעולות המלא
              <SquareArrowOutUpLeft aria-hidden="true" className="size-4 ltr:-scale-x-100" />
              <span className="sr-only">(בחלון חדש)</span>
            </Cta>
          </div>
        </section>
      </div>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.75rem] leading-snug text-cream-muted">{label}</dt>
      <dd className="mt-1 truncate text-[1.0625rem] leading-tight text-cream tabular">{value}</dd>
    </div>
  );
}
