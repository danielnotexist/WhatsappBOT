import { ChatDemo, type ChatStep } from "@/components/brand/chat-demo";
import { Confetti } from "@/components/brand/confetti";
import { Cta } from "@/components/brand/cta";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { QrCode } from "@/components/brand/qr-code";
import { StepProgress } from "@/components/brand/step-card";
import { BRAND } from "@/lib/brand";
import { StepHeading } from "./step-heading";

/** The little conversation on the "ready" phone: a 34-second voice note → a numbered answer with a ready draft. */
export const READY_SCRIPT: ChatStep[] = [
  { kind: "chip", text: "היום" },
  { kind: "voice", duration: "0:34", time: "08:12", react: true },
  { kind: "typing", ms: 900, wait: 200 },
  {
    kind: "in",
    time: "08:13",
    text: "קיבלתי. מה שעל הצלחת היום:\n1. הצעת מחיר ללוי — טיוטה מוכנה\n2. הפגישה עם כהן — אפשר להזיז לחמישי ב-10:00\n3. חשבונית לרו״ח — תזכורת מחר ב-9:00\n\nתגידו מילה וזה יוצא.",
  },
];

/**
 * Step 6 (round plan §3): confetti, "העוזרת שלך מוכנה.", the wa.me link with the one-time token, a QR code for
 * desktop, and "use another email". Server component — the token and QR are made per request.
 */
export async function ReadyStep({
  waHref,
  token,
  connected,
  signOutAction,
}: {
  waHref: string;
  token: string;
  connected: string | null;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="grid flex-1 gap-10 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-14">
      <Confetti />
      <div className="flex flex-col">
        <StepHeading tag="נכנסת." title="העוזרת שלך " light="מוכנה" after="." onDark size="hero" />
        <p className="mt-4 text-lede text-cream-muted">היא לא רואה את שאר השיחות שלך.</p>
        {connected === "microsoft" || connected === "google" ? (
          <p role="status" className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-sage/15 px-3 py-1 text-[0.9375rem] text-sage">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-[2.6]">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {connected === "google" ? "Gmail מחובר" : "Outlook מחובר"}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
          <Cta href={waHref} external tone="honey" block>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z" />
            </svg>
            חיבור לוואטסאפ
          </Cta>
          <p className="text-[0.875rem] text-cream-muted">
            נפתחת שיחה עם {BRAND.name} עם הודעה מוכנה. הקוד <bdi dir="ltr" className="font-semibold text-cream">{token}</bdi> עובד פעם אחת, ל-15 דקות.
          </p>
        </div>

        <div className="mt-8 hidden items-center gap-5 lg:flex">
          <QrCode value={waHref} label={`קוד QR לפתיחת השיחה עם ${BRAND.name} בטלפון`} className="size-32 flex-none" />
          <p className="max-w-[16rem] text-[0.9375rem] text-cream-muted">במחשב? סורקים עם המצלמה של הטלפון, ושולחים את ההודעה שנפתחת.</p>
        </div>

        <form action={signOutAction} className="mt-8">
          <button type="submit" className="rounded-md text-[0.9375rem] font-semibold text-cream underline underline-offset-3">
            להשתמש במייל אחר
          </button>
        </form>
        <div className="mt-auto pt-8">
          <StepProgress step={4} light={false} />
        </div>
      </div>

      <div className="flex justify-center lg:items-center">
        <PhoneMockup label={`דוגמה לשיחה עם ${BRAND.name} בוואטסאפ`} className="w-[17.5rem] max-w-full">
          <ChatDemo script={READY_SCRIPT} loop={false} replayable={false} />
        </PhoneMockup>
      </div>
    </div>
  );
}
