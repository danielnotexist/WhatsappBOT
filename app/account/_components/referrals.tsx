import { WaLinkButton } from "@/components/brand/wa-link-button";
import { BRAND } from "@/lib/brand";
import { REFERRAL_CAP_PER_YEAR } from "@/lib/referrals/constants";
import type { ReferralStats } from "@/lib/referrals/service";
import { cn } from "@/lib/utils";
import { formatCount } from "../view";
import { CopyLinkButton } from "./copy-link";
import { Section } from "./parts";

/** The message a friend gets from "שליחה בוואטסאפ" (wa.me with the text prefilled; the friend's number is picked in WhatsApp). */
export function referralShareText(link: string): string {
  return `${BRAND.name} עוזרת לי בוואטסאפ עם המייל, היומן והתזכורות. מי שנרשם דרך הקישור הזה מקבל חודש חינם אחרי התשלום הראשון: ${link}`;
}

export function referralShareHref(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(referralShareText(link))}`;
}

/**
 * "חבר מביא חבר" in the personal area (round 3, in "מנוי"): the personal link with [העתקת הקישור] and [שליחה בוואטסאפ],
 * how it works in one line (the details: the pricing FAQ and the terms), and the counters — who joined through the link, who paid, and the free months earned
 * (with the ones waiting for a paid subscription). The rules are lib/referrals (the numbers: ./constants.ts).
 */
export function ReferralSection({ link, stats, className }: { link: string; stats: ReferralStats; className?: string }) {
  const counters: { id: string; label: string; value: number; note?: string }[] = [
    { id: "joined", label: "הצטרפו דרך הקישור", value: stats.joined },
    { id: "paid", label: "שילמו", value: stats.paid },
    { id: "months", label: "חודשים חינם", value: stats.monthsEarned, note: stats.monthsPending ? `${formatCount(stats.monthsPending)} ממתינים לתשלום הבא` : undefined },
  ];
  return (
    <Section id="referrals" title="חבר מביא חבר" className={className}>
      <p className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-cream-muted">
        חבר שנרשם דרך הקישור ומשלם בפעם הראשונה: חודש חינם לכל אחד מכם, עד {REFERRAL_CAP_PER_YEAR} בשנה.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-night-2/70 p-4 sm:p-5">
        <p id="referral-link-label" className="text-[0.875rem] text-cream-muted">
          הקישור האישי שלך
        </p>
        <p aria-labelledby="referral-link-label" className="mt-1.5 text-[1.0625rem] font-semibold break-all text-cream">
          <bdi dir="ltr">{link}</bdi>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <CopyLinkButton text={link} />
          <WaLinkButton href={referralShareHref(link)} tone="honey" className="min-h-11 px-5 text-[0.9375rem]">
            שליחה בוואטסאפ
          </WaLinkButton>
        </div>
      </div>

      <dl aria-label="מה קרה עם הקישור" className="mt-6 grid grid-cols-3 gap-3 sm:max-w-[36rem]">
        {counters.map((c) => (
          <div key={c.id} className={cn("rounded-2xl border border-line px-4 py-3.5", c.id === "months" && c.value > 0 && "border-honey/50")}>
            <dt className="text-[0.8125rem] leading-snug text-cream-muted">{c.label}</dt>
            <dd className={cn("tabular mt-1 font-heading text-[1.75rem] leading-none font-bold", c.id === "months" && c.value > 0 ? "text-honey" : "text-cream")}>{formatCount(c.value)}</dd>
            {c.note ? <dd className="mt-1.5 text-[0.75rem] leading-snug text-cream-muted">{c.note}</dd> : null}
          </div>
        ))}
      </dl>
    </Section>
  );
}
