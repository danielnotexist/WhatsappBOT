"use client";

import { Mic, MousePointerClick, Search } from "lucide-react";
import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { CHAT_FILTERS, filterMessages, highlightParts, toolLabel, type ChatFilter, type ChatMessage } from "@/lib/admin/conversation";
import { clockOf, groupByDay } from "@/lib/admin/days";
import { formatInt, formatUsd } from "@/lib/admin/view";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { olderMessagesAction } from "../actions";

/**
 * The WhatsApp conversation, as WhatsApp's dark theme shows it, in a pane that scrolls inside itself and opens at the
 * newest message. עלזה at the inline start (right), the customer at the end — the panel's convention. Search marks and
 * filters what is loaded; "טעינת הודעות קודמות" pages back through the server (olderMessagesAction).
 */
export function ConversationReader({ userId, initial, more: initialMore, now, tz }: { userId: string; initial: ChatMessage[]; more: boolean; now: string; tz: string }) {
  const [messages, setMessages] = useState(initial);
  const [more, setMore] = useState(initialMore);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  /** distance from the content's bottom before older messages were put on top — kept, so the view does not jump */
  const keep = useRef<number | null>(null);
  const searchId = useId();

  const shown = useMemo(() => filterMessages(messages, { filter, q: query }), [messages, filter, query]);
  const days = useMemo(() => groupByDay(shown, (m) => m.at, new Date(now), tz), [shown, now, tz]);
  const narrowed = filter !== "all" || query.trim() !== "";

  // open at the newest message, and again whenever the filter or the search changes
  useLayoutEffect(() => {
    const el = pane.current;
    if (el && keep.current === null) el.scrollTop = el.scrollHeight;
  }, [filter, query]);

  // after loading older messages: the message that was on top stays where it was
  useLayoutEffect(() => {
    const el = pane.current;
    if (el && keep.current !== null) {
      el.scrollTop = el.scrollHeight - keep.current;
      keep.current = null;
    }
  }, [messages]);

  function loadOlder() {
    const oldest = messages[0]?.at;
    if (!oldest) return;
    const el = pane.current;
    setError(null);
    startLoading(async () => {
      try {
        const r = await olderMessagesAction(userId, oldest);
        keep.current = el ? el.scrollHeight - el.scrollTop : null;
        setMessages((prev) => [...r.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
        setMore(r.more);
      } catch {
        setError("הטעינה נכשלה. אפשר לנסות שוב.");
      }
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div role="search" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-3 pb-3">
        <label htmlFor={searchId} className="sr-only">
          חיפוש בשיחה
        </label>
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-cream-muted" />
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש בשיחה"
            autoComplete="off"
            className="h-11 w-full rounded-full border border-line bg-night-2 ps-10 pe-4 text-[0.9375rem] text-cream placeholder:text-cream-muted/80 focus-visible:border-honey/70 focus-visible:outline-none"
          />
        </div>
        <div role="group" aria-label="סינון ההודעות" className="flex flex-wrap gap-1 sm:gap-1.5">
          {CHAT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-[0.8125rem] sm:px-3.5 text-cream-muted transition-colors duration-150 hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey aria-pressed:border-[var(--wa-green)] aria-pressed:bg-[var(--wa-green)]/15 aria-pressed:text-cream"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={pane}
        role="log"
        aria-label="ההודעות"
        tabIndex={0}
        className="min-h-[22rem] min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-card border border-line bg-[var(--wa-bg)] bg-[radial-gradient(rgb(255_255_255/0.028)_1px,transparent_1.2px)] [background-size:20px_20px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey max-lg:h-[72dvh] max-lg:flex-none lg:min-h-0"
      >
        <div className="grid gap-1 px-3 pt-3 pb-5 sm:px-6">
          {more ? (
            <p className="flex flex-col items-center gap-1 pb-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loading}
                className="inline-flex min-h-9 items-center rounded-full bg-[var(--wa-chip)] px-4 text-[0.8125rem] text-[var(--wa-fg)] ring-1 ring-white/10 hover:bg-[var(--wa-head)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey disabled:opacity-60"
              >
                {loading ? "טוען…" : "טעינת הודעות קודמות"}
              </button>
              {error ? (
                <span role="alert" className="text-[0.8125rem] text-[var(--wa-red)]">
                  {error}
                </span>
              ) : null}
            </p>
          ) : messages.length ? (
            <p className="pb-2 text-center text-[0.75rem] text-[var(--wa-time)]">תחילת השיחה</p>
          ) : null}

          {days.length ? (
            days.map((d) => (
              <section key={d.key} aria-label={d.label} className="grid gap-1">
                <h2 className="sticky top-2 z-10 my-2 justify-self-center rounded-lg bg-[var(--wa-chip)]/95 px-3 py-1 text-[0.75rem] text-[var(--wa-time)] shadow-[0_1px_1px_rgb(0_0_0/0.3)]">{d.label}</h2>
                <ol className="grid gap-1.5">
                  {d.items.map((m, i) => (
                    <Bubble key={m.id} m={m} q={query} tz={tz} first={i === 0 || d.items[i - 1]!.out !== m.out} />
                  ))}
                </ol>
              </section>
            ))
          ) : (
            <p className="py-16 text-center text-[0.9375rem] text-[var(--wa-time)]">{messages.length ? "אין הודעות שמתאימות לחיפוש." : "עוד אין הודעות."}</p>
          )}
        </div>
      </div>

      <p aria-live="polite" className="flex-none pt-2 text-[0.8125rem] text-cream-muted">
        {narrowed ? `${formatInt(shown.length)} מתוך ${formatInt(messages.length)} ההודעות שנטענו` : `${formatInt(messages.length)} הודעות נטענו`}
        {more && narrowed ? ". החיפוש רק בהודעות שנטענו - אפשר לטעון קודמות." : null}
      </p>
    </div>
  );
}

const TYPE_LABEL: Partial<Record<ChatMessage["type"], string>> = { image: "תמונה", doc: "קובץ", template: "תבנית" };

function Marked({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-honey/85 px-0.5 text-night">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** One message. The tail corner only on the first of a run from the same side, like WhatsApp. */
function Bubble({ m, q, tz, first }: { m: ChatMessage; q: string; tz: string; first: boolean }) {
  const meta = m.out && (m.model || m.tools.length > 0 || (m.cost ?? 0) > 0);
  return (
    <li className={cn("flex min-w-0 flex-col", m.out ? "items-start" : "items-end", first && "mt-1.5")}>
      <div
        className={cn(
          "min-w-0 max-w-[min(88%,36rem)] rounded-xl px-3 pt-1.5 pb-1 text-[0.9375rem] leading-relaxed text-[var(--wa-fg)] shadow-[0_1px_0.5px_rgb(0_0_0/0.3)]",
          m.out ? "bg-[var(--wa-out)]" : "bg-[var(--wa-in)]",
          first && (m.out ? "rounded-ss-sm" : "rounded-se-sm"),
          m.hidden && "outline-1 outline-offset-[-1px] outline-white/25 outline-dashed",
        )}
      >
        <span className="sr-only">{m.out ? `${BRAND.name}: ` : "הלקוח: "}</span>
        {m.type === "audio" ? (
          <span className={cn("flex items-center gap-1.5 text-[0.8125rem]", m.out ? "text-[var(--wa-meta-out)]" : "text-[var(--wa-meta-in)]")}>
            <Mic aria-hidden="true" className="size-3.5" />
            הודעה קולית
          </span>
        ) : TYPE_LABEL[m.type] ? (
          <span className={cn("block text-[0.8125rem]", m.out ? "text-[var(--wa-meta-out)]" : "text-[var(--wa-meta-in)]")}>{TYPE_LABEL[m.type]}</span>
        ) : null}
        {m.text ? (
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">
            <Marked text={m.text} q={q} />
          </p>
        ) : null}
        {m.transcript ? (
          <p className="mt-0.5 border-s-2 border-white/25 ps-2 whitespace-pre-line [overflow-wrap:anywhere]">
            <span className="sr-only">תמלול: </span>
            <Marked text={m.transcript} q={q} />
          </p>
        ) : null}
        {m.type === "button" ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-0.5 text-[0.75rem] text-[var(--wa-fg)]">
            <MousePointerClick aria-hidden="true" className="size-3.5" />
            כפתורים
          </span>
        ) : null}
        <span className={cn("mt-0.5 flex items-center justify-end gap-2 text-[0.6875rem] tabular", m.out ? "text-[var(--wa-meta-out)]" : "text-[var(--wa-meta-in)]")}>
          {m.hidden ? <span>מחוץ לזיכרון</span> : null}
          <time dateTime={m.at}>{clockOf(m.at, tz)}</time>
        </span>
      </div>
      {meta ? (
        <p className="mt-1 mb-1 flex max-w-[min(88%,36rem)] flex-wrap items-center gap-1.5 px-1 text-[0.75rem] text-[var(--wa-time)]">
          {m.tools.map((t, i) => (
            <span key={`${t}-${i}`} title={t} className="rounded-full bg-[var(--wa-green)]/15 px-2 py-px text-[#7FD8C1] ring-1 ring-[var(--wa-green)]/30">
              {toolLabel(t)}
            </span>
          ))}
          {m.model ? (
            <bdi dir="ltr" className="tabular">
              {m.model}
            </bdi>
          ) : null}
          {(m.cost ?? 0) > 0 ? <span className="tabular">{formatUsd(m.cost ?? 0)}</span> : null}
        </p>
      ) : null}
    </li>
  );
}
