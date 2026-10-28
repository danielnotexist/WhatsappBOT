"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { CYCLE_COOKIE, CYCLE_COOKIE_MAX_AGE } from "@/lib/billing/cycle-cookie";
import { cn } from "@/lib/utils";

/**
 * The monthly / annual switch of the price cards (round 3, "מסלול שנתי"): the landing and /pricing. Monthly by default;
 * the annual face shows what the year comes to per month ("82.50 ₪ לחודש") and the yearly charge under it. The choice is
 * remembered in a first-party cookie (alze_cycle, 30 days) so the payment page opens on the same cycle — nothing is
 * charged from here; the plan is still chosen and paid on the pay page. The numbers come in as props from the server
 * (lib/billing/plans.ts), so this client file carries no prices of its own.
 */
export type ShownCycle = "monthly" | "annual";


export const CYCLE_LABELS = { legend: "מחזור החיוב", monthly: "חודשי", annual: "שנתי", gift: "חודשיים מתנה" } as const;

const CycleContext = createContext<{ cycle: ShownCycle; setCycle: (c: ShownCycle) => void }>({ cycle: "monthly", setCycle: () => undefined });

function remember(cycle: ShownCycle) {
  try {
    document.cookie = `${CYCLE_COOKIE}=${cycle}; path=/; max-age=${CYCLE_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // no cookies: the pay page simply opens on monthly
  }
}

export function CycleProvider({ children }: { children: ReactNode }) {
  const [cycle, setCycleState] = useState<ShownCycle>("monthly");
  const setCycle = (c: ShownCycle) => {
    setCycleState(c);
    remember(c);
  };
  return <CycleContext.Provider value={{ cycle, setCycle }}>{children}</CycleContext.Provider>;
}

export function useShownCycle(): ShownCycle {
  return useContext(CycleContext).cycle;
}

/**
 * Two native radios styled as one pill on the night stage: arrow keys move between them, the checked one is the
 * cream face. "חודשיים מתנה" rides on the annual option in honey.
 */
export function CycleToggle({ className }: { className?: string }) {
  const { cycle, setCycle } = useContext(CycleContext);
  const name = useId();
  const option = (value: ShownCycle, label: ReactNode) => (
    <label
      className={cn(
        "relative flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cream",
        cycle === value ? "bg-cream text-ink" : "text-cream-muted hover:text-cream",
      )}
    >
      <input type="radio" name={name} value={value} checked={cycle === value} onChange={() => setCycle(value)} className="sr-only" />
      {label}
    </label>
  );
  return (
    <fieldset className={cn("inline-flex min-w-0", className)}>
      <legend className="sr-only">{CYCLE_LABELS.legend}</legend>
      <div className="inline-flex rounded-full border border-line bg-night-2/70 p-1">
        {option("monthly", <span>{CYCLE_LABELS.monthly}</span>)}
        {option(
          "annual",
          <>
            <span>{CYCLE_LABELS.annual}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[0.8125rem] leading-tight font-semibold", cycle === "annual" ? "bg-honey text-ink" : "bg-honey/15 text-honey")}>{CYCLE_LABELS.gift}</span>
          </>,
        )}
      </div>
    </fieldset>
  );
}

/**
 * One plan's price on its card. Monthly: "99 ₪ לחודש", and under it the annual offer. Annual (Daniel, 28.10.2026: the
 * month's share reads cheaper than the year's total): "82.50 ₪ לחודש" with the monthly price struck through, and under
 * it the yearly charge ("990 ₪ לשנה, בחיוב אחד"). Both faces have the same two lines, so the cards keep their height
 * when the switch flips. The amounts arrive formatted ("99", "990", "82.50").
 */
export function PlanPrice({ monthly, annual, perMonth }: { monthly: string; annual: string; perMonth: string }) {
  const yearly = useShownCycle() === "annual";
  const [whole, agorot] = perMonth.split(".");
  return (
    <p className="flex flex-none items-end gap-1.5">
      <span className="tabular font-heading text-[clamp(3.25rem,2.6rem+2vw,4.5rem)] leading-[0.85] font-bold tracking-[-0.02em]">
        {yearly ? (
          <>
            <span className="sr-only">{perMonth}</span>
            {/* the agorot small and raised, as on a price tag */}
            <span aria-hidden="true" data-price-month="">
              {whole}
              {agorot ? <span className="align-top text-[0.42em] leading-none">.{agorot}</span> : null}
            </span>
          </>
        ) : (
          monthly
        )}
      </span>
      <span className="font-heading text-[1.75rem] leading-none font-bold">₪</span>
      {/* two short lines beside the digits (no extra height): the period, then the other cycle / the yearly charge */}
      <span className="ms-0.5 flex flex-col pb-0.5 text-[0.875rem] leading-[1.3] text-ink-muted">
        {yearly ? (
          <span className="whitespace-nowrap">
            לחודש · <span className="sr-only">במקום </span>
            <s>{monthly} ₪</s>
          </span>
        ) : (
          <span className="whitespace-nowrap">לחודש</span>
        )}
        <span className="text-[0.8125rem] whitespace-nowrap">{yearly ? `${annual} ₪ לשנה, בחיוב אחד` : `או ${annual} ₪ לשנה`}</span>
      </span>
    </p>
  );
}

/** Children shown only on the annual face (the note under the cards). */
export function AnnualOnly({ children }: { children: ReactNode }) {
  return useShownCycle() === "annual" ? <>{children}</> : null;
}
