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
 * products she works in once it is connected, and a quiet chevron toward the inline end. A real link to the hand-off
 * screen; its accessible name is the action ("חיבור Gmail / Google"), the products line its description.
 * Hover and keyboard focus lift it a little and fill the chevron with ink (no lift under reduced motion).
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
    <Link
      href={provider === "microsoft" ? "/connect/microsoft" : "/connect/google"}
      aria-label={label}
      aria-describedby={tag ? `${tagId} ${productsId}` : productsId}
      className={cn(
        "group relative flex min-h-[5.5rem] items-center gap-4 rounded-field border-2 border-ink/12 bg-paper/75 px-4 py-4 text-ink sm:gap-5 sm:px-5",
        "transition-[translate,background-color,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-ink/40 hover:bg-paper hover:shadow-[0_18px_30px_-22px_rgb(19_36_28/0.75)]",
        "focus-visible:-translate-y-0.5 focus-visible:border-ink focus-visible:bg-paper focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink",
        "active:translate-y-0 active:shadow-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0",
      )}
    >
      {tag ? (
        // a note stuck on the tile's top edge, slightly turned like the handwritten lines above the headlines
        <span
          id={tagId}
          className="absolute end-4 -top-3 -rotate-2 rounded-[0.3125rem] bg-honey px-2 py-0.5 font-hand text-[0.8125rem] leading-tight font-semibold text-ink shadow-[0_4px_10px_-6px_rgb(19_36_28/0.6)] sm:end-5"
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
        <span className="text-[1.125rem] leading-tight font-bold">{name}</span>
        <span id={productsId} className="text-[0.9375rem] leading-snug text-ink-muted">
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
        className="grid size-9 flex-none place-items-center rounded-full border-2 border-ink/20 transition-[background-color,border-color,color] duration-200 group-hover:border-ink group-hover:bg-ink group-hover:text-cream group-focus-visible:border-ink group-focus-visible:bg-ink group-focus-visible:text-cream"
      >
        <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[2.6] rtl:-scale-x-100">
          <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
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
    <div role="alert" className="mb-6 rounded-field border-2 border-destructive/40 bg-white/40 p-4 text-[0.9375rem] leading-snug">
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
        <div role="group" aria-labelledby="connect-choice" className="mt-4 flex flex-col gap-4">
          {/* Microsoft first: the primary market. Official logos on white (Microsoft / Google branding). */}
          <ProviderTile
            provider="microsoft"
            label="חיבור Microsoft 365 / Outlook"
            name="Microsoft 365"
            tag="הנפוץ במשרדים"
            products={["Outlook", "יומן", "Teams", "OneDrive"]}
            logo={<MicrosoftLogo className="size-[1.3125rem]" />}
          />
          <ProviderTile
            provider="google"
            label="חיבור Gmail / Google"
            name="Google"
            products={["Gmail", "יומן", "Meet", "Drive"]}
            logo={<GoogleLogo className="size-6" />}
          />
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-1 text-center text-[0.875rem] text-ink-muted">
          <span>אפשר לחבר גם אחר כך, מהאזור האישי.</span>
          <Link
            href="/start/ready"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-[0.9375rem] font-semibold text-ink underline decoration-ink/35 underline-offset-4 transition-colors hover:decoration-ink"
          >
            דילוג בינתיים
          </Link>
        </p>
        <div className="mt-auto flex items-end justify-between gap-4 pt-8">
          <StepProgress step={3} />
          <StepMascot pose="thinking" />
        </div>
      </StepBody>
    </>
  );
}
