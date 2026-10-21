import Link from "next/link";
import { Cta } from "@/components/brand/cta";
import { StepProgress } from "@/components/brand/step-card";
import { BRAND } from "@/lib/brand";
import { StepHeading } from "./step-heading";

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-current stroke-[2.4]">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Lock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-current stroke-2">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
function Info() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-current stroke-2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
    </svg>
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
    <div className="flex flex-1 flex-col">
      <StepHeading tag="דבר אחרון" title={`תנו ל${BRAND.name} את `} light="כוח-העל" after=" הראשון שלה" />
      <p className="mt-3 text-lede">כל עוזרת טובה מתחילה מהמייל.</p>

      <ul className="mt-6 flex flex-col gap-3 text-[1rem]">
        <li className="flex gap-3">
          <Check />
          שום דבר לא יוצא בלי האישור שלך
        </li>
        <li className="flex gap-3">
          <Lock />
          מוצפן, נשמר באירופה, לא משמש לאימון
        </li>
        <li className="flex gap-3">
          <Info />
          במסך הבא — לסמן את כל ההרשאות
        </li>
      </ul>

      {error ? (
        <div role="alert" className="mt-6 rounded-2xl border-2 border-ink/25 bg-white/35 p-4 text-[0.9375rem]">
          <p className="font-semibold text-destructive">{error}</p>
          {adminLink ? (
            <p className="mt-2">
              <a href={adminMailto(adminLink)} className="font-semibold underline underline-offset-3">
                שליחה למנהל ה-IT
              </a>{" "}
              — מייל מוכן עם קישור לאישור. אחרי שיאשר, מתחברים שוב מכאן.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Cta tone="ink" href="/connect/microsoft" block>
          חיבור Microsoft 365 / Outlook
        </Cta>
        <Cta tone="outline" href="/connect/google" block>
          חיבור Gmail
        </Cta>
        <Link href="/start/ready" className="self-center rounded-md px-3 py-2 text-[1rem] font-semibold underline underline-offset-3">
          דילוג בינתיים
        </Link>
      </div>
      <div className="mt-4">
        <StepProgress step={3} />
      </div>
    </div>
  );
}
