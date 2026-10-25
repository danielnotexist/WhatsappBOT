import type { Route } from "next";
import Link from "next/link";
import { Cta } from "@/components/brand/cta";
import { Mascot } from "@/components/brand/mascot";
import { UsageMeter } from "@/components/brand/usage-meter";
import { PlanFeatureList } from "@/components/brand/plan-features";
import { PLANS, TRIAL_MESSAGES, cycleOf, isPaidPlan, planFeatures, priceOf, renewalCycleOf, type EffectivePlan, type PaidPlan } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import type { SubscriptionRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { cancelSubscriptionAction, keepAnnualAction, scheduleMonthlyAction } from "../actions";

/** The plan of the next charge (a scheduled downgrade takes effect there) — lib/billing/subscription.ts renewalPlan, client-free. */
function renewalPlanOf(sub: Pick<SubscriptionRow, "plan" | "scheduled_plan">): PaidPlan | null {
  const p = sub.scheduled_plan ?? sub.plan;
  return isPaidPlan(p) ? p : null;
}
import { formatCount, formatDay, type UsageView } from "../view";
import { AreaLink } from "./area-nav";
import { Chevron } from "./parts";

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  trial: { label: "ניסיון", className: "bg-ink/8 text-ink" },
  ended: { label: "הסתיים", className: "bg-ink/8 text-ink" },
  active: { label: "פעיל", className: "bg-ink text-cream" },
  past_due: { label: "התשלום נכשל", className: "bg-destructive/12 text-destructive" },
  cancelled: { label: "בוטל", className: "bg-ink/8 text-ink" },
};

/**
 * The subscription as the one paper slip (the same paper as the signup cards), with the usage meter; on wide screens
 * the hoopoe stands on its top edge, as on the signup papers.
 *  - "summary" (סקירה): the plan, the meter and the one next step; "לפרטי המנוי" leads to the full slip.
 *  - "full" (מנוי): also the next charge, the payment method, the upgrade and cancelling.
 */
export function PlanSlip({
  variant,
  subscription,
  meter,
  payHref,
  timeZone,
  className,
}: {
  variant: "summary" | "full";
  subscription: SubscriptionRow | null;
  meter: UsageView;
  payHref: string;
  timeZone: string;
  className?: string;
}) {
  const full = variant === "full";
  const titleId = full ? "plan-title" : "plan-summary-title";
  const onTrial = meter.plan === "trial";
  const chip = onTrial ? (subscription && subscription.status !== "trial" ? "ended" : "trial") : (subscription?.status ?? "active");
  const plan = meter.plan === "trial" ? null : PLANS[meter.plan];
  const left = meter.limit - meter.used;
  const nextCharge = subscription?.next_charge_at ? formatDay(subscription.next_charge_at, timeZone) : null;
  const Heading = full ? "h2" : "h3";
  // the cycle in force, and what the next charge will be (a scheduled change takes effect there)
  const cycle = cycleOf(subscription);
  const annual = !onTrial && cycle === "annual";
  const nextPlan = subscription ? (renewalPlanOf(subscription) ?? (meter.plan === "trial" ? null : meter.plan)) : null;
  const nextCycle = renewalCycleOf(subscription);
  const nextAmount = nextPlan ? priceOf(nextPlan, nextCycle) : null;
  const active = subscription?.status === "active";
  const toMonthly = annual && subscription?.scheduled_cycle === "monthly";
  const toBasic = subscription?.scheduled_plan === "basic" && meter.plan === "pro";

  return (
    <section aria-labelledby={titleId} className={cn("surface-light relative rounded-card bg-paper p-6 text-ink shadow-stage sm:p-8", className)}>
      <Mascot pose="front" sizes="104px" className="absolute end-8 bottom-full -mb-1 hidden w-[6.5rem] lg:block" />
      <div className="flex items-center justify-between gap-4">
        <Heading id={titleId} className="font-heading text-[1.625rem] leading-tight font-bold focus:outline-none">
          המנוי
        </Heading>
        <span className={cn("flex-none rounded-full px-3 py-1 text-[0.8125rem] font-semibold", STATUS_CHIP[chip]?.className)}>{STATUS_CHIP[chip]?.label ?? chip}</span>
      </div>
      <p className="mt-1.5 text-[1rem] text-ink-muted">
        {plan
          ? annual
            ? `מסלול ${plan.nameHe} שנתי, ${formatCount(plan.annualPriceIls)} ₪ לשנה`
            : `מסלול ${plan.nameHe}, ${plan.priceIls} ₪ לחודש`
          : `תקופת ניסיון: ${TRIAL_MESSAGES} הודעות, בלי כרטיס אשראי`}
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
              ? `שימוש הוגן, עד ${formatCount(meter.limit)} הודעות בחודש. המכסה מתחדשת ב-${meter.resetsOn}${annual ? ", גם בחיוב שנתי" : ""}.`
              : `המכסה מתחדשת ב-${meter.resetsOn}${annual ? ", גם בחיוב שנתי" : ""}.`
        }
      />

      {full && !onTrial && nextCharge ? (
        <dl className="mt-6 border-t border-ink/12 text-[0.9375rem]">
          <div className="flex items-baseline justify-between gap-4 pt-5">
            <dt className="text-ink-muted">{subscription?.status === "cancelled" ? "פעיל עד" : "החיוב הבא"}</dt>
            <dd className="text-end font-semibold">
              {nextCharge}
              {subscription?.status !== "cancelled" && nextAmount !== null ? `, ${formatCount(nextAmount)} ₪` : ""}
            </dd>
          </div>
          {/* changes that wait for the renewal (no refund for the rest of the paid period) */}
          {active && toMonthly && nextPlan ? (
            <div className="flex items-baseline justify-between gap-4 pt-3">
              <dt className="text-ink-muted">מ-{nextCharge}</dt>
              <dd className="text-end font-semibold">
                חיוב חודשי, {priceOf(nextPlan, "monthly")} ₪ לחודש
              </dd>
            </div>
          ) : null}
          {active && toBasic ? (
            <div className="flex items-baseline justify-between gap-4 pt-3">
              <dt className="text-ink-muted">מ-{nextCharge}</dt>
              <dd className="text-end font-semibold">מסלול {PLANS.basic.nameHe}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {full && active && toMonthly ? (
        <form action={keepAnnualAction} className="mt-3">
          <p className="text-[0.875rem] leading-relaxed text-ink-muted">המנוי השנתי נמשך עד {nextCharge}, ומשם החיוב חודשי.</p>
          <Cta tone="outline" size="sm" type="submit" className="mt-3">
            להישאר בחיוב שנתי
          </Cta>
        </form>
      ) : null}
      {full && active && toBasic ? <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-muted">כדי להישאר בפרו: בשיחה עם {BRAND.name}, לכתוב ״שדרוג״.</p> : null}

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
        <>
          {/* an active basic plan: the pay link opens on the upgrade (the prorated difference, the saved card) */}
          {meter.plan === "basic" ? (
            <Cta tone="ink" href={payHref} block className="mt-7">
              לשדרוג לפרו
            </Cta>
          ) : null}
          {full ? (
            <Link href={`${payHref}?view=card` as Route} className="mt-5 inline-block rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
              עדכון אמצעי תשלום
            </Link>
          ) : null}
        </>
      )}

      {full && active && annual && !toMonthly ? (
        <details className="group mt-6 border-t border-ink/12 pt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
            מעבר לחיוב חודשי
            <Chevron />
          </summary>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            המעבר נכנס לתוקף בחידוש, ב-{nextCharge ?? "סוף השנה"}: עד אז המנוי השנתי נמשך כרגיל, ומשם {nextPlan ? priceOf(nextPlan, "monthly") : PLANS.basic.priceIls} ₪ לחודש. על החלק שנותר מהשנה אין החזר.
          </p>
          <form action={scheduleMonthlyAction} className="mt-4">
            <Cta tone="outline" size="sm" type="submit">
              לעבור לחיוב חודשי בחידוש
            </Cta>
          </form>
        </details>
      ) : null}

      {full && !onTrial && subscription && subscription.status !== "cancelled" ? (
        <details className="group mt-6 border-t border-ink/12 pt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
            ביטול המנוי
            <Chevron />
          </summary>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            המנוי יישאר פעיל עד {nextCharge ?? "סוף התקופה"}, ולא יהיה חיוב נוסף.{annual ? " על החלק שנותר מהשנה אין החזר." : ""} אפשר לחדש בכל רגע.
          </p>
          <form action={cancelSubscriptionAction} className="mt-4">
            <Cta tone="outline" size="sm" type="submit">
              לבטל את המנוי
            </Cta>
          </form>
        </details>
      ) : null}

      {full || onTrial ? null : (
        <AreaLink area="plan" className="mt-5 inline-flex min-h-11 items-center rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
          פרטי המנוי והתשלום
        </AreaLink>
      )}
    </section>
  );
}

/**
 * What the plan in force includes (lib/billing/plans.ts planFeatures: the same lines as the landing and the pay page):
 * basic's list (the trial is basic in what it connects to), and on basic and in the trial what pro adds. In "מנוי" it
 * stands open on the stage beside the slip — nothing to unfold.
 */
export function PlanIncludes({ plan, className }: { plan: EffectivePlan; className?: string }) {
  const basic = planFeatures("basic");
  const pro = planFeatures("pro");
  return (
    <section aria-labelledby="plan-includes-title" className={className}>
      <h3 id="plan-includes-title" className="font-heading text-[1.25rem] leading-tight font-bold">
        {plan === "trial" ? "מה כלול בתקופת הניסיון" : "מה כלול במסלול"}
      </h3>
      {plan === "pro" ? <p className="mt-2 text-[0.9375rem] text-cream-muted">{pro.lead}</p> : null}
      <PlanFeatureList tone="night" lines={plan === "pro" ? pro.lines : basic.lines} className="mt-4" itemClassName="py-3 text-[0.9375rem]" />
    </section>
  );
}

/** On basic and in the trial: what pro adds, in two columns under the slip. */
export function ProAdds({ plan, className }: { plan: EffectivePlan; className?: string }) {
  if (plan === "pro") return null;
  return (
    <section aria-labelledby="pro-adds-title" className={className}>
      <h3 id="pro-adds-title" className="text-[1rem] font-semibold text-honey">
        במסלול פרו, בנוסף:
      </h3>
      <PlanFeatureList tone="night" lines={planFeatures("pro").lines} className="mt-2 grid gap-x-10 border-t-0 sm:grid-cols-2" itemClassName="py-3 text-[0.9375rem] text-cream-muted" />
    </section>
  );
}
