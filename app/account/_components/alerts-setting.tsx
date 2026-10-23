import { Cta } from "@/components/brand/cta";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * "התראות יזומות" in the settings area (pro): what the switch covers, its state in words and a dot, and one button that
 * flips it (a server action — the same profile key as "בלי התראות" / "להחזיר התראות" in WhatsApp). On basic and in the
 * trial: the line that it is part of pro, with the way there. Nothing here changes what she sends without approval.
 */
export function AlertsSetting({ included, enabled, payHref, action }: { included: boolean; enabled: boolean; payHref: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <section aria-labelledby="alerts-title" className="rounded-2xl border border-line p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-[36rem]">
          <h3 id="alerts-title" className="font-heading text-[1.25rem] leading-tight font-bold">
            התראות יזומות
          </h3>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-cream-muted">
            ״דברים שכדאי לא לפספס״ בסיכום הבוקר: מי מחכה לתשובה, מועדים מתוך מיילים, התנגשויות ביומן ותדריך לפגישה. ובנוסף עד 2 התראות דחופות ביום, בין 08:00 ל-20:00, לא בשבת
            ובחג. מייל שנראה כמו פישינג מקבל אזהרה. {BRAND.name} לא שולחת ולא משנה כלום בלי אישור.
          </p>
          {included ? (
            <p className="mt-3 flex items-center gap-2.5 text-[0.9375rem] text-cream">
              <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", enabled ? "bg-sage" : "border-[1.5px] border-cream-muted")} />
              {enabled ? "פעילות" : "כבויות"}
            </p>
          ) : (
            <p className="mt-3 text-[0.9375rem] text-cream">כלול במסלול פרו.</p>
          )}
        </div>
        <div className="flex-none">
          {included ? (
            <form action={action}>
              <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
              <Cta tone="ghost" size="sm" type="submit">
                {enabled ? "לכבות התראות" : "להפעיל התראות"}
              </Cta>
            </form>
          ) : (
            <Cta tone="ghost" size="sm" href={payHref}>
              מעבר לפרו
            </Cta>
          )}
        </div>
      </div>
    </section>
  );
}
