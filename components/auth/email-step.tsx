"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Cta } from "@/components/brand/cta";
import { StepProgress } from "@/components/brand/step-card";
import { StepHeading } from "./step-heading";
import { Toggle } from "./toggle";

/** Same rule as the server (lib/auth/otp.ts normalises and re-checks); here only to enable the button. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.trim().length <= 254;
}

export type AuthMode = "signup" | "login";

/** "where to go next" for each mode — keeps the URLs in one place */
export const authPaths = {
  signup: { email: "/start/email", code: "/start/code" },
  login: { email: "/login/email", code: "/login/code" },
} as const satisfies Record<AuthMode, { email: Route; code: Route }>;

/**
 * Step 2 (round plan §3): the email card. The send button stays disabled until the address looks valid; the
 * "updates and tips" toggle is OFF by default (anti-spam law) and travels to the code step in the URL.
 */
export function EmailStep({ mode = "signup", initialEmail = "" }: { mode?: AuthMode; initialEmail?: string }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [updates, setUpdates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = looksLikeEmail(email);

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
          ...(updates ? { updates: "1" } : {}),
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
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <StepHeading tag={mode === "login" ? "כניסה" : "קודם כל"} title="מה המייל שלך?" />

      <div className="mt-8 flex flex-col gap-2">
        <label htmlFor={inputId} className="text-[0.9375rem] font-semibold">
          כתובת מייל
        </label>
        <input
          id={inputId}
          type="email"
          name="email"
          dir="ltr"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          maxLength={254}
          placeholder="name@company.co.il"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-14 w-full rounded-field border-2 border-input bg-white/45 px-4 text-end text-[1.125rem] text-foreground placeholder:text-end placeholder:text-muted-foreground/70 focus-visible:border-ring"
        />
        <p id={errorId} role="alert" aria-live="assertive" className="min-h-6 text-[0.9375rem] font-semibold text-destructive">
          {error}
        </p>
      </div>

      {mode === "signup" ? (
        <div className="mt-2 rounded-2xl bg-ink/[0.06] p-4">
          <Toggle checked={updates} onChange={setUpdates} label="עדכונים וטיפים" hint="מדי פעם, במייל. אפשר להפסיק בכל רגע." />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-4 pt-8">
        <Cta tone="ink" type="submit" block disabled={!valid || busy} aria-busy={busy}>
          {busy ? "שולחים…" : "שליחת קוד"}
        </Cta>
        <p className="text-center text-[0.875rem] text-muted-foreground">
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
      </div>
      {mode === "signup" ? (
        <div className="mt-6">
          <StepProgress step={1} />
        </div>
      ) : null}
    </form>
  );
}
