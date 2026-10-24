import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { ownerState } from "@/lib/admin/auth";
import { helpItems, kpis, userQueryFrom } from "@/lib/admin/view";
import { spendLimits } from "@/lib/ai/budget";
import { getDb } from "@/lib/db";
import type { SupportTicketStatus } from "@/lib/db/types";
import { addDays, dateKey, localDateOf } from "@/lib/time/zoned";
import { CodeStep } from "./_components/code-step";
import { HelpTab, OverviewTab, UsersTab } from "./_components/dashboard";
import { ChatsTab, ErrorsTab, TicketsTab } from "./_components/inbox";
import { Notice } from "./_components/parts";
import { AdminHeader, AdminNav } from "./_components/shell";
import { ADMIN_TABS, tabFrom } from "./tabs";

export const metadata: Metadata = { title: "ניהול", robots: { index: false, follow: false } };

/**
 * /admin — the owner's panel (round plan "פאנל ניהול לבעלים"). proxy.ts answers a real 404 to anyone without the
 * panel's gate cookie; here the owner is checked again in full (lib/admin/auth.ts): no owner → 404, the owner before the
 * one-time code → the code step, the open panel → the tab the URL names (./tabs.ts). Each tab loads only its own data.
 */
export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <div className="stage flex min-h-dvh flex-col">
      <Suspense fallback={<AdminSkeleton />}>
        <Admin searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const STATUSES: readonly SupportTicketStatus[] = ["open", "in_progress", "closed"];

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection(); // the owner check and every figure are per request
  const db = getDb();
  const s = await ownerState(db);
  if (s.state === "none") notFound();
  if (s.state === "code") {
    return (
      <>
        <AdminHeader open={false} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-10 pb-24 sm:px-8 sm:pt-16">
          <CodeStep email={s.user.email} codeSent={s.codeSent} />
        </main>
      </>
    );
  }

  const sp = await searchParams;
  const tab = tabFrom(sp);
  const now = new Date();
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const notice = one("notice")?.slice(0, 300) ?? null;
  const error = one("error")?.slice(0, 300) ?? null;

  const [rows, openTickets, failedJobs] = await Promise.all([db.adminUserOverview(), db.listSupportTickets({ status: "open", limit: 500 }), db.adminFailedJobs(new Date(now.getTime() - 7 * 86_400_000), 200)]);
  const help = helpItems(rows, failedJobs, now);
  const names = new Map(rows.map((u) => [u.id, u.name || u.business_name || u.email]));

  let body: ReactNode;
  if (tab === "overview") {
    const today = localDateOf(now);
    const daily = await db.adminDailyStats(dateKey(addDays(today, -29)), dateKey(today));
    const errors = await db.listAppErrors({ limit: 500 });
    let budgetUsd: number | null = null;
    try {
      budgetUsd = spendLimits()?.dailyBudgetUsd ?? null;
    } catch {
      budgetUsd = null;
    }
    body = <OverviewTab k={kpis(rows, daily, now)} daily={daily} rows={rows} openTickets={openTickets.length} errors24h={errors.filter((e) => Date.parse(e.at) >= now.getTime() - 86_400_000).length} budgetUsd={budgetUsd} />;
  } else if (tab === "users") {
    body = <UsersTab rows={rows} query={userQueryFrom(sp)} now={now} />;
  } else if (tab === "help") {
    body = <HelpTab items={help} now={now} />;
  } else if (tab === "tickets") {
    const status = STATUSES.find((x) => x === one("status")) ?? null;
    body = <TicketsTab tickets={await db.listSupportTickets({ status: status ?? undefined, limit: 200 })} status={status} now={now} />;
  } else if (tab === "chats") {
    body = <ChatsTab chats={await db.listSupportChats({ limit: 150 })} now={now} names={names} />;
  } else {
    const source = one("source")?.slice(0, 60) || null;
    const userId = one("user") && /^[0-9a-f-]{36}$/.test(one("user")!) ? one("user") : null;
    const [errors, all] = await Promise.all([db.listAppErrors({ source: source ?? undefined, userId: userId ?? undefined, limit: 300 }), db.listAppErrors({ limit: 500 })]);
    body = <ErrorsTab errors={errors} sources={[...new Set(all.map((e) => e.source))].sort()} source={source} userId={userId} now={now} names={names} />;
  }

  return (
    <>
      <AdminHeader open />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 sm:px-8">
        <div className="pt-6 pb-6 sm:pt-8">
          <h1 className="text-title leading-[1.1] font-bold">ניהול</h1>
          <p className="mt-2 max-w-[42rem] text-[1.0625rem] leading-relaxed text-cream-muted">כל המשתמשים, הפניות והשיחות, במקום אחד.</p>
        </div>
        <AdminNav current={tab} counts={{ help: help.length, tickets: openTickets.length }} />
        <div className="pt-8 sm:pt-10">
          {notice || error ? <Notice kind={error ? "error" : "notice"} text={(error || notice)!} /> : null}
          {body}
        </div>
      </main>
    </>
  );
}

/** The frame while the owner is checked: no data, no layout jump. */
function AdminSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-7xl px-4 sm:px-8">
      <p role="status" className="sr-only">
        טוען את פאנל הניהול…
      </p>
      <div className="h-[4.75rem]" />
      <div className="pt-8 pb-6">
        <div className="h-10 w-40 rounded-full bg-cream/[0.06]" />
      </div>
      <div className="flex gap-6 border-b border-line pb-4" aria-hidden="true">
        {ADMIN_TABS.map((t) => (
          <span key={t.id} className="text-[0.9375rem] text-cream-muted/50">
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
