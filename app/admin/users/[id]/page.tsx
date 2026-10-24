import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { usageView } from "@/app/account/view";
import { Cta } from "@/components/brand/cta";
import { UsageMeter } from "@/components/brand/usage-meter";
import { ownerState } from "@/lib/admin/auth";
import { sourceLabel } from "@/lib/admin/source";
import {
  ONBOARDING_LABEL,
  PLAN_LABEL,
  PROBLEM_LABEL,
  STAGE_LABEL,
  SUB_STATUS_LABEL,
  formatAgo,
  formatDate,
  formatDateTime,
  formatIls,
  formatInt,
  formatPhoneIl,
  formatUsd,
  problemsOf,
  stageOf,
  waLink,
} from "@/lib/admin/view";
import { loadAgents } from "@/lib/agents/service";
import { BRAND } from "@/lib/brand";
import { connectionServices } from "@/lib/connections/services";
import { getDb } from "@/lib/db";
import type { AdminUserRow, MessageRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { ChatList, ErrorTable } from "../../_components/inbox";
import { Empty, Ltr, Panel, Pill } from "../../_components/parts";
import { AdminHeader } from "../../_components/shell";
import { CopyButton } from "../../_components/copy-button";
import { TicketCard } from "../../_components/ticket-card";
import { tabHref } from "../../tabs";

export const metadata: Metadata = { title: "ניהול - משתמש", robots: { index: false, follow: false } };

/**
 * /admin/users/<id> — everything about one user, to help them: the profile and where they came from, the way in so far,
 * WhatsApp, the connected systems, the plan and the payments, the usage, the agents, reminders and failed work, alerts and
 * meeting summaries, the whole WhatsApp conversation (Daniel's decision: the content is always shown), the action
 * timeline, the errors, their tickets and website chats. Every view is written to the audit log (admin.view_user).
 */
export default function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  return (
    <div className="stage flex min-h-dvh flex-col">
      <Suspense
        fallback={
          <p role="status" className="m-auto text-cream-muted">
            טוען…
          </p>
        }
      >
        <UserView params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const CONN_TONE = { active: "ok", expired: "warn", error: "error", revoked: "off" } as const;
const CONN_LABEL = { active: "מחובר", expired: "פג תוקף", error: "נכשל", revoked: "נותק" } as const;
const JOB_LABEL: Record<string, string> = {
  morning_summary: "סיכום בוקר",
  reminder: "תזכורת",
  renew_subscription: "חידוש מנוי",
  charge: "חיוב",
  retry: "ניסיון חוזר",
  proactive_scan: "סריקת התראות",
  meeting_plan: "תכנון פגישות",
  meeting_summary: "סיכום פגישה",
};
const AGENT_STATUS = { active: "פעיל", disabled: "כבוי", locked: "נעול", not_in_plan: "לא בתוכנית" } as const;
const MESSAGE_PAGE = 60;

async function UserView({ params, searchParams }: { params: PageProps<"/admin/users/[id]">["params"]; searchParams: PageProps<"/admin/users/[id]">["searchParams"] }) {
  await connection();
  const db = getDb();
  const s = await ownerState(db);
  if (s.state !== "ok") notFound();
  const owner = s.user;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await db.adminGetUser(id);
  if (!user) notFound();
  await db.addAudit({ user_id: owner.id, action: "admin.view_user", target: user.id, result: "ok" });

  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const now = new Date();
  const tz = user.timezone || "Asia/Jerusalem";
  const [overview, phones, connections, subscription, usage, payments, approvals, reminders, jobs, alerts, meetings, messages, audit, errors, tickets, chats] = await Promise.all([
    db.adminUserOverview().then((rows) => rows.find((r) => r.id === user.id) ?? null),
    db.listWaIdentities(user.id),
    db.listConnections(user.id),
    db.getSubscription(user.id),
    db.getCurrentUsage(user.id),
    db.listPayments(user.id, 20),
    db.listBillingApprovals(user.id, { limit: 20 }),
    db.listReminders(user.id, { statuses: ["scheduled", "sent", "done", "cancelled"], limit: 20 }),
    db.adminJobs(user.id, 30),
    db.adminProactiveAlerts(user.id, 20),
    db.adminMeetingSummaries(user.id, 10),
    db.adminMessages(user.id, { before, limit: MESSAGE_PAGE }),
    db.adminAudit(user.id, 60),
    db.listAppErrors({ userId: user.id, limit: 30 }),
    db.listSupportTickets({ userId: user.id, limit: 30 }),
    db.listSupportChats({ userId: user.id, limit: 30 }),
  ]);
  const { agents, plan } = await loadAgents(db, user.id, now, subscription);
  const meter = usageView(subscription, usage, now, tz);
  const phone = phones.find((p) => p.status === "active") ?? null;
  const o: Pick<AdminUserRow, "wa_linked" | "connections_ever" | "paid"> = overview ?? { wa_linked: phones.length > 0, connections_ever: connections.length, paid: payments.some((p) => p.ccode === "0") };
  const problems = overview ? problemsOf(overview, now) : [];
  const onboarding = (user.profile.onboarding as { step?: string } | undefined)?.step;
  const pains = Array.isArray(user.profile.pain_points) ? (user.profile.pain_points as unknown[]).map(String) : [];
  const optIn = user.profile.marketing_opt_in as { value?: boolean; at?: string } | undefined;
  const src = user.signup_source ?? null;
  const back = `/admin/users/${user.id}`;
  const details = [`שם: ${user.name ?? "-"}`, `עסק: ${user.business_name ?? "-"}`, `מייל: ${user.email}`, `טלפון: ${phone ? formatPhoneIl(phone.phone_e164) : "-"}`, `תוכנית: ${PLAN_LABEL[plan]}`, `מזהה: ${user.id}`].join("\n");
  const oldest = messages.at(-1)?.created_at;

  return (
    <>
      <AdminHeader open />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 sm:px-8">
        <p className="pt-4">
          <Link href={tabHref("users") as Route} className="inline-flex min-h-10 items-center text-[0.9375rem] text-cream-muted underline-offset-4 hover:text-cream hover:underline">
            חזרה לרשימת המשתמשים
          </Link>
        </p>

        <section aria-labelledby="user-title" className="border-b border-line pt-4 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <h1 id="user-title" className="text-title leading-[1.1] font-bold">
                {user.name || user.business_name || <Ltr>{user.email}</Ltr>}
              </h1>
              <p className="mt-2 text-[1rem] text-cream-muted">
                <Ltr className="text-cream">{user.email}</Ltr>
                {user.business_name && user.name ? `, ${user.business_name}` : ""}
                {phone ? (
                  <>
                    {", "}
                    <Ltr className="text-cream">{formatPhoneIl(phone.phone_e164)}</Ltr>
                  </>
                ) : null}
              </p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                <Pill tone="ok">{PLAN_LABEL[plan]}</Pill>
                <Pill tone="off">{STAGE_LABEL[stageOf(o)]}</Pill>
                {problems.map((p) => (
                  <Pill key={p} tone={p === "billing" || p === "errors" ? "error" : "warn"}>
                    {PROBLEM_LABEL[p]}
                  </Pill>
                ))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="פנייה למשתמש" role="group">
              <Cta tone="honey" size="sm" href={`mailto:${user.email}?subject=${encodeURIComponent(`${BRAND.name} - לגבי החשבון שלך`)}`}>
                מייל
              </Cta>
              {phone ? (
                <Cta tone="ghost" size="sm" href={waLink(phone.phone_e164)} external>
                  וואטסאפ
                </Cta>
              ) : null}
              <CopyButton text={details} />
            </div>
          </div>
        </section>

        <div className="grid gap-x-12 gap-y-12 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-3">
          <Panel id="profile" title="פרופיל">
            <Facts
              rows={[
                ["נרשם", `${formatDateTime(user.created_at)} (${formatAgo(user.created_at, now)})`],
                ["נראה לאחרונה", formatAgo(user.last_seen_at, now)],
                ["תחום", user.business_type ?? "-"],
                ["מה מעמיס", pains.length ? pains.join(", ") : "-"],
                [
                  "סיכום בוקר",
                  <span key="m">
                    {user.morning_time}, <Ltr>{tz}</Ltr>
                  </span>,
                ],
                ["עדכונים וטיפים", optIn?.value ? `כן, מ-${formatDate(optIn.at ?? user.created_at)}` : "לא"],
              ]}
            />
          </Panel>

          <Panel id="source" title="מקור ההרשמה">
            {src ? (
              <Facts
                rows={[
                  ["מקור", sourceLabel(src)],
                  ...(src.utm_medium ? ([["utm_medium", src.utm_medium]] as [string, ReactNode][]) : []),
                  ...(src.utm_campaign ? ([["utm_campaign", src.utm_campaign]] as [string, ReactNode][]) : []),
                  ...(src.utm_term ? ([["utm_term", src.utm_term]] as [string, ReactNode][]) : []),
                  ...(src.utm_content ? ([["utm_content", src.utm_content]] as [string, ReactNode][]) : []),
                  ["אתר מפנה", src.ref ? <Ltr key="r">{src.ref}</Ltr> : "ישיר"],
                  ["דף ראשון", src.landing ? <Ltr key="l">{src.landing}</Ltr> : "-"],
                  ["ביקור ראשון", src.at ? formatDateTime(src.at) : "-"],
                ]}
              />
            ) : (
              <Empty>לא ידוע: נרשם לפני שהמקור נשמר, או מדפדפן שחסם את העוגייה.</Empty>
            )}
          </Panel>

          <Panel id="stage" title="שלב ההרשמה">
            <ol className="grid gap-2.5">
              {(["signed_up", "whatsapp", "connected", "paid"] as const).map((st) => {
                const reached = ["signed_up", "whatsapp", "connected", "paid"].indexOf(stageOf(o)) >= ["signed_up", "whatsapp", "connected", "paid"].indexOf(st);
                return (
                  <li key={st} className="flex items-center gap-3 text-[0.9375rem]">
                    <span aria-hidden="true" className={cn("grid size-5 flex-none place-items-center rounded-full text-[0.6875rem]", reached ? "bg-sage text-night" : "border-[1.5px] border-cream-muted/60")}>
                      {reached ? "✓" : ""}
                    </span>
                    <span className={reached ? "text-cream" : "text-cream-muted"}>
                      {STAGE_LABEL[st]}
                      <span className="sr-only">{reached ? ", הושלם" : ", עוד לא"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 text-[0.875rem] text-cream-muted">ההיכרות בוואטסאפ: {onboarding ? (ONBOARDING_LABEL[onboarding] ?? onboarding) : "עוד לא התחילה"}</p>
          </Panel>

          <Panel id="whatsapp" title="וואטסאפ">
            {phones.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {phones.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <Ltr className="text-cream">{formatPhoneIl(p.phone_e164)}</Ltr>
                    <span className="flex items-baseline gap-3 text-[0.8125rem] text-cream-muted">
                      <Pill tone={p.status === "active" ? "ok" : p.status === "blocked" ? "error" : "off"}>{p.status === "active" ? "מקושר" : p.status === "blocked" ? "חסום" : "נותק"}</Pill>
                      {formatDate(p.linked_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>עוד לא קושר מספר.</Empty>
            )}
          </Panel>

          <Panel id="connections" title="מערכות מחוברות" className="xl:col-span-2">
            {connections.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {connections.map((c) => {
                  const services = connectionServices(c, { plan });
                  return (
                    <li key={c.id} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">
                          {c.provider === "google" ? "Google" : "Microsoft 365"} <Ltr className="font-normal text-cream-muted">{c.account_email ?? ""}</Ltr>
                        </p>
                        <Pill tone={CONN_TONE[c.status]}>{CONN_LABEL[c.status]}</Pill>
                      </div>
                      <p className="mt-1 text-[0.8125rem] text-cream-muted">
                        חובר {formatDate(c.created_at)}, {formatInt(c.scopes.length)} הרשאות{c.consent_type === "admin" ? ", אישור מנהל" : ""}
                        {c.expires_at ? `, הטוקן עד ${formatDateTime(c.expires_at)}` : ""}
                      </p>
                      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                        {services.map((sv) => (
                          <li key={sv.id}>
                            <Pill tone={sv.status === "connected" ? "ok" : sv.status === "needs_consent" ? "warn" : "off"}>
                              {sv.label}
                              <span className="text-cream-muted">{sv.status === "connected" ? "" : ` (${sv.statusLabel})`}</span>
                            </Pill>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>לא חוברה אף מערכת.</Empty>
            )}
          </Panel>

          <Panel id="billing" title="מנוי ותשלומים">
            <Facts
              rows={[
                ["תוכנית", PLAN_LABEL[plan]],
                ["סטטוס", subscription ? SUB_STATUS_LABEL[subscription.status] : "ניסיון, בלי מנוי"],
                ...(subscription?.next_charge_at ? ([["החיוב הבא", formatDate(subscription.next_charge_at)]] as [string, ReactNode][]) : []),
                ...(subscription?.charge_failures ? ([["חיובים שנכשלו", formatInt(subscription.charge_failures)]] as [string, ReactNode][]) : []),
                ...(subscription?.scheduled_plan ? ([["יעבור ל", PLAN_LABEL[subscription.scheduled_plan]]] as [string, ReactNode][]) : []),
              ]}
            />
            {payments.length ? (
              <ul className="mt-5 divide-y divide-line border-y border-line text-[0.9375rem]">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="tabular">{formatDate(p.created_at)}</span>
                    <span className="tabular">{formatIls(p.amount_ils)}</span>
                    <Pill tone={p.ccode === "0" ? "ok" : "error"}>{p.ccode === "0" ? "עבר" : `נכשל (${p.ccode})`}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[0.875rem] text-cream-muted">אין תשלומים.</p>
            )}
            {approvals.length ? (
              <details className="mt-4">
                <summary className="inline-flex min-h-9 cursor-pointer items-center text-[0.875rem] text-honey underline-offset-4 hover:underline">בקשות אישור מוואטסאפ ({formatInt(approvals.length)})</summary>
                <ul className="mt-2 grid gap-1.5 text-[0.875rem] text-cream-muted">
                  {approvals.map((a) => (
                    <li key={a.id}>
                      {formatDateTime(a.created_at)}: {a.kind}, {PLAN_LABEL[a.plan]}, {formatIls(a.amount_ils)}, {a.status}
                      {a.error ? <span className="block text-[0.8125rem]">{a.error}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Panel>

          <Panel id="usage" title="שימוש">
            <UsageMeter used={meter.used} limit={meter.limit} label={meter.plan === "trial" ? "הודעות בתקופת הניסיון" : "הודעות החודש"} caption={meter.resetsOn ? `מתחדש ב-${meter.resetsOn}` : undefined} />
            <p className="mt-4 text-[0.875rem] text-cream-muted">
              ב-30 הימים האחרונים: {formatInt(overview?.messages_30d ?? 0)} הודעות נכנסות, עלות AI {formatUsd(overview?.ai_cost_30d ?? 0)}.
            </p>
          </Panel>

          <Panel id="agents" title="סוכנים">
            <ul className="divide-y divide-line border-y border-line">
              {agents.map((a) => (
                <li key={a.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[0.9375rem]">
                  <span>
                    {a.name}
                    {a.kind === "custom" ? <span className="text-cream-muted"> (מותאם)</span> : null}
                  </span>
                  <Pill tone={a.status === "active" ? "ok" : a.status === "locked" ? "warn" : "off"}>{AGENT_STATUS[a.status]}</Pill>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel id="reminders" title="תזכורות ועבודות">
            {reminders.length ? (
              <ul className="grid gap-1.5 text-[0.9375rem]">
                {reminders.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{r.text}</span>
                    <span className="flex-none text-[0.8125rem] text-cream-muted">
                      {formatDateTime(r.due_at, tz)}
                      {r.recurrence ? ", חוזרת" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.875rem] text-cream-muted">אין תזכורות.</p>
            )}
            {jobs.some((j) => j.status === "failed") ? (
              <ul className="mt-5 grid gap-2 border-t border-line pt-4">
                {jobs
                  .filter((j) => j.status === "failed")
                  .map((j) => (
                    <li key={j.id} className="text-[0.875rem]">
                      <Pill tone="error">
                        {JOB_LABEL[j.kind] ?? j.kind} נכשלה, {formatDateTime(j.run_at)}
                      </Pill>
                      {j.last_error ? (
                        <Ltr className="mt-1 block text-[0.8125rem] break-words text-cream-muted">{j.last_error}</Ltr>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-4 text-[0.875rem] text-cream-muted">אין עבודות שנכשלו.</p>
            )}
          </Panel>

          <Panel id="alerts" title="התראות וסיכומי פגישות">
            {alerts.length || meetings.length ? (
              <ul className="grid gap-1.5 text-[0.9375rem]">
                {alerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span>
                      {a.channel === "urgent" ? "התראה דחופה" : "בסיכום הבוקר"}: {a.kind}
                    </span>
                    <span className="flex-none text-[0.8125rem] text-cream-muted">
                      {a.status}, {formatDate(a.created_at)}
                    </span>
                  </li>
                ))}
                {meetings.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">סיכום: {m.title || "פגישה"}</span>
                    <span className="flex-none text-[0.8125rem] text-cream-muted">{formatDate(m.meeting_start)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.875rem] text-cream-muted">אין התראות או סיכומים.</p>
            )}
          </Panel>
        </div>

        <div className="mt-16 grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Panel id="conversation" title="השיחה בוואטסאפ" lead={`${BRAND.name} מימין, המשתמש משמאל. עם התמלול, הכלים שהופעלו והעלות של כל תשובה.`}>
            {messages.length ? (
              <>
                {messages.length === MESSAGE_PAGE && oldest ? (
                  <p className="mb-4">
                    <Link href={`/admin/users/${user.id}?before=${encodeURIComponent(oldest)}#conversation` as Route} className="text-[0.875rem] text-honey underline-offset-4 hover:underline">
                      הודעות קודמות
                    </Link>
                  </p>
                ) : null}
                <ol className="grid gap-2.5 rounded-card border border-line bg-[var(--wa-bg)] p-3 sm:p-5">
                  {messages
                    .slice()
                    .reverse()
                    .map((m) => (
                      <Message key={m.id} m={m} tz={tz} />
                    ))}
                </ol>
                {before ? (
                  <p className="mt-4">
                    <Link href={`/admin/users/${user.id}#conversation` as Route} className="text-[0.875rem] text-honey underline-offset-4 hover:underline">
                      להודעות האחרונות
                    </Link>
                  </p>
                ) : null}
              </>
            ) : (
              <Empty>עוד אין הודעות.</Empty>
            )}
          </Panel>

          <Panel id="timeline" title="ציר הפעולות" lead="מה קרה בחשבון, מהחדש לישן.">
            {audit.length ? (
              <ol className="relative grid gap-3 border-s border-line ps-5">
                {audit.map((a, i) => (
                  <li key={i} className="relative text-[0.9375rem]">
                    <span aria-hidden="true" className={cn("absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-night", a.result?.startsWith("error") ? "bg-destructive" : "bg-cream-muted")} />
                    <Ltr className="text-cream">{a.action}</Ltr>
                    {a.result ? <span className="text-cream-muted"> {a.result}</span> : null}
                    {a.agent_name ? <span className="text-cream-muted"> ({a.agent_name})</span> : null}
                    <span className="block text-[0.8125rem] text-cream-muted">{formatDateTime(a.created_at, tz)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>אין פעולות ביומן.</Empty>
            )}
          </Panel>
        </div>

        <div className="mt-16 grid gap-14">
          <Panel
            id="errors"
            title="תקלות"
            action={
              errors.length ? (
                <Link href={tabHref("errors", { user: user.id }) as Route} className="text-[0.875rem] text-honey underline-offset-4 hover:underline">
                  ביומן התקלות
                </Link>
              ) : null
            }
          >
            {errors.length ? <ErrorTable errors={errors} now={now} showUser={false} /> : <Empty>אין תקלות.</Empty>}
          </Panel>

          <Panel id="tickets" title="פניות">
            {tickets.length ? (
              <div className="grid gap-4">
                {tickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} back={back} now={now} showUser={false} />
                ))}
              </div>
            ) : (
              <Empty>לא פתח פניות.</Empty>
            )}
          </Panel>

          <Panel id="chats" title="שיחות בצ'אט באתר">{chats.length ? <ChatList chats={chats} now={now} showUser={false} /> : <Empty>אין שיחות באתר.</Empty>}</Panel>
        </div>
      </main>
    </>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5 text-[0.9375rem]">
          <dt className="text-cream-muted">{k}</dt>
          <dd className="min-w-0 text-end text-cream">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const TYPE_LABEL: Partial<Record<MessageRow["type"], string>> = { audio: "הודעה קולית", image: "תמונה", doc: "קובץ", button: "כפתורים", template: "תבנית" };

/** One WhatsApp message as WhatsApp shows it (the dark chrome), with what the admin needs under it. */
function Message({ m, tz }: { m: MessageRow; tz: string }) {
  const out = m.direction === "out";
  const text = m.text?.trim() || "";
  return (
    <li className={cn("flex", out ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed text-[var(--wa-fg)] sm:max-w-[80%]", out ? "rounded-ss-md bg-[var(--wa-out)]" : "rounded-se-md bg-[var(--wa-in)]")}>
        <span className="sr-only">{out ? `${BRAND.name}: ` : "המשתמש: "}</span>
        {m.type !== "text" && TYPE_LABEL[m.type] ? <span className="block text-[0.8125rem] text-[var(--wa-meta-in)]">{TYPE_LABEL[m.type]}</span> : null}
        {text ? <p className="whitespace-pre-line">{text}</p> : null}
        {m.transcript ? <p className="mt-1 border-s-2 border-cream/30 ps-2 whitespace-pre-line">תמלול: {m.transcript}</p> : null}
        <p className={cn("mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.75rem]", out ? "text-[var(--wa-meta-out)]" : "text-[var(--wa-meta-in)]")}>
          <span className="tabular">{formatDateTime(m.created_at, tz)}</span>
          {m.tools?.length ? <Ltr>{m.tools.join(", ")}</Ltr> : null}
          {m.model_used ? <Ltr>{m.model_used}</Ltr> : null}
          {typeof m.cost_usd === "number" && m.cost_usd > 0 ? <span className="tabular">{formatUsd(m.cost_usd)}</span> : null}
          {m.hidden_from_model ? <span>מחוץ לזיכרון</span> : null}
        </p>
      </div>
    </li>
  );
}
