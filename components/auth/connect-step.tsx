import Link from "next/link";
import { Fragment, type ReactNode } from "react";
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
 *  - The link is the account's name, stretched over the whole tile (its ::after), so the tile is one big target while
 *    the link holds only text that is part of its name: "חיבור Gmail / Google" contains the visible "Google"
 *    (WCAG 2.5.3, label in name). The note and the products line sit beside it as its description, aria-hidden as
 *    content, so they are read once (as the description), never twice.
 *  - Only the tile under the pointer or the keyboard changes: a 2px lift, an ink border (on focus also the email field's
 *    soft halo and the outer outline of every focusable on the paper) and the chevron filling with ink and nudging
 *    toward the reading end. No movement under reduced motion.
 *  - `scroll-mb-*` keeps a focused tile clear of the fixed accessibility button on phones.
 */
function ProviderTile({
  provider,
  label,
  name,
  products,
  logo,
  tag,
}: {
  provider: ProviderId;
  label: string;
  name: string;
  products: string[];
  logo: ReactNode;
  tag?: string;
}) {
  const productsId = `connect-${provider}-products`;
  const tagId = `connect-${provider}-tag`;
  const last = products.length - 1;
  return (
    <div
      className={cn(
        "group relative flex min-h-[5.25rem] items-center gap-4 rounded-field border-2 border-ink/12 bg-paper/75 px-4 py-3.5 text-ink sm:gap-5 sm:px-5",
        "transition-[translate,background-color,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-ink/45 hover:bg-paper hover:shadow-[0_14px_24px_-20px_rgb(19_36_28/0.7)]",
        "has-[a:focus-visible]:-translate-y-0.5 has-[a:focus-visible]:border-ink has-[a:focus-visible]:bg-paper has-[a:focus-visible]:shadow-[0_0_0_4px_rgb(19_36_28/0.16)]",
        "has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ink has-[a:focus-visible]:outline-solid",
        "has-[a:active]:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:has-[a:focus-visible]:translate-y-0",
      )}
    >
      {tag ? (
        // a note stuck on the tile's top edge, slightly turned like the handwritten lines above the headlines
        <span
          id={tagId}
          aria-hidden="true"
          className="pointer-events-none absolute end-4 -top-3.5 -rotate-2 rounded-[0.3125rem] bg-honey px-2 py-0.5 font-hand text-[0.875rem] leading-tight font-semibold whitespace-nowrap text-ink shadow-[0_4px_10px_-6px_rgb(19_36_28/0.6)] sm:end-5"
        >
          {tag}
        </span>
      ) : null}
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
          aria-describedby={tag ? `${tagId} ${productsId}` : productsId}
          className="scroll-mt-24 scroll-mb-28 self-start text-[1.125rem] leading-tight font-bold outline-none after:absolute after:-inset-0.5 after:rounded-field after:content-['']"
        >
          {name}
        </Link>
        <span id={productsId} aria-hidden="true" className="text-[0.9375rem] leading-snug text-ink-muted">
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
        {error ? <ConnectError error={error} adminLink={adminLink} /> : null}
        {notice}

        <p id="connect-choice" className="text-[0.9375rem] font-semibold">
          איפה המייל שלך?
        </p>
        <div role="group" aria-labelledby="connect-choice" className="mt-4 flex flex-col gap-3">
          {/* Microsoft first: the primary market. Official logos on white (Microsoft / Google branding). */}
          <ProviderTile
            provider="microsoft"
            label="חיבור Microsoft 365 / Outlook"
            name="Microsoft 365"
            tag="הנפוץ במשרדים"
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
        {/* the worry at the moment of choosing, in the code step's helper style */}
        <p className="mt-4 text-[0.9375rem] leading-snug text-ink-muted">הסיסמה לא עוברת דרכנו, ואפשר לנתק בכל רגע.</p>

        {/* footer: progress and skip share one row (phones: next to the hoopoe; wide screens: progress at the start,
            skip at the end, the hoopoe standing on the paper's top edge) */}
        <div className="mt-auto flex items-end justify-between gap-4 pt-8 lg:items-center lg:pt-7">
          <div className="flex flex-wrap items-center gap-x-3 lg:contents">
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
