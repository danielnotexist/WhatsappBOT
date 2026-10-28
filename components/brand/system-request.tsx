"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  SUPPORT_COPY,
  SUPPORT_LIMITS,
  SYSTEM_REQUEST_COPY as T,
  SYSTEM_REQUEST_LIMITS,
  type SupportErrorResponse,
  type SupportTicketPrefill,
  type SupportTicketResponse,
  type SystemRequestField,
} from "@/lib/support/types";
import { cn } from "@/lib/utils";

/**
 * "בקשת מערכת": a small form that tells Daniel which system a customer wants her to work with. Opened from the
 * "ועוד בהמשך" row of the systems list (the landing's #connectors) and from /pricing. A dialog in "לילה ירוק": centred
 * on wide screens, a bottom sheet on a phone; focus starts in the first field and stays inside, Esc or "סגירה" closes
 * it and focus returns to the trigger. The email is prefilled when signed in (GET /api/support/ticket).
 * Sent to POST /api/support/ticket with `kind: "system"` - stored as a support ticket "בקשת מערכת: <name>" and
 * emailed to the support inbox, under the same limits as a ticket (origin, rate limit, honeypot).
 */

const API = "/api/support/ticket";
type Errors = Partial<Record<SystemRequestField, string>>;
const ORDER: readonly SystemRequestField[] = ["system", "want", "email", "business"];

const fieldClass =
  "w-full rounded-field border border-line bg-night px-3.5 py-2.5 text-base text-cream placeholder:text-cream-muted/65 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey aria-[invalid=true]:border-[var(--alze-error-on-dark)] sm:text-[0.9375rem]";

async function send(body: unknown): Promise<SupportTicketResponse | SupportErrorResponse> {
  try {
    const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return ((await res.json().catch(() => null)) as SupportTicketResponse | SupportErrorResponse | null) ?? { ok: false, code: "server_error", message: SUPPORT_COPY.network };
  } catch {
    return { ok: false, code: "server_error", message: SUPPORT_COPY.network };
  }
}

/**
 * The trigger and its dialog. `children` is the trigger's face (the list row draws its own); without it a plain
 * "בקשת מערכת" text button.
 */
export function SystemRequest({ children, className, labelledBy, describedBy }: { children?: ReactNode; className?: string; labelledBy?: string; describedBy?: string }) {
  const [open, setOpen] = useState(false);
  // a fresh form on every opening (a sent request is not shown again)
  const [round, setRound] = useState(0);
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setRound((r) => r + 1);
        setOpen(next);
      }}
    >
      <Dialog.Trigger data-system-request="" aria-labelledby={labelledBy} aria-describedby={describedBy} className={className ?? "rounded-sm text-honey underline decoration-honey/45 underline-offset-4 hover:decoration-honey"}>
        {children ?? T.trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-[rgb(6_12_10/0.72)] backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          ref={popup}
          // the first field, not the close button (on touch: the sheet itself, so no keyboard jumps up)
          initialFocus={(type) => (type === "touch" ? true : (popup.current?.querySelector<HTMLElement>("input:not([tabindex='-1'])") ?? true))}
          data-lenis-prevent=""
          className={cn(
            "fixed z-[70] flex max-h-[min(44rem,92dvh)] flex-col overflow-hidden border border-line bg-night-2 text-cream shadow-stage outline-none",
            // a bottom sheet on a phone, a centred card from sm up
            "inset-x-0 bottom-0 rounded-t-card border-b-0 sm:top-1/2 sm:bottom-auto sm:mx-auto sm:w-[31rem] sm:-translate-y-1/2 sm:rounded-card sm:border-b",
            "transition-[opacity,translate] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 max-sm:data-[ending-style]:translate-y-6 max-sm:data-[starting-style]:translate-y-6 motion-reduce:transition-none",
          )}
        >
          <RequestForm key={round} onClose={() => setOpen(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RequestForm({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const [values, setValues] = useState({ system: "", want: "", email: "", business: "" });
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const focusField = useCallback((key: SystemRequestField) => document.getElementById(`${uid}-${key}`)?.focus(), [uid]);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  // the signed-in person's address, once (the field stays editable)
  useEffect(() => {
    let cancelled = false;
    void fetch(API, { cache: "no-store" })
      .then((r) => r.json() as Promise<SupportTicketPrefill>)
      .then((d) => {
        if (!cancelled && d?.ok && d.email) setValues((v) => (v.email ? v : { ...v, email: d.email! }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const local: Errors = {};
    if (!values.system.trim()) local.system = T.errors.system;
    if (values.want.trim().length < 5) local.want = T.errors.want;
    if (!values.email.trim()) local.email = T.errors.email;
    if (Object.keys(local).length) {
      setErrors(local);
      focusField(ORDER.find((f) => local[f])!);
      return;
    }
    setErrors({});
    setFormError(null);
    setSending(true);
    const res = await send({ kind: "system", ...values, website });
    setSending(false);
    if (res.ok) return setDone(true);
    const fields = (res.fields ?? {}) as Errors;
    const first = ORDER.find((f) => fields[f]);
    if (first) {
      setErrors(fields);
      focusField(first);
    } else setFormError(res.message);
  };

  const field = (key: SystemRequestField, hint?: boolean) => ({
    id: `${uid}-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [errors[key] ? `${uid}-${key}-error` : null, hint ? `${uid}-${key}-hint` : null].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (key: SystemRequestField) =>
    errors[key] ? (
      <p id={`${uid}-${key}-error`} className="mt-1.5 text-[0.8125rem] text-[var(--alze-error-on-dark)]">
        {errors[key]}
      </p>
    ) : null;
  const hint = (key: SystemRequestField, text: string) => (
    <p id={`${uid}-${key}-hint`} className="mt-1.5 text-[0.8125rem] text-cream-muted">
      {text}
    </p>
  );

  const header = (
    <div className="flex flex-none items-start gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
      <div className="min-w-0 flex-1">
        <Dialog.Title className="font-heading text-[1.375rem] leading-tight font-bold">{T.title}</Dialog.Title>
        {done ? null : <Dialog.Description className="mt-1.5 text-[0.9375rem] leading-relaxed text-cream-muted">{T.lead}</Dialog.Description>}
      </div>
      <Dialog.Close aria-label={T.close} className="-me-2 -mt-1 grid size-11 flex-none place-items-center rounded-full text-cream-muted transition-colors hover:bg-cream/[0.06] hover:text-cream">
        <X aria-hidden="true" className="size-5" strokeWidth={2} />
      </Dialog.Close>
    </div>
  );

  if (done) {
    return (
      <>
        {header}
        <div role="status" className="flex flex-col items-start px-5 pt-6 pb-7 sm:px-7">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-sage/15 text-sage">
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-[2.4]">
              <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 ref={doneRef} tabIndex={-1} className="mt-4 text-[1.1875rem] leading-snug font-semibold focus:outline-none">
            {T.done}
          </h3>
          <p className="mt-1.5 max-w-[26rem] text-[0.9375rem] leading-relaxed text-cream-muted">{T.doneLead}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex min-h-11 items-center rounded-full border-2 border-cream-muted/55 px-6 text-[0.9375rem] font-semibold text-cream hover:border-cream hover:bg-cream/6"
          >
            {T.close}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <form onSubmit={submit} noValidate aria-label={T.title} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <div>
            <label htmlFor={`${uid}-system`} className="mb-1.5 block text-[0.9375rem] font-semibold">
              {T.system}
            </label>
            <input {...field("system")} value={values.system} onChange={set("system")} placeholder={T.systemHint} maxLength={SYSTEM_REQUEST_LIMITS.system} required autoComplete="off" className={fieldClass} />
            {fieldError("system")}
          </div>
          <div>
            <label htmlFor={`${uid}-want`} className="mb-1.5 block text-[0.9375rem] font-semibold">
              {T.want}
            </label>
            <textarea {...field("want")} value={values.want} onChange={set("want")} placeholder={T.wantHint} rows={3} maxLength={SYSTEM_REQUEST_LIMITS.want} required className={cn(fieldClass, "min-h-24 resize-y leading-snug")} />
            {fieldError("want")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-email`} className="mb-1.5 block text-[0.9375rem] font-semibold">
                {T.email}
              </label>
              <input
                {...field("email", true)}
                type="email"
                dir="ltr"
                value={values.email}
                onChange={set("email")}
                autoComplete="email"
                inputMode="email"
                maxLength={SUPPORT_LIMITS.ticket.email}
                required
                className={cn(fieldClass, "text-start")}
              />
              {fieldError("email") ?? hint("email", T.emailHint)}
            </div>
            <div>
              <label htmlFor={`${uid}-business`} className="mb-1.5 block text-[0.9375rem] font-semibold">
                {T.business} <span className="font-normal text-cream-muted">{T.optional}</span>
              </label>
              <input {...field("business")} value={values.business} onChange={set("business")} placeholder={T.businessHint} maxLength={SYSTEM_REQUEST_LIMITS.business} autoComplete="organization-title" className={fieldClass} />
              {fieldError("business")}
            </div>
          </div>
          {/* a field people never see: a bot that fills it gets a quiet "received" and nothing is stored */}
          <div aria-hidden="true" className="pointer-events-none absolute -z-10 size-px overflow-hidden opacity-0">
            <label htmlFor={`${uid}-website`}>אתר</label>
            <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {formError ? (
            <p role="alert" className="text-[0.875rem] text-[var(--alze-error-on-dark)]">
              {formError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-3 border-t border-line px-5 py-4 sm:px-7">
          <button
            type="submit"
            disabled={sending}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-honey px-6 text-[1rem] font-semibold text-night shadow-[inset_0_-2px_0_rgb(15_28_23/0.2)] transition-colors hover:bg-[#EDC273] disabled:bg-honey/30 disabled:text-night/55 sm:flex-none"
          >
            {sending ? T.sending : T.submit}
          </button>
          <Dialog.Close className="inline-flex min-h-12 items-center rounded-full px-4 text-[0.9375rem] text-cream-muted hover:bg-cream/6 hover:text-cream">{T.cancel}</Dialog.Close>
        </div>
      </form>
    </>
  );
}
