import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Handwritten } from "@/components/brand/handwritten";
import { GoogleLogo, MicrosoftLogo, type ProviderId } from "@/components/brand/provider-logo";
import { StepProgress } from "@/components/brand/step-card";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { StepHeading } from "./step-heading";
import { StepAside, StepBody, StepMascot } from "./step-slots";

/**
 * One provider as a tile on the paper: the official logo on white (both brands ask for it), the account's name, the
 * products she works in today once it is connected (only what works now: no "coming soon" promises here), and a quiet
 * chevron toward the inline end.
 *  - The tile is the same material as the email field and the code cells (`fieldClass`: white over the paper, a little
 *    more on hover, more again on focus) and focuses the same way: an ink border and the soft 4px halo, nothing more
 *    (a real outline only in forced-colors mode, where shadows are dropped).
 *  - The link is the account's name, stretched over the whole tile (its ::after), so the tile is one big target while
 *    the link holds only text that is part of its name: "חיבור Gmail / Google" contains the visible "Google"
 *    (WCAG 2.5.3, label in name). Its description is one hidden sentence (the note, a full stop, the products), so a
 *    screen reader pauses between them; the visible products line is aria-hidden, so nothing is read twice.
 *  - Only the tile under the pointer or the keyboard changes: a 2px lift, the ink border and the chevron filling with
 *    ink and nudging toward the reading end. No movement under reduced motion (the device's or the site's own
 *    "עצירת אנימציות", app/globals.css).
 *  - `scroll-mb-*` keeps a focused tile clear of the fixed accessibility button on phones.
 */
function ProviderTile({
  provider,
  label,
  name,
  products,
  logo,
  note,
}: {
  provider: ProviderId;
  label: string;
  name: string;
  products: string[];
  logo: ReactNode;
  /** read before the products, in the description (shown above the tile, as a handwritten line) */
  note?: string;
}) {
  const descId = `connect-${provider}-desc`;
  const last = products.length - 1;
  const productsSentence = products.map((p, i) => (i === last ? `ו-${p}` : i === last - 1 ? p : `${p},`)).join(" ");
  return (
    <div
      className={cn(
        "group relative flex min-h-[5.25rem] items-center gap-4 rounded-field border-2 border-ink/12 bg-white/50 px-4 py-3.5 text-ink sm:gap-5 sm:px-5",
        "transition-[translate,background-color,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-ink/45 hover:bg-white/65 hover:shadow-[0_14px_24px_-20px_rgb(19_36_28/0.7)]",
        "has-[a:focus-visible]:-translate-y-0.5 has-[a:focus-visible]:border-ink has-[a:focus-visible]:bg-white/80 has-[a:focus-visible]:shadow-[0_0_0_4px_rgb(19_36_28/0.16)]",
        "forced-colors:has-[a:focus-visible]:outline-3 forced-colors:has-[a:focus-visible]:outline-offset-2 forced-colors:has-[a:focus-visible]:outline-solid",
        "has-[a:active]:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:has-[a:focus-visible]:translate-y-0",
      )}
    >
      <span id={descId} hidden>
        {note ? `${note}. ` : ""}
        {productsSentence}
      </span>
      <span
        aria-hidden="true"
        className="grid size-12 flex-none place-items-center rounded-[0.8125rem] bg-white shadow-[0_0_0_1px_rgb(19_36_28/0.12),0_6px_14px_-10px_rgb(19_36_28/0.45)]"
      >
        {logo}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={provider === "microsoft" ? "/connect/microsoft" : "/connect/google"}
          aria-label={label}
          aria-describedby={descId}
          className="scroll-mt-24 scroll-mb-28 self-start text-[1.125rem] leading-tight font-bold outline-none after:absolute after:-inset-0.5 after:rounded-field after:content-['']"
        >
          {name}
        </Link>
        <span aria-hidden="true" className="text-[0.9375rem] leading-snug text-ink-muted">
          {/* each product unbroken ("ו-OneDrive" never splits); lines break only between products */}
          {products.map((p, i) => (
            <Fragment key={p}>
              <span className="whitespace-nowrap">{i === last ? `ו-${p}` : i === last - 1 ? p : `${p},`}</span>
              {i < last ? " " : null}
            </Fragment>
          ))}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="grid size-9 flex-none place-items-center rounded-full border-2 border-ink/20 transition-[background-color,border-color,color] duration-200 group-hover:border-ink group-hover:bg-ink group-hover:text-cream group-has-[a:focus-visible]:border-ink group-has-[a:focus-visible]:bg-ink group-has-[a:focus-visible]:text-cream motion-reduce:transition-none"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 fill-none stroke-current stroke-[2.6] transition-transform duration-200 ease-out rtl:-scale-x-100 ltr:group-hover:translate-x-0.5 ltr:group-has-[a:focus-visible]:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:group-has-[a:focus-visible]:-translate-x-0.5 motion-reduce:transition-none motion-reduce:translate-x-0!"
        >
          <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
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
    `אני רוצה לחבר את ${BRAND.name} - עוזרת למייל וליומן בוואטסאפ - לחשבון ה-Microsoft 365 שלי.`,
    "הארגון דורש אישור מנהל חד-פעמי להרשאות מייל, יומן וקבצים (קריאה ושליחה בשמי בלבד, בלי גישה לחשבונות אחרים).",
    "",
    "הקישור לאישור (תקף 30 דקות):",
    adminLink,
    "",
    "תודה!",
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Why the last connection failed (the OAuth callback's `?error=`), and the IT-admin mail when the organisation needs one. */
export function ConnectError({ error, adminLink }: { error: string; adminLink?: string | null }) {
  return (
    <div role="alert" className="mb-5 rounded-field border-2 border-destructive/40 bg-white/40 px-4 py-3.5 text-[0.9375rem] leading-snug">
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
  );
}

/**
 * Back on this step with an account already connected, on a one-account plan (the trial, basic): which account, and
 * that the other one joins it on pro (lib/billing/plans.ts entitlements).
 */
export function OneAccountNote({ connected }: { connected: ProviderId }) {
  const name = connected === "microsoft" ? "Microsoft 365" : "Google";
  return (
    <p role="status" className="mb-5 rounded-field border-2 border-ink/15 bg-white/40 px-4 py-3.5 text-[0.9375rem] leading-snug">
      {name} כבר מחובר. בתקופת הניסיון ובמסלול הבסיסי עובדים עם חשבון אחד, ושני החשבונות יחד כלולים במסלול פרו.{" "}
      <Link href="/start/ready" className="font-semibold underline underline-offset-3">
        להמשיך
      </Link>
    </p>
  );
}

const MS_NOTE = "הנפוץ במשרדים";

/**
 * Step 4 (round plan §3): give עלזה her first superpower. Microsoft first (primary), Gmail second, skip.
 * After a failed Microsoft round-trip the callback brings the user back here with the reason; when the
 * organisation needs an admin, a "send to the IT admin" mail link appears. `notice` takes the request-time part
 * (the page streams the session check and the error there), so the card itself is static and never redrawn.
 */
export function ConnectStep({ error, adminLink, notice }: { error?: string; adminLink?: string | null; notice?: ReactNode }) {
  return (
    <>
      <StepAside>
        <StepHeading
          tag="דבר אחרון"
          title={
            <>
              {/* "הראשון שלה" stays together, so no line ends on a lone "שלה" */}
              תנו ל{BRAND.name} את <span className="whitespace-nowrap">כוח-העל</span>{" "}
              <span className="whitespace-nowrap">הראשון שלה</span>
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
        {error ? <ConnectError error={error} adminLink={adminLink} /> : null}
        {notice}

        {/* the question, and Microsoft's note in the handwritten voice right above its tile (in ink: on paper the
            accents turn to ink); the note is read as part of that tile's description */}
        <div className="flex items-end justify-between gap-x-4">
          <p id="connect-choice" className="text-[0.9375rem] font-semibold">
            איפה המייל שלך?
          </p>
          <span aria-hidden="true" className="me-2 whitespace-nowrap">
            <Handwritten as="span" tone="ink" className="text-[1.125rem] leading-none">
              {MS_NOTE}
            </Handwritten>
          </span>
        </div>
        <div role="group" aria-labelledby="connect-choice" className="mt-3 flex flex-col gap-3">
          {/* Microsoft first: the primary market. Official logos on white (Microsoft / Google branding). */}
          <ProviderTile
            provider="microsoft"
            label="חיבור Microsoft 365 / Outlook"
            name="Microsoft 365"
            note={MS_NOTE}
            products={["Outlook", "יומן", "OneDrive"]}
            logo={<MicrosoftLogo className="size-[1.3125rem]" />}
          />
          <ProviderTile
            provider="google"
            label="חיבור Gmail / Google"
            name="Google"
            products={["Gmail", "יומן", "Drive"]}
            logo={<GoogleLogo className="size-6" />}
          />
        </div>
        {/* the worry at the moment of choosing, in the code step's helper style; only where the assurances sit on the
            dark stage (below lg they share this paper, and one trust block is enough) */}
        <p className="mt-4 hidden text-[0.9375rem] leading-snug text-ink-muted lg:block">הסיסמה לא עוברת דרכנו, ואפשר לנתק בכל רגע.</p>

        {/* footer: phones and tablets stack progress and skip next to the hoopoe; wide screens put progress at the
            start and skip at the end (the hoopoe standing on the paper's top edge) */}
        <div className="mt-auto flex items-end justify-between gap-4 pt-8 lg:items-center lg:pt-7">
          <div className="flex flex-col items-start gap-0.5 lg:contents">
            <StepProgress step={3} />
            <Link
              href="/start/ready"
              className="-ms-2 inline-flex min-h-11 scroll-mb-24 items-center rounded-md px-2 text-[0.9375rem] font-semibold text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink lg:ms-0 lg:-me-2"
            >
              דילוג בינתיים
            </Link>
          </div>
          <StepMascot pose="thinking" />
        </div>
      </StepBody>
    </>
  );
}
