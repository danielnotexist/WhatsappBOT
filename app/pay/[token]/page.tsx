import type { Metadata, Route } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CYCLE_COOKIE } from "@/lib/billing/cycle-cookie";
import { Mascot } from "@/components/brand/mascot";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { cardLinkFor } from "@/lib/billing/links";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { VAT_RATE, cycleOf, isBillingCycle, isPaidPlan, type BillingCycle, type PaidPlan } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { webUpgradeResult, webUpgradeView, type WebUpgradeOffer } from "@/lib/billing/web-upgrade";
import { BRAND } from "@/lib/brand";
import { isPlanGateReason, type PlanGateReason } from "@/lib/connections/plan-gate";
import { getDb } from "@/lib/db";
import { paymentsOpen } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import type { SubscriptionRow, UserRow } from "@/lib/db/types";
import { zonedParts } from "@/lib/time/zoned";
import { publicWaNumber } from "@/lib/wa/public-number";
import { Assurance, PayError, PayHeading, PayNotice, PayPaper, PayStage } from "../_components/pay-ui";
import { upgradeAction } from "./actions";
import { PlanCard } from "./plan-card";
import {
  CardUpdateFace,
  UpgradeDoneFace,
  UpgradeFailedFace,
  UpgradeOfferFace,
  UpgradePendingFace,
  UpgradeUnknownFace,
  PLAN_GATE_NOTICES,
  isUpgradeNotice,
  type OfferFaceData,
} from "./upgrade-faces";

export const metadata: Metadata = { title: "תשלום", robots: { index: false, follow: false } };

const VAT_PERCENT = Math.round(VAT_RATE * 100);

/**
 * The personal payment page, reached from the WhatsApp link or the personal area (no session needed; the signed
 * token names the account). Its faces:
 *  - choose a plan (trial, ended, paused, cancelled): the two plans as papers, pro in honey, then HYP's secure page;
 *  - an active basic plan with a saved card: the upgrade to pro — the prorated difference until the end of the cycle,
 *    charged to the saved card with one press (lib/billing/web-upgrade.ts), and its result (`?upgrade=<approval>`);
 *  - an active subscription otherwise, or `?view=card`: update the card for the next charges (HYP J2 check, no charge)
 *    via /pay/card/<token>; on basic it says why the upgrade waits (no card, expired card, an overdue charge…);
 *  - an invalid or expired link: how to get a new one.
 * `?why=` (lib/connections/plan-gate.ts): a connect the plan does not include was refused (a second account, a pro
 * service) — its fixed notice stands above the face that leads to pro.
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
  // only a line this site signed (lib/flash.ts): a crafted ?error= is not shown
  const flash = readFlash(sp, { kinds: ["error"] });
  const error = flash ? flash.text.slice(0, 300) : "";
  const link = verifyPayLinkToken(token);
  await ensureDemoSessionUser();
  const db = getDb();
  const user = link ? await db.getUser(link.userId) : null;
  if (!link || !user) return <InvalidLink />;
  if (!paymentsOpen()) return <PaymentsSoon />;
  const now = new Date();
  const read = { db, now: () => now };
  const self = `/pay/${encodeURIComponent(token)}`;
  const cardHref = `${self}?view=card`;
  const cardUpdateHref = cardLinkFor(process.env.APP_URL || "http://localhost:3000", user.id);
  const notice = isUpgradeNotice(sp.r) ? sp.r : null;
  const gate = isPlanGateReason(sp.why) ? sp.why : null;
  const sub = await db.getSubscription(user.id);
  const offerData = (o: WebUpgradeOffer): OfferFaceData => ({ ...o, periodEndDay: dayOf(o.periodEnd.toISOString(), user.timezone) });
  // the cycle of the plan choice: the switch on this page (?cycle=), else the one picked on the price list (the
  // alze_cycle cookie, components/brand/landing/plan-cycle.tsx), else monthly
  const shown = typeof sp.cycle === "string" && isBillingCycle(sp.cycle) ? sp.cycle : (await cookies()).get(CYCLE_COOKIE)?.value === "annual" ? "annual" : "monthly";

  // the result of [לשדרג עכשיו] (the action redirects here; a refresh shows the same result, never a second charge)
  const upgradeId = typeof sp.upgrade === "string" ? sp.upgrade : null;
  const result = upgradeId ? await webUpgradeResult({ db }, user.id, upgradeId) : null;
  if (result?.status === "succeeded") {
    return (
      <UpgradeDoneFace
        email={user.email}
        amountIls={result.amountIls}
        vatIls={result.vatIls}
        nextAmountIls={result.nextAmountIls}
        nextCycle={result.nextCycle}
        nextDay={dayOf(result.nextChargeAt.toISOString(), user.timezone)}
        waHref={waHref()}
      />
    );
  }
  if (result?.status === "processing") return <UpgradePendingFace href={`${self}?upgrade=${encodeURIComponent(upgradeId!)}`} />;
  if (result?.status === "unknown") return <UpgradeUnknownFace />;
  if (result?.status === "failed") {
    const again = await webUpgradeView(read, user, sub);
    return (
      <UpgradeFailedFace
        token={token}
        failure={result.failure}
        ccode={result.ccode}
        last4={result.last4}
        retry={again.kind === "offer" ? offerData(again.offer) : null}
        action={upgradeAction}
        cardHref={cardHref}
        cardUpdateHref={cardUpdateHref}
      />
    );
  }

  if (sub?.status === "active" && isPaidPlan(sub.plan)) {
    const view = sub.plan === "basic" ? await webUpgradeView(read, user, sub) : null;
    if (view?.kind === "offer" && sp.view !== "card") {
      return <UpgradeOfferFace name={firstName(user)} token={token} offer={offerData(view.offer)} cardHref={cardHref} action={upgradeAction} notice={notice} error={error} gate={gate} />;
    }
    return (
      <CardUpdateFace
        plan={sub.plan}
        cycle={cycleOf(sub)}
        nextDay={sub.next_charge_at ? dayOf(sub.next_charge_at, user.timezone) : null}
        cardUpdateHref={cardUpdateHref}
        upgradeHref={view?.kind === "offer" ? self : null}
        block={view?.kind === "blocked" ? { reason: view.reason, last4: view.last4 } : null}
        notice={notice === "expired" ? "changed" : notice}
        gate={gate}
      />
    );
  }
  return <ChoosePlan user={user} sub={sub} token={token} error={error} gate={gate} now={now} cycle={shown} self={self} />;
}

/** The way back to the chat (null when no public number is configured: the page still says what happened). */
function waHref(): string | null {
  try {
    return `https://wa.me/${publicWaNumber()}`;
  } catch {
    return null;
  }
}

const firstName = (user: UserRow) => (user.name ?? "").trim().split(/\s+/)[0] ?? "";

function dayOf(iso: string, timeZone: string): string {
  const { year, month, day } = zonedParts(new Date(iso), timeZone);
  return `${day}.${month}.${year}`;
}

/* ---------- choose a plan ---------- */

function ChoosePlan({
  user,
  sub,
  token,
  error,
  gate,
  now,
  cycle,
  self,
}: {
  user: UserRow;
  sub: SubscriptionRow | null;
  token: string;
  error: string;
  gate: PlanGateReason | null;
  now: Date;
  cycle: BillingCycle;
  self: string;
}) {
  const name = firstName(user);
  const annual = cycle === "annual";
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
      {gate ? <PayNotice text={PLAN_GATE_NOTICES[gate]} /> : null}

      {/* the cycle: two links (no script needed), the price list's choice preselected */}
      <nav aria-label="מחזור החיוב" className="mt-10 inline-flex rounded-full border border-line bg-night-2/70 p-1">
        {(["monthly", "annual"] as const).map((c) => (
          <Link
            key={c}
            href={`${self}?cycle=${c}` as Route}
            aria-current={cycle === c ? "page" : undefined}
            replace
            scroll={false}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold transition-colors duration-150",
              cycle === c ? "bg-cream text-ink" : "text-cream-muted hover:text-cream",
            )}
          >
            {c === "monthly" ? "חודשי" : "שנתי"}
            {c === "annual" ? <span className={cn("rounded-full px-2 py-0.5 text-[0.8125rem] leading-tight", cycle === c ? "bg-honey text-ink" : "bg-honey/15 text-honey")}>חודשיים מתנה</span> : null}
          </Link>
        ))}
      </nav>

      {/* the hoopoe stands on the papers' top edge at the inline end: on the pro paper when they stand side by side */}
      <div className="relative mt-28 grid gap-5 sm:mt-32 md:grid-cols-2 md:gap-6">
        <Mascot pose="front" eager sizes="(min-width: 640px) 112px, 88px" className="absolute end-6 bottom-full -mb-1 w-[5.5rem] sm:end-8 sm:w-28" />
        {(["basic", "pro"] as const satisfies readonly PaidPlan[]).map((plan) => (
          <PlanCard key={plan} plan={plan} token={token} current={past === plan} cycle={cycle} />
        ))}
      </div>

      <div className="mt-10 grid gap-6 text-[0.9375rem] leading-relaxed text-cream-muted md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
        <ul className="flex flex-col gap-2">
          <Assurance>{annual ? `המחירים לשנה, בחיוב אחד, וכוללים מע״מ (${VAT_PERCENT}%). מכסת ההודעות נשארת חודשית.` : `המחירים לחודש וכוללים מע״מ (${VAT_PERCENT}%).`}</Assurance>
          <Assurance>התשלום עצמו בדף המאובטח של HYP. מספר הכרטיס לא נשמר אצלנו.</Assurance>
          <Assurance>
            {annual ? "קבלה נשלחת אוטומטית במייל. ביטול בכל רגע: השירות נמשך עד סוף השנה ששולמה, בלי החזר על החלק שנותר." : "קבלה נשלחת אוטומטית במייל. ביטול בכל רגע מהאזור האישי או מהשיחה."}
          </Assurance>
        </ul>
        <p className="text-[0.875rem]">
          בלחיצה על ״לתשלום״ מאושרים{" "}
          <Link href="/terms" className="rounded-sm underline underline-offset-3 hover:text-cream">
            תנאי השימוש
          </Link>
          , כולל חיוב חוזר {annual ? "שנתי" : "חודשי"} עד לביטול.
        </p>
      </div>
    </>
  );
}

/* ---------- payments not open yet (no real HYP terminal on this deployment) ---------- */

function PaymentsSoon() {
  return (
    <>
      <PayHeading tag="עוד מעט." title="התשלום ייפתח בקרוב">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">דף התשלום עדיין לא פתוח. החשבון ממשיך לפעול כרגיל, ולא נדרש כרגע שום דבר.</p>
      </PayHeading>
      <PayPaper pose="thinking">
        <h2 className="font-heading text-[1.5rem] leading-tight font-bold">מה הלאה</h2>
        <p className="mt-2 text-[1.0625rem] leading-relaxed">
          כשהתשלום ייפתח, {BRAND.name} תשלח הודעה בוואטסאפ עם קישור חדש.
        </p>
      </PayPaper>
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
