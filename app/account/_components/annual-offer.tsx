import { PendingSubmit } from "@/app/pay/_components/pending-submit";
import type { AnnualSwitchBlock, AnnualSwitchView } from "@/lib/billing/annual-switch";
import { formatIls } from "@/lib/billing/money";
import { PLANS, annualSavingIls } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { switchToAnnualAction } from "../actions";
import { formatCount, formatDay } from "../view";

const BLOCKED: Record<AnnualSwitchBlock, (last4?: string) => string> = {
  settle: () => "כדי לעבור לחיוב שנתי, קודם מסדירים את החיוב החודשי שלא עבר.",
  renewal_due: () => "החיוב החודשי מתבצע בימים אלה. אפשר לעבור לשנתי מיד אחריו.",
  no_card: () => "למעבר בלחיצה צריך כרטיס שמור. אחרי עדכון הכרטיס אפשר לעבור לשנתי מכאן.",
  card_expired: (last4) => `תוקף הכרטיס השמור${last4 ? ` (מסתיים ב-${last4})` : ""} עבר. אחרי עדכון הכרטיס אפשר לעבור לשנתי מכאן.`,
  scheduled: () => "יש שינוי מתוכנן במנוי לחידוש הקרוב. אחרי החידוש אפשר לעבור לשנתי מכאן.",
};

/**
 * [מעבר לשנתי] in "מנוי" (round 3): an active monthly plan, on the honey paper of the offers. The annual price, what
 * is credited for the days left in the month, what is charged now (VAT included) to which card, and the next charge a
 * year on. The form carries the signed offer (lib/billing/annual-switch.ts) — the amount charged is exactly this one.
 * A plan that cannot switch with one press says why instead.
 */
export function AnnualOffer({ view, timeZone, className }: { view: AnnualSwitchView; timeZone: string; className?: string }) {
  if (view.kind === "not_monthly") return null;
  if (view.kind === "blocked") {
    return (
      <section aria-labelledby="annual-title" className={cn("rounded-card border border-line bg-night-2/60 p-6 sm:p-7", className)}>
        <h3 id="annual-title" className="font-heading text-[1.25rem] leading-tight font-bold">
          מעבר לחיוב שנתי
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-cream-muted">{BLOCKED[view.reason](view.last4)}</p>
      </section>
    );
  }
  const o = view.offer;
  const spec = PLANS[o.plan];
  return (
    <section aria-labelledby="annual-title" className={cn("surface-light rounded-card bg-honey p-6 text-ink shadow-stage sm:p-8", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="annual-title" className="font-heading text-[1.375rem] leading-tight font-bold">
          מעבר לחיוב שנתי
        </h3>
        <span className="flex-none rounded-full bg-ink px-3 py-1 text-[0.8125rem] font-semibold text-cream">חודשיים מתנה</span>
      </div>
      <p className="mt-2 text-[0.9375rem] leading-relaxed">
        {formatCount(o.annualPriceIls)} ₪ לשנה במקום {formatCount(spec.priceIls * 12)} ₪: חיסכון של {formatCount(annualSavingIls(o.plan))} ₪. מכסת ההודעות נשארת חודשית.
      </p>
      <dl className="mt-5 border-t border-ink/20 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink/20 py-3">
          <dt className="text-ink-muted">קיזוז על {o.daysLeft === 1 ? "היום" : `${o.daysLeft} הימים`} שנותרו בחודש</dt>
          <dd className="text-end font-semibold">{formatIls(o.creditIls)} ₪</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-b border-ink/20 py-3">
          <dt className="text-ink-muted">לתשלום עכשיו</dt>
          <dd className="text-end">
            <span className="tabular font-heading text-[1.75rem] leading-none font-bold">{formatIls(o.amountIls)} ₪</span>
            <span className="block text-[0.8125rem] text-ink-muted">כולל מע״מ {formatIls(o.vatIls)} ₪</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">החיוב הבא</dt>
          <dd className="text-end font-semibold">
            {formatCount(o.annualPriceIls)} ₪, ב-{formatDay(o.newPeriodEnd.toISOString(), timeZone)}
          </dd>
        </div>
      </dl>
      <form action={switchToAnnualAction} className="mt-5">
        <input type="hidden" name="offer" value={o.offerToken} />
        <PendingSubmit pendingLabel="מעבירים לשנתי…">מעבר לשנתי עכשיו</PendingSubmit>
      </form>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-muted">
        חיוב אחד בכרטיס השמור (<bdi dir="ltr">{o.last4}</bdi>), והשנה מתחילה היום. הקבלה נשלחת למייל. ביטול בכל רגע: השירות נמשך עד סוף השנה, בלי החזר על החלק שנותר.
      </p>
    </section>
  );
}
