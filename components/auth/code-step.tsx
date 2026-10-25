"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { useAnimate } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Cta } from "@/components/brand/cta";
import { StepProgress } from "@/components/brand/step-card";
import { trackEvent } from "@/lib/analytics/send";
import { CODE_LENGTH, RESEND_SECONDS } from "@/lib/auth/otp-constants";
import { cn } from "@/lib/utils";
import { authPaths, type AuthMode } from "./email-step";
import { StepHeading } from "./step-heading";
import { StepAside, StepBody, StepMascot } from "./step-slots";
import { useMarkSignedIn } from "./shell-session";

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

/** One cell: thin border at rest, ink + halo where the caret is, a small pop when a digit lands, error-red after a miss. */
function Slot({ slot, invalid }: { slot: SlotProps; invalid: boolean }) {
  return (
    <div
      className={cn(
        "relative grid h-[3.75rem] min-w-0 flex-1 place-items-center rounded-field bg-white/50 font-heading text-[1.875rem] leading-none font-bold tabular transition-[border-color,box-shadow,background-color] duration-150 sm:h-[4.25rem] sm:text-[2.125rem]",
        invalid
          ? "border-2 border-destructive"
          : slot.isActive
            ? "border-2 border-foreground bg-white/80 shadow-[0_0_0_4px_rgb(19_36_28/0.16)]"
            : slot.char
              ? "border-2 border-foreground/50 bg-white/70"
              : "border-[1.5px] border-input",
      )}
    >
      {slot.char ? (
        <span key={slot.char} className="animate-in duration-150 zoom-in-75 fade-in motion-reduce:animate-none">
          {slot.char}
        </span>
      ) : (
        <span className="text-foreground/30">{slot.placeholderChar}</span>
      )}
      {slot.hasFakeCaret ? <span aria-hidden="true" className="absolute h-8 w-0.5 animate-caret-blink rounded-full bg-foreground" /> : null}
    </div>
  );
}

/** `?wait=` from the email card (a code was sent less than a minute ago): 0…RESEND_SECONDS; missing → a full minute. */
export function waitFromParam(value: string | null): number {
  return value === null ? RESEND_SECONDS : Math.min(RESEND_SECONDS, Math.max(0, Number(value) || 0));
}

/**
 * The code card of a static page: email / opt-in / cooldown come in the URL from the email card and are read here,
 * on the client, so the card is drawn at once on a client-side navigation (no server round-trip, no empty card).
 * Without an email there is nothing to verify → back to the email card. Keyed by the router's bfcacheId: a new visit
 * starts fresh (new countdown, empty cells) instead of revealing the previous one.
 */
export function CodeStepFromUrl({ mode = "signup", demoNote }: { mode?: AuthMode; demoNote?: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const email = params.get("email") ?? "";

  useEffect(() => {
    if (!email) router.replace(authPaths[mode].email);
  }, [email, mode, router]);

  return (
    <CodeStep
      key={router.bfcacheId}
      mode={mode}
      email={email}
      updates={mode === "signup" && params.get("updates") === "1"}
      initialWait={waitFromParam(params.get("wait"))}
      demoNote={demoNote}
    />
  );
}

/**
 * Step 3 (round plan §3): six cells in two groups of three (input-otp — paste, auto-advance, one-time-code autofill),
 * auto-submit on the sixth digit, a 60-second resend countdown and "change email". Talks to /api/auth/otp/{send,verify}.
 */
export function CodeStep({
  email,
  updates = false,
  initialWait = RESEND_SECONDS,
  mode = "signup",
  demoNote,
  autoFocus = true,
}: {
  email: string;
  updates?: boolean;
  initialWait?: number;
  mode?: AuthMode;
  demoNote?: ReactNode;
  /** false on a page's static fallback, so the browser focuses the cells of the card that replaces it */
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const markSignedIn = useMarkSignedIn();
  const reduce = useReducedMotion();
  const labelId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // the countdown runs from when the card is shown in a browser; a prerendered (static) card shows the full wait
  const [deadline, setDeadline] = useState<number | null>(() => (typeof window === "undefined" ? null : Date.now() + Math.max(0, initialWait) * 1000));
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  const inputRef = useRef<HTMLInputElement>(null);
  const [cells, animateCells] = useAnimate<HTMLDivElement>();
  const remaining = deadline === null ? Math.max(0, initialWait) : Math.max(0, (deadline - now) / 1000);

  // the screen after a good code: load it now, so it opens at once
  useEffect(() => {
    router.prefetch(authPaths[mode].next);
  }, [mode, router]);

  // the cells take the focus whenever the card is shown — also when the router shows it again (back/forward reveals the
  // hidden step through <Activity>, and `autoFocus` only acts on mount); never on a page's static fallback
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

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
          if (mode === "signup") trackEvent("code_ok"); // the session cookie is set: this step is linked to the account
          markSignedIn(); // the shell header switches to "לאזור האישי" (the layout's cookie check ran before the code)
          router.replace(data.next as Route);
          return;
        }
        setError(
          data.message
            ? `${data.message}${typeof data.attemptsLeft === "number" && data.attemptsLeft > 0 ? ` נשארו ${data.attemptsLeft} ניסיונות.` : ""}`
            : "לא הצלחנו לבדוק את הקוד. אפשר לנסות שוב.",
        );
        // a short head-shake of the cells, like a door that didn't open (skipped under reduced motion)
        if (!reduce && cells.current) void animateCells(cells.current, { x: [0, -9, 8, -5, 3, 0] }, { duration: 0.36, ease: "easeOut" });
        setCode("");
        inputRef.current?.focus();
      } catch {
        setError("אין חיבור לשרת כרגע. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
      }
      setBusy(false);
    },
    [animateCells, busy, cells, email, markSignedIn, mode, reduce, router, updates],
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

  // back to the email card with the address, and the opt-in the user chose there
  const changeHref = `${authPaths[mode].email}?email=${encodeURIComponent(email)}${updates ? "&updates=1" : "&updates=0"}` as Route;
  const invalid = Boolean(error) && code.length === 0;

  return (
    <>
      <StepAside>
        <StepHeading tag="בדקו את המייל" title="הזינו את הקוד" />
        <p className="mt-3 text-[1.0625rem] lg:mt-5 lg:text-lede">
          שלחנו 6 ספרות ל-
          <bdi dir="ltr" className="inline-block max-w-full font-semibold break-all">
            {email || "המייל שלך"}
          </bdi>
        </p>
        <Link href={changeHref} className="mt-2 self-start rounded-sm text-[0.9375rem] font-semibold text-foreground underline underline-offset-3">
          שינוי מייל
        </Link>
      </StepAside>

      <StepBody>
        {demoNote}
        <form
          className="flex flex-1 flex-col"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code);
          }}
        >
          <span id={labelId} className="sr-only">
            קוד בן 6 ספרות
          </span>
          <div ref={cells} dir="ltr">
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
              autoFocus={autoFocus}
              disabled={busy}
              aria-labelledby={labelId}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              containerClassName="flex items-center gap-1.5 sm:gap-2 has-disabled:opacity-60"
              render={({ slots }) => (
                <>
                  {slots.slice(0, 3).map((slot, i) => (
                    <Slot key={i} slot={slot} invalid={invalid} />
                  ))}
                  <span aria-hidden="true" className="mx-0.5 h-0.5 w-2.5 flex-none rounded-full bg-foreground/35 sm:mx-1 sm:w-3" />
                  {slots.slice(3).map((slot, i) => (
                    <Slot key={i + 3} slot={slot} invalid={invalid} />
                  ))}
                </>
              )}
            />
          </div>

          <p id={errorId} role="alert" aria-live="assertive" className="mt-3 min-h-6 text-[0.9375rem] leading-snug font-semibold text-destructive">
            {error}
          </p>
          <p role="status" className={cn("text-[0.9375rem]", notice ? "mb-2" : "sr-only")}>
            {notice}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.9375rem]">
            <span className="text-muted-foreground">הקוד תקף 10 דקות.</span>
            {remaining > 0 ? (
              <span className="text-muted-foreground">
                שליחה חוזרת בעוד <span className="tabular">{formatCountdown(remaining)}</span>
              </span>
            ) : (
              <button type="button" onClick={() => void resend()} className="rounded-sm font-semibold text-foreground underline underline-offset-3">
                שליחה חוזרת
              </button>
            )}
          </div>

          <Cta tone="ink" type="submit" block disabled={code.length !== CODE_LENGTH || busy} aria-busy={busy} className="mt-8">
            {busy ? "בודקים…" : "המשך"}
          </Cta>
          <div className="mt-auto flex items-end justify-between gap-4 pt-8">
            {mode === "signup" ? <StepProgress step={2} /> : <span />}
            <StepMascot pose="envelope" />
          </div>
        </form>
      </StepBody>
    </>
  );
}
