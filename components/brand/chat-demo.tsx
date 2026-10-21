"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Bubble } from "./bubble";
import { DraftCard, type Draft } from "./draft-card";
import { MascotAvatar } from "./mascot";
import { TypingDots } from "./typing-dots";
import { VoiceNote } from "./voice-note";
import { WaButtons } from "./wa-buttons";

/**
 * The live chat demo (ported from design/directions/03-warm-clinic.html): the script is data, the player is a
 * cancellable async loop (AbortController — unmount or replay stops it), and under prefers-reduced-motion the
 * whole conversation is shown at once with no timers.
 */
export type ChatStep =
  | { kind: "chip"; text: string; wait?: number }
  | { kind: "out"; text: string; time: string; wait?: number; react?: boolean }
  | { kind: "voice"; duration: string; transcript?: string; time: string; wait?: number; react?: boolean }
  | { kind: "typing"; ms: number; wait?: number }
  | { kind: "in"; text: string; time: string; wait?: number }
  | { kind: "draft"; draft: Draft; prompt: string; time: string; wait?: number }
  | { kind: "buttons"; labels: readonly string[]; replies: Readonly<Record<string, string>>; time: string; wait?: number };

type Shown =
  | { id: number; kind: "chip"; text: string }
  | { id: number; kind: "out"; text: string; time: string; reaction?: string }
  | { id: number; kind: "voice"; duration: string; transcript?: string; time: string; reaction?: string }
  | { id: number; kind: "in"; text: string; time: string }
  | { id: number; kind: "draft"; draft: Draft; prompt: string; time: string }
  | { id: number; kind: "buttons"; labels: readonly string[]; replies: Readonly<Record<string, string>>; time: string; chosen: string | null };

/** The landing-page script: question → calendar answer → voice note → draft → approve. */
export const DEMO_SCRIPT: ChatStep[] = [
  { kind: "chip", text: "היום" },
  { kind: "out", text: "מה יש לי מחר?", time: "13:41", wait: 400, react: true },
  { kind: "typing", ms: 1400, wait: 500 },
  {
    kind: "in",
    time: "13:41",
    text: "מחר, יום ג׳ 22.10:\n09:00 גב׳ אברהם, פגישת המשך\n10:30 מר כהן, פגישה ראשונה\n16:00 ד״ר רונן, שיחת תיאום\n\nמחכים לתשובה: מייל מגב׳ אברהם על ההפניה.",
  },
  { kind: "voice", duration: "0:07", time: "13:42", wait: 2000, react: true, transcript: "תכתבי לגב׳ אברהם שמחר ב-9 קורה, ושתביא את ההפניה" },
  { kind: "typing", ms: 1400, wait: 500 },
  {
    kind: "draft",
    time: "13:42",
    prompt: "לשלוח?",
    draft: {
      to: "r.avraham@gmail.com",
      subject: "הפגישה מחר, 22.10 בשעה 09:00",
      body: "שלום רונית,\nהפגישה מחר בשעה 09:00 מתקיימת כמתוכנן. אשמח אם תביאי את ההפניה מהרופא.\nנתראה,\nמיכל",
    },
  },
  {
    kind: "buttons",
    time: "13:43",
    labels: ["שלח", "ערוך", "בטל"],
    replies: { שלח: "נשלח. אעדכן כשתגיע תשובה.", ערוך: "בסדר. מה לשנות בטיוטה?", בטל: "בוטל. הטיוטה נמחקה ולא נשלחה." },
  },
];

class Aborted extends Error {}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Aborted());
      },
      { once: true },
    );
  });
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

/** prefers-reduced-motion as an external store (server snapshot: motion allowed). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCE_QUERY).matches : false),
    () => false,
  );
}

/** Everything a script shows, at once (reduced motion / tests). */
export function finalState(script: ChatStep[]): Shown[] {
  const out: Shown[] = [];
  let id = 0;
  for (const s of script) {
    if (s.kind === "typing") continue;
    if (s.kind === "out" || s.kind === "voice") out.push({ ...s, id: id++, reaction: s.react ? "✅" : undefined } as Shown);
    else if (s.kind === "buttons") out.push({ ...s, id: id++, chosen: null });
    else out.push({ ...s, id: id++ } as Shown);
  }
  return out;
}

export function ChatDemo({
  script = DEMO_SCRIPT,
  loop = true,
  replayable = true,
  className,
  title = BRAND.name,
}: {
  script?: ChatStep[];
  /** restart after the user picks a button (only with motion) */
  loop?: boolean;
  replayable?: boolean;
  className?: string;
  title?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState<Shown[]>(() => finalState(script));
  // reduced motion: the whole conversation, no timers (buttons still answer, instantly)
  const [staticShown, setStaticShown] = useState<Shown[]>(() => finalState(script));
  const [typing, setTyping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1000);

  const play = useCallback(async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    const { signal } = ctl;
    setShown([]);
    setTyping(false);
    try {
      for (const step of script) {
        if (step.wait) await sleep(step.wait, signal);
        if (step.kind === "typing") {
          setTyping(true);
          await sleep(step.ms, signal);
          setTyping(false);
          continue;
        }
        const id = nextId.current++;
        if (step.kind === "out" || step.kind === "voice") {
          setShown((s) => [...s, { ...step, id, reaction: undefined } as Shown]);
          if (step.react) {
            await sleep(650, signal);
            setShown((s) => s.map((m) => (m.id === id ? ({ ...m, reaction: "✅" } as Shown) : m)));
          }
        } else if (step.kind === "buttons") {
          setShown((s) => [...s, { ...step, id, chosen: null }]);
        } else {
          setShown((s) => [...s, { ...step, id } as Shown]);
        }
      }
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  }, [script]);

  // Start (or show everything at once under reduced motion). Unmount aborts the running loop.
  useEffect(() => {
    if (reduce) {
      controller.current?.abort();
      return;
    }
    // start on the next tick (the server HTML shows the whole conversation until then)
    const start = window.setTimeout(() => void play(), 0);
    return () => {
      window.clearTimeout(start);
      controller.current?.abort();
    };
  }, [reduce, play]);

  const list = reduce ? staticShown : shown;
  const isTyping = !reduce && typing;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list, isTyping]);

  const choose = useCallback(
    async (msgId: number, label: string, replies: Readonly<Record<string, string>>, time: string) => {
      const mark = (s: Shown[]) => s.map((m) => (m.id === msgId && m.kind === "buttons" ? { ...m, chosen: label } : m));
      const reply = replies[label];
      if (reduce) {
        setStaticShown((s) => (reply ? [...mark(s), { id: nextId.current++, kind: "in" as const, text: reply, time }] : mark(s)));
        return;
      }
      setShown(mark);
      if (!reply) return;
      const signal = controller.current?.signal;
      if (!signal || signal.aborted) return;
      try {
        await sleep(450, signal);
        setTyping(true);
        await sleep(900, signal);
        setTyping(false);
        setShown((s) => [...s, { id: nextId.current++, kind: "in", text: reply, time }]);
        if (loop) {
          await sleep(4500, signal);
          void play();
        }
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
      }
    },
    [loop, play, reduce],
  );

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2.5 bg-[var(--wa-head)] px-3 pt-10 pb-2.5">
        <MascotAvatar sizes="36px" className="size-9 flex-none" />
        <span className="min-w-0">
          <b className="block text-[0.9375rem] leading-tight">{title}</b>
          <small className="block text-[0.75rem] leading-tight text-[var(--wa-time)]">{isTyping ? "מקלידה…" : "מחוברת"}</small>
        </span>
      </div>
      <div
        ref={logRef}
        aria-live="off"
        role="log"
        aria-label="השיחה"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2.5 py-3 [scrollbar-width:none] [&>*]:flex-none"
      >
        {list.map((m) => {
          switch (m.kind) {
            case "chip":
              return (
                <span key={m.id} className="self-center rounded-lg bg-[var(--wa-chip)] px-3 py-0.5 text-[0.75rem] text-[var(--wa-time)]">
                  {m.text}
                </span>
              );
            case "out":
              return (
                <Bubble key={m.id} side="out" time={m.time} reaction={m.reaction}>
                  {m.text}
                </Bubble>
              );
            case "voice":
              return (
                <Bubble key={m.id} side="out" time={m.time} reaction={m.reaction} label={`הודעה קולית, ${m.duration}${m.transcript ? `: ${m.transcript}` : ""}`}>
                  <VoiceNote duration={m.duration} transcript={m.transcript} />
                </Bubble>
              );
            case "in":
              return (
                <Bubble key={m.id} side="in" time={m.time}>
                  {m.text}
                </Bubble>
              );
            case "draft":
              return (
                <Bubble key={m.id} side="in" time={m.time}>
                  <DraftCard draft={m.draft} />
                  {m.prompt}
                </Bubble>
              );
            case "buttons":
              return <WaButtons key={m.id} labels={m.labels} chosen={m.chosen} onChoose={(l) => void choose(m.id, l, m.replies, m.time)} />;
          }
        })}
        {isTyping ? <TypingDots /> : null}
      </div>
      <div aria-hidden="true" className="flex items-center gap-2 bg-[var(--wa-head)]/60 px-2.5 pt-2 pb-3.5">
        <span className="flex-1 rounded-full bg-[var(--wa-in)] px-3.5 py-2 text-[0.8125rem] text-[var(--wa-time)]">הודעה</span>
        <span className="grid size-9 place-items-center rounded-full bg-[var(--wa-green)]">
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-white stroke-2">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      {replayable && !reduce ? (
        <button
          type="button"
          onClick={() => void play()}
          className="absolute end-3 top-11 z-10 rounded-full bg-black/35 px-2.5 py-1 text-[0.75rem] text-[var(--wa-fg)] hover:bg-black/50"
        >
          מההתחלה
        </button>
      ) : null}
    </div>
  );
}
