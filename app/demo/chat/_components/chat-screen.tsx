"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Bubble } from "@/components/brand/bubble";
import { MascotAvatar } from "@/components/brand/mascot";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { TypingDots } from "@/components/brand/typing-dots";
import { VoiceNote } from "@/components/brand/voice-note";
import { WaButtons } from "@/components/brand/wa-buttons";
import { BRAND } from "@/lib/brand";
import { chatTime, clockDuration, waBlocks, type Inline } from "@/lib/demo-chat/format";
import { DEMO_CHAT_LIMITS, type ChatErrorResponse, type ChatHistoryResponse, type ChatItem, type ChatPostResponse } from "@/lib/demo-chat/types";
import { cn } from "@/lib/utils";

/**
 * The website chat (/demo/chat): a WhatsApp-like conversation with עלזה through the same pipeline as WhatsApp
 * (app/api/demo/chat). Typing, a recorded voice message (MediaRecorder → upload), the bot's reply buttons and lists,
 * "מקלידה…" while waiting, and the history on load. A phone frame on wide screens, the whole screen on a phone.
 */

const API = "/api/demo/chat";

/** Things to try first — each one exercises a different part of the pipeline. */
export const STARTERS = ["מה יש לי מחר?", "תזכירי לי מחר ב-9 להתקשר לבנק", "תנסחי מייל לדנה שהפגישה זזה ליום ה׳"] as const;

const ERRORS = {
  load: "לא הצלחתי לטעון את השיחה. אפשר לרענן את הדף.",
  network: "אין חיבור כרגע. ההודעה לא נשלחה, אפשר לנסות שוב.",
  micDenied: "אין גישה למיקרופון. אפשר לאשר גישה בהגדרות הדפדפן ולנסות שוב.",
  micUnsupported: "הדפדפן הזה לא תומך בהקלטה. אפשר לכתוב במקום.",
  tooShort: "ההקלטה קצרה מדי. אפשר להחזיק עוד רגע.",
} as const;

type Waiting = null | "text" | "voice";

async function postChat(body: BodyInit, json: boolean): Promise<ChatPostResponse | ChatErrorResponse> {
  try {
    const res = await fetch(API, { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
    const data = (await res.json().catch(() => null)) as ChatPostResponse | ChatErrorResponse | null;
    return data ?? { ok: false, code: "server_error", message: ERRORS.network };
  } catch {
    return { ok: false, code: "server_error", message: ERRORS.network };
  }
}

export function ChatScreen({ liveAi, dailyMessages }: { liveAi: boolean; dailyMessages: number | null }) {
  return (
    <PhoneMockup
      label={`הצ'אט עם ${BRAND.name}`}
      className="max-md:flex max-md:min-h-0 max-md:w-full max-md:flex-1 max-md:flex-col max-md:rounded-none max-md:bg-transparent max-md:p-0 max-md:shadow-none md:w-[24rem] md:flex-none"
      screenClassName="aspect-auto max-md:min-h-0 max-md:flex-1 max-md:rounded-none md:h-[min(46rem,calc(100dvh-9rem))]"
      islandClassName="max-md:hidden"
    >
      <ChatPanel liveAi={liveAi} dailyMessages={dailyMessages} />
    </PhoneMockup>
  );
}

function ChatPanel({ liveAi, dailyMessages }: { liveAi: boolean; dailyMessages: number | null }) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState<Waiting>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // onboarding waits for an answer (the name, the business…): a suggested request tapped now would be taken as one
  const [awaiting, setAwaiting] = useState(false);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tempId = useRef(0);

  const apply = useCallback((tempKey: string | null, res: ChatPostResponse | ChatErrorResponse, userPatch: Partial<ChatItem> = {}): boolean => {
    if (!res.ok) {
      setItems((list) => list.filter((m) => m.id !== tempKey));
      setError(res.message);
      return false;
    }
    setAwaiting(res.awaiting);
    setItems((list) => {
      const kept = list.filter((m) => m.id !== tempKey);
      return [...kept, ...(res.user ? [{ ...userPatch, ...res.user, ...(res.user.durationMs ? {} : { durationMs: userPatch.durationMs ?? null }) }] : []), ...res.replies];
    });
    return true;
  }, []);

  // the history, then (first visit) the start: the chat's number is linked and the welcome arrives
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API, { cache: "no-store" });
        const data = (await res.json()) as ChatHistoryResponse | ChatErrorResponse;
        if (cancelled) return;
        if (!data.ok) {
          setError(data.message);
          return;
        }
        setItems(data.items);
        setAwaiting(data.awaiting);
        setLoaded(true);
        if (!data.linked) {
          setWaiting("text");
          const started = await postChat(JSON.stringify({ start: true }), true);
          if (!cancelled) apply(null, started);
        }
      } catch {
        if (!cancelled) setError(ERRORS.load);
      } finally {
        if (!cancelled) {
          setLoaded(true);
          setWaiting(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, waiting]);

  const pushTemp = (item: Omit<ChatItem, "id" | "at">): string => {
    const id = `temp-${++tempId.current}`;
    setItems((list) => [...list, { ...item, id, at: new Date().toISOString() }]);
    return id;
  };

  const sendText = async (value: string) => {
    const body = value.trim();
    if (!body || waiting) return;
    if (body.length > DEMO_CHAT_LIMITS.textChars) {
      setError(`ההודעה ארוכה מדי. אפשר עד ${DEMO_CHAT_LIMITS.textChars.toLocaleString("he-IL")} תווים.`);
      return;
    }
    setError(null);
    setText("");
    const temp = pushTemp({ side: "user", kind: "text", text: body });
    setWaiting("text");
    const ok = apply(temp, await postChat(JSON.stringify({ text: body }), true));
    if (!ok) setText(body);
    setWaiting(null);
    inputRef.current?.focus();
  };

  const sendReply = async (item: ChatItem, id: string, title: string, list: boolean) => {
    if (waiting) return;
    setError(null);
    setChosen((c) => ({ ...c, [item.id]: title }));
    const temp = pushTemp({ side: "user", kind: "choice", text: title });
    setWaiting("text");
    const ok = apply(temp, await postChat(JSON.stringify({ reply: { id, title, list } }), true));
    if (!ok)
      setChosen((c) => {
        const next = { ...c };
        delete next[item.id];
        return next;
      });
    setWaiting(null);
  };

  const sendVoice = async (blob: Blob, durationMs: number) => {
    if (waiting) return;
    setError(null);
    const temp = pushTemp({ side: "user", kind: "voice", text: "", transcript: null, durationMs });
    setWaiting("voice");
    const type = blob.type || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("audio", new File([blob], `voice.${ext}`, { type }));
    form.append("durationMs", String(Math.round(durationMs)));
    apply(temp, await postChat(form, false), { durationMs });
    setWaiting(null);
  };

  // buttons and lists answer only in the latest turn (after the person's last message), like a fresh WhatsApp prompt
  const lastUser = useMemo(() => items.findLastIndex((m) => m.side === "user"), [items]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendText(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendText(text);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-2.5 bg-[var(--wa-head)] px-3 pt-3 pb-2.5 md:pt-10">
        <Link href="/account" aria-label="חזרה לאזור האישי" className="grid size-9 flex-none place-items-center rounded-full text-[var(--wa-fg)] hover:bg-white/5">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 rtl:-scale-x-100">
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <MascotAvatar sizes="36px" className="size-9 flex-none" />
        <span className="min-w-0 flex-1">
          <b className="block text-[0.9375rem] leading-tight font-normal">{BRAND.name}</b>
          <small aria-live="polite" className="block text-[0.75rem] leading-tight text-[var(--wa-time)]">
            {waiting === "voice" ? "מקשיבה…" : waiting ? "מקלידה…" : liveAi ? "מחוברת, AI אמיתי" : "מחוברת, גרסת הדגמה"}
          </small>
        </span>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="השיחה"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2.5 py-3 [&>*]:flex-none"
      >
        <span className="self-center rounded-lg bg-[var(--wa-chip)] px-3 py-1 text-center text-[0.75rem] leading-snug text-[var(--wa-time)]">
          {liveAi
            ? `שיחת בדיקה עם המודל האמיתי${dailyMessages ? `, עד ${dailyMessages} הודעות ביום` : ""}. שום דבר לא נשלח החוצה.`
            : "גרסת הדגמה: תשובות לדוגמה, ושום דבר לא נשלח החוצה."}
        </span>
        {!loaded ? (
          <p role="status" className="self-center py-6 text-[0.8125rem] text-[var(--wa-time)]">
            טוען את השיחה…
          </p>
        ) : null}
        {items.map((m, i) =>
          m.side === "user" ? (
            <UserBubble key={m.id} item={m} pending={m.id.startsWith("temp-")} />
          ) : (
            <BotBubble key={m.id} item={m} active={i > lastUser && !waiting} chosen={chosen[m.id] ?? null} onReply={(id, title, list) => void sendReply(m, id, title, list)} />
          ),
        )}
        {waiting ? <TypingDots label={waiting === "voice" ? `${BRAND.name} מקשיבה` : `${BRAND.name} מקלידה`} /> : null}
      </div>

      {error ? (
        <p role="alert" className="mx-2.5 mb-1.5 flex-none rounded-lg bg-[var(--wa-red)]/15 px-3 py-2 text-[0.8125rem] leading-snug text-[var(--wa-fg)]">
          {error}
        </p>
      ) : null}

      {!waiting && !text && loaded && !awaiting ? (
        <div className="flex flex-none gap-1.5 overflow-x-auto px-2.5 pb-1.5 [scrollbar-width:none]" aria-label="רעיונות להתחלה" role="group">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void sendText(s)}
              className="flex-none rounded-full border border-white/12 bg-[var(--wa-in)] px-3 py-1.5 text-[0.8125rem] whitespace-nowrap text-[var(--wa-fg)] hover:bg-white/8"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <Composer
        text={text}
        setText={setText}
        inputRef={inputRef}
        disabled={Boolean(waiting) || !loaded}
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
        onVoice={(blob, ms) => void sendVoice(blob, ms)}
        onError={setError}
      />
    </div>
  );
}

/* ---------- bubbles ---------- */

function WaText({ text }: { text: string }) {
  const inline = (parts: Inline[], key: string) =>
    parts.map((p, i) =>
      p.t === "bold" ? (
        <b key={`${key}-${i}`} className="font-normal text-[var(--wa-fg)] [text-shadow:0_0_0.6px_currentColor]">
          {p.v}
        </b>
      ) : p.t === "link" ? (
        <a key={`${key}-${i}`} href={p.v} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-[var(--wa-link)] underline underline-offset-2">
          {p.v}
        </a>
      ) : (
        <span key={`${key}-${i}`}>{p.v}</span>
      ),
    );
  return (
    <>
      {waBlocks(text).map((b, i) =>
        b.kind === "quote" ? (
          <blockquote key={i} className="my-1 rounded-md border-s-[3px] border-[var(--wa-green)] bg-black/20 px-2 py-1 text-[0.8125rem]">
            {b.lines.map((l, j) => (
              <p key={j} className="min-h-[1em]">
                {inline(l, `${i}-${j}`)}
              </p>
            ))}
          </blockquote>
        ) : (
          <p key={i} className="min-h-[0.6em]">
            {inline(b.parts, String(i))}
          </p>
        ),
      )}
    </>
  );
}

function UserBubble({ item, pending }: { item: ChatItem; pending: boolean }) {
  const time = pending ? "" : chatTime(item.at);
  if (item.kind === "voice") {
    const heard = item.transcript ?? "";
    return (
      <Bubble side="out" time={time} reaction={pending ? undefined : "✅"} label={`הודעה קולית${heard ? `: ${heard}` : ""}`}>
        <VoiceNote icon="mic" duration={item.durationMs ? clockDuration(item.durationMs) : ""} transcript={pending ? undefined : heard || undefined} />
      </Bubble>
    );
  }
  return (
    <Bubble side="out" time={time} reaction={pending || item.kind === "choice" ? undefined : "✅"} className={cn(pending && "opacity-80")}>
      {item.text}
    </Bubble>
  );
}

function BotBubble({ item, active, chosen, onReply }: { item: ChatItem; active: boolean; chosen: string | null; onReply: (id: string, title: string, list: boolean) => void }) {
  const time = chatTime(item.at);
  const body: ReactNode =
    item.kind === "document" ? (
      <DocumentLine item={item} />
    ) : item.kind === "image" && item.link ? (
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[var(--wa-link)] underline underline-offset-2">
        תמונה
      </a>
    ) : null;
  return (
    <>
      <Bubble side="in" time={time}>
        {body}
        {item.text ? <WaText text={item.text} /> : null}
      </Bubble>
      {item.kind === "buttons" && item.buttons?.length ? (
        <WaButtons
          label="כפתורי תשובה"
          labels={item.buttons.map((b) => b.title)}
          chosen={chosen ?? (active ? null : "")}
          onChoose={active ? (title) => onReply(item.buttons!.find((b) => b.title === title)!.id, title, false) : undefined}
          className={cn("-mt-0.5", !active && !chosen && "opacity-60")}
        />
      ) : null}
      {item.kind === "list" && item.list ? <ListPicker item={item} active={active} chosen={chosen} onPick={(id, title) => onReply(id, title, true)} /> : null}
    </>
  );
}

function DocumentLine({ item }: { item: ChatItem }) {
  const name = item.filename || "קובץ";
  const content = (
    <span className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-2">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none fill-none stroke-current stroke-[1.8]">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5" strokeLinejoin="round" />
      </svg>
      <bdi className="truncate">{name}</bdi>
    </span>
  );
  return item.link ? (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="block text-[var(--wa-fg)] hover:opacity-90">
      {content}
    </a>
  ) : (
    content
  );
}

function ListPicker({ item, active, chosen, onPick }: { item: ChatItem; active: boolean; chosen: string | null; onPick: (id: string, title: string) => void }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  // the rows open below the end of the log: bring them into view (the log's own auto-scroll runs on new messages only)
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const rows = item.list!.sections.flatMap((s) => s.rows);
  const label = item.list!.button || "בחירה";
  return (
    <div className="w-[86%] self-start overflow-hidden rounded-xl bg-[var(--wa-in)] shadow-[0_1px_0.5px_rgb(0_0_0/0.25)]">
      <button
        type="button"
        aria-expanded={open}
        disabled={!active || Boolean(chosen)}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-[0.9375rem] text-[var(--wa-link)] enabled:hover:bg-white/5 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
        </svg>
        {chosen ? `נבחר: ${chosen}` : label}
      </button>
      {open && active && !chosen ? (
        <ul ref={listRef} role="list" aria-label={label} className="border-t border-white/10">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(r.id, r.title);
                }}
                className="block w-full border-t border-white/6 px-3 py-2 text-start first:border-t-0 hover:bg-white/5"
              >
                <span className="block text-[0.875rem] text-[var(--wa-fg)]">{r.title}</span>
                {r.description ? <span className="block text-[0.75rem] text-[var(--wa-time)]">{r.description}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- composer + recorder ---------- */

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
}

function Composer({
  text,
  setText,
  inputRef,
  disabled,
  onSubmit,
  onKeyDown,
  onVoice,
  onError,
}: {
  text: string;
  setText: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  onSubmit: (e: FormEvent) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onVoice: (blob: Blob, durationMs: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; send: boolean; timer: number } | null>(null);
  // getUserMedia can take a while (the permission prompt): a second tap must not open a second microphone
  const starting = useRef(false);
  const mounted = useRef(true);

  const stop = useCallback((send: boolean) => {
    const r = rec.current;
    if (!r) return;
    r.send = send;
    window.clearInterval(r.timer);
    if (r.recorder.state !== "inactive") r.recorder.stop();
    else r.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop(false);
    };
  }, [stop]);

  const start = async () => {
    if (starting.current || rec.current) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError(ERRORS.micUnsupported);
      return;
    }
    starting.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (mounted.current) onError(ERRORS.micDenied);
      return;
    } finally {
      starting.current = false;
    }
    if (!mounted.current || rec.current) {
      stream.getTracks().forEach((t) => t.stop()); // the page is gone (or a recording already runs): release the microphone
      return;
    }
    const mimeType = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: DEMO_CHAT_LIMITS.audioBitsPerSecond });
    const state = { recorder, stream, chunks: [] as Blob[], startedAt: Date.now(), send: true, timer: 0 };
    recorder.ondataavailable = (e) => {
      if (e.data.size) state.chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setRecording(false);
      const ms = Date.now() - state.startedAt;
      if (!state.send) return;
      if (ms < 700) {
        onError(ERRORS.tooShort);
        return;
      }
      const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size > DEMO_CHAT_LIMITS.audioBytes) {
        onError(`ההקלטה ארוכה מדי. אפשר להקליט עד ${DEMO_CHAT_LIMITS.audioSeconds} שניות.`);
        return;
      }
      onVoice(blob, Math.min(ms, DEMO_CHAT_LIMITS.audioSeconds * 1000));
    };
    state.timer = window.setInterval(() => {
      const ms = Date.now() - state.startedAt;
      setElapsed(ms);
      if (ms >= DEMO_CHAT_LIMITS.audioSeconds * 1000) stop(true); // a minute at most, then it goes as is
    }, 200);
    rec.current = state;
    setElapsed(0);
    setRecording(true);
    recorder.start(250);
  };

  if (recording) {
    return (
      <div className="flex flex-none items-center gap-2 bg-[var(--wa-head)] px-2.5 pt-2 pb-3.5">
        <button type="button" onClick={() => stop(false)} aria-label="ביטול ההקלטה" className="grid size-10 flex-none place-items-center rounded-full text-[var(--wa-time)] hover:bg-white/5">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p role="status" className="flex flex-1 items-center gap-2 rounded-full bg-[var(--wa-in)] px-3.5 py-2 text-[0.875rem] text-[var(--wa-fg)]">
          <span aria-hidden="true" className="size-2.5 flex-none animate-pulse rounded-full bg-[var(--wa-red)]" />
          מקליטים <span className="tabular" dir="ltr">{clockDuration(elapsed)}</span>
          <span className="text-[var(--wa-time)]">/ {clockDuration(DEMO_CHAT_LIMITS.audioSeconds * 1000)}</span>
        </p>
        <button type="button" onClick={() => stop(true)} aria-label="שליחת ההקלטה" className="grid size-10 flex-none place-items-center rounded-full bg-[var(--wa-green)] text-white">
          <SendIcon />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-none items-end gap-2 bg-[var(--wa-head)] px-2.5 pt-2 pb-3.5">
      <label className="sr-only" htmlFor="demo-chat-input">
        הודעה
      </label>
      <textarea
        id="demo-chat-input"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={DEMO_CHAT_LIMITS.textChars}
        placeholder="הודעה"
        enterKeyHint="send"
        className="max-h-32 min-h-10 flex-1 resize-none rounded-[1.25rem] bg-[var(--wa-in)] px-3.5 py-2 text-base leading-snug md:text-[0.9375rem] text-[var(--wa-fg)] [field-sizing:content] placeholder:text-[var(--wa-time)] focus-visible:outline-2 focus-visible:outline-[var(--wa-green)]"
      />
      {text.trim() ? (
        <button type="submit" disabled={disabled} aria-label="שליחה" className="grid size-10 flex-none place-items-center rounded-full bg-[var(--wa-green)] text-white disabled:opacity-50">
          <SendIcon />
        </button>
      ) : (
        <button type="button" disabled={disabled} onClick={() => void start()} aria-label="הקלטה קולית" className="grid size-10 flex-none place-items-center rounded-full bg-[var(--wa-green)] text-white disabled:opacity-50">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </form>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current rtl:-scale-x-100">
      <path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12 3.5 13.9z" />
    </svg>
  );
}
