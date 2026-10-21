import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { Mascot } from "@/components/brand/mascot";
import { ProviderLogo, WhatsappGlyph } from "@/components/brand/provider-logo";
import { UsageMeter } from "@/components/brand/usage-meter";
import { Wordmark } from "@/components/brand/wordmark";
import { DELETE_CONFIRM_WORD } from "@/lib/account/service";
import { getSession } from "@/lib/auth/current-user";
import { createPayLinkToken } from "@/lib/billing/pay-link";
import { PLANS, TRIAL_MESSAGES } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import type { ConnectionRow, SubscriptionRow, WaIdentityRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { DeleteAccountForm } from "./_components/delete-account-form";
import { cancelSubscriptionAction, deleteAccountAction, disconnectAction, signOutAction, unlinkPhoneAction } from "./actions";
import {
  connectionFor,
  firstName,
  formatCount,
  formatDay,
  formatPhone,
  greetingFor,
  linkedPhones,
  statusLine,
  usageView,
  type ConnectionState,
  type UsageView,
} from "./view";

export const metadata: Metadata = { title: "האזור האישי", robots: { index: false, follow: false } };

/**
 * The personal area (round plan §3) in "לילה ירוק": a greeting and one line from עלזה about what is set up; the
 * connections and the WhatsApp number as quiet rows on the stage; the subscription as the one paper slip (the same
 * paper as the signup cards) with the usage meter; deleting the account folded away at the bottom.
 * Same server actions as before (./actions.ts).
 */
export default function AccountPage(props: PageProps<"/account">) {
  return (
    <div className="stage flex min-h-dvh flex-col">
      <header className="mx-auto flex h-[4.75rem] w-full max-w-6xl flex-none items-center justify-between px-4 sm:px-8">
        <Wordmark />
        <form action={signOutAction}>
          <Cta tone="ghost" size="sm" type="submit">
            יציאה
          </Cta>
        </form>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        <Suspense
          fallback={
            <p role="status" className="pt-12 text-cream-muted">
              טוען את האזור האישי…
            </p>
          }
        >
          <Account searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  await connection(); // the session check, the greeting and the usage period depend on the current time
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const user = await db.getUser(session.userId);
  if (!user) redirect("/login");
  const [connections, phones, subscription, usage, sp] = await Promise.all([
    db.listConnections(user.id),
    db.listWaIdentities(user.id),
    db.getSubscription(user.id),
    db.getCurrentUsage(user.id),
    searchParams,
  ]);
  const now = new Date();
  const tz = user.timezone || "Asia/Jerusalem";
  const notice = typeof sp.notice === "string" ? sp.notice.slice(0, 300) : "";
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  const microsoft = connectionFor(connections, "microsoft");
  const google = connectionFor(connections, "google");
  const linked = linkedPhones(phones);
  const meter = usageView(subscription, usage, now, tz);
  const name = firstName(user.name);

  return (
    <>
      <section aria-labelledby="account-title" className="relative flex items-end justify-between gap-6 pt-8 pb-10 sm:pt-12 sm:pb-14">
        <div className="min-w-0">
        <Handwritten tone="sage">
          {greetingFor(now, tz)}
          {name ? `, ${name}` : ""}.
        </Handwritten>
        <h1 id="account-title" className="mt-2 text-title leading-[1.1] font-bold">
          האזור האישי
        </h1>
        <p className="mt-4 max-w-[40rem] text-lede text-cream-muted">{keepPrefixes(statusLine({ phoneLinked: linked.length > 0, microsoft: microsoft.state, google: google.state }))}</p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-cream-muted">
          <bdi dir="ltr" className="text-cream">
            {user.email}
          </bdi>
          <span>חשבון מ-{formatDay(user.created_at, tz)}</span>
        </p>
        </div>
        {/* phones: tucked into the top corner beside the short greeting, so the status line keeps the full width */}
        <Mascot pose="front" eager sizes="(min-width: 640px) 112px, 64px" className="absolute end-0 top-6 w-16 flex-none sm:static sm:w-28 lg:hidden" />
      </section>

      {notice ? <Banner kind="notice" text={notice} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}

      <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_auto_1fr]">
        <Section id="connections" title="חיבורים" description={`מכאן ${BRAND.name} קוראת ושולחת מייל, ורואה את היומן. ניתוק מוחק את הגישה אצלנו.`} className="lg:col-start-1 lg:row-start-1">
          <ul className="divide-y divide-line border-y border-line">
            <ConnectionItem provider="microsoft" title="Microsoft 365" product="Outlook" {...microsoft} />
            <ConnectionItem provider="google" title="Google" product="Gmail" {...google} />
          </ul>
        </Section>

        <Section id="whatsapp" title="וואטסאפ" description={`המספר שממנו מדברים עם ${BRAND.name}.`} className="lg:col-start-1 lg:row-start-2">
          <ul className="divide-y divide-line border-y border-line">
            {linked.length ? linked.map((p) => <PhoneItem key={p.id} phone={p} timeZone={tz} />) : <NoPhoneItem />}
          </ul>
          {linked.length ? <p className="mt-3 text-[0.875rem] text-cream-muted">מספר אחד לחשבון. להחלפה מנתקים את המספר הנוכחי, ומקשרים חדש מכאן.</p> : null}
        </Section>

        <SubscriptionSlip
          subscription={subscription}
          meter={meter}
          payHref={`/pay/${createPayLinkToken(user.id)}`}
          timeZone={tz}
          className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start"
        />

        <DeleteAccount className="lg:col-start-1 lg:row-start-3" />
      </div>
    </>
  );
}

/* ---------- pieces ---------- */

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

function Section({ id, title, description, className, children }: { id: string; title: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <h2 id={`${id}-title`} className="font-heading text-[1.625rem] leading-tight font-bold">
        {title}
      </h2>
      {description ? <p className="mt-1.5 max-w-[36rem] text-[0.9375rem] leading-relaxed text-cream-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Row({ mark, title, children, action }: { mark: ReactNode; title: ReactNode; children?: ReactNode; action: ReactNode }) {
  return (
    <li className="flex items-center gap-4 py-5">
      {mark}
      <div className="min-w-0 flex-1">
        <p className="text-[1.0625rem] leading-snug font-semibold">{title}</p>
        {children}
      </div>
      <div className="flex-none">{action}</div>
    </li>
  );
}

function Tile({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid size-12 flex-none place-items-center rounded-2xl", muted ? "bg-cream/8" : "bg-cream")}>
      {children}
    </span>
  );
}

const STATE_STYLE: Record<ConnectionState, { text: string; dot: string; label: string }> = {
  active: { text: "text-sage", dot: "bg-sage", label: "מחובר" },
  expired: { text: "text-honey", dot: "bg-honey", label: "פג תוקף, צריך לחבר מחדש" },
  error: { text: "text-destructive", dot: "bg-destructive", label: "יש תקלה בחיבור" },
  none: { text: "text-cream-muted", dot: "border-[1.5px] border-cream-muted", label: "לא מחובר" },
};

function Status({ state, children }: { state: ConnectionState; children?: ReactNode }) {
  const s = STATE_STYLE[state];
  return (
    <p className={cn("mt-1 flex items-center gap-2 text-[0.9375rem]", s.text)}>
      <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", s.dot)} />
      {children ?? s.label}
    </p>
  );
}

function ConnectionItem({ provider, title, product, row, state }: { provider: "microsoft" | "google"; title: string; product: string; row: ConnectionRow | null; state: ConnectionState }) {
  const action =
    state === "active" && row ? (
      <form action={disconnectAction}>
        <input type="hidden" name="id" value={row.id} />
        <Cta tone="ghost" size="sm" type="submit" aria-label={`ניתוק ${title}`}>
          ניתוק
        </Cta>
      </form>
    ) : (
      <Cta tone={state === "none" ? "ghost" : "honey"} size="sm" href={`/api/auth/${provider}/start`} aria-label={`${state === "none" ? "חיבור" : "חיבור מחדש"} ${title}`}>
        {state === "none" ? "חיבור" : "חיבור מחדש"}
      </Cta>
    );
  return (
    <Row
      mark={
        <Tile>
          <ProviderLogo provider={provider} className="size-[1.375rem]" />
        </Tile>
      }
      title={title}
      action={action}
    >
      <Status state={state} />
      {row?.account_email && state !== "none" ? (
        <p className="mt-0.5 truncate text-[0.875rem] text-cream-muted">
          <bdi dir="ltr">{row.account_email}</bdi>
        </p>
      ) : state === "none" ? (
        <p className="mt-0.5 text-[0.875rem] text-cream-muted">מייל ויומן דרך {product}</p>
      ) : null}
    </Row>
  );
}

function PhoneItem({ phone, timeZone }: { phone: WaIdentityRow; timeZone: string }) {
  const formatted = formatPhone(phone.phone_e164);
  return (
    <Row
      mark={
        <Tile>
          <WhatsappGlyph className="size-6 text-[var(--wa-green)]" />
        </Tile>
      }
      title={
        <bdi dir="ltr" className="tabular">
          {formatted}
        </bdi>
      }
      action={
        <form action={unlinkPhoneAction}>
          <input type="hidden" name="id" value={phone.id} />
          <Cta tone="ghost" size="sm" type="submit" aria-label={`ניתוק המספר ${formatted}`}>
            ניתוק
          </Cta>
        </form>
      }
    >
      {phone.status === "blocked" ? <Status state="error">חסום</Status> : <Status state="active">מקושר מ-{formatDay(phone.linked_at, timeZone)}</Status>}
    </Row>
  );
}

function NoPhoneItem() {
  return (
    <Row
      mark={
        <Tile muted>
          <WhatsappGlyph className="size-6 text-cream-muted" />
        </Tile>
      }
      title="עוד לא קושר מספר"
      action={
        <Cta tone="ghost" size="sm" href="/start/ready">
          קישור מספר
        </Cta>
      }
    >
      <p className="mt-1 text-[0.9375rem] text-cream-muted">קוד חד-פעמי, והשיחה נפתחת בטלפון.</p>
    </Row>
  );
}

function Banner({ kind, text }: { kind: "notice" | "error"; text: string }) {
  const error = kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        // wide screens: only over the start column, so the hoopoe standing on the subscription slip has its own air
        "mb-12 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream sm:px-5 lg:me-[28rem]",
        error ? "border-destructive/45 bg-destructive/10" : "border-sage/35 bg-sage/10",
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("mt-0.5 size-5 flex-none fill-none stroke-current stroke-[2.2]", error ? "text-destructive" : "text-sage")}>
        {error ? <path d="M12 7.5v5.5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" /> : <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <p className="flex-1">{text}</p>
      <Link href="/account" className="flex-none rounded-sm text-cream-muted underline underline-offset-3 hover:text-cream">
        סגירה
      </Link>
    </div>
  );
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  trial: { label: "ניסיון", className: "bg-ink/8 text-ink" },
  ended: { label: "הסתיים", className: "bg-ink/8 text-ink" },
  active: { label: "פעיל", className: "bg-ink text-cream" },
  past_due: { label: "התשלום נכשל", className: "bg-destructive/12 text-destructive" },
  cancelled: { label: "בוטל", className: "bg-ink/8 text-ink" },
};

function SubscriptionSlip({
  subscription,
  meter,
  payHref,
  timeZone,
  className,
}: {
  subscription: SubscriptionRow | null;
  meter: UsageView;
  payHref: string;
  timeZone: string;
  className?: string;
}) {
  const onTrial = meter.plan === "trial";
  const chip = onTrial ? (subscription && subscription.status !== "trial" ? "ended" : "trial") : (subscription?.status ?? "active");
  const plan = meter.plan === "trial" ? null : PLANS[meter.plan];
  const left = meter.limit - meter.used;
  const nextCharge = subscription?.next_charge_at ? formatDay(subscription.next_charge_at, timeZone) : null;

  return (
    <section aria-labelledby="plan-title" className={cn("surface-light relative rounded-card bg-paper p-6 text-ink shadow-stage sm:p-8", className)}>
      {/* wide screens: the hoopoe stands on the slip's top edge, as on the signup papers */}
      <Mascot pose="front" sizes="104px" className="absolute end-8 bottom-full -mb-1 hidden w-[6.5rem] lg:block" />
      <div className="flex items-center justify-between gap-4">
        <h2 id="plan-title" className="font-heading text-[1.625rem] leading-tight font-bold">
          המנוי
        </h2>
        <span className={cn("flex-none rounded-full px-3 py-1 text-[0.8125rem] font-semibold", STATUS_CHIP[chip]?.className)}>{STATUS_CHIP[chip]?.label ?? chip}</span>
      </div>
      <p className="mt-1.5 text-[1rem] text-ink-muted">
        {plan ? `מסלול ${plan.nameHe}, ${plan.priceIls} ₪ לחודש` : `תקופת ניסיון: ${TRIAL_MESSAGES} הודעות, בלי כרטיס אשראי`}
      </p>

      <UsageMeter
        className="mt-7"
        used={meter.used}
        limit={meter.limit}
        label={onTrial ? "הודעות בתקופת הניסיון" : "הודעות החודש"}
        caption={
          onTrial
            ? left > 0
              ? `נשארו ${left}. אחר כך המנוי: ${PLANS.basic.priceIls} ₪ לחודש, עד ${formatCount(PLANS.basic.messages)} הודעות.`
              : `הניסיון הסתיים. אחרי בחירת מסלול ${BRAND.name} ממשיכה מאיפה שעצרתם.`
            : meter.plan === "pro"
              ? `שימוש הוגן, עד ${formatCount(meter.limit)} הודעות בחודש. המכסה מתחדשת ב-${meter.resetsOn}.`
              : `המכסה מתחדשת ב-${meter.resetsOn}.`
        }
      />

      {!onTrial && nextCharge ? (
        <dl className="mt-6 flex items-baseline justify-between gap-4 border-t border-ink/12 pt-5 text-[0.9375rem]">
          <dt className="text-ink-muted">{subscription?.status === "cancelled" ? "פעיל עד" : "החיוב הבא"}</dt>
          <dd className="font-semibold">{nextCharge}</dd>
        </dl>
      ) : null}

      {onTrial ? (
        <Cta tone="ink" href={payHref} block className="mt-7">
          בחירת מסלול
        </Cta>
      ) : subscription?.status === "past_due" ? (
        <div className="mt-6">
          <p className="text-[0.9375rem] font-semibold text-destructive">החיוב האחרון לא עבר. כדאי לעדכן את אמצעי התשלום.</p>
          <Cta tone="ink" href={payHref} block className="mt-4">
            עדכון אמצעי תשלום
          </Cta>
        </div>
      ) : subscription?.status === "cancelled" ? (
        <div className="mt-6">
          <p className="text-[0.9375rem] text-ink-muted">לא יהיה חיוב נוסף.</p>
          <Cta tone="outline" href={payHref} block className="mt-4">
            חידוש המנוי
          </Cta>
        </div>
      ) : (
        <Link href={payHref as Route} className="mt-5 inline-block rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
          עדכון אמצעי תשלום
        </Link>
      )}

      {!onTrial && subscription && subscription.status !== "cancelled" ? (
        <details className="group mt-6 border-t border-ink/12 pt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
            ביטול המנוי
            <Chevron />
          </summary>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            המנוי יישאר פעיל עד {nextCharge ?? "סוף התקופה"}, ולא יהיה חיוב נוסף. אפשר לחדש בכל רגע.
          </p>
          <form action={cancelSubscriptionAction} className="mt-4">
            <Cta tone="outline" size="sm" type="submit">
              לבטל את המנוי
            </Cta>
          </form>
        </details>
      ) : null}
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none fill-none stroke-current stroke-2 transition-transform duration-200 group-open:rotate-180">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteAccount({ className }: { className?: string }) {
  return (
    <section aria-labelledby="delete-title" className={className}>
      <details className="group rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-cream/[0.03] [&::-webkit-details-marker]:hidden">
          <span>
            <span id="delete-title" className="block font-heading text-[1.25rem] leading-tight font-bold">
              מחיקת החשבון
            </span>
            <span className="mt-0.5 block text-[0.9375rem] text-cream-muted">לצמיתות, כולל ההודעות והחיבורים.</span>
          </span>
          <Chevron />
        </summary>
        <div className="border-t border-line px-5 pt-4 pb-5">
          <p className="max-w-[36rem] text-[0.9375rem] leading-relaxed text-cream-muted">
            נמחקים לצמיתות ההודעות, ההעדפות, התזכורות, יומן הפעולות והחיבורים, והמנוי מתבטל. אין שחזור.
          </p>
          <DeleteAccountForm action={deleteAccountAction} word={DELETE_CONFIRM_WORD} />
        </div>
      </details>
    </section>
  );
}
