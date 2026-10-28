import type { ReactNode } from "react";
import { ChatDemo, type ChatStep } from "@/components/brand/chat-demo";
import { Confetti } from "@/components/brand/confetti";
import { ctaClass } from "@/components/brand/cta";
import { Mascot } from "@/components/brand/mascot";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { WhatsappGlyph } from "@/components/brand/provider-logo";
import { QrCode } from "@/components/brand/qr-code";
import { StepProgress } from "@/components/brand/step-card";
import { WaLinkButton } from "@/components/brand/wa-link-button";
import { BRAND } from "@/lib/brand";
import { StepHeading } from "./step-heading";
import { StepAside, StepBody } from "./step-slots";

/** The little conversation on the "ready" phone: a 34-second voice note → a numbered answer with a ready draft. */
export const READY_SCRIPT: ChatStep[] = [
  { kind: "chip", text: "היום" },
  { kind: "voice", duration: "0:34", time: "08:12", react: true },
  { kind: "typing", ms: 900, wait: 200 },
  {
    kind: "in",
    time: "08:13",
    text: "קיבלתי. מה שעל הצלחת היום:\n1. הצעת מחיר ללוי - טיוטה מוכנה\n2. הפגישה עם כהן - אפשר להזיז לחמישי ב-10:00\n3. חשבונית לרו״ח - תזכורת מחר ב-9:00\n\nתגידו מילה וזה יוצא.",
  },
];

/**
 * Step 6 (round plan §3): the paper dissolves into the stage — "העוזרת שלך מוכנה.", the wa.me link with the one-time
 * token, a QR code for desktop, "use another email" and the phone with a first conversation. Static: the page streams
 * the request-time part (the session, the token) into `link` — <ReadyLink>, with <ReadyLinkPending> in its place until
 * then — so the step is drawn at once and never redrawn.
 */
export function ReadyStep({ link, signOutAction }: { link: ReactNode; signOutAction: () => Promise<void> }) {
  return (
    <>
      <StepAside className="max-sm:px-4 lg:self-center">
        <StepHeading tag="נכנסת." title="העוזרת שלך " light="מוכנה" after="." onDark size="hero" />
        <p className="mt-4 text-lede text-cream-muted">היא לא רואה את שאר השיחות שלך.</p>
        {link}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 sm:max-w-sm lg:max-w-none lg:justify-start">
          <form action={signOutAction}>
            <button type="submit" className="rounded-md text-[0.9375rem] font-semibold text-cream underline underline-offset-3">
              להשתמש במייל אחר
            </button>
          </form>
          <StepProgress step={4} light={false} />
        </div>
      </StepAside>

      <StepBody className="items-center pt-12 max-sm:px-4 lg:justify-center lg:p-0">
        <div className="relative">
          <PhoneMockup label={`דוגמה לשיחה עם ${BRAND.name} בוואטסאפ`} className="w-[17.5rem] max-w-full lg:w-[19rem]">
            <ChatDemo script={READY_SCRIPT} loop={false} replayable={false} />
          </PhoneMockup>
          {/* the hoopoe celebrates next to the phone, leaning on its corner */}
          <Mascot pose="celebrating" eager sizes="(min-width: 1024px) 168px, 104px" className="absolute -start-8 -bottom-2 w-[6.5rem] lg:-start-24 lg:w-[10.5rem]" />
        </div>
      </StepBody>
    </>
  );
}

const QR_HINT = "במחשב? סורקים עם המצלמה של הטלפון, ושולחים את ההודעה שנפתחת.";

/**
 * The personal part of the ready step: confetti, "Outlook / Gmail מחובר", the wa.me button (WaLinkButton: the single
 * wiring point for the demo dialog) with the one-time token, and its QR. Made per request (the token, the QR).
 */
export function ReadyLink({ waHref, token, connected }: { waHref: string; token: string; connected: string | null }) {
  return (
    <>
      <Confetti />
      {connected === "microsoft" || connected === "google" ? (
        <p role="status" className="mt-5 inline-flex items-center gap-2 self-start rounded-full bg-sage/12 py-1 ps-2.5 pe-3.5 text-[0.9375rem] font-semibold text-sage">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-[2.6]">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {connected === "google" ? "Gmail מחובר" : "Outlook מחובר"}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
        <WaLinkButton href={waHref} block>
          חיבור לוואטסאפ
        </WaLinkButton>
        <p className="text-[0.875rem] leading-relaxed text-cream-muted">
          נפתחת שיחה עם {BRAND.name} עם הודעה מוכנה. הקוד{" "}
          <bdi dir="ltr" className="font-semibold text-cream tabular">
            {token}
          </bdi>{" "}
          עובד פעם אחת, ל-15 דקות.
        </p>
      </div>

      <div className="mt-8 hidden items-center gap-5 lg:flex">
        <QrCode value={waHref} label={`קוד QR לפתיחת השיחה עם ${BRAND.name} בטלפון`} className="size-28 flex-none" />
        <p className="max-w-[15rem] text-[0.9375rem] leading-relaxed text-cream-muted">{QR_HINT}</p>
      </div>
    </>
  );
}

/**
 * <ReadyLink> while the token is being issued: the same layout, the button and the QR as quiet placeholders — never a
 * link without its token (and never a wrong wa.me link). The button is a real disabled button in the tone's disabled
 * look, so it neither looks nor reads as ready; a status line says what is happening.
 */
export function ReadyLinkPending() {
  return (
    <>
      <div className="mt-8 flex flex-col gap-3 sm:max-w-sm" aria-busy="true">
        <p role="status" className="sr-only">
          מכינים את קישור החיבור האישי…
        </p>
        <button type="button" disabled className={ctaClass({ tone: "honey", block: true })}>
          <WhatsappGlyph className="size-5 flex-none" />
          חיבור לוואטסאפ
        </button>
        <p className="text-[0.875rem] leading-relaxed text-cream-muted">
          נפתחת שיחה עם {BRAND.name} עם הודעה מוכנה. הקוד{" "}
          <bdi dir="ltr" className="font-semibold text-cream/35 tabular">
            ····-····
          </bdi>{" "}
          עובד פעם אחת, ל-15 דקות.
        </p>
      </div>

      <div className="mt-8 hidden items-center gap-5 lg:flex" aria-hidden="true">
        <span className="size-28 flex-none rounded-2xl bg-paper/10" />
        <p className="max-w-[15rem] text-[0.9375rem] leading-relaxed text-cream-muted">{QR_HINT}</p>
      </div>
    </>
  );
}
