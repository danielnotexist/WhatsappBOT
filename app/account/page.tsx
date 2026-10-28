import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Cta, ctaClass } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { Mascot } from "@/components/brand/mascot";
import { SupportChat } from "@/components/brand/support-chat";
import { FRAME, HEADER_BAR } from "@/components/brand/frame";
import { PageTransition } from "@/components/brand/page-transition";
import { Wordmark } from "@/components/brand/wordmark";
import { touchLastSeen } from "@/lib/admin/activity";
import { isAdminEmail } from "@/lib/admin/auth";
import { getSession } from "@/lib/auth/current-user";
import { createPayLinkToken } from "@/lib/billing/pay-link";
import { entitlements, mayConnect, providerGate } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import { googleReadGates } from "@/lib/connections/gates";
import { connectionServices, previewServices } from "@/lib/connections/services";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { isBuiltinRole } from "@/lib/agents/constraints";
import { loadAgents } from "@/lib/agents/service";
import { isDemo } from "@/lib/demo";
import { AgentsSection } from "./_components/agents-section";
import { AreaLink, AreaNav, AreaPanel } from "./_components/area-nav";
import { Banner } from "./_components/banner";
import { OverviewRows } from "./_components/overview";
import { Section } from "./_components/parts";
import { PlanIncludes, PlanSlip, ProAdds } from "./_components/plan-slip";
import { AnnualOffer } from "./_components/annual-offer";
import { ReferralSection } from "./_components/referrals";
import { annualSwitchView } from "@/lib/billing/annual-switch";
import { referralLinkOf, referralStats } from "@/lib/referrals/service";
import { ConnectionItem, NoPhoneItem, ONE_ACCOUNT_LINE, PausedNotice, PhoneItem, DemoChatItem, type ProviderGate } from "./_components/rows";
import { SettingsArea } from "./_components/settings";
import { signOutAction } from "./actions";
import { ACCOUNT_AREAS, areaFrom, type AccountArea } from "./areas";
import { agentsView, areasNeedingAttention, connectionFor, firstName, formatDay, greetingFor, linkedPhones, statusChips, statusLine, usageView, type StatusChip } from "./view";

export const metadata: Metadata = { title: "האזור האישי", robots: { index: false, follow: false } };

/**
 * The personal area (round plan §3) in "לילה ירוק", in areas: a compact overview on top (the greeting, one line from
 * עלזה, the status chips: accounts, WhatsApp, agents, the plan with the messages used), then the navigation (a column
 * at the inline start on wide screens, one sticky row on phones) and the area it names — סקירה, חיבורים, וואטסאפ,
 * סוכנים, מנוי, הגדרות (./areas.ts: `/account?tab=<area>`). Every area is rendered here once, the URL picks the one
 * shown, and a result (`?notice=` / `?error=`) appears in the area it belongs to. Same server actions (./actions.ts).
 */
export default function AccountPage(props: PageProps<"/account">) {
  return (
    <PageTransition>
      <div className="stage flex min-h-dvh flex-col">
        <header className={HEADER_BAR}>
          <Wordmark />
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <AdminLink />
            </Suspense>
            <form action={signOutAction}>
              <Cta tone="ghost" size="sm" type="submit">
                יציאה
              </Cta>
            </form>
          </div>
        </header>
        <main id="main" className={cn(FRAME, "flex-1 pb-24")}>
          <Suspense fallback={<AccountSkeleton />}>
            <Account searchParams={props.searchParams} />
          </Suspense>
        </main>
        <SupportChat />
      </div>
    </PageTransition>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  await connection(); // the session check, the greeting and the usage period depend on the current time
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const user = await db.getUser(session.userId);
  if (!user) redirect("/login");
  await touchLastSeen(db, user.id); // the admin panel's "נראה לאחרונה" (best effort, at most once an hour)
  const [connections, phones, subscription, usage, sp] = await Promise.all([
    db.listConnections(user.id),
    db.listWaIdentities(user.id),
    db.getSubscription(user.id),
    db.getCurrentUsage(user.id),
    searchParams,
  ]);
  const now = new Date();
  const tz = user.timezone || "Asia/Jerusalem";
  const area = areaFrom(sp);
  const notice = typeof sp.notice === "string" ? sp.notice.slice(0, 400) : "";
  const error = typeof sp.error === "string" ? sp.error.slice(0, 400) : "";
  // the result of an action, at the top of the area the address names; a new key per render opens a closed one again
  const bannerFor = (a: AccountArea): ReactNode =>
    a === area && (notice || error) ? <Banner key={now.getTime()} kind={error ? "error" : "notice"} text={error || notice} area={a} /> : null;

  const { agents, plan } = await loadAgents(db, user.id, now, subscription);
  const newTemplate = typeof sp.new === "string" && (sp.new === "blank" || isBuiltinRole(sp.new)) ? sp.new : null;
  const payHref = `/pay/${createPayLinkToken(user.id)}`;
  const microsoft = connectionFor(connections, "microsoft");
  const google = connectionFor(connections, "google");
  // the plan's accounts (lib/billing/plans.ts): on basic and in the trial one account; a second one connected before the
  // split is paused (kept, not used) until the user disconnects one of them or upgrades
  const { inForce, paused } = providerGate(connections, plan);
  const gateOf = (provider: "microsoft" | "google"): ProviderGate => (paused.includes(provider) ? "paused" : mayConnect(connections, plan, provider) ? "open" : "pro");
  // the services behind each connected account, from its granted scopes (+ the Google user cap for the restricted reads)
  // and the plan (a service pro has and the plan does not: "במסלול פרו", a click opens the upgrade); an account that is
  // not connected shows its services faded, as a preview of what connecting gives ("Gmail - יתחבר עם Google")
  const planOpts = { plan, upgradeHref: payHref };
  const msServices = microsoft.state === "active" && microsoft.row ? connectionServices(microsoft.row, { ...planOpts, paused: paused.includes("microsoft") }) : previewServices("microsoft", { plan, secondAccount: gateOf("microsoft") === "pro" });
  const googleServices =
    google.state === "active" && google.row ? connectionServices(google.row, { ...planOpts, paused: paused.includes("google"), gates: await googleReadGates(db, google.row.account_email) }) : previewServices("google", { plan, secondAccount: gateOf("google") === "pro" });
  const linked = linkedPhones(phones);
  const meter = usageView(subscription, usage, now, tz);
  const name = firstName(user.name);
  const demo = isDemo(); // the website chat exists only in the demo
  const agentsModel = agentsView(agents, plan);
  const working = agentsModel.rows.filter((r) => r.status === "active").map((r) => r.name);
  const chips = statusChips({
    microsoft: microsoft.state,
    google: google.state,
    phone: linked.length ? (linked[0]!.status === "blocked" ? "blocked" : "linked") : "none",
    activeAgents: working.length,
    meter,
    subscriptionStatus: subscription?.status ?? null,
  });
  const slip = { subscription, meter, payHref, timeZone: tz };
  const pausedLabel = (p: "microsoft" | "google") => (paused.includes(p) ? "מושהה" : undefined);
  // round 3: monthly → annual (an active monthly plan), and "חבר מביא חבר" (the link is made on the first visit)
  const annualView = await annualSwitchView({ db, now: () => now }, user, subscription);
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const [referral, brought, ownReferral] = await Promise.all([referralLinkOf(db, user.id, appUrl), db.listReferralsBy(user.id), db.getReferralOf(user.id)]);
  const referralNumbers = referralStats(user.id, brought, ownReferral);

  return (
    <>
      <section aria-labelledby="account-title" className="relative pt-6 pb-8 sm:pt-10 lg:pb-12">
        <div className="min-w-0 pe-20 sm:pe-32 lg:pe-0">
          <Handwritten tone="sage">
            {greetingFor(now, tz)}
            {name ? `, ${name}` : ""}.
          </Handwritten>
          <h1 id="account-title" className="mt-2 text-title leading-[1.1] font-bold">
            האזור האישי
          </h1>
        </div>
        <p className="mt-3 max-w-[42rem] text-[1.125rem] leading-relaxed text-cream-muted sm:text-lede">
          {keepPrefixes(statusLine({ phoneLinked: linked.length > 0, microsoft: microsoft.state, google: google.state }))}
        </p>
        <p className="mt-1.5 text-[0.9375rem] text-cream-muted">
          <bdi dir="ltr" className="text-cream">
            {user.email}
          </bdi>
        </p>
        {/* phones: two by two, nothing hidden; wider: one row */}
        <ul aria-label="מצב החשבון" className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {chips.map((c) => (
            <li key={c.area} className="flex">
              <ChipLink chip={c} />
            </li>
          ))}
        </ul>
        {/* phones and tablets: the hoopoe beside the greeting (wide screens: on the plan slip) */}
        <Mascot pose="front" eager sizes="(min-width: 640px) 112px, 64px" className="absolute end-0 top-4 w-16 sm:top-6 sm:w-28 lg:hidden" />
      </section>

      <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <AreaNav attention={areasNeedingAttention(chips)} />

        <div className="pt-8 lg:pt-0">
          <AreaPanel area="overview">
            <div className="grid gap-x-12 gap-y-16 lg:grid-cols-[minmax(0,1fr)_19rem] lg:pt-[6.75rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
              <Section id="overview" title="סקירה" description="מה מחובר לחשבון, ומה אפשר לעשות מכאן." className="lg:-mt-[6.75rem]">
                {bannerFor("overview")}
                <OverviewRows
                  microsoft={{ state: microsoft.state, label: pausedLabel("microsoft") }}
                  google={{ state: google.state, label: pausedLabel("google") }}
                  phone={linked[0] ?? null}
                  timeZone={tz}
                  activeAgents={working}
                  agentsLine={agentsModel.quotaLine}
                  demo={demo}
                />
              </Section>
              <PlanSlip variant="summary" {...slip} className="lg:self-start" />
            </div>
          </AreaPanel>

          <AreaPanel area="connections">
            <Section id="connections" title="חיבורים" description={`מכאן ${BRAND.name} עובדת עם המייל, היומן, המשימות והקבצים. ניתוק מוחק את הגישה אצלנו.`}>
              {bannerFor("connections")}
              {paused.length && inForce[0] ? <PausedNotice inForce={inForce[0]} paused={paused[0]!} plan={plan} payHref={payHref} /> : null}
              <ul className="divide-y divide-line border-y border-line">
                <ConnectionItem provider="microsoft" title="Microsoft 365" product="Outlook" services={msServices} gate={gateOf("microsoft")} plan={plan} payHref={payHref} {...microsoft} />
                <ConnectionItem provider="google" title="Google" product="Gmail" services={googleServices} gate={gateOf("google")} plan={plan} payHref={payHref} {...google} />
              </ul>
              {plan !== "pro" && !paused.length ? <p className="mt-3 text-[0.875rem] text-cream-muted">{ONE_ACCOUNT_LINE[plan]}</p> : null}
            </Section>
          </AreaPanel>

          <AreaPanel area="whatsapp">
            <Section id="whatsapp" title="וואטסאפ" description={`המספר שממנו מדברים עם ${BRAND.name}.`}>
              {bannerFor("whatsapp")}
              <ul className="divide-y divide-line border-y border-line">
                {linked.length ? linked.map((p) => <PhoneItem key={p.id} phone={p} timeZone={tz} />) : <NoPhoneItem />}
                {demo ? <DemoChatItem /> : null}
              </ul>
              {linked.length ? <p className="mt-3 text-[0.875rem] text-cream-muted">מספר אחד לחשבון. להחלפה מנתקים את המספר הנוכחי, ומקשרים חדש מכאן.</p> : null}
            </Section>
          </AreaPanel>

          <AreaPanel area="agents">
            <AgentsSection view={agentsModel} agents={agents} payHref={payHref} newTemplate={newTemplate} banner={bannerFor("agents")} />
          </AreaPanel>

          <AreaPanel area="plan">
            {bannerFor("plan")}
            <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:pt-[6.75rem]">
              <div className="grid gap-6 lg:self-start">
                <PlanSlip variant="full" {...slip} />
                <AnnualOffer view={annualView} timeZone={tz} />
              </div>
              <PlanIncludes plan={plan} className="lg:pt-2" />
            </div>
            <ProAdds plan={plan} className="mt-14" />
            <ReferralSection link={referral.link} stats={referralNumbers} className="mt-16 border-t border-line pt-12" />
          </AreaPanel>

          <AreaPanel area="settings">
            <SettingsArea
              banner={bannerFor("settings")}
              alerts={{ included: entitlements(plan).proactive, enabled: user.profile.alerts_disabled !== true, payHref }}
              details={[
                ...(user.name ? [{ label: "שם", value: user.name }] : []),
                ...(user.business_name ? [{ label: "העסק", value: user.business_name }] : []),
                { label: "החשבון נפתח", value: formatDay(user.created_at, tz) },
              ]}
            />
          </AreaPanel>
        </div>
      </div>
    </>
  );
}

/* ---------- pieces ---------- */

/** "ניהול" beside "יציאה" — the owner only (ADMIN_EMAILS); the panel then asks for its own one-time code (lib/admin/auth.ts). */
async function AdminLink() {
  await connection();
  const session = await getSession();
  if (!session) return null;
  const user = await getDb().getUser(session.userId);
  if (!user || !isAdminEmail(user.email)) return null;
  return (
    <a href="/admin/enter" className={ctaClass({ tone: "ghost", size: "sm" })}>
      ניהול
    </a>
  );
}

/** Hebrew one-letter prefixes glued to a Latin name ("ל-Outlook") must not break after the hyphen. */
function keepPrefixes(text: string): ReactNode[] {
  return text.split(/([לבמהו]-[A-Za-z0-9][^\s.,]*)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const CHIP_DOT: Record<StatusChip["tone"], string> = {
  ok: "bg-sage",
  warn: "bg-honey",
  error: "bg-destructive",
  off: "border-[1.5px] border-cream-muted",
};

/** A status chip: a link to its area. The plan chip draws the messages used as a small bar (the words say it too). */
function ChipLink({ chip }: { chip: StatusChip }) {
  const pct = chip.meter && chip.meter.limit > 0 ? Math.min(100, (chip.meter.used / chip.meter.limit) * 100) : 0;
  return (
    <AreaLink
      area={chip.area}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-line bg-night-2/70 px-3.5 py-2 text-[0.8125rem] leading-tight text-cream transition-colors duration-150 hover:border-cream-muted/50 hover:bg-night-2 sm:min-h-10 sm:w-auto sm:rounded-full sm:px-4 sm:text-[0.875rem]"
    >
      {chip.meter ? (
        <span aria-hidden="true" className="relative h-1.5 w-9 flex-none overflow-hidden rounded-full bg-cream/12">
          <span className={cn("absolute inset-y-0 start-0 rounded-full", chip.tone === "ok" || chip.tone === "off" ? "bg-cream" : CHIP_DOT[chip.tone])} style={{ width: `${pct}%` }} />
        </span>
      ) : (
        <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", CHIP_DOT[chip.tone])} />
      )}
      <span className="sm:whitespace-nowrap">{chip.label}</span>
    </AreaLink>
  );
}

/** The shape of the page while the session is checked: the same frame, no data (no blank flash, no layout jump). */
function AccountSkeleton() {
  const bar = "rounded-full bg-cream/[0.06]";
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        טוען את האזור האישי…
      </p>
      <div className="pt-6 pb-8 sm:pt-10 lg:pb-12">
        <div className={cn(bar, "h-8 w-44")} />
        <p aria-hidden="true" className="mt-2 text-title leading-[1.1] font-bold text-cream/90">
          האזור האישי
        </p>
        <div className={cn(bar, "mt-4 h-6 w-full max-w-[34rem]")} />
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {["sm:w-36", "sm:w-36", "sm:w-36", "sm:w-60"].map((w, i) => (
            <div key={i} className={cn("h-11 rounded-2xl bg-cream/[0.06] sm:h-10 sm:rounded-full", w)} />
          ))}
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <div className="-mx-4 grid grid-flow-col border-b border-line px-2 sm:-mx-8 sm:px-6 lg:mx-0 lg:flex lg:flex-col lg:gap-1 lg:border-0 lg:px-0" aria-hidden="true">
          {ACCOUNT_AREAS.map((a) => (
            <div key={a.id} className="flex flex-col items-center gap-1 px-1.5 pt-3 pb-2.5 text-[0.8125rem] leading-none text-cream-muted/60 lg:flex-row lg:gap-3.5 lg:px-4 lg:py-3 lg:text-[1.0625rem] lg:leading-snug">
              <span className="size-[1.375rem] rounded-md bg-cream/[0.06] lg:size-5" />
              {a.label}
            </div>
          ))}
        </div>
        <div className="pt-8 lg:pt-0">
          <div className={cn(bar, "h-8 w-40")} />
          <div className="mt-6 grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-cream/[0.03]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
