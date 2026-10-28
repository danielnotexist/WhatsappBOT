import type { ReactNode } from "react";
import { DELETE_CONFIRM_WORD } from "@/lib/account/service";
import { deleteAccountAction, setAlertsAction } from "../actions";
import { AlertsSetting } from "./alerts-setting";
import { DeleteAccountForm } from "./delete-account-form";
import { Section } from "./parts";

/**
 * "הגדרות": the account's details as עלזה keeps them, the proactive alerts' switch (pro), and deleting the account. In
 * its own area the delete form is out in the open (no fold to find) — the typed word is what keeps it from a slip of the hand.
 */
export function SettingsArea({
  details,
  banner,
  alerts,
}: {
  details: { label: string; value: string }[];
  banner?: ReactNode;
  /** the proactive alerts (lib/proactive): included in the plan, on or off, and the way to pro */
  alerts?: { included: boolean; enabled: boolean; payHref: string };
}) {
  return (
    <div className="grid gap-14">
      <Section id="settings" title="הגדרות">
        {banner}
        <dl className="divide-y divide-line border-y border-line">
          {details.map((d) => (
            <div key={d.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
              <dt className="text-[0.9375rem] text-cream-muted">{d.label}</dt>
              <dd className="text-[1rem] text-cream">{d.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {alerts ? <AlertsSetting {...alerts} action={setAlertsAction} /> : null}

      <section aria-labelledby="delete-title" className="rounded-2xl border border-destructive/30 p-5 sm:p-7">
        <h3 id="delete-title" className="font-heading text-[1.25rem] leading-tight font-bold">
          מחיקת החשבון
        </h3>
        <p className="mt-2 max-w-[36rem] text-[0.9375rem] leading-relaxed text-cream-muted">
          נמחקים לצמיתות ההודעות, ההעדפות, התזכורות, יומן הפעולות והחיבורים, והמנוי מתבטל. אין שחזור.
        </p>
        <DeleteAccountForm action={deleteAccountAction} word={DELETE_CONFIRM_WORD} />
      </section>
    </div>
  );
}
