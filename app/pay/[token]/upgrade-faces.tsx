import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ctaClass } from "@/components/brand/cta";
import { PlanFeatureList } from "@/components/brand/plan-features";
import { WaLinkButton } from "@/components/brand/wa-link-button";
import { formatIls } from "@/lib/billing/money";
import { PER_CYCLE_HE, PLANS, planFeatures, priceOf, type BillingCycle, type PaidPlan, type PlanFeatureLine } from "@/lib/billing/plans";
import type { UpgradeBlock, UpgradeFailure } from "@/lib/billing/web-upgrade";
import type { PlanGateReason } from "@/lib/connections/plan-gate";
import { BRAND } from "@/lib/brand";
import { daysHe } from "@/lib/copy/bot-billing";
import { cn } from "@/lib/utils";
import { Assurance, PayError, PayHeading, PayNotice, PayPaper, StageLink } from "../_components/pay-ui";
import { PendingSubmit } from "../_components/pending-submit";

/**
 * The faces of /pay/<token> for an active subscription (the page picks one; these only render): the upgrade offer
 * (basic, a saved card), its result (upgraded / not charged / in doubt / still charging) and the card update. Pure:
 * every date and amount comes in ready, the form posts to the server action given in `action`.
 */

type FormAction = (formData: FormData) => void | Promise<void>;

const count = (n: number) => new Intl.NumberFormat("he-IL").format(n);
/** a whole price with its thousands ("2,990"), an agorot amount as charged ("135.48") */
const money = (n: number) => (Number.isInteger(n) ? count(n) : formatIls(n));

/**
 * What pro adds to basic: the messages, then pro's lines of the price list (lib/billing/plans.ts planFeatures, from
 * the entitlements), so the page never promises more than the plan; "בקרוב" on what is coming.
 */
export function proAdds(): PlanFeatureLine[] {
  const { basic, pro } = PLANS;
  return [{ id: "messages", text: `עד ${count(pro.messages)} הודעות בחודש, במקום ${count(basic.messages)}` }, ...planFeatures("pro").lines];
}

/**
 * Why the connect step sent the user here (`?why=`, lib/connections/plan-gate.ts): fixed text by code, never text from
 * the URL. Shown above the face (the plan choice, the upgrade offer, the card update).
 */
export const PLAN_GATE_NOTICES: Record<PlanGateReason, string> = {
  second_account: "בתקופת הניסיון ובמסלול הבסיסי עובדים עם חשבון אחד: Google או Microsoft. שניהם יחד כלולים במסלול פרו. אפשר גם להחליף חשבון: לנתק את החשבון המחובר באזור האישי, ואז לחבר את השני.",
  pro_feature: "השירות הזה כלול במסלול פרו. אחרי השדרוג אפשר לאשר אותו מהאזור האישי.",
};

/** "ל-21 ימים" / "ליומיים" / "ליום אחד" */
const forDays = (n: number) => (n > 2 ? `ל-${daysHe(n)}` : `ל${daysHe(n)}`);

/** The `?r=` codes the upgrade action sends back (fixed text; nothing from the URL is shown). */
export const UPGRADE_NOTICES = {
  expired: "עברו יותר מ-10 דקות מאז שהמחיר הוצג, ולכן לא בוצע חיוב. כאן המחיר המעודכן.",
  changed: "המצב של המנוי השתנה מאז שהמחיר הוצג, ולכן לא בוצע חיוב.",
  busy: "יש חיוב קודם שעדיין בבדיקה. כדי לא לחייב פעמיים, לא בוצע חיוב נוסף.",
  error: "לא הצלחנו להשלים את השדרוג כרגע, ולא בוצע חיוב. אפשר לנסות שוב בעוד רגע.",
  signin: "השדרוג מחויב בכרטיס השמור, ולכן הוא נעשה אחרי כניסה לחשבון. אחרי הכניסה, באזור האישי: ״לשדרוג לפרו״.",
} as const;
export type UpgradeNotice = keyof typeof UPGRADE_NOTICES;

export function isUpgradeNotice(x: unknown): x is UpgradeNotice {
  return typeof x === "string" && Object.hasOwn(UPGRADE_NOTICES, x);
}

function Notice({ code, error }: { code?: UpgradeNotice | null; error?: string }) {
  if (error) return <PayError text={error} />;
  if (!code) return null;
  return code === "busy" || code === "error" ? <PayError text={UPGRADE_NOTICES[code]} /> : <PayNotice text={UPGRADE_NOTICES[code]} />;
}

/** One "label — value" row on a paper. */
function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-ink/20 py-3", className)}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-end font-semibold">{children}</dd>
    </div>
  );
}

export interface OfferFaceData {
  amountIls: number;
  vatIls: number;
  daysLeft: number;
  /** "10.11.2026" in the user's zone */
  periodEndDay: string;
  nextAmountIls: number;
  /** the cycle in force (annual: the difference is prorated over the year that was paid); monthly when absent */
  cycle?: BillingCycle;
  /** the cycle of the next charge ("לחודש" / "לשנה" after its amount); monthly when absent */
  nextCycle?: BillingCycle;
  last4: string;
  offerToken: string;
}

/** The hidden fields + [לשדרג עכשיו]. */
function UpgradeForm({ token, offer, action, label, pendingLabel, className, children }: { token: string; offer: OfferFaceData; action: FormAction; label: string; pendingLabel: string; className?: string; children?: ReactNode }) {
  return (
    <form action={action} className={className}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="offer" value={offer.offerToken} />
      {children}
      <PendingSubmit pendingLabel={pendingLabel}>{label}</PendingSubmit>
    </form>
  );
}

/* ---------- the offer: an active basic plan with a saved card ---------- */

export function UpgradeOfferFace({
  name,
  token,
  offer,
  cardHref,
  action,
  notice,
  error,
  gate,
}: {
  name: string;
  token: string;
  offer: OfferFaceData;
  /** the card-update face of this page (?view=card) */
  cardHref: string;
  action: FormAction;
  notice?: UpgradeNotice | null;
  error?: string;
  /** the connect step was refused for the plan (`?why=`) */
  gate?: PlanGateReason | null;
}) {
  const amount = formatIls(offer.amountIls);
  const next = money(offer.nextAmountIls);
  const per = PER_CYCLE_HE[offer.nextCycle ?? "monthly"];
  return (
    <>
      <PayHeading tag={name ? `${name}, עוברים לפרו.` : "עוברים לפרו."} title="שדרוג לפרו">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">
          {offer.cycle === "annual"
            ? "המנוי שנתי: משלמים עכשיו רק את ההפרש היחסי עד סוף השנה ששולמה, בכרטיס השמור. מסלול פרו פעיל מיד, ומועד החיוב לא משתנה."
            : "משלמים עכשיו רק את ההפרש עד סוף התקופה הנוכחית, בכרטיס השמור. מסלול פרו פעיל מיד."}
        </p>
      </PayHeading>

      <Notice code={notice} error={error} />
      {gate ? <PayNotice text={PLAN_GATE_NOTICES[gate]} /> : null}

      <div className="grid gap-x-14 md:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <PayPaper pose="front" tone="honey" className="max-w-none">
          <div className="flex items-center justify-between gap-3">
            <h2 id="upgrade-title" className="font-heading text-[1.5rem] leading-tight font-bold">
              מסלול {PLANS.pro.nameHe}
            </h2>
            <span className="flex-none rounded-full bg-ink px-3 py-1 text-[0.8125rem] font-semibold text-cream">פעיל מיד</span>
          </div>

          <p className="mt-6 text-[1rem] text-ink-muted">לתשלום עכשיו</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tabular font-heading text-[clamp(3.25rem,2.6rem+2.4vw,4.75rem)] leading-[0.9] font-bold tracking-[-0.02em]">{amount}</span>
            <span className="font-heading text-[1.75rem] leading-none font-bold">₪</span>
          </p>
          <p className="mt-3 text-[0.9375rem] text-ink-muted">כולל מע״מ {formatIls(offer.vatIls)} ₪</p>
          <p className="mt-4 text-[1rem] leading-relaxed">
            ההפרש בין המסלולים {forDays(offer.daysLeft)}, עד {offer.periodEndDay}.
          </p>

          <dl className="mt-6 border-t border-ink/20 text-[0.9375rem]">
            <Row label="מהחיוב הבא">
              {next} ₪ {per}, מ-{offer.periodEndDay}
            </Row>
            <Row label="החיוב בכרטיס">
              מסתיים ב-<bdi dir="ltr">{offer.last4}</bdi>
            </Row>
          </dl>

          <p className="mt-7 text-[1rem] text-ink-muted">כל מה שבבסיסי, ובנוסף:</p>
          <PlanFeatureList lines={proAdds()} rule="border-ink/20" className="mt-2" itemClassName="py-3 text-[1rem]" />

          <UpgradeForm token={token} offer={offer} action={action} label="לשדרג עכשיו" pendingLabel="משדרגים…" className="mt-8" />
          <p className="mt-3 text-[0.875rem] text-ink-muted">חיוב אחד של {amount} ₪ עכשיו. הקבלה נשלחת למייל.</p>
          <Link href={cardHref as Route} className="mt-5 inline-block rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
            עדכון כרטיס
          </Link>
        </PayPaper>

        <div className="mt-10 text-[0.9375rem] leading-relaxed text-cream-muted md:mt-32 md:max-w-[26rem] md:pt-9">
          <ul className="flex flex-col gap-2.5">
            <Assurance>המכסה של החודש עולה מיד ל-{count(PLANS.pro.messages)} הודעות.</Assurance>
            <Assurance>החיוב בכרטיס השמור, בלי להקליד פרטים מחדש.</Assurance>
            <Assurance>
              מ-{offer.periodEndDay}: {next} ₪ {per}, כולל מע״מ. ביטול בכל רגע מהאזור האישי או מהשיחה.
            </Assurance>
          </ul>
          <p className="mt-6 text-[0.875rem]">
            בלחיצה על ״לשדרג עכשיו״ מאושרים{" "}
            <Link href="/terms" className="rounded-sm underline underline-offset-3 hover:text-cream">
              תנאי השימוש
            </Link>
            , כולל חיוב חוזר {offer.nextCycle === "annual" ? "שנתי" : "חודשי"} עד לביטול.
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------- the result ---------- */

export function UpgradeDoneFace({
  email,
  amountIls,
  vatIls,
  nextAmountIls,
  nextCycle = "monthly",
  nextDay,
  waHref,
}: {
  email: string;
  amountIls: number;
  vatIls: number;
  nextAmountIls: number;
  nextCycle?: BillingCycle;
  nextDay: string;
  waHref: string | null;
}) {
  return (
    <>
      <PayHeading tag="תודה." title="המסלול שודרג לפרו">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">מסלול פרו פעיל מעכשיו, עם כל מה שהוא כולל.</p>
      </PayHeading>
      <PayPaper pose="celebrating" tone="honey">
        <h2 className="font-heading text-[1.5rem] leading-tight font-bold" role="status">
          מסלול {PLANS.pro.nameHe} פעיל
        </h2>
        <dl className="mt-5 border-t border-ink/20 text-[0.9375rem]">
          <Row label="חויבו עכשיו">
            {formatIls(amountIls)} ₪ <span className="font-normal text-ink-muted">(כולל מע״מ {formatIls(vatIls)} ₪)</span>
          </Row>
          <Row label="החיוב הבא">
            {money(nextAmountIls)} ₪ {PER_CYCLE_HE[nextCycle]}, ב-{nextDay}
          </Row>
        </dl>
        <p className="mt-5 text-[1rem] leading-relaxed">
          הקבלה נשלחה למייל{" "}
          <bdi dir="ltr" className="font-semibold">
            {email}
          </bdi>
          .
        </p>
        {waHref ? (
          <WaLinkButton href={waHref} tone="ink" block className="mt-7">
            חזרה לוואטסאפ
          </WaLinkButton>
        ) : null}
      </PayPaper>
      <p className="mt-8">
        <StageLink href="/account?tab=plan">לאזור האישי</StageLink>
      </p>
    </>
  );
}

const FAILURE_TEXT: Record<UpgradeFailure, (o: { ccode: string | null; last4: string | null }) => string> = {
  declined: ({ ccode }) => `חברת האשראי לא אישרה את החיוב${ccode ? ` (קוד ${ccode})` : ""}. אפשר לנסות שוב, או לעדכן כרטיס.`,
  temporary: () => "הייתה תקלת תקשורת מול חברת האשראי. אפשר לנסות שוב בעוד רגע.",
  card: ({ ccode }) => `הכרטיס השמור לא אושר לחיוב${ccode ? ` (קוד ${ccode})` : ""}. כדי לשדרג, מעדכנים כרטיס וחוזרים לכאן.`,
  card_expired: ({ last4 }) => `תוקף הכרטיס השמור${last4 ? ` (מסתיים ב-${last4})` : ""} עבר. כדי לשדרג, מעדכנים כרטיס וחוזרים לכאן.`,
  no_card: () => "אין כרטיס שמור לחיוב. כדי לשדרג, מעדכנים כרטיס וחוזרים לכאן.",
  config: () => "יש תקלה זמנית במערכת התשלומים שלנו, וכבר מטפלים בה. אפשר לנסות שוב מאוחר יותר.",
  changed: () => "המצב של המנוי השתנה מאז שהמחיר הוצג.",
};

/** A card problem: the way forward is a card update, not another try. */
const CARD_FAILURES: readonly UpgradeFailure[] = ["card", "card_expired", "no_card"];

export function UpgradeFailedFace({
  token,
  failure,
  ccode,
  last4,
  retry,
  action,
  cardHref,
  cardUpdateHref,
}: {
  token: string;
  failure: UpgradeFailure;
  ccode: string | null;
  last4: string | null;
  /** a fresh offer when the plan can still be upgraded now (a new nonce — the failed one is spent) */
  retry: OfferFaceData | null;
  action: FormAction;
  /** the card-update face of this page (?view=card) */
  cardHref: string;
  /** the HYP card-update page itself (/pay/card/<token>) */
  cardUpdateHref: string;
}) {
  const cardFirst = CARD_FAILURES.includes(failure);
  return (
    <>
      <PayHeading tag="לא בוצע חיוב." title="השדרוג לא הושלם">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">המסלול נשאר בסיסי, ושום דבר לא השתנה.</p>
      </PayHeading>
      <PayPaper pose="thinking">
        <p role="alert" className="text-[1.125rem] leading-relaxed">
          {FAILURE_TEXT[failure]({ ccode, last4 })}
        </p>
        {cardFirst ? (
          <>
            {/* a plain link, never prefetched: every open of /pay/card/<token> creates a fresh HYP page */}
            <a href={cardUpdateHref} className={ctaClass({ tone: "ink", block: true, className: "mt-7" })}>
              לעדכון הכרטיס
            </a>
            <p className="mt-3 text-[0.875rem] text-ink-muted">אימות בלבד, בלי חיוב.</p>
          </>
        ) : retry ? (
          <>
            {failure === "changed" ? (
              <p className="mt-4 text-[1rem] leading-relaxed">
                המחיר המעודכן: {formatIls(retry.amountIls)} ₪, {forDays(retry.daysLeft)} עד {retry.periodEndDay}.
              </p>
            ) : null}
            <UpgradeForm token={token} offer={retry} action={action} label={`לנסות שוב, ${formatIls(retry.amountIls)} ₪`} pendingLabel="מנסים שוב…" className="mt-7" />
            <Link href={cardHref as Route} className="mt-5 inline-block rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
              עדכון כרטיס
            </Link>
          </>
        ) : (
          <Link href={cardHref as Route} className={ctaClass({ tone: "outline", block: true, className: "mt-7" })}>
            לפרטי המנוי
          </Link>
        )}
      </PayPaper>
      <p className="mt-8">
        <StageLink href="/account?tab=plan">לאזור האישי</StageLink>
      </p>
    </>
  );
}

/** No clear answer from HYP: the charge may exist — never offer another try (the per-user lock blocks it anyway). */
export function UpgradeUnknownFace() {
  return (
    <>
      <PayHeading tag="בודקים את זה." title="החיוב בבדיקה" />
      <PayPaper pose="thinking">
        <p role="status" className="text-[1.125rem] leading-relaxed">
          לא התקבלה תשובה ברורה מחברת האשראי. כדי לא לחייב פעמיים, לא יבוצע ניסיון נוסף עד שזה יתברר. אם החיוב עבר, הקבלה תגיע למייל.
        </p>
      </PayPaper>
      <p className="mt-8">
        <StageLink href="/account?tab=plan">לאזור האישי</StageLink>
      </p>
    </>
  );
}

/** The first click is still charging (seen only when a second request outlived the wait). */
export function UpgradePendingFace({ href }: { href: string }) {
  return (
    <>
      <PayHeading tag="רגע." title="השדרוג מתבצע" />
      <PayPaper pose="thinking">
        <p role="status" className="text-[1.125rem] leading-relaxed">
          החיוב עדיין בתהליך. בעוד כמה שניות אפשר לרענן את הדף ולראות את התוצאה.
        </p>
        <a href={href} className={ctaClass({ tone: "outline", block: true, className: "mt-7" })}>
          לרענון הדף
        </a>
      </PayPaper>
    </>
  );
}

/* ---------- active subscription: a new card for the next charges ---------- */

const BLOCK_TEXT: Record<UpgradeBlock, (last4?: string) => string> = {
  settle: () => "לפני שדרוג צריך להסדיר את החיוב החודשי שלא עבר. אחרי עדכון הכרטיס מאשרים את החיוב בוואטסאפ, ואז אפשר לשדרג מכאן.",
  renewal_due: () => "החיוב החודשי מתבצע בימים אלה. אפשר לשדרג מכאן מיד אחריו.",
  no_card: () => "לשדרוג בלחיצה צריך כרטיס שמור. אחרי עדכון הכרטיס אפשר לשדרג מכאן.",
  card_expired: (last4) => `תוקף הכרטיס השמור${last4 ? ` (מסתיים ב-${last4})` : ""} עבר. אחרי עדכון הכרטיס אפשר לשדרג מכאן.`,
};

export function CardUpdateFace({
  plan,
  cycle = "monthly",
  nextDay,
  cardUpdateHref,
  upgradeHref,
  signInHref = null,
  block,
  notice,
  gate,
}: {
  plan: PaidPlan;
  /** how the plan is charged (the price line: "990 ₪ לשנה") */
  cycle?: BillingCycle;
  nextDay: string | null;
  /** the HYP card-update page (/pay/card/<token>) */
  cardUpdateHref: string;
  /** basic with a one-tap upgrade available: the upgrade face of this page */
  upgradeHref: string | null;
  /** basic, viewed without the account's session: the upgrade waits for a sign-in (the link to it) */
  signInHref?: string | null;
  /** basic without one: why (shown above the paper) */
  block: { reason: UpgradeBlock; last4?: string } | null;
  notice?: UpgradeNotice | null;
  /** the connect step was refused for the plan (`?why=`) */
  gate?: PlanGateReason | null;
}) {
  return (
    <>
      <PayHeading tag="המנוי פעיל." title="עדכון כרטיס">
        <p className="mt-4 max-w-[38rem] text-lede text-cream-muted">כרטיס חדש לחיובים הבאים. את הפרטים מקלידים בדף המאובטח של HYP, והכרטיס נבדק בלי חיוב.</p>
      </PayHeading>
      {notice ? <Notice code={notice} /> : null}
      {gate && plan === "basic" ? <PayNotice text={PLAN_GATE_NOTICES[gate]} /> : null}
      {block ? <PayNotice text={BLOCK_TEXT[block.reason](block.last4)} /> : null}
      <PayPaper pose="front">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-[1.5rem] leading-tight font-bold">מסלול {PLANS[plan].nameHe}</h2>
          <span className="flex-none rounded-full bg-ink px-3 py-1 text-[0.8125rem] font-semibold text-cream">פעיל</span>
        </div>
        <p className="mt-1.5 text-[1rem] text-ink-muted">
          {count(priceOf(plan, cycle))} ₪ {PER_CYCLE_HE[cycle]}, כולל מע״מ{cycle === "annual" ? ". מכסת ההודעות חודשית" : ""}
        </p>
        {nextDay ? (
          <dl className="mt-6 flex items-baseline justify-between gap-4 border-t border-ink/12 pt-5 text-[0.9375rem]">
            <dt className="text-ink-muted">החיוב הבא</dt>
            <dd className="font-semibold">{nextDay}</dd>
          </dl>
        ) : null}
        {/* a plain link, never prefetched: every open of /pay/card/<token> creates a fresh HYP page */}
        <a href={cardUpdateHref} className={ctaClass({ tone: "ink", block: true, className: "mt-7" })}>
          לעדכון הכרטיס
        </a>
        <p className="mt-3 text-[0.875rem] text-ink-muted">אימות בלבד, בלי חיוב.</p>
      </PayPaper>
      {upgradeHref ? (
        <p className="mt-8">
          <StageLink href={upgradeHref as Route}>לשדרוג לפרו</StageLink>
        </p>
      ) : signInHref ? (
        <p className="mt-8">
          <StageLink href={signInHref as Route}>כניסה לחשבון</StageLink>
        </p>
      ) : plan === "pro" ? (
        <p className="mt-8 max-w-[38rem] text-[0.9375rem] leading-relaxed text-cream-muted">מעבר למסלול הבסיסי: בשיחה עם {BRAND.name}, לכתוב ״מעבר לבסיסי״.</p>
      ) : null}
    </>
  );
}
