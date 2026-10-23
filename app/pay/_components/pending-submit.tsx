"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Cta, type CtaTone } from "@/components/brand/cta";

/**
 * The submit button of a charge form: disabled (with a short status) from the first click until the server answers,
 * so a double click sends one request. The server never relies on it — the form's single-use nonce does that.
 */
export function PendingSubmit({ children, pendingLabel, tone = "ink", className }: { children: ReactNode; pendingLabel: string; tone?: CtaTone; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Cta type="submit" tone={tone} block disabled={pending} aria-busy={pending || undefined} className={className}>
      {pending ? pendingLabel : children}
    </Cta>
  );
}
