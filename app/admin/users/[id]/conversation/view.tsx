import { connection } from "next/server";
import { CHAT_PAGE, STATS_CAP, conversationStats, toChatMessage, type ConversationStats } from "@/lib/admin/conversation";
import { openUserView } from "@/lib/admin/user-view";
import { ADMIN_TZ, formatAgo, formatDate, formatInt, formatUsd, userDetails } from "@/lib/admin/view";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { ConversationReader } from "../../../_components/conversation-reader";
import { UserBar } from "../../../_components/user-bar";

/**
 * /admin/users/<id>/conversation — the whole WhatsApp conversation of one user, in its own tab: a reader that scrolls
 * inside itself (newest at the bottom), with search, filters and paging back, and the conversation's figures beside it.
 * The owner only; every view is written to the audit log (admin.view_conversation).
 */
export async function ConversationView({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const db = getDb();
  const { id } = await params;
  const { user } = await openUserView(db, id, "admin.view_conversation");

  const now = new Date();
  // the owner reads in Israel time (the day chips and the clock), whatever the user's own time zone
  const tz = ADMIN_TZ;
  const [rows, phones] = await Promise.all([db.adminMessages(user.id, { limit: STATS_CAP }), db.listWaIdentities(user.id)]);
  const all = rows.map(toChatMessage);
  const stats = conversationStats(all);
  const capped = rows.length >= STATS_CAP;
  const initial = all.slice(0, CHAT_PAGE).reverse();
  const phone = phones.find((p) => p.status === "active")?.phone_e164 ?? phones[0]?.phone_e164 ?? null;

  return (
    <div className="stage flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <UserBar user={user} phone={phone} page="השיחה בוואטסאפ" details={userDetails(user, phone)} />
      <main id="main" className="mx-auto grid min-h-0 w-full max-w-[96rem] flex-1 gap-x-8 gap-y-4 px-4 pt-4 pb-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[minmax(0,1fr)]">
        <section aria-label="נתוני השיחה" className="min-w-0 lg:order-2 lg:overflow-y-auto">
          <details className="rounded-card border border-line bg-night-2/60 lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[0.9375rem] [&::-webkit-details-marker]:hidden">
              <span className="font-semibold text-cream">נתוני השיחה</span>
              <span className="text-[0.8125rem] text-cream-muted tabular">
                {formatInt(stats.total)} הודעות, {formatUsd(stats.cost)}
              </span>
            </summary>
            <div className="border-t border-line px-4 pb-4">
              <Stats stats={stats} capped={capped} now={now} tz={tz} />
            </div>
          </details>
          <div className="max-lg:hidden">
            <h2 className="pt-1 text-[1rem] font-semibold text-cream">נתוני השיחה</h2>
            <Stats stats={stats} capped={capped} now={now} tz={tz} />
          </div>
        </section>
        <ConversationReader userId={user.id} initial={initial} more={rows.length > CHAT_PAGE} now={now.toISOString()} tz={tz} />
      </main>
    </div>
  );
}

function Stats({ stats, capped, now, tz }: { stats: ConversationStats; capped: boolean; now: Date; tz: string }) {
  const rows: [string, string][] = [
    ["הודעות", formatInt(stats.total)],
    ["מהלקוח", formatInt(stats.inbound)],
    [`מ${BRAND.name}`, formatInt(stats.outbound)],
    ["קוליות", formatInt(stats.voice)],
    ["ההודעה הראשונה", stats.first ? formatDate(stats.first, tz) : "-"],
    ["ההודעה האחרונה", stats.last ? formatAgo(stats.last, now) : "-"],
    ["עלות AI", formatUsd(stats.cost)],
  ];
  return (
    <>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2 text-[0.9375rem]">
            <dt className="text-cream-muted">{k}</dt>
            <dd className="text-cream tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 text-[0.875rem] text-cream-muted">הכלים שהופעלו הכי הרבה</h3>
      {stats.topTools.length ? (
        <ol className="mt-2 grid gap-1.5">
          {stats.topTools.map((t) => (
            <li key={t.tool} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
              <span title={t.tool} className="min-w-0 truncate text-cream">
                {t.label}
              </span>
              <span className="flex-none text-[0.8125rem] text-cream-muted tabular">{formatInt(t.count)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[0.875rem] text-cream-muted">עוד לא הופעלו כלים.</p>
      )}
      {capped ? <p className="mt-4 text-[0.8125rem] leading-relaxed text-cream-muted">לפי {formatInt(STATS_CAP)} ההודעות האחרונות.</p> : null}
    </>
  );
}
