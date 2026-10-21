import type { ReactNode } from "react";
import { Bubble } from "@/components/brand/bubble";
import { DraftCard, type Draft } from "@/components/brand/draft-card";
import { VoiceNote } from "@/components/brand/voice-note";
import { WaButtons } from "@/components/brand/wa-buttons";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "./mascot";

/**
 * The pieces of the day scene's phone (landing page). The thread is one WhatsApp conversation that grows through the
 * day: each item belongs to a scene, and a scene's screen shows everything up to it, newest at the bottom — the
 * vertical sequence renders those snapshots, the pinned scene animates between them. Scene 4 is the lock screen.
 */

export type ThreadItem =
  | { id: string; scene: number; kind: "chip"; text: string }
  | { id: string; scene: number; kind: "out"; text: string; time: string }
  | { id: string; scene: number; kind: "voice"; duration: string; transcript: string; time: string }
  | { id: string; scene: number; kind: "in"; time: string; body: ReactNode }
  | { id: string; scene: number; kind: "draft"; time: string; draft: Draft; prompt: string }
  | {
      id: string;
      scene: number;
      kind: "buttons";
      time: string;
      labels: readonly string[];
      chosen: string;
    };

export const THREAD: readonly ThreadItem[] = [
  { id: "chip", scene: 0, kind: "chip", text: "היום" },
  {
    id: "voice",
    scene: 0,
    kind: "voice",
    duration: "0:38",
    time: "13:05",
    transcript:
      "תזכירי לי מחר בבוקר להתקשר לרו״ח, תכיני לברק הצעת מחיר כמו בפעם הקודמת, ותמצאי לי שעה בשבוע הבא לכתוב סיכומים",
  },
  {
    id: "sorted",
    scene: 0,
    kind: "in",
    time: "13:06",
    body: (
      <>
        קיבלתי. שלושה דברים:
        {"\n"}• מחר ב-09:00: להתקשר לרו״ח
        {"\n"}• ברק: הצעת מחיר, טיוטה מוכנה
        {"\n"}• יום א׳ 25.10, 14:00–15:00 פנוי לסיכומים. לחסום?
      </>
    ),
  },
  { id: "ask-tomorrow", scene: 1, kind: "out", text: "מה יש לי מחר?", time: "18:20" },
  {
    id: "tomorrow",
    scene: 1,
    kind: "in",
    time: "18:20",
    body: (
      <>
        <b>מחר, יום ה׳ 22.10</b>
        {"\n"}09:00 תזכורת: להתקשר לרו״ח
        {"\n"}10:30 משפחת לוי, במשרד
        {"\n"}14:00 דנה רז, שיחת וידאו
        {"\n\n"}מחכים לתשובה: מייל מהבנק ומייל מעו״ד שטרן.
      </>
    ),
  },
  {
    id: "ask-draft",
    scene: 2,
    kind: "out",
    text: "תכתבי ללוי שמחר ב-10:30 במשרד, ושיביאו את החוזה החתום",
    time: "18:24",
  },
  {
    id: "draft",
    scene: 2,
    kind: "draft",
    time: "18:24",
    prompt: "לשלוח?",
    draft: {
      to: "levi.family@gmail.com",
      subject: "הפגישה מחר, 22.10 בשעה 10:30",
      body: "שלום,\nנתראה מחר ב-10:30 במשרד. אשמח אם תביאו את החוזה החתום.\nמיכל",
    },
  },
  {
    id: "approve",
    scene: 2,
    kind: "buttons",
    time: "18:25",
    labels: ["שלח", "ערוך", "בטל"],
    chosen: "שלח",
  },
  { id: "sent", scene: 2, kind: "in", time: "18:25", body: "נשלח. אעדכן כשתגיע תשובה." },
];

/** The last chat scene; the scene after it is the lock screen. */
export const LAST_CHAT_SCENE = 2;

/** Is this item written by her (and so preceded by "מקלידה…" when it arrives)? */
export const isHers = (item: ThreadItem) => item.kind === "in" || item.kind === "draft";

export function ThreadItemView({ item }: { item: ThreadItem }) {
  switch (item.kind) {
    case "chip":
      return (
        <span className="block self-center rounded-lg bg-[var(--wa-chip)] px-3 py-0.5 text-[0.75rem] text-[var(--wa-time)]">
          {item.text}
        </span>
      );
    case "out":
      return (
        <Bubble side="out" time={item.time} reaction="✅">
          {item.text}
        </Bubble>
      );
    case "voice":
      return (
        <Bubble
          side="out"
          time={item.time}
          reaction="✅"
          label={`הודעה קולית, ${item.duration}: ${item.transcript}`}
        >
          <VoiceNote duration={item.duration} transcript={item.transcript} />
        </Bubble>
      );
    case "in":
      return (
        <Bubble side="in" time={item.time}>
          {item.body}
        </Bubble>
      );
    case "draft":
      return (
        <Bubble side="in" time={item.time}>
          <DraftCard draft={item.draft} />
          {item.prompt}
        </Bubble>
      );
    case "buttons":
      return <WaButtons labels={item.labels} chosen={item.chosen} label="אישור הטיוטה ללוי" />;
  }
}

/** WhatsApp's chat header: her avatar, name and status ("מחוברת" / "מקלידה…"). */
export function WaHeader({ typing = false }: { typing?: boolean }) {
  return (
    <div className="flex flex-none items-center gap-2.5 bg-[var(--wa-head)] px-3 pt-10 pb-2.5">
      <ProfileAvatar size={36} />
      <span className="min-w-0">
        <b className="block text-[0.9375rem] leading-tight">{BRAND.name}</b>
        <small className="block text-[0.75rem] leading-tight text-[var(--wa-time)]">
          {typing ? "מקלידה…" : "מחוברת"}
        </small>
      </span>
    </div>
  );
}

/** The (drawn) message field at the bottom of the chat. */
export function WaComposer() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-none items-center gap-2 bg-[var(--wa-head)]/60 px-2.5 pt-2 pb-3.5"
    >
      <span className="flex-1 rounded-full bg-[var(--wa-in)] px-3.5 py-2 text-[0.8125rem] text-[var(--wa-time)]">
        הודעה
      </span>
      <span className="grid size-9 place-items-center rounded-full bg-[var(--wa-green)]">
        <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-white stroke-2">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}

/** A static snapshot of the thread up to `scene`: newest at the bottom, older messages slide under the header. */
export function ThreadSnapshot({ scene, className }: { scene: number; className?: string }) {
  const items = THREAD.filter((i) => i.scene <= scene);
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 pt-2 pb-3 [&>*]:flex-none",
        className,
      )}
    >
      {items.map((item) => (
        <ThreadItemView key={item.id} item={item} />
      ))}
    </div>
  );
}

/** 07:30 the next morning: the lock screen at dawn with her morning summary. */
export function LockScreen({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center px-3.5 pt-14 pb-3 text-[#F6F1E7]",
        "bg-[radial-gradient(120%_55%_at_50%_112%,#E9B866_0%,#B98549_28%,rgb(60_74_58/0.6)_58%,transparent_80%),linear-gradient(180deg,#0C1713_0%,#13241C_45%,#2C3A2C_78%,#6E5A3A_100%)]",
        className,
      )}
    >
      <p className="text-[0.8125rem] font-semibold">יום חמישי, 22 באוקטובר</p>
      <p
        dir="ltr"
        className="tabular mt-0.5 text-[4.25rem] leading-none font-extralight tracking-tight @max-[16rem]:text-[3.5rem]"
      >
        07:30
      </p>
      <div className="mt-7 w-full rounded-[1.25rem] bg-[rgb(16_29_24/0.78)] px-3 pt-2.5 pb-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ProfileAvatar size={24} />
          <b className="text-[0.8125rem]">{BRAND.name}</b>
          <span className="ms-auto text-[0.6875rem] text-[#C9D2CB]">עכשיו</span>
        </div>
        <p className="mt-1.5 text-[0.8125rem] font-bold">סיכום הבוקר, יום ה׳ 22.10</p>
        <p className="mt-0.5 text-[0.8125rem] leading-[1.45] whitespace-pre-line text-[#E4E9E5]">
          {
            "09:00 תזכורת: להתקשר לרו״ח\n10:30 משפחת לוי, אישרו הגעה\n14:00 דנה רז, שיחת וידאו\nמחכים לתשובה: 2 מיילים"
          }
        </p>
      </div>
      <span aria-hidden="true" className="mt-auto h-1 w-28 rounded-full bg-white/70" />
    </div>
  );
}
