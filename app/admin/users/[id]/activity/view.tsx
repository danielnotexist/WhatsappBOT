import Link from "next/link";
import type { Route } from "next";
import { connection } from "next/server";
import { CATEGORY_LABEL, CATEGORY_ORDER, RANGE_LABEL, activityQueryFrom, filterActivity, mergeTimeline, type ActivityQuery, type ActivityRange } from "@/lib/admin/audit-labels";
import { groupByDay } from "@/lib/admin/days";
import { openUserView } from "@/lib/admin/user-view";
import { ADMIN_TZ, formatInt, userDetails } from "@/lib/admin/view";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { CategoryIcon, EventRow, categoryStyle } from "../../../_components/activity-parts";
import { Empty } from "../../../_components/parts";
import { UserBar } from "../../../_components/user-bar";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * /admin/users/<id>/activity — the account's story in one timeline, in its own tab: the audit log in Hebrew words,
 * with the user's errors, failed jobs and billing approvals merged in, by Israel day (sticky day headers), filtered by
 * category and range (links: the filters live in the URL, the page stays server-rendered). The owner only; every view
 * is written to the audit log (admin.view_activity).
 */
export async function ActivityView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  await connection();
  const db = getDb();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user } = await openUserView(db, id, "admin.view_activity");

  const now = new Date();
  const tz = ADMIN_TZ;
  const q = activityQueryFrom(sp);
  const [audit, errors, jobs, approvals, phones] = await Promise.all([
    db.adminAudit(user.id, 600),
    db.listAppErrors({ userId: user.id, limit: 200 }),
    db.adminJobs(user.id, 200),
    db.listBillingApprovals(user.id, { limit: 100 }),
    db.listWaIdentities(user.id),
  ]);
  const events = mergeTimeline({ audit, errors, jobs, approvals });
  const view = filterActivity(events, q, now);
  const days = groupByDay(view.rows, (e) => e.at, now, tz);
  const phone = phones.find((p) => p.status === "active")?.phone_e164 ?? phones[0]?.phone_e164 ?? null;
  const href = (patch: Partial<ActivityQuery>) => activityHref(user.id, { ...q, page: 1, ...patch });
  const rangeWords = q.range === "all" ? "מאז ההרשמה" : `ב-${RANGE_LABEL[q.range]} האחרונים`;

  return (
    <div className="stage flex min-h-dvh flex-col">
      <UserBar user={user} phone={phone} page="ציר הפעולות" details={userDetails(user, phone)} />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <p className="text-[0.9375rem] text-cream-muted">
            <span className="text-[1.5rem] leading-none text-cream tabular">{formatInt(view.inRange)}</span> אירועים {rangeWords}
          </p>
          <nav aria-label="טווח זמן" className="flex rounded-full border border-line p-1">
            {(["7", "30", "all"] as ActivityRange[]).map((r) => (
              <Link
                key={r}
                href={href({ range: r }) as Route}
                aria-current={q.range === r ? "page" : undefined}
                className="inline-flex min-h-9 items-center rounded-full px-4 text-[0.875rem] text-cream-muted hover:text-cream aria-[current=page]:bg-cream aria-[current=page]:text-night"
              >
                {RANGE_LABEL[r]}
              </Link>
            ))}
          </nav>
        </div>

        <nav aria-label="סינון לפי סוג" className="relative mt-5 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li className="flex-none">
              <Link
                href={href({ category: null }) as Route}
                aria-current={q.category === null ? "page" : undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-[0.875rem] text-cream-muted hover:text-cream aria-[current=page]:border-cream/70 aria-[current=page]:text-cream"
              >
                הכול <span className="tabular">{formatInt(view.inRange)}</span>
              </Link>
            </li>
            {CATEGORY_ORDER.map((c) => (
              <li key={c} className="flex-none">
                <Link
                  href={href({ category: c }) as Route}
                  aria-current={q.category === c ? "page" : undefined}
                  style={categoryStyle(c)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border border-line ps-1.5 pe-4 text-[0.875rem] text-cream-muted hover:text-cream aria-[current=page]:border-[var(--cat)] aria-[current=page]:text-cream",
                    view.counts[c] === 0 && q.category !== c && "opacity-55",
                  )}
                >
                  <CategoryIcon category={c} size="sm" />
                  <span aria-hidden="true">{CATEGORY_LABEL[c]}</span>
                  <span className="tabular">{formatInt(view.counts[c])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {days.length ? (
          <div className="mt-6">
            {days.map((d) => (
              <section key={d.key} aria-labelledby={`day-${d.key}`} className="relative">
                <h2 id={`day-${d.key}`} className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between gap-4 border-b border-line bg-night/90 px-4 py-2.5 backdrop-blur-md sm:mx-0 sm:px-0">
                  <span className="text-[1rem] font-semibold text-cream">{d.label}</span>
                  <span className="text-[0.8125rem] text-cream-muted tabular">{formatInt(d.items.length)} אירועים</span>
                </h2>
                <ol className="relative before:absolute before:inset-y-3 before:start-[4.625rem] before:w-px before:bg-line">
                  {d.items.map((e) => (
                    <EventRow key={e.id} e={e} tz={tz} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <Empty>{q.category ? `אין אירועים מסוג ${CATEGORY_LABEL[q.category]} ${rangeWords}.` : `אין אירועים ${rangeWords}.`}</Empty>
          </div>
        )}

        {view.pages > 1 ? (
          <nav aria-label="דפדוף" className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[0.875rem]">
            {view.page > 1 ? (
              <Link href={activityHref(user.id, { ...q, page: view.page - 1 }) as Route} className="inline-flex min-h-10 items-center text-honey underline-offset-4 hover:underline">
                אירועים חדשים יותר
              </Link>
            ) : (
              <span />
            )}
            <span className="text-cream-muted tabular">
              עמוד {formatInt(view.page)} מתוך {formatInt(view.pages)}
            </span>
            {view.page < view.pages ? (
              <Link href={activityHref(user.id, { ...q, page: view.page + 1 }) as Route} className="inline-flex min-h-10 items-center text-honey underline-offset-4 hover:underline">
                אירועים ישנים יותר
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    </div>
  );
}

function activityHref(userId: string, q: ActivityQuery): string {
  const p = new URLSearchParams();
  if (q.category) p.set("cat", q.category);
  if (q.range !== "30") p.set("range", q.range);
  if (q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return `/admin/users/${userId}/activity${s ? `?${s}` : ""}`;
}
