"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Bubble } from "@/components/brand/bubble";
import { Cta } from "@/components/brand/cta";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";

/** The prefilled message inside a wa.me link (`?text=`), or "" when there is none. */
export function demoWaMessage(href: string): string {
  try {
    return new URL(href).searchParams.get("text") ?? "";
  } catch {
    return "";
  }
}

/**
 * DEMO_MODE: wraps the "חיבור לוואטסאפ" button (round plan §1). A click on any link inside does not open WhatsApp;
 * a dialog shows the message that would be sent, with the real one-time code. The wrapper is `display: contents`, so
 * the button keeps its place in the layout. Server pages use <DemoWaGate> (./DemoWaGate.tsx), which renders this only
 * in the demo; `enabled={false}` passes the children through untouched.
 */
export function DemoWaDialog({ href, enabled = true, children }: { href: string; enabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return <>{children}</>;
  const message = demoWaMessage(href);

  function intercept(e: MouseEvent<HTMLDivElement>) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest("a[href]")) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <div data-demo-wa="" className="contents" onClickCapture={intercept}>
        {children}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-5 rounded-card bg-night-2 p-6 text-cream ring-line sm:max-w-md sm:p-8">
          <div className="flex flex-col gap-2">
            <DialogTitle className="font-heading text-[1.75rem] leading-tight font-bold">כאן נפתחת השיחה עם {BRAND.name}</DialogTitle>
            <DialogDescription className="text-[1rem] text-cream-muted">בגרסה האמיתית ייפתח וואטסאפ עם ההודעה:</DialogDescription>
          </div>
          <div className="flex flex-col rounded-2xl bg-[var(--wa-bg)] p-3 text-[var(--wa-fg)]">
            <Bubble side="out" className="max-w-[92%] pb-2 text-[0.9375rem]">
              {message}
            </Bubble>
          </div>
          <p className="text-[0.9375rem] text-cream-muted">
            שולחים אותה, ו{BRAND.name} מקשרת את המספר לחשבון לפי הקוד שבסוגריים. בגרסת ההדגמה שום דבר לא נשלח.
          </p>
          <Cta tone="honey" block onClick={() => setOpen(false)}>
            הבנתי
          </Cta>
        </DialogContent>
      </Dialog>
    </>
  );
}
