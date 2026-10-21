"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Cta } from "@/components/brand/cta";
import { StepProgress } from "@/components/brand/step-card";
import { CODE_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp-constants";
import { cn } from "@/lib/utils";
import { authPaths, type AuthMode } from "./email-step";
import { StepHeading } from "./step-heading";

export { CODE_LENGTH, RESEND_SECONDS };

/** 42 → "0:42" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Digits only, at most six — for pasted text like "הקוד שלך: 123 456". */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

function Slot({ slot }: { slot: SlotProps }) {
  return (
    <div
      className={cn(
        "relative grid h-16 flex-1 place-items-center rounded-field border-2 bg-white/45 font-heading text-[2rem] leading-none font-bold tabular transition-[border-color,box-shadow] duration-150 sm:h-[4.5rem]",
        slot.isActive ? "border-ink shadow-[0_0_0_3px_rgb(19_36_28/0.25)]" : "border-input",
      )}
    >
      {slot.char ?? <span className="text-ink-muted/50">{slot.placeholderChar}</span>}
      {slot.hasFakeCaret ? <span aria-hidden="true" className="absolute h-8 w-0.5 animate-caret-blink bg-ink" /> : null}
    </div>
  );
}

/**
 * Step 3 (round plan §3): six cells (input-otp — paste, auto-advance, one-time-code autofill), auto-submit on the
 * sixth digit, a 60-second resend countdown and "change email". Talks to /api/auth/otp/{send,verify}.
 */
export function CodeStep({ email, updates = false, initialWait = RESEND_SECONDS, mode = "signup" }: { email: string; updates?: boolean; initialWait?: number; mode?: AuthMode }) {
  const router = useRouter();
  const labelId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deadline, setDeadline] = useState(() => Date.now() + Math.max(0, initialWait) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = Math.max(0, (deadline - now) / 1000);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [remaining]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || busy) return;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const res = await fetch("/api/auth/otp/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, code: value, ...(updates ? { updates: true } : {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; message?: string; attemptsLeft?: number };
        if (data.ok && data.next) {
          router.replace(data.next as Route);
          return;
        }
        setError(
          data.message
            ? `${data.message}${typeof data.attemptsLeft === "number" && data.attemptsLeft > 0 ? ` נשארו ${data.attemptsLeft} ניסיונות.` : ""}`
            : "לא הצלחנו לבדוק את הקוד. אפשר לנסות שוב.",
        );
        setCode("");
        inputRef.current?.focus();
      } catch {
        setError("אין חיבור לשרת כרגע. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
      }
      setBusy(false);
    },
    [busy, email, router, updates],
  );

  async function resend() {
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/otp/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; cooldownSeconds?: number; retryAfterSeconds?: number };
      const wait = data.ok ? (data.cooldownSeconds ?? RESEND_SECONDS) : (data.retryAfterSeconds ?? 0);
      if (data.ok) setNotice("נשלח קוד חדש. הקוד הקודם כבר לא תקף.");
      else setError(data.message ?? "לא הצלחנו לשלוח קוד חדש.");
      setDeadline(Date.now() + wait * 1000);
      setNow(Date.now());
    } catch {
      setError("אין חיבור לשרת כרגע. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
    }
  }

  const changeHref = `${authPaths[mode].email}?email=${encodeURIComponent(email)}` as Route;

  return (
    <form
      className="flex flex-1 flex-col"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
    >
      <StepHeading tag="בדקו את המייל" title="הזינו את הקוד" />
      <p className="mt-3 text-[1.0625rem]">
        שלחנו 6 ספרות ל-
        <bdi dir="ltr" className="font-semibold">
          {email || "המייל שלך"}
        </bdi>
      </p>

      <div className="mt-7" dir="ltr">
        <span id={labelId} className="sr-only">
          קוד בן 6 ספרות
        </span>
        <OTPInput
          ref={inputRef}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError("");
          }}
          onComplete={(v: string) => void verify(v)}
          maxLength={CODE_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          pasteTransformer={digitsOnly}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={busy}
          aria-labelledby={labelId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          containerClassName="flex gap-2 sm:gap-3 has-disabled:opacity-60"
          render={({ slots }) => (
            <>
              {slots.map((slot, i) => (
                <Slot key={i} slot={slot} />
              ))}
            </>
          )}
        />
      </div>

      <p id={errorId} role="alert" aria-live="assertive" className="mt-3 min-h-6 text-[0.9375rem] font-semibold text-destructive">
        {error}
      </p>
      <p role="status" className={cn("text-[0.9375rem]", notice ? "mb-1" : "sr-only")}>
        {notice}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-muted-foreground">
        <span>הקוד תקף 10 דקות</span>
        <span aria-hidden="true">·</span>
        {remaining > 0 ? (
          <span>
            שליחה חוזרת בעוד <span className="tabular">{formatCountdown(remaining)}</span>
          </span>
        ) : (
          <button type="button" onClick={() => void resend()} className="font-semibold text-foreground underline underline-offset-3">
            שליחה חוזרת
          </button>
        )}
      </div>
      <Link href={changeHref} className="mt-2 self-start text-[0.9375rem] font-semibold text-foreground underline underline-offset-3">
        שינוי מייל
      </Link>

      <div className="mt-auto pt-8">
        <Cta tone="ink" type="submit" block disabled={code.length !== CODE_LENGTH || busy} aria-busy={busy}>
          {busy ? "בודקים…" : "המשך"}
        </Cta>
      </div>
      {mode === "signup" ? (
        <div className="mt-6">
          <StepProgress step={2} />
        </div>
      ) : null}
    </form>
  );
}
