import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Mascot } from "@/components/brand/mascot";
import { ctaClass } from "@/components/brand/cta";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { cardLinkFor } from "@/lib/billing/links";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { PLANS, VAT_RATE, isPaidPlan, type PaidPlan } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import type { SubscriptionRow, UserRow } from "@/lib/db/types";
import { zonedParts } from "@/lib/time/zoned";
import { Assurance, PayError, PayHeading, PayPaper, PayStage } from "../_components/pay-ui";
import { PlanCard } from "./plan-card";

export const metadata: Metadata = { title: "תשלום", robots: { index: false, follow: false } };

const VAT_PERCENT = Math.round(VAT_RATE * 100);

/**
 * The personal payment page, reached from the WhatsApp link or the personal area (no session needed; the signed
 * token names the account). Three faces:
 *  - choose a plan (trial, ended, paused, cancelled): the two plans as papers, pro in honey, then HYP's secure page;
 *  - an active subscription: update the card for the next charges (HYP J2 check, no charge) via /pay/card/<token>;
 *  - an invalid or expired link: how to get a new one.
 */
export default function PayPage(props: PageProps<"/pay/[token]">) {
  return (
    <PayStage>
      <Suspense
        fallback={
          <p role="status" className="pt-12 text-cream-muted">
            טוען את דף התשלום…
          </p>
        }
      >
        <Pay params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </PayStage>
  );
}

async function Pay({ params, searchParams }: { params: PageProps<"/pay/[token]">["params"]; searchParams: PageProps<"/pay/[token]">["searchParams"] }) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  const link = verifyPayLinkToken(token);
  await ensureDemoSessionUser();
  const user = link ? await getDb().getUser(link.userId) : null;
  if (!link || !user) return <InvalidLink />;
  const sub = await getDb().getSubscription(user.id);
  if (sub?.status === "active" && isPaidPlan(sub.plan)) return <CardUpdate user={user} sub={sub} plan={sub.plan} />;
  return <ChoosePlan user={user} sub={sub} token={token} error={error} now={new Date()} />;
}

const firstName = (user: UserRow) => (user.name ?? "").trim().split(/\s+/)[0] ?? "";

function dayOf(iso: string, timeZone: string): string {
  const { year, month, day } = zonedParts(new Date(iso), timeZone);
  return `${day}.${month}.${year}`;
}

/* ---------- choose a plan ---------- */

function ChoosePlan({ user, sub, token, error, now }: { user: UserRow; sub: SubscriptionRow | null; token: string; error: string; now: Date }) {
  const name = firstName(user);
  const past = sub && isPaidPlan(sub.plan) && sub.status !== "trial" ? sub.plan : null;
  const cancelledUntil = sub?.status === "cancelled" && sub.next_charge_at && Date.parse(sub.next_charge_at) > now.getTime() ? dayOf(sub.next_charge_at, user.timezone) : null;
  const face =
    sub?.status === "past_due"
      ? { tag: "החיוב האחרון לא עבר.", title: "הסדרת התשלום", lede: "משלמים חודש חדש בכרטיס, והחשבון חוזר לפעול מיד. כל ההגדרות, החיבורים והתזכורות נשמרו." }
      : sub?.status === "cancelled"
        ? { tag: "טוב לראות אותך שוב.", title: "חידוש המנוי", lede: "בוחרים מסלול ומשלמים חודש חדש. כל ההגדרות והחיבורים נשמרו." }
        : { tag: name ? `${name}, ממשיכים מאותו מקום.` : "ממשיכים מאותו מקום.", title: "בחירת מסלול", lede: `בוחרים מסלול, משלמים בדף המאובטח של HYP, ו${BRAND.name} ממשיכה בוואטסאפ מאיפה שעצרתם.` };

  return (
    <>
      <PayHeading tag={face.tag} title={face.title}>
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">{face.lede}</p>
        {cancelledUntil ? (
          <p className="mt-3 max-w-[38rem] text-[0.9375rem] text-cream-muted">
            המנוי פעיל עד {cancelledUntil}. כדי להמשיך אותו בלי חיוב עכשיו: בוואטסאפ, לכתוב ״המשך מנוי״.
          </p>
        ) : null}
        <p className="mt-3 text-[0.9375rem] text-cream-muted">
          החשבון:{" "}
          <bdi dir="ltr" className="text-cream">
            {user.email}
          </bdi>
        </p>
      </PayHeading>

      {error ? <PayError text={error} /> : null}

      {/* the hoopoe stands on the papers' top edge at the inline end: on the pro paper when they stand side by side */}
      <div className="relative mt-28 grid gap-5 sm:mt-32 md:grid-cols-2 md:gap-6">
        <Mascot pose="front" eager sizes="(min-width: 640px) 112px, 88px" className="absolute end-6 bottom-full -mb-1 w-[5.5rem] sm:end-8 sm:w-28" />
        {(["basic", "pro"] as const satisfies readonly PaidPlan[]).map((plan) => (
          <PlanCard key={plan} plan={plan} token={token} current={past === plan} />
        ))}
      </div>

      <div className="mt-10 grid gap-6 text-[0.9375rem] leading-relaxed text-cream-muted md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
        <ul className="flex flex-col gap-2">
          <Assurance>המחירים לחודש וכוללים מע״מ ({VAT_PERCENT}%).</Assurance>
          <Assurance>התשלום עצמו בדף המאובטח של HYP. מספר הכרטיס לא נשמר אצלנו.</Assurance>
          <Assurance>קבלה נשלחת אוטומטית במייל. ביטול בכל רגע מהאזור האישי או מהשיחה.</Assurance>
        </ul>
        <p className="text-[0.875rem]">
          בלחיצה על ״לתשלום״ מאושרים{" "}
          <Link href="/terms" className="rounded-sm underline underline-offset-3 hover:text-cream">
            תנאי השימוש
          </Link>
          , כולל חיוב חוזר חודשי עד לביטול.
        </p>
      </div>
    </>
  );
}

/* ---------- active subscription: a new card for the next charges ---------- */

function CardUpdate({ user, sub, plan }: { user: UserRow; sub: SubscriptionRow; plan: PaidPlan }) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const next = sub.next_charge_at ? dayOf(sub.next_charge_at, user.timezone) : null;
  return (
    <>
      <PayHeading tag="המנוי פעיל." title="עדכון כרטיס">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">כרטיס חדש לחיובים הבאים. את הפרטים מקלידים בדף המאובטח של HYP, והכרטיס נבדק בלי חיוב.</p>
      </PayHeading>
      <PayPaper pose="front">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-[1.5rem] leading-tight font-bold">מסלול {PLANS[plan].nameHe}</h2>
          <span className="flex-none rounded-full bg-ink px-3 py-1 text-[0.8125rem] font-semibold text-cream">פעיל</span>
        </div>
        <p className="mt-1.5 text-[1rem] text-ink-muted">{PLANS[plan].priceIls} ₪ לחודש, כולל מע״מ</p>
        {next ? (
          <dl className="mt-6 flex items-baseline justify-between gap-4 border-t border-ink/12 pt-5 text-[0.9375rem]">
            <dt className="text-ink-muted">החיוב הבא</dt>
            <dd className="font-semibold">{next}</dd>
          </dl>
        ) : null}
        {/* a plain link, never prefetched: every open of /pay/card/<token> creates a fresh HYP page */}
        <a href={cardLinkFor(appUrl, user.id)} className={ctaClass({ tone: "ink", block: true, className: "mt-7" })}>
          לעדכון הכרטיס
        </a>
        <p className="mt-3 text-[0.875rem] text-ink-muted">אימות בלבד, בלי חיוב.</p>
      </PayPaper>
      <p className="mt-8 max-w-[38rem] text-[0.9375rem] leading-relaxed text-cream-muted">
        מעבר בין מסלולים ושאר שינויי המנוי: בשיחה עם {BRAND.name}, לכתוב ״שדרוג״ או ״מעבר לבסיסי״.
      </p>
    </>
  );
}

/* ---------- invalid link ---------- */

function InvalidLink() {
  return (
    <>
      <PayHeading tag="הקישור פג." title="הקישור לא בתוקף">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">קישור התשלום תקף לשבוע.</p>
      </PayHeading>
      <PayPaper pose="thinking">
        <h2 className="font-heading text-[1.5rem] leading-tight font-bold">לקישור חדש</h2>
        <p className="mt-2 text-[1.0625rem] leading-relaxed">
          בשיחה עם {BRAND.name} בוואטסאפ, לכתוב ״תשלום״. הקישור החדש מגיע מיד.
        </p>
      </PayPaper>
    </>
  );
}
