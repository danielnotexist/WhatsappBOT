"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Cta } from "@/components/brand/cta";
import { StepProgress } from "@/components/brand/step-card";
import { cn } from "@/lib/utils";
import { StepHeading } from "./step-heading";
import { StepAside, StepBody, StepMascot } from "./step-slots";
import { Toggle } from "./toggle";

/** Same rule as the server (lib/auth/otp.ts normalises and re-checks); here only to enable the button. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.trim().length <= 254;
}

export type AuthMode = "signup" | "login";

/** "where to go next" for each mode — keeps the URLs in one place (`next`: where a code usually leads) */
export const authPaths = {
  signup: { email: "/start/email", code: "/start/code", next: "/start/connect" },
  login: { email: "/login/email", code: "/login/code", next: "/account" },
} as const satisfies Record<AuthMode, { email: Route; code: Route; next: Route }>;

/** Shared look of the text fields on the paper: a calm border that turns ink with a soft halo on focus. */
export const fieldClass =
  "h-14 w-full rounded-field border-2 border-input bg-white/50 text-[1.125rem] text-foreground transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-muted-foreground/65 hover:bg-white/65 focus-visible:border-foreground focus-visible:bg-white/80 focus-visible:shadow-[0_0_0_4px_rgb(19_36_28/0.16)] focus-visible:outline-none aria-invalid:border-destructive";

/**
 * The email card of a static page: `?email=` / `?updates=` (from "שינוי מייל") are read here, on the client, so a
 * client-side navigation draws the card at once (no server round-trip, no empty card). Keyed by the router's
 * bfcacheId, so a link back to this step starts it fresh (and with its entrance) instead of revealing the old,
 * submitted form.
 */
export function EmailStepFromUrl({ mode = "signup" }: { mode?: AuthMode }) {
  const params = useSearchParams();
  const { bfcacheId } = useRouter();
  return <EmailStep key={bfcacheId} mode={mode} initialEmail={params.get("email") ?? ""} initialUpdates={mode === "signup" && params.get("updates") !== "0"} />;
}

/**
 * Step 2 (round plan §3): the email card. The send button stays disabled until the address looks valid; the
 * "updates and tips" toggle is ON by default (Daniel's decision, 21.10) and travels to the code step in the URL.
 */
export function EmailStep({
  mode = "signup",
  initialEmail = "",
  initialUpdates = mode === "signup",
  autoFocus = true,
}: {
  mode?: AuthMode;
  initialEmail?: string;
  initialUpdates?: boolean;
  /** false on a page's static fallback, so the browser focuses the field of the card that replaces it */
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [updates, setUpdates] = useState(initialUpdates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = looksLikeEmail(email);

  // the code card is the next screen: load it while the address is being finished, so it can open at once
  useEffect(() => {
    if (valid) router.prefetch(authPaths[mode].code);
  }, [valid, mode, router]);

  // the router keeps this step (hidden) after "שליחת קוד"; coming back to it, the button must be awake again
  useLayoutEffect(() => () => setBusy(false), []);

  // the field takes the focus whenever the card is shown — also when the router shows it again (back/forward reveals
  // the hidden step through <Activity>, and `autoFocus` only acts on mount); never on a page's static fallback
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; code?: string; retryAfterSeconds?: number };
      // A cooldown means a code was sent less than a minute ago — the code screen can still take it.
      if (data.ok || data.code === "cooldown") {
        const qs = new URLSearchParams({
          email: email.trim().toLowerCase(),
          updates: updates ? "1" : "0",
          ...(data.code === "cooldown" && data.retryAfterSeconds ? { wait: String(data.retryAfterSeconds) } : {}),
        });
        router.push(`${authPaths[mode].code}?${qs.toString()}` as Route);
        return;
      }
      setError(data.message || "לא הצלחנו לשלוח קוד. אפשר לנסות שוב בעוד רגע.");
    } catch {
      setError("אין חיבור לשרת כרגע. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
    }
    setBusy(false);
  }

  return (
    <>
      <StepAside>
        <StepHeading tag={mode === "login" ? "כניסה" : "קודם כל"} title="מה המייל שלך?" />
        <p className="mt-3 max-w-[24rem] text-[1.0625rem] text-muted-foreground lg:mt-5 lg:text-lede">
          {mode === "login" ? "לשם יישלח קוד כניסה בן 6 ספרות." : "לשם יישלח קוד בן 6 ספרות. בלי סיסמאות."}
        </p>
      </StepAside>

      <StepBody>
        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <label htmlFor={inputId} className="text-[0.9375rem] font-semibold">
            כתובת מייל
          </label>
          <div className="relative mt-2">
            <input
              ref={inputRef}
              id={inputId}
              type="email"
              name="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={autoFocus}
              required
              maxLength={254}
              placeholder="name@company.co.il"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn(fieldClass, "ps-12 pe-4 text-end placeholder:text-end")}
            />
            {/* a quiet tick once the address looks right — the button wakes up at the same moment */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute end-4 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground transition-[opacity,scale] duration-200",
                valid ? "scale-100 opacity-100" : "scale-75 opacity-0",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current stroke-[3]">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <p id={errorId} role="alert" aria-live="assertive" className="mt-2 min-h-6 text-[0.9375rem] leading-snug font-semibold text-destructive">
            {error}
          </p>

          {mode === "signup" ? (
            <div className="mt-2 rounded-2xl bg-foreground/[0.05] px-4 py-3.5">
              <Toggle checked={updates} onChange={setUpdates} label="עדכונים וטיפים" hint="מדי פעם, במייל. אפשר להפסיק בכל רגע." />
            </div>
          ) : null}

          <Cta tone="ink" type="submit" block disabled={!valid || busy} aria-busy={busy} className="mt-7">
            {busy ? "שולחים…" : "שליחת קוד"}
          </Cta>
          <p className="mt-4 text-center text-[0.875rem] text-muted-foreground">
            {mode === "signup" ? (
              <>
                בהמשך מאשרים את{" "}
                <Link href="/terms" className="font-semibold text-foreground underline underline-offset-3">
                  התנאים
                </Link>{" "}
                ו
                <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-3">
                  מדיניות הפרטיות
                </Link>
              </>
            ) : (
              <>
                אין עדיין חשבון?{" "}
                <Link href="/start" className="font-semibold text-foreground underline underline-offset-3">
                  הרשמה
                </Link>
              </>
            )}
          </p>
          <div className="mt-auto flex items-end justify-between gap-4 pt-8">
            {mode === "signup" ? <StepProgress step={1} /> : <span />}
            <StepMascot pose="waving" />
          </div>
        </form>
      </StepBody>
    </>
  );
}
