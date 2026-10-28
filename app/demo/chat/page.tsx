import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { HEADER_BAR } from "@/components/brand/frame";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import { spendLimits } from "@/lib/ai/budget";
import { getSession } from "@/lib/auth/current-user";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { liveAiInDemo } from "@/lib/env";
import { ChatScreen } from "./_components/chat-screen";

export const metadata: Metadata = { title: `הצ'אט עם ${BRAND.name}`, robots: { index: false, follow: false } };

/**
 * /demo/chat — DEMO_MODE only, signed-in only (proxy.ts answers 404 otherwise; checked here again). The person talks to
 * עלזה through the same pipeline as WhatsApp. Wide screens: a short note beside the phone. Phones: the chat is the
 * whole screen (app/globals.css pins the page to the viewport height).
 */
export default function DemoChatPage() {
  return (
    <div data-chat-page="" className="stage flex min-h-0 flex-1 flex-col">
      <header className={cn(HEADER_BAR, "hidden md:flex")}>
        <Wordmark />
        <Cta tone="ghost" size="sm" href="/account">
          לאזור האישי
        </Cta>
      </header>
      <main id="main" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col md:flex-row md:items-center md:justify-between md:gap-16 md:px-8 md:pb-12">
        <Suspense
          fallback={
            <p role="status" className="m-auto text-cream-muted">
              פותחים את הצ&apos;אט…
            </p>
          }
        >
          <Chat />
        </Suspense>
      </main>
    </div>
  );
}

async function Chat() {
  await connection(); // the session and the demo switch are read per request
  if (!isDemo()) notFound();
  const session = await getSession();
  if (!session) notFound();
  const user = await getDb().getUser(session.userId);
  if (!user) notFound();
  const liveAi = liveAiInDemo();
  let dailyMessages: number | null = null;
  try {
    dailyMessages = spendLimits()?.userDailyMessages ?? null;
  } catch {
    dailyMessages = null; // a bad value fails the first message with its Hebrew message, not the page
  }

  return (
    <>
      <section aria-labelledby="chat-title" className="max-w-[28rem] max-md:sr-only">
        <Handwritten tone="sage">בלי לפתוח את הטלפון.</Handwritten>
        <h1 id="chat-title" className="mt-2 text-title leading-[1.1] font-bold">
          הצ&apos;אט עם {BRAND.name}
        </h1>
        <p className="mt-5 text-lede text-cream-muted">
          אותה שיחה כמו בוואטסאפ: כותבים, מקליטים ולוחצים על הכפתורים ש{BRAND.name} שולחת. ההיכרות, הטיוטות והתזכורות עובדות כרגיל, ושום דבר לא יוצא
          החוצה.
        </p>
        <p className="mt-5 border-s-2 border-honey/60 ps-4 text-[0.9375rem] leading-relaxed text-cream-muted">
          {liveAi
            ? `התשובות כאן מהמודל האמיתי, וההקלטות מתומללות באמת.${dailyMessages ? ` עד ${dailyMessages} הודעות ביום.` : ""}`
            : "בגרסת ההדגמה התשובות לדוגמה, וכל הקלטה מתומללת לאותו משפט קבוע."}
        </p>
      </section>
      <ChatScreen liveAi={liveAi} dailyMessages={dailyMessages} />
    </>
  );
}
