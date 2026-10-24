"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Bubble } from "@/components/brand/bubble";
import { MascotAvatar } from "@/components/brand/mascot";
import { TypingDots } from "@/components/brand/typing-dots";
import {
  SUPPORT_COPY,
  SUPPORT_LIMITS,
  SUPPORT_SUGGESTIONS,
  type SupportChatResponse,
  type SupportErrorResponse,
  type SupportTicketField,
  type SupportTicketPrefill,
  type SupportTicketResponse,
  type SupportTurn,
} from "@/lib/support/types";
import { cn } from "@/lib/utils";

/**
 * "שאלות ותמיכה" — the website's support chat (docs/copy/support-chat.md). A round launcher with עלזה's hoopoe at the
 * bottom of the inline-start side (the right, in Hebrew; the accessibility button lives on the other side), and a
 * compact panel in "לילה ירוק": her answers on the night card, the visitor's questions in honey, topic chips, the
 * typing dots, and "פתיחת פנייה" — a small form inside the panel that reaches the support inbox.
 *
 * Answers: POST /api/support/chat (the model grounded in lib/support/knowledge.ts, or the deterministic matcher).
 * Tickets: POST /api/support/ticket. The conversation is stored under one id per open page (support_chats, 180 days) so
 * the support team can help — a line under the field says so.
 * Shown on the landing, the legal pages and /account; not on the signup flow, /login or /demo/chat.
 *
 * Keyboard: the launcher toggles the panel (aria-expanded), Esc closes it and focus returns to the launcher; opening
 * focuses the question field, the ticket form its first empty field, and the confirmation its heading. New answers are
 * announced (role="log"). On a phone the panel is a bottom sheet across the full width.
 */

const CHAT_API = "/api/support/chat";
const TICKET_API = "/api/support/ticket";

type Item = { id: string; role: SupportTurn["role"]; text: string; suggestions?: readonly string[]; ticket?: boolean };
type View = "chat" | "ticket" | "done";

const GREETING: Item = { id: "greeting", role: "assistant", text: SUPPORT_COPY.greeting, suggestions: SUPPORT_SUGGESTIONS };

async function postJson<T>(url: string, body: unknown): Promise<T | SupportErrorResponse> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as T | SupportErrorResponse | null;
    return data ?? { ok: false, code: "server_error", message: SUPPORT_COPY.network };
  } catch {
    return { ok: false, code: "server_error", message: SUPPORT_COPY.network };
  }
}

/** The conversation as turns for the server (the greeting is the page's own, not part of it). */
const turnsOf = (items: Item[]): SupportTurn[] => items.filter((m) => m.id !== GREETING.id).map((m) => ({ role: m.role, text: m.text }));

export function SupportChat({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [items, setItems] = useState<Item[]>([GREETING]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  // one id per conversation (the page's lifetime): the server keeps the turns under it (support_chats)
  const chatId = useRef<string | null>(null);
  const panelId = useId();
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    // the launcher comes back on a phone once the sheet is gone: focus it on the next frame
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, pending, open]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    if (q.length > SUPPORT_LIMITS.messageChars) {
      setError(SUPPORT_COPY.tooLong);
      return;
    }
    const history = turnsOf(items).slice(-SUPPORT_LIMITS.historyTurns);
    setError(null);
    setText("");
    setItems((list) => [...list, { id: `q${++nextId.current}`, role: "user", text: q }]);
    setPending(true);
    chatId.current ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
    const res = await postJson<SupportChatResponse>(CHAT_API, { message: q, history, ...(chatId.current ? { chatId: chatId.current } : {}), page: window.location.pathname.slice(0, 200) });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setItems((list) => [...list, { id: `a${++nextId.current}`, role: "assistant", text: res.answer, suggestions: res.suggestions, ticket: res.ticket }]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(text);
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const last = items.at(-1)!;

  return (
    <div className={cn("support-chat", className)} data-support-chat="">
      <button
        ref={launcherRef}
        type="button"
        aria-label={SUPPORT_COPY.launcher}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) close();
        }}
        className={cn(
          "group fixed start-4 bottom-4 z-[60] grid size-14 place-items-center rounded-full bg-night-2 shadow-[0_14px_34px_-14px_rgb(0_0_0/0.85)] ring-2 ring-honey/70 transition-[box-shadow,transform] duration-150 ease-out hover:ring-honey focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-honey active:translate-y-px sm:start-6 sm:bottom-6",
          open && "max-sm:hidden",
        )}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-honey stroke-[2.2]">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <>
            <MascotAvatar className="size-12" sizes="48px" />
            {/* a quiet honey mark: this bird answers questions */}
            <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-honey text-[0.75rem] leading-none font-semibold text-night ring-2 ring-night">
              ?
            </span>
          </>
        )}
      </button>

      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={onPanelKeyDown}
          data-lenis-prevent=""
          className="fixed z-[60] flex flex-col overflow-hidden border border-line bg-night text-cream shadow-stage motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-200 max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[min(40rem,88dvh)] max-sm:rounded-t-card max-sm:border-b-0 sm:start-6 sm:bottom-24 sm:h-[min(36rem,calc(100dvh-8rem))] sm:w-[23rem] sm:rounded-card"
        >
          <header className="flex flex-none items-center gap-3 border-b border-line bg-night-2 px-4 py-3">
            <MascotAvatar className="size-10 flex-none" sizes="40px" />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[1rem] leading-tight font-semibold">
                {SUPPORT_COPY.title}
              </h2>
              <p className="truncate text-[0.8125rem] text-cream-muted">{SUPPORT_COPY.subtitle}</p>
            </div>
            <button type="button" onClick={close} aria-label={SUPPORT_COPY.close} className="grid size-10 flex-none place-items-center rounded-full text-cream-muted transition-colors hover:bg-cream/6 hover:text-cream">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          {view === "chat" ? (
            <>
              <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="השיחה" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-4">
                {items.map((m) => (
                  <Message key={m.id} item={m} latest={m === last && !pending} onAsk={(q) => void ask(q)} onTicket={() => setView("ticket")} />
                ))}
                {pending ? <TypingDots label={SUPPORT_COPY.typing} className="bg-night-2 ring-1 ring-line" /> : null}
              </div>
              {error ? (
                <p role="alert" className="flex-none px-4 pb-1 text-[0.8125rem] text-[var(--alze-error-on-dark)]">
                  {error}
                </p>
              ) : null}
              <form onSubmit={onSubmit} className="flex flex-none items-end gap-2 border-t border-line bg-night-2 px-4 pt-3 pb-2">
                <label className="sr-only" htmlFor={`${panelId}-q`}>
                  {SUPPORT_COPY.inputLabel}
                </label>
                <textarea
                  id={`${panelId}-q`}
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  maxLength={SUPPORT_LIMITS.messageChars}
                  placeholder={SUPPORT_COPY.inputPlaceholder}
                  enterKeyHint="send"
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-[1.375rem] border border-line bg-night px-4 py-2.5 text-base leading-snug text-cream [field-sizing:content] placeholder:text-cream-muted/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey sm:text-[0.9375rem]"
                />
                <button
                  type="submit"
                  disabled={pending || !text.trim()}
                  aria-label={SUPPORT_COPY.send}
                  className="grid size-11 flex-none place-items-center rounded-full bg-honey text-night shadow-[inset_0_-2px_0_rgb(15_28_23/0.2)] transition-colors hover:bg-[#EDC273] disabled:bg-honey/30 disabled:text-night/55 disabled:shadow-none"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current rtl:-scale-x-100">
                    <path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12 3.5 13.9z" />
                  </svg>
                </button>
              </form>
              <div className="flex flex-none items-center justify-between gap-3 bg-night-2 px-4 pb-3 text-[0.8125rem]">
                <button type="button" onClick={() => setView("ticket")} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-1 text-honey underline-offset-4 hover:underline">
                  <TicketIcon />
                  {SUPPORT_COPY.openTicket}
                </button>
                {text.length > SUPPORT_LIMITS.messageChars - 80 ? (
                  <span className="text-cream-muted tabular" aria-live="polite">
                    {text.length}/{SUPPORT_LIMITS.messageChars}
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-cream-muted">{SUPPORT_COPY.savedNotice}</span>
                )}
              </div>
            </>
          ) : (
            <TicketView
              done={view === "done"}
              transcript={turnsOf(items).slice(-SUPPORT_LIMITS.ticket.transcriptTurns)}
              onDone={() => setView("done")}
              onBack={() => setView("chat")}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function Message({ item, latest, onAsk, onTicket }: { item: Item; latest: boolean; onAsk: (q: string) => void; onTicket: () => void }) {
  if (item.role === "user") {
    return (
      <Bubble side="out" className="bg-honey/[0.16] pb-1.5 text-[0.9375rem] text-cream ring-1 ring-honey/25">
        {item.text}
      </Bubble>
    );
  }
  return (
    <>
      <Bubble side="in" className="bg-night-2 pb-1.5 text-[0.9375rem] text-cream ring-1 ring-line">
        {item.text}
      </Bubble>
      {latest && item.suggestions?.length ? (
        <ul aria-label="נושאים" className="flex flex-wrap gap-1.5 pt-1">
          {item.suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => onAsk(s)} className="min-h-9 rounded-full border border-honey/45 px-3 py-1 text-[0.875rem] text-honey transition-colors hover:border-honey hover:bg-honey/10">
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {latest && item.ticket ? (
        <button type="button" onClick={onTicket} className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full bg-honey px-3.5 py-1 text-[0.875rem] font-semibold text-night hover:bg-[#EDC273]">
          <TicketIcon />
          {SUPPORT_COPY.openTicket}
        </button>
      ) : null}
    </>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none fill-none stroke-current stroke-2">
      <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z M10 9h6M10 15h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- the ticket form ---------- */

type Errors = Partial<Record<SupportTicketField, string>>;

const fieldClass =
  "w-full rounded-field border border-line bg-night-2 px-3.5 py-2.5 text-base text-cream placeholder:text-cream-muted/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-honey aria-[invalid=true]:border-[var(--alze-error-on-dark)] sm:text-[0.9375rem]";

function TicketView({ done, transcript, onDone, onBack }: { done: boolean; transcript: SupportTurn[]; onDone: () => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [attach, setAttach] = useState(transcript.some((t) => t.role === "user"));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const focusField = useCallback((key: SupportTicketField) => document.getElementById(`${uid}-${key}`)?.focus(), [uid]);
  const hasChat = transcript.some((t) => t.role === "user");

  // the signed-in person's address, once (the field stays editable)
  useEffect(() => {
    let cancelled = false;
    void fetch(TICKET_API, { cache: "no-store" })
      .then((r) => r.json() as Promise<SupportTicketPrefill>)
      .then((d) => {
        if (!cancelled && d?.ok && d.email) setEmail((current) => current || d.email!);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (done) doneRef.current?.focus();
    else focusField("name");
  }, [done, focusField]);

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-start gap-4 overflow-y-auto px-4 py-6">
        <MascotAvatar className="size-14" sizes="56px" />
        <h3 ref={doneRef} tabIndex={-1} className="text-[1.125rem] leading-snug font-semibold focus:outline-none">
          {SUPPORT_COPY.ticketDone}
        </h3>
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center rounded-full border-2 border-cream-muted/55 px-5 text-[0.9375rem] font-semibold text-cream hover:border-cream hover:bg-cream/6">
          {SUPPORT_COPY.backToChat}
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const local: Errors = {};
    if (!name.trim()) local.name = "צריך למלא שם.";
    if (!email.trim()) local.email = "צריך למלא כתובת מייל.";
    if (body.trim().length < 5) local.body = "צריך לתאר במשפט או שניים מה קרה.";
    if (Object.keys(local).length) {
      setErrors(local);
      focusField((["name", "email", "body"] as const).find((f) => local[f])!);
      return;
    }
    setErrors({});
    setFormError(null);
    setSending(true);
    const res = await postJson<SupportTicketResponse>(TICKET_API, { name, email, subject, body, transcript: attach && hasChat ? transcript : null, website });
    setSending(false);
    if (res.ok) {
      onDone();
      return;
    }
    if (res.fields && Object.keys(res.fields).length) {
      setErrors(res.fields);
      const first = (["name", "email", "subject", "body"] as const).find((f) => res.fields![f]);
      if (first) focusField(first);
    } else setFormError(res.message);
  };

  const field = (key: SupportTicketField) => ({
    id: `${uid}-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${uid}-${key}-error` : undefined,
  });
  const fieldError = (key: SupportTicketField) =>
    errors[key] ? (
      <p id={`${uid}-${key}-error`} className="mt-1 text-[0.8125rem] text-[var(--alze-error-on-dark)]">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 py-4">
        <div>
          <h3 className="text-[1.0625rem] leading-snug font-semibold">{SUPPORT_COPY.ticketTitle}</h3>
          <p className="mt-0.5 text-[0.875rem] text-cream-muted">{SUPPORT_COPY.ticketLead}</p>
        </div>
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1 block text-[0.875rem]">
            שם
          </label>
          <input {...field("name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={SUPPORT_LIMITS.ticket.name} required className={fieldClass} />
          {fieldError("name")}
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-[0.875rem]">
            אימייל
          </label>
          <input
            {...field("email")}
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            maxLength={SUPPORT_LIMITS.ticket.email}
            required
            className={cn(fieldClass, "text-start")}
          />
          {fieldError("email")}
        </div>
        <div>
          <label htmlFor={`${uid}-subject`} className="mb-1 block text-[0.875rem]">
            נושא <span className="text-cream-muted">(לא חובה)</span>
          </label>
          <input {...field("subject")} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUPPORT_LIMITS.ticket.subject} className={fieldClass} />
          {fieldError("subject")}
        </div>
        <div>
          <label htmlFor={`${uid}-body`} className="mb-1 block text-[0.875rem]">
            תיאור
          </label>
          <textarea {...field("body")} value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={SUPPORT_LIMITS.ticket.body} required className={cn(fieldClass, "min-h-28 resize-y")} />
          {fieldError("body")}
        </div>
        {hasChat ? (
          <label className="flex items-start gap-2.5 text-[0.875rem] text-cream">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-1 size-4 flex-none accent-honey" />
            {SUPPORT_COPY.attachChat}
          </label>
        ) : null}
        {/* a field people never see: a bot that fills it gets a quiet "received" and nothing is stored */}
        <div aria-hidden="true" className="pointer-events-none absolute -z-10 size-px overflow-hidden opacity-0">
          <label htmlFor={`${uid}-website`}>אתר</label>
          <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {formError ? (
          <p role="alert" className="text-[0.8125rem] text-[var(--alze-error-on-dark)]">
            {formError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-line bg-night-2 px-4 py-3">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-honey px-5 text-[0.9375rem] font-semibold text-night shadow-[inset_0_-2px_0_rgb(15_28_23/0.2)] hover:bg-[#EDC273] disabled:bg-honey/30 disabled:text-night/55"
        >
          {sending ? "שולחים…" : SUPPORT_COPY.submitTicket}
        </button>
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] text-cream-muted hover:bg-cream/6 hover:text-cream">
          {SUPPORT_COPY.backToChat}
        </button>
      </div>
    </form>
  );
}
