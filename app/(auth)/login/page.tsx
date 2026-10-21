import type { Metadata } from "next";
import Link from "next/link";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { MascotPlaceholder } from "@/components/brand/mascot-placeholder";
import { Wordmark } from "@/components/brand/wordmark";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "כניסה" };

/**
 * Step 7 (round plan §3): the split sign-in screen. Form side: email (same code flow → /account) or the WhatsApp
 * way for people who joined from the chat. Other side: the mascot and one line — no fake social proof.
 */
export default function LoginPage() {
  return (
    <div className="stage grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 sm:px-8">
        <header className="flex h-[4.75rem] items-center">
          <Wordmark />
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center pb-16">
          <div className="mx-auto w-full max-w-[26rem]">
            <Handwritten tone="sage">שוב כאן.</Handwritten>
            <h1 className="mt-2 text-title font-bold">טוב לראות אותך שוב</h1>
            <p className="mt-3 text-[1.0625rem] text-cream-muted">נכנסים לאזור האישי: חיבורים, מנוי ומספר הוואטסאפ.</p>

            <div className="mt-9 flex flex-col gap-4">
              <Cta href="/login/email" block>
                המשך עם מייל
              </Cta>
              <div className="flex items-center gap-3 text-[0.875rem] text-cream-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                או
                <span className="h-px flex-1 bg-line" />
              </div>
              <Link
                href="/login/whatsapp"
                className="flex min-h-14 items-center justify-center rounded-full border-2 border-cream-muted/60 px-6 text-center text-[1rem] font-semibold hover:bg-cream/6"
              >
                הצטרפת דרך וואטסאפ? כניסה כאן
              </Link>
            </div>

            <p className="mt-10 text-[0.9375rem] text-cream-muted">
              אין עדיין חשבון?{" "}
              <Link href="/start" className="font-semibold text-cream underline underline-offset-3">
                הרשמה — לוקח בערך דקה
              </Link>
            </p>
          </div>
        </main>
      </div>

      <aside aria-label={`${BRAND.name} בקצרה`} className="relative hidden flex-col justify-between overflow-hidden bg-moss p-12 text-ink lg:flex">
        <p className="max-w-md font-heading text-[2.75rem] leading-[1.08] font-bold">
          מה שאמרת שתעשה?
          <span className="block font-light">היא כבר על זה.</span>
        </p>
        <MascotPlaceholder pose="wave" label={`הדוכיפת של ${BRAND.name}`} className="mx-auto size-[22rem] max-w-full" />
        <p className="max-w-md text-[1rem] text-ink-muted">מייל, יומן וקבצים, בעברית ובוואטסאפ. שום דבר לא יוצא בלי האישור שלך.</p>
      </aside>
    </div>
  );
}
