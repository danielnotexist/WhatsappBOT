"use client";

import { useActionState, useEffect, useRef } from "react";
import { Cta } from "@/components/brand/cta";
import { sendCodeAction, verifyCodeAction, type CodeStepState } from "../actions";

/**
 * The panel's second step: a one-time code mailed to the owner's address (lib/admin/auth.ts). First "שליחת קוד", then
 * the six digits. The sign-in code of the demo never works here.
 */
export function CodeStep({ email, codeSent }: { email: string; codeSent: boolean }) {
  const initial: CodeStepState = { sent: codeSent, message: null, error: false };
  const [sendState, send, sending] = useActionState(sendCodeAction, initial);
  const [verifyState, verify, verifying] = useActionState(verifyCodeAction, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const sent = sendState.sent || verifyState.sent;
  const status = verifyState.message ? verifyState : sendState;

  useEffect(() => {
    if (sent) inputRef.current?.focus();
  }, [sent, sendState]);

  return (
    <div className="mx-auto max-w-[30rem] rounded-card border border-line bg-night-2/70 p-6 shadow-stage sm:p-9">
      <h1 className="font-heading text-[1.75rem] leading-tight font-bold">כניסה לפאנל הניהול</h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-cream-muted">
        {sent ? "קוד חד-פעמי נשלח אל" : "עוד צעד אחד: קוד חד-פעמי יישלח אל"}{" "}
        <bdi dir="ltr" className="text-cream">
          {email}
        </bdi>
        . הוא תקף ל-10 דקות, ורק איתו הפאנל נפתח.
      </p>

      {status.message ? (
        <p role={status.error ? "alert" : "status"} className={status.error ? "mt-5 text-[0.9375rem] text-destructive" : "mt-5 text-[0.9375rem] text-sage"}>
          {status.message}
        </p>
      ) : null}

      {sent ? (
        <form action={verify} className="mt-6 grid gap-4">
          <label htmlFor="admin-code" className="text-[0.9375rem] text-cream">
            הקוד מהמייל
          </label>
          <input
            ref={inputRef}
            id="admin-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            dir="ltr"
            className="h-14 w-full rounded-field border border-cream-muted/55 bg-night px-4 text-center text-[1.5rem] tracking-[0.4em] text-cream tabular focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey"
          />
          <Cta type="submit" block disabled={verifying}>
            {verifying ? "בודקים…" : "כניסה"}
          </Cta>
        </form>
      ) : null}

      <form action={send} className="mt-4">
        <Cta type="submit" tone={sent ? "ghost" : "honey"} size={sent ? "sm" : "md"} block={!sent} disabled={sending}>
          {sending ? "שולחים…" : sent ? "שליחת קוד חדש" : "שליחת קוד"}
        </Cta>
      </form>
    </div>
  );
}
