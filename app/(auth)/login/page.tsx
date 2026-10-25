import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChatSnippet, type SnippetLine } from "@/components/brand/chat-snippet";
import { Cta } from "@/components/brand/cta";
import { Handwritten } from "@/components/brand/handwritten";
import { Mascot } from "@/components/brand/mascot";
import { WhatsappGlyph } from "@/components/brand/provider-logo";
import { Wordmark } from "@/components/brand/wordmark";
import { BRAND } from "@/lib/brand";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "כניסה", robots: NOINDEX };

/** A real morning summary, in the bot's own template (lib/copy/bot-m5.ts → act.morning.summary). */
const MORNING: SnippetLine[] = [
  { bold: true, text: "בוקר טוב. יום ג׳ 22.10" },
  { text: "" },
  { bold: true, text: "פגישות היום" },
  { text: "09:00 גב׳ אברהם, פגישת המשך" },
  { text: "13:30 מר כהן, פגישה ראשונה" },
  { text: "" },
  { bold: true, text: "מיילים שמחכים לתשובה" },
  { text: "רונית אברהם: ההפניה מהרופא" },
  { text: "" },
  { bold: true, text: "תזכורות" },
  { text: "16:00 להתקשר לרו״ח" },
  { text: "" },
  { text: "רוצה שאנסח תשובה למישהו מהם?" },
];

const LEGAL = [
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/privacy", label: "פרטיות" },
  { href: "/accessibility", label: "נגישות" },
] as const;

/** A soft key light and a little paper grain on the sage panel. */
const PANEL_TEXTURE = {
  backgroundImage: [
    "radial-gradient(70% 55% at 30% 38%, rgb(255 255 255 / 0.22), transparent 70%)",
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.07 0 0 0 0 0.14 0 0 0 0 0.11 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  ].join(", "),
};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none fill-none stroke-current stroke-2">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Assurance({ icon, children }: { icon: "lock" | "check"; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none fill-none stroke-sage stroke-2">
        {icon === "lock" ? (
          <>
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </>
        ) : (
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {children}
    </li>
  );
}

/**
 * Step 7 (round plan §3): the split sign-in screen. Form side, on the stage: email (same code flow → /account) or the
 * WhatsApp way for people who joined from the chat, two plain promises and the legal links. Other side: a sage paper
 * with the hoopoe and a real morning summary from עלזה — what signing back in is for. No fake social proof.
 */
export default function LoginPage() {
  return (
    <div className="stage grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 sm:px-8 lg:ps-[max(2rem,calc((100vw-72rem)/2+2rem))]">
        <header className="flex h-[4.75rem] flex-none items-center">
          <Wordmark />
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center py-8">
          <div className="mx-auto w-full max-w-[25rem] lg:mx-0">
            <Mascot pose="waving" eager sizes="80px" className="mb-3 w-20 lg:hidden" />
            <Handwritten tone="sage">שוב כאן.</Handwritten>
            <h1 className="mt-2 text-title leading-[1.12] font-bold">טוב לראות אותך שוב</h1>
            <p className="mt-3 text-[1.0625rem] text-cream-muted">נכנסים לאזור האישי: החיבורים, המנוי ומספר הוואטסאפ.</p>

            <div className="mt-8 flex flex-col gap-3">
              <Cta href="/login/email" block>
                <MailIcon />
                המשך עם מייל
              </Cta>
              <Cta href="/login/whatsapp" tone="ghost" block>
                <WhatsappGlyph className="size-5 flex-none text-sage" />
                הצטרפת דרך וואטסאפ? כניסה כאן
              </Cta>
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[0.875rem] text-cream-muted">
              <Assurance icon="lock">מוצפן ונשמר באירופה</Assurance>
              <Assurance icon="check">שום דבר לא יוצא בלי אישור</Assurance>
            </ul>

            <p className="mt-8 text-[0.9375rem] text-cream-muted">
              אין עדיין חשבון?{" "}
              <Link href="/start" className="rounded-sm font-semibold text-cream underline underline-offset-3">
                הרשמה
              </Link>
              , לוקח בערך דקה.
            </p>
          </div>
        </main>
        <footer className="flex flex-none flex-wrap gap-x-5 gap-y-1 pb-6 text-[0.8125rem] text-cream-muted">
          {LEGAL.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-sm underline-offset-3 hover:text-cream hover:underline">
              {l.label}
            </Link>
          ))}
        </footer>
      </div>

      <aside aria-label={`${BRAND.name} בקצרה`} className="hidden p-6 lg:flex">
        <div style={PANEL_TEXTURE} className="surface-light relative flex w-full flex-col overflow-hidden rounded-card bg-moss px-12 pt-12 pb-10 text-ink shadow-stage">
          <p className="max-w-md font-heading text-[2.75rem] leading-[1.08] font-bold">
            מה שעל הצלחת?
            <span className="block font-light">היא כבר על זה.</span>
          </p>

          <div className="relative mt-8 flex flex-1 items-center justify-center">
            <ChatSnippet lines={MORNING} time="07:30" label={`דוגמה לסיכום בוקר מ${BRAND.name} בוואטסאפ`} className="relative z-10 me-20 rotate-[1.5deg]" />
            <Mascot
              pose="waving"
              alt={`הדוכיפת של ${BRAND.name} מנופפת לשלום`}
              eager
              sizes="208px"
              className="absolute end-[-0.5rem] bottom-[-1.5rem] z-20 w-[min(13rem,26vh)]"
            />
          </div>

          <p className="relative z-10 mt-6 max-w-[19rem] text-[1rem] text-ink-muted">סיכום בוקר בוואטסאפ, טיוטות למייל ותזכורות, בעברית. שום דבר לא יוצא בלי האישור שלך.</p>
        </div>
      </aside>
    </div>
  );
}
