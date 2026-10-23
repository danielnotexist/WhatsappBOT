"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ctaClass } from "@/components/brand/cta";
import { cn } from "@/lib/utils";
import { areaHref } from "../areas";

/**
 * An agent's form in a side sheet (docs/design/agents.md §10): the agents stay a calm grid, and editing or creating one
 * opens over it from the inline-end edge (full screen on a phone) — focus kept inside, Esc or "סגירה" closes it.
 * The forms inside are the same server-action forms as before; the server renders them as this sheet's children.
 *
 *  - edit: opened by the card's "עריכה" button.
 *  - new:  opened by the address (`?new=<template>`, a template link renders the form on the server); closing it drops
 *          `new` from the address.
 * A submit (<SheetFormWatch> in each form) comes back as an address: the agents with `notice=` or `error=` — and the
 * page renders again (Next.js may mount it anew after a server action's redirect). A notice: the sheet is closed and
 * the notice shows at the top of the agents. An error: the sheet that sent it is open again with the message (the
 * submit is remembered here, outside React, so it survives that new mount).
 */

let lastSubmit: { sheet: string; search: string; at: number } | null = null;
/** an answer later than this belongs to no sheet any more */
const ANSWER_MS = 30_000;

const SheetContext = createContext<{ sent: () => void; answered: () => void } | null>(null);

/** Inside each form of a sheet: tells the sheet when a submit left and when the server answered it. */
export function SheetFormWatch() {
  const { pending } = useFormStatus();
  const sheet = useContext(SheetContext);
  const sent = useRef(false);
  useEffect(() => {
    if (pending) {
      if (!sent.current) sheet?.sent();
      sent.current = true;
      return;
    }
    if (!sent.current) return;
    sent.current = false;
    sheet?.answered();
  }, [pending, sheet]);
  return null;
}

/** How long to wait for the redirect's address after the form settles (the same address twice never changes it). */
const ANSWER_GRACE_MS = 1500;

export function AgentSheet({
  id,
  title,
  description,
  mark,
  trigger,
  newTemplate,
  children,
}: {
  /** stable per sheet (the agent key, or "new:<template>"): an error comes back to the sheet that sent it */
  id: string;
  title: string;
  description?: string;
  mark?: ReactNode;
  /** edit: the button on the card ("עריכה" + the agent's name for screen readers) */
  trigger?: { label: string; srName: string };
  /** new: the sheet is open while the address says `new=<this>` */
  newTemplate?: string;
  children: ReactNode;
}) {
  const sp = useSearchParams();
  const [openState, setOpenState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byAddress = newTemplate !== undefined;
  const open = byAddress ? sp.get("new") === newTemplate : openState;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setError(null);
      if (!byAddress) return setOpenState(next);
      if (!next) window.history.replaceState(null, "", areaHref("agents"));
    },
    [byAddress],
  );

  // this sheet's submit has its answer: the address the action redirected to
  const decide = useCallback(() => {
    if (lastSubmit?.sheet !== id) return;
    lastSubmit = null;
    const err = new URLSearchParams(window.location.search).get("error");
    if (!err) return setOpen(false);
    setError(err.slice(0, 400));
    if (!byAddress) setOpenState(true);
  }, [id, byAddress, setOpen]);

  const search = sp.toString();
  useEffect(() => {
    const s = lastSubmit;
    if (!s || s.sheet !== id) return;
    if (Date.now() - s.at > ANSWER_MS) {
      lastSubmit = null;
      return;
    }
    if (window.location.search === s.search) return;
    // the answer arrived (an address outside React's state): apply it right after this commit
    const t = setTimeout(decide, 0);
    return () => clearTimeout(t);
  }, [id, search, decide]);

  const body = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const watch = useMemo(
    () => ({
      sent: () => {
        lastSubmit = { sheet: id, search: window.location.search, at: Date.now() };
        setError(null);
      },
      // the same address twice (the same notice again) never changes it: decide after a moment
      answered: () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(decide, ANSWER_GRACE_MS);
      },
    }),
    [id, decide],
  );

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpen(next)}>
      {trigger ? (
        <Dialog.Trigger className={ctaClass({ tone: "ghost", size: "sm" })} aria-label={`${trigger.label} ${trigger.srName}`}>
          {trigger.label}
        </Dialog.Trigger>
      ) : null}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-[rgb(6_12_10/0.72)] backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          // the first field, not the close button (on touch: the sheet itself, so no keyboard jumps up)
          initialFocus={(type) => (type === "touch" ? true : (body.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea") ?? true))}
          className={cn(
            // the inline end: the left edge in Hebrew; slides in from there
            "fixed inset-y-0 end-0 z-[70] flex w-full flex-col overflow-y-auto overscroll-contain border-line bg-night-2 text-cream shadow-stage outline-none sm:max-w-[38rem] sm:border-s",
            "transition-transform duration-300 ease-out data-[ending-style]:duration-200 data-[ending-style]:ease-in rtl:data-[ending-style]:-translate-x-full rtl:data-[starting-style]:-translate-x-full ltr:data-[ending-style]:translate-x-full ltr:data-[starting-style]:translate-x-full",
          )}
        >
          <div className="sticky top-0 z-10 flex items-start gap-4 border-b border-line bg-night-2/95 px-5 py-5 backdrop-blur-md sm:px-8">
            {mark}
            <div className="min-w-0 flex-1 pt-0.5">
              <Dialog.Title className="font-heading text-[1.375rem] leading-tight font-bold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-[0.9375rem] text-cream-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close aria-label="סגירה" className="-me-2 grid size-11 flex-none place-items-center rounded-full text-cream-muted transition-colors hover:bg-cream/[0.06] hover:text-cream">
              <X aria-hidden="true" className="size-5" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div ref={body} className="flex-1 px-5 pt-6 pb-10 sm:px-8">
            {error ? (
              <p role="alert" className="mb-6 rounded-2xl border border-destructive/45 bg-destructive/10 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream">
                {error}
              </p>
            ) : null}
            <SheetContext.Provider value={watch}>{children}</SheetContext.Provider>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** "ביטול" at the foot of a sheet's form. */
export function SheetCancel({ children }: { children: ReactNode }) {
  return <Dialog.Close className="min-h-11 rounded-sm px-1 text-[0.9375rem] text-cream-muted underline underline-offset-3 hover:text-cream">{children}</Dialog.Close>;
}
