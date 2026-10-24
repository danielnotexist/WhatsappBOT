import { Cta } from "@/components/brand/cta";
import { BRAND } from "@/lib/brand";
import type { SupportTicketRow } from "@/lib/db/types";
import { TICKET_STATUS_LABEL, formatAgo, formatDateTime } from "@/lib/admin/view";
import { isSystemRequest } from "@/lib/support/types";
import { setTicketStatusAction } from "../actions";
import { Ltr, Pill, Turns, UserLink } from "./parts";

const TONE = { open: "warn", in_progress: "ok", closed: "off" } as const;

/** One ticket: who, what, the chat that came with it, and the status with a note (the owner's, never sent). */
export function TicketCard({ ticket, back, now, showUser = true }: { ticket: SupportTicketRow; back: string; now: Date; showUser?: boolean }) {
  const request = isSystemRequest(ticket.subject);
  return (
    <article aria-labelledby={`t-${ticket.id}`} className="rounded-2xl border border-line bg-night-2/50 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 id={`t-${ticket.id}`} className="text-[1.0625rem] leading-snug font-semibold">
            {ticket.subject || "(בלי נושא)"}
          </h3>
          <p className="mt-1 text-[0.875rem] text-cream-muted">
            {ticket.name}, <Ltr>{ticket.email}</Ltr>
            {showUser ? (
              <>
                {", "}
                {ticket.user_id ? <UserLink id={ticket.user_id}>לדף המשתמש</UserLink> : "לא מחובר"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <Pill tone={TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Pill>
          <span className="text-[0.8125rem] text-cream-muted" title={formatDateTime(ticket.created_at)}>
            {request ? "בקשת מערכת, " : ""}
            {formatAgo(ticket.created_at, now)}
          </span>
        </div>
      </header>
      <p className="mt-4 max-w-[48rem] text-[0.9375rem] leading-relaxed whitespace-pre-line text-cream">{ticket.body}</p>
      {ticket.transcript?.length ? (
        <details className="mt-4">
          <summary className="inline-flex min-h-9 cursor-pointer items-center text-[0.875rem] text-honey underline-offset-4 hover:underline">
            השיחה שצורפה ({ticket.transcript.length} הודעות)
          </summary>
          <div className="mt-3 max-w-[40rem]">
            <Turns turns={ticket.transcript} assistantName={BRAND.name} />
          </div>
        </details>
      ) : null}
      <form action={setTicketStatusAction} className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="id" value={ticket.id} />
        <input type="hidden" name="back" value={back} />
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          סטטוס
          <select name="status" aria-label="סטטוס" defaultValue={ticket.status} className="h-11 rounded-field border border-line bg-night px-3 text-[0.9375rem] text-cream">
            {(["open", "in_progress", "closed"] as const).map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          הערה (לא נשלחת לפונה)
          <input name="note" aria-label="הערה (לא נשלחת לפונה)" defaultValue={ticket.admin_note ?? ""} maxLength={2000} className="h-11 rounded-field border border-line bg-night px-3 text-[0.9375rem] text-cream" />
        </label>
        <Cta type="submit" tone="ghost" size="sm">
          שמירה
        </Cta>
      </form>
    </article>
  );
}
