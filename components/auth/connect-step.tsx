import Link from "next/link";
import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { GoogleLogo, MicrosoftLogo } from "@/components/brand/provider-logo";
import { StepProgress } from "@/components/brand/step-card";
import { BRAND } from "@/lib/brand";
import { StepHeading } from "./step-heading";
import { StepAside, StepBody, StepMascot } from "./step-slots";

/** A white rounded chip for a provider logo inside a button (both brands want their logo on white). */
function LogoChip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-lg bg-white shadow-[0_0_0_1px_rgb(19_36_28/0.12)]">
      {children}
    </span>
  );
}

const icon = "mt-[0.2rem] size-5 flex-none fill-none stroke-current lg:text-sage";

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${icon} stroke-[2.4]`}>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Lock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${icon} stroke-2`}>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
function Boxes() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${icon} stroke-2`}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Assurance({ icon: Icon, children }: { icon: () => ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icon />
      <span>{children}</span>
    </li>
  );
}

/** The text an IT admin gets by mail, with the tenant-wide consent link (30 minutes, from this signed-in user). */
export function adminMailto(adminLink: string): string {
  const subject = `בקשה לאישור חיבור ${BRAND.name} ל-Microsoft 365`;
  const body = [
    "היי,",
    `אני רוצה לחבר את ${BRAND.name} — עוזרת למייל וליומן בוואטסאפ — לחשבון ה-Microsoft 365 שלי.`,
    "הארגון דורש אישור מנהל חד-פעמי להרשאות מייל, יומן וקבצים (קריאה ושליחה בשמי בלבד, בלי גישה לחשבונות אחרים).",
    "",
    "הקישור לאישור (תקף 30 דקות):",
    adminLink,
    "",
    "תודה!",
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Step 4 (round plan §3): give עלזה her first superpower. Microsoft first (primary), Gmail second, skip.
 * After a failed Microsoft round-trip the callback brings the user back here with the reason; when the
 * organisation needs an admin, a "send to the IT admin" mail link appears.
 */
export function ConnectStep({ error, adminLink }: { error?: string; adminLink?: string | null }) {
  return (
    <>
      <StepAside>
        <StepHeading
          tag="דבר אחרון"
          title={
            <>
              תנו ל{BRAND.name} את <span className="whitespace-nowrap">כוח-העל</span> הראשון שלה
            </>
          }
        />
        <p className="mt-3 text-[1.0625rem] lg:mt-5 lg:text-lede lg:text-cream-muted">כל עוזרת טובה מתחילה מהמייל.</p>
        <ul className="mt-6 flex flex-col gap-3 text-[1rem] leading-snug lg:mt-8">
          <Assurance icon={Check}>שום דבר לא יוצא בלי האישור שלך</Assurance>
          <Assurance icon={Lock}>מוצפן, נשמר באירופה, לא משמש לאימון</Assurance>
          <Assurance icon={Boxes}>במסך הבא כדאי לסמן את כל ההרשאות</Assurance>
        </ul>
      </StepAside>

      <StepBody>
        {error ? (
          <div role="alert" className="mb-6 rounded-2xl border-2 border-destructive/40 bg-white/40 p-4 text-[0.9375rem] leading-snug">
            <p className="font-semibold text-destructive">{error}</p>
            {adminLink ? (
              <p className="mt-2">
                <a href={adminMailto(adminLink)} className="font-semibold underline underline-offset-3">
                  שליחה למנהל ה-IT
                </a>
                : מייל מוכן עם קישור לאישור. אחרי האישור מתחברים שוב מכאן.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {/* official logos on a white chip, on the start side of the label (Microsoft / Google sign-in branding) */}
          <Cta tone="ink" href="/connect/microsoft" block>
            <LogoChip>
              <MicrosoftLogo className="size-[1.0625rem]" />
            </LogoChip>
            חיבור Microsoft 365 / Outlook
          </Cta>
          <Cta tone="outline" href="/connect/google" block>
            <LogoChip>
              <GoogleLogo className="size-[1.125rem]" />
            </LogoChip>
            חיבור Gmail
          </Cta>
          <Link href="/start/ready" className="mt-1 self-center rounded-md px-3 py-2 text-[1rem] font-semibold underline underline-offset-3">
            דילוג בינתיים
          </Link>
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 pt-8">
          <StepProgress step={3} />
          <StepMascot pose="thinking" />
        </div>
      </StepBody>
    </>
  );
}
