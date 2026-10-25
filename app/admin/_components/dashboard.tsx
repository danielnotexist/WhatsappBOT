import Link from "next/link";
import type { Route } from "next";
import { Cta } from "@/components/brand/cta";
import { sourceLabel } from "@/lib/admin/source";
import {
  ONBOARDING_LABEL,
  PLAN_LABEL,
  PROBLEM_LABEL,
  REFERRAL_STATUS_LABEL,
  STAGE_LABEL,
  SUB_STATUS_LABEL,
  USER_SORT_LABEL,
  filterUsers,
  formatAgo,
  formatDate,
  formatInt,
  formatIls,
  formatPhoneIl,
  formatUsd,
  funnel,
  planSplit,
  problemsOf,
  referralTotals,
  sourceSplit,
  stageOf,
  type HelpItem,
  type Kpis,
  type UserQuery,
} from "@/lib/admin/view";
import type { AdminDailyRow, AdminReferralRow, AdminUserRow } from "@/lib/db/types";
import { tabHref } from "../tabs";
import { DailyColumns, ShareBars } from "./charts";
import { Empty, Ltr, Panel, Pill, Stat, TableWrap, UserLink, td, th } from "./parts";

// ---------- סקירה ----------

export function OverviewTab({
  k,
  daily,
  rows,
  openTickets,
  errors24h,
  budgetUsd,
  referrals = [],
}: {
  k: Kpis;
  daily: AdminDailyRow[];
  rows: AdminUserRow[];
  openTickets: number;
  errors24h: number;
  budgetUsd: number | null;
  /** the latest referrals ("חבר מביא חבר", newest first) */
  referrals?: AdminReferralRow[];
}) {
  const rt = referralTotals(referrals);
  const sum = (f: (d: AdminDailyRow) => number) => daily.reduce((s, d) => s + f(d), 0);
  const f = funnel(rows);
  return (
    <div className="grid gap-14">
      <section aria-label="מספרים מרכזיים">
        <dl className="grid grid-cols-2 gap-x-6 border-y border-line py-2 sm:grid-cols-3 sm:gap-x-10 lg:grid-cols-6">
          <Stat label="משתמשים" value={formatInt(k.users)} note={k.newThisWeek ? `${formatInt(k.newThisWeek)} חדשים השבוע` : "אין חדשים השבוע"} />
          <Stat label="פעילים היום" value={formatInt(k.activeToday)} note={`${formatInt(k.activeWeek)} נראו השבוע`} />
          <Stat label="הכנסה חודשית קבועה" value={formatIls(k.mrrIls)} note={`${formatInt(k.paying)} מנויים משלמים`} />
          <Stat
            label="עלות AI היום"
            value={formatUsd(k.aiToday)}
            tone={budgetUsd !== null && k.aiToday >= budgetUsd * 0.8 ? "warn" : "plain"}
            note={`${budgetUsd !== null ? `מתוך תקרה של ${formatUsd(budgetUsd)}, ` : ""}החודש ${formatUsd(k.aiMonth)}`}
          />
          <Stat label="פניות פתוחות" value={formatInt(openTickets)} tone={openTickets ? "warn" : "plain"} note={<Link href={tabHref("tickets", { status: "open" }) as Route} className="underline underline-offset-4 hover:text-cream">לפניות</Link>} />
          <Stat label="תקלות ב-24 שעות" value={formatInt(errors24h)} tone={errors24h ? "error" : "plain"} note={<Link href={tabHref("errors") as Route} className="underline underline-offset-4 hover:text-cream">ליומן התקלות</Link>} />
        </dl>
      </section>

      <Panel id="days" title="30 הימים האחרונים" lead="לפי יום, בשעון ישראל. היום הוא העמודה האחרונה.">
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-3">
          <DailyColumns title="הרשמות" total={formatInt(sum((d) => d.signups))} rows={daily.map((d) => ({ day: d.day, value: d.signups }))} />
          <DailyColumns title="הודעות נכנסות" total={formatInt(sum((d) => d.messages))} rows={daily.map((d) => ({ day: d.day, value: d.messages }))} />
          <DailyColumns title="עלות AI" total={formatUsd(sum((d) => d.ai_cost))} rows={daily.map((d) => ({ day: d.day, value: d.ai_cost }))} format="usd" />
        </div>
      </Panel>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-3">
        <Panel id="funnel" title="מהרשמה לתשלום" lead="כמה משתמשים הגיעו לכל שלב.">
          <ShareBars title="משתמשים לפי השלב הרחוק ביותר" rows={f} of={f[0]?.count ?? 0} />
        </Panel>
        <Panel id="plans" title="לפי תוכנית">
          <ShareBars title="משתמשים בכל תוכנית" rows={planSplit(rows)} />
        </Panel>
        <Panel id="sources" title="מאיפה הגיעו">
          <ShareBars title="מקור ההרשמה (utm_source, האתר המפנה, או הפניה של חבר)" rows={sourceSplit(rows)} />
        </Panel>
      </div>

      <Panel id="referrals" title="חבר מביא חבר" lead="הפניות דרך הקישור האישי: מי נרשם, מי שילם, וכמה חודשים חינם ניתנו לשני הצדדים.">
        <dl className="grid grid-cols-2 gap-x-6 border-y border-line py-2 sm:grid-cols-4 sm:gap-x-10">
          <Stat label="נרשמו דרך הפניה" value={formatInt(rt.joined)} note={rt.pending ? `${formatInt(rt.pending)} עוד לא שילמו` : "כולם שילמו או נדחו"} />
          <Stat label="שילמו" value={formatInt(rt.rewarded)} />
          <Stat label="חודשים חינם" value={formatInt(rt.months)} note="לחבר ולמי שהביא אותו" />
          <Stat label="נדחו" value={formatInt(rt.rejected)} tone={rt.rejected ? "warn" : "plain"} note="הפניה עצמית" />
        </dl>
        {referrals.length ? (
          <TableWrap label="ההפניות האחרונות">
            <table className="w-full text-[0.9375rem]">
              <thead>
                <tr>
                  <th className={th}>מי הביא</th>
                  <th className={th}>מי הצטרף</th>
                  <th className={th}>מצב</th>
                  <th className={th}>נרשם</th>
                </tr>
              </thead>
              <tbody>
                {referrals.slice(0, 8).map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className={td}>
                      <UserLink id={r.referrer_id}>
                        <Ltr>{r.referrer_email ?? r.referrer_id}</Ltr>
                      </UserLink>
                    </td>
                    <td className={td}>
                      <UserLink id={r.referred_user_id}>
                        <Ltr>{r.referred_email ?? r.referred_user_id}</Ltr>
                      </UserLink>
                    </td>
                    <td className={td}>
                      <Pill tone={r.status === "rewarded" ? "ok" : r.status === "rejected" ? "error" : "off"}>{REFERRAL_STATUS_LABEL[r.status]}</Pill>
                    </td>
                    <td className={td}>{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <Empty>עוד אין הפניות.</Empty>
        )}
      </Panel>
    </div>
  );
}

// ---------- משתמשים ----------

const field = "h-11 rounded-field border border-line bg-night px-3 text-[0.9375rem] text-cream";

export function UsersTab({ rows, query, now }: { rows: AdminUserRow[]; query: UserQuery; now: Date }) {
  const { rows: page, total, page: n, pages } = filterUsers(rows, query, now);
  const params = (p: number) => ({ q: query.q, plan: query.plan, status: query.status, problem: query.problem, sort: query.sort, page: p > 1 ? String(p) : undefined });
  return (
    <Panel id="users" title="משתמשים" lead={`${formatInt(total)} מתוך ${formatInt(rows.length)}. חיפוש לפי מייל, טלפון או שם עסק.`}>
      <form method="get" action="/admin" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <input type="hidden" name="tab" value="users" />
        <label className="col-span-2 grid gap-1.5 text-[0.8125rem] text-cream-muted lg:col-span-1">
          חיפוש
          <input type="search" name="q" defaultValue={query.q ?? ""} placeholder="מייל, טלפון או שם עסק" className={field} />
        </label>
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          תוכנית
          <select name="plan" defaultValue={query.plan ?? ""} className={field}>
            <option value="">הכול</option>
            {(["trial", "basic", "pro"] as const).map((p) => (
              <option key={p} value={p}>
                {PLAN_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          סטטוס מנוי
          <select name="status" defaultValue={query.status ?? ""} className={field}>
            <option value="">הכול</option>
            <option value="none">בלי מנוי</option>
            {(["active", "past_due", "cancelled"] as const).map((s) => (
              <option key={s} value={s}>
                {SUB_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          צריך עזרה
          <select name="problem" defaultValue={query.problem ?? ""} className={field}>
            <option value="">הכול</option>
            {Object.entries(PROBLEM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
          מיון
          <select name="sort" defaultValue={query.sort ?? "created"} className={field}>
            {Object.entries(USER_SORT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Cta type="submit" tone="ghost" size="sm" className="col-span-2 lg:col-span-1">
          הצגה
        </Cta>
      </form>

      {page.length ? (
        <TableWrap label="טבלת המשתמשים">
          <table className="w-full min-w-[66rem] border-y border-line text-[0.9375rem]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={`${th} w-[17rem]`}>
                  משתמש
                </th>
                <th scope="col" className={th}>
                  תוכנית
                </th>
                <th scope="col" className={th}>
                  הודעות בתקופה
                </th>
                <th scope="col" className={th}>
                  נראה לאחרונה
                </th>
                <th scope="col" className={th}>
                  חיבורים
                </th>
                <th scope="col" className={th}>
                  עלות AI ב-30 יום
                </th>
                <th scope="col" className={th}>
                  תקלות ב-7 ימים
                </th>
                <th scope="col" className={th}>
                  שלב
                </th>
                <th scope="col" className={th}>
                  מקור
                </th>
                <th scope="col" className={th}>
                  נרשם
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {page.map((u) => {
                const problems = problemsOf(u, now);
                return (
                  <tr key={u.id} className="hover:bg-cream/[0.025]">
                    <td className={td}>
                      <UserLink id={u.id} className="font-semibold">
                        {u.name || u.business_name || <Ltr>{u.email}</Ltr>}
                      </UserLink>
                      {u.name || u.business_name ? <Ltr className="mt-0.5 block text-[0.8125rem] whitespace-nowrap text-cream-muted">{u.email}</Ltr> : null}
                      {u.phone ? <Ltr className="block text-[0.8125rem] whitespace-nowrap text-cream-muted">{formatPhoneIl(u.phone)}</Ltr> : null}
                      {problems.length ? (
                        <span className="mt-1 flex flex-wrap gap-x-3">
                          {problems.map((p) => (
                            <Pill key={p} tone={p === "billing" || p === "errors" ? "error" : "warn"}>
                              {PROBLEM_LABEL[p]}
                            </Pill>
                          ))}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {PLAN_LABEL[u.plan]}
                      {u.sub_status && u.sub_status !== "active" && u.sub_status !== "trial" ? <span className="block text-[0.8125rem] text-cream-muted">{SUB_STATUS_LABEL[u.sub_status]}</span> : null}
                    </td>
                    <td className={`${td} tabular`}>{u.usage_limit ? `${formatInt(u.usage_used ?? 0)} / ${formatInt(u.usage_limit)}` : "0"}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatAgo(u.last_seen_at, now)}</td>
                    <td className={td}>
                      {u.connections_active || u.connections_broken ? (
                        <span className="grid gap-0.5">
                          {u.connections_active ? <Pill tone="ok">{u.providers.map((p) => (p === "google" ? "Google" : "Microsoft")).join(", ") || `${u.connections_active} פעילים`}</Pill> : null}
                          {u.connections_broken ? <Pill tone="error">{u.connections_broken === 1 ? "חיבור פגום" : `${formatInt(u.connections_broken)} פגומים`}</Pill> : null}
                        </span>
                      ) : (
                        <span className="text-cream-muted">אין</span>
                      )}
                    </td>
                    <td className={`${td} tabular`}>{formatUsd(u.ai_cost_30d)}</td>
                    <td className={`${td} tabular`}>{formatInt(u.errors_7d + u.failed_jobs_7d)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {STAGE_LABEL[stageOf(u)]}
                      {u.onboarding_step && u.onboarding_step !== "done" ? <span className="block text-[0.8125rem] text-cream-muted">בשיחה: {ONBOARDING_LABEL[u.onboarding_step] ?? u.onboarding_step}</span> : null}
                    </td>
                    <td className={td}>{sourceLabel(u.signup_source)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <Empty>אין משתמשים שמתאימים לחיפוש.</Empty>
      )}

      {pages > 1 ? (
        <nav aria-label="דפים" className="mt-5 flex items-center justify-between gap-4 text-[0.9375rem]">
          {n > 1 ? (
            <Link href={tabHref("users", params(n - 1)) as Route} className="underline underline-offset-4">
              הדף הקודם
            </Link>
          ) : (
            <span />
          )}
          <span className="text-cream-muted tabular">
            דף {n} מתוך {pages}
          </span>
          {n < pages ? (
            <Link href={tabHref("users", params(n + 1)) as Route} className="underline underline-offset-4">
              הדף הבא
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </Panel>
  );
}

// ---------- צריך עזרה ----------

const HELP_TONE: Record<HelpItem["kind"], "warn" | "error"> = { billing: "error", broken: "error", errors: "error", limit: "warn", stuck: "warn" };
const HELP_KIND: Record<HelpItem["kind"], string> = {
  billing: "תשלום",
  broken: "חיבור",
  errors: "תקלות",
  limit: "מגבלה",
  stuck: "הרשמה",
};

export function HelpTab({ items, now }: { items: HelpItem[]; now: Date }) {
  return (
    <Panel id="help" title="צריך עזרה" lead="מי שכדאי לפנות אליו עכשיו: תשלום שנכשל, חיבור שפג, עבודה שנכשלה או תקלות חוזרות, מגבלה שהושגה, והרשמה שנתקעה יותר מיממה.">
      {items.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((it, i) => (
            <li key={`${it.userId}-${it.kind}-${i}`} className="grid gap-1 py-4 sm:grid-cols-[7rem_minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
              <Pill tone={HELP_TONE[it.kind]}>{HELP_KIND[it.kind]}</Pill>
              <UserLink id={it.userId} className="truncate font-semibold">
                {it.who}
              </UserLink>
              <span className="text-[0.9375rem] text-cream-muted">{it.detail}</span>
              {it.since ? <span className="text-[0.8125rem] text-cream-muted">{formatAgo(it.since, now)}</span> : <span />}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>כרגע אין משתמש שצריך עזרה.</Empty>
      )}
    </Panel>
  );
}
