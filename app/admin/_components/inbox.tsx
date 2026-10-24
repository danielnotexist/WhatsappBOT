import Link from "next/link";
import type { Route } from "next";
import { Cta } from "@/components/brand/cta";
import { BRAND } from "@/lib/brand";
import { TICKET_STATUS_LABEL, formatAgo, formatDateTime, formatInt, pagePlace } from "@/lib/admin/view";
import type { AppErrorRow, SupportChatRow, SupportTicketRow, SupportTicketStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { tabHref } from "../tabs";
import { Empty, Ltr, Panel, TableWrap, Turns, UserLink, td, th } from "./parts";
import { TicketCard } from "./ticket-card";

// ---------- פניות ----------

export function TicketsTab({ tickets, status, now }: { tickets: SupportTicketRow[]; status: SupportTicketStatus | null; now: Date }) {
  const back = tabHref("tickets", { status: status ?? undefined });
  const filters: { id: SupportTicketStatus | null; label: string }[] = [{ id: null, label: "הכול" }, ...(["open", "in_progress", "closed"] as const).map((s) => ({ id: s, label: TICKET_STATUS_LABEL[s] }))];
  return (
    <Panel id="tickets" title="פניות" lead="כל הפניות מהאתר, כולל בקשות מערכת, עם השיחה שצורפה. הסטטוס וההערה נשמרים כאן בלבד.">
      <nav aria-label="סינון לפי סטטוס" className="mb-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={tabHref("tickets", { status: f.id ?? undefined }) as Route}
            aria-current={status === f.id ? "page" : undefined}
            className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.875rem] text-cream-muted hover:text-cream aria-[current=page]:border-honey/60 aria-[current=page]:text-cream"
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {tickets.length ? (
        <div className="grid gap-4">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} back={back} now={now} />
          ))}
        </div>
      ) : (
        <Empty>אין פניות כאן.</Empty>
      )}
    </Panel>
  );
}

// ---------- צ'אט באתר ----------

/** Who a user id is, for the lists (the overview's rows: name, business or email). */
export type Names = ReadonlyMap<string, string>;

export function ChatsTab({ chats, now, names }: { chats: SupportChatRow[]; now: Date; names: Names }) {
  return (
    <Panel id="chats" title="צ'אט באתר" lead={`השיחות עם ${BRAND.name} בצ'אט התמיכה באתר, מהחדשה לישנה. נמחקות אחרי 180 יום.`}>
      {chats.length ? <ChatList chats={chats} now={now} names={names} /> : <Empty>עוד אין שיחות בצ&apos;אט באתר.</Empty>}
    </Panel>
  );
}

export function ChatList({ chats, now, showUser = true, names }: { chats: SupportChatRow[]; now: Date; showUser?: boolean; names?: Names }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {chats.map((c) => {
        const first = c.turns.find((t) => t.role === "user")?.text ?? "(בלי שאלה)";
        return (
          <li key={c.id}>
            <details className="group py-4">
              <summary className="grid cursor-pointer list-none gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block truncate text-[1rem] font-semibold text-cream group-open:whitespace-normal">{first}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-cream-muted">
                    {formatInt(c.turns.length)} הודעות
                    {c.page ? (
                      <>
                        {", "}
                        {pagePlace(c.page) ?? (
                          <>
                            בדף <Ltr>{c.page}</Ltr>
                          </>
                        )}
                      </>
                    ) : null}
                    {showUser ? (c.user_id ? `, ${names?.get(c.user_id) ?? "משתמש רשום"}` : ", אורח לא מחובר") : null}
                  </span>
                </span>
                <span className="text-[0.8125rem] text-cream-muted sm:text-end" title={formatDateTime(c.updated_at)}>
                  {formatAgo(c.updated_at, now)}
                </span>
              </summary>
              <div className="mt-4 grid max-w-[44rem] gap-3">
                {showUser && c.user_id ? (
                  <p className="text-[0.875rem]">
                    <UserLink id={c.user_id}>לדף המשתמש {names?.get(c.user_id) ?? ""}</UserLink>
                  </p>
                ) : null}
                <Turns turns={c.turns} assistantName={BRAND.name} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- תקלות ----------

export function ErrorsTab({ errors, sources, source, userId, now, names }: { errors: AppErrorRow[]; sources: string[]; source: string | null; userId: string | null; now: Date; names: Names }) {
  return (
    <Panel id="errors" title="תקלות" lead="יומן התקלות של השרת, בלי טוקנים וסיסמאות. נמחק אחרי 90 יום.">
      <form method="get" action="/admin" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="errors" />
        {userId ? <input type="hidden" name="user" value={userId} /> : null}
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          מקור
          <select name="source" defaultValue={source ?? ""} className="h-11 min-w-[12rem] rounded-field border border-line bg-night px-3 text-[0.9375rem] text-cream">
            <option value="">הכול</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Cta type="submit" tone="ghost" size="sm">
          סינון
        </Cta>
        {userId ? (
          <p className="text-[0.875rem] text-cream-muted">
            של <UserLink id={userId}>{names.get(userId) ?? "משתמש אחד"}</UserLink>.{" "}
            <Link href={tabHref("errors", { source: source ?? undefined }) as Route} className="underline underline-offset-4 hover:text-cream">
              כל המשתמשים
            </Link>
          </p>
        ) : null}
      </form>
      {errors.length ? <ErrorTable errors={errors} now={now} names={names} /> : <Empty>אין תקלות כאן.</Empty>}
    </Panel>
  );
}

export function ErrorTable({ errors, now, showUser = true, names }: { errors: AppErrorRow[]; now: Date; showUser?: boolean; names?: Names }) {
  return (
    <TableWrap label="טבלת התקלות">
      <table className="w-full min-w-[48rem] border-y border-line text-[0.9375rem]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              מתי
            </th>
            <th scope="col" className={th}>
              מקור
            </th>
            <th scope="col" className={th}>
              הודעה
            </th>
            {showUser ? (
              <th scope="col" className={th}>
                משתמש
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {errors.map((e) => {
            const ctx = Object.entries(e.context ?? {});
            return (
              <tr key={e.id}>
                <td className={cn(td, "whitespace-nowrap text-cream-muted")} title={formatDateTime(e.at)}>
                  {formatAgo(e.at, now)}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <Ltr>{e.source}</Ltr>
                </td>
                <td className={td}>
                  <span dir="ltr" className="block text-end break-words">
                    {e.message}
                  </span>
                  {ctx.length ? (
                    <span dir="ltr" className="mt-1 block text-end text-[0.8125rem] break-all text-cream-muted">
                      {ctx.map(([k, v]) => `${k}=${String(v)}`).join("  ")}
                    </span>
                  ) : null}
                </td>
                {showUser ? <td className={td}>{e.user_id ? <UserLink id={e.user_id}>{names?.get(e.user_id) ?? "לדף המשתמש"}</UserLink> : <span className="text-cream-muted">אין</span>}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
