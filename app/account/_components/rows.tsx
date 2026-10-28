import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { MascotAvatar } from "@/components/brand/mascot";
import { ProviderLogo, WhatsappGlyph } from "@/components/brand/provider-logo";
import { ServiceRow } from "@/components/brand/service-row";
import type { EffectivePlan } from "@/lib/billing/plans";
import { BRAND } from "@/lib/brand";
import type { ServiceView } from "@/lib/connections/services";
import type { ConnectionRow, WaIdentityRow } from "@/lib/db/types";
import { isDemoChatPhone } from "@/lib/demo-chat/phone";
import { cn } from "@/lib/utils";
import { disconnectAction, unlinkPhoneAction } from "../actions";
import { formatDay, formatPhone, type ConnectionState } from "../view";
import { Row, Tile } from "./parts";

/** The rows of "חיבורים" and "וואטסאפ" (quiet rows on the stage, the same server actions as before). */

export const STATE_STYLE: Record<ConnectionState, { text: string; dot: string; label: string }> = {
  active: { text: "text-sage", dot: "bg-sage", label: "מחובר" },
  expired: { text: "text-honey", dot: "bg-honey", label: "פג תוקף, צריך לחבר מחדש" },
  error: { text: "text-destructive", dot: "bg-destructive", label: "יש תקלה בחיבור" },
  none: { text: "text-cream-muted", dot: "border-[1.5px] border-cream-muted", label: "לא מחובר" },
};

export function Status({ state, children, className }: { state: ConnectionState; children?: ReactNode; className?: string }) {
  const s = STATE_STYLE[state];
  return (
    <p className={cn("mt-1 flex items-center gap-2 text-[0.9375rem]", s.text, className)}>
      <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", s.dot)} />
      {children ?? s.label}
    </p>
  );
}

const PROVIDER_TITLE: Record<"microsoft" | "google", string> = { microsoft: "Microsoft 365", google: "Google" };
const WHERE: Record<Exclude<EffectivePlan, "pro">, string> = { trial: "בתקופת הניסיון", basic: "במסלול הבסיסי" };
export const ONE_ACCOUNT_LINE: Record<Exclude<EffectivePlan, "pro">, string> = {
  trial: "בתקופת הניסיון ובמסלול הבסיסי מחברים חשבון אחד: Google או Microsoft. שניהם יחד: במסלול פרו.",
  basic: "במסלול הבסיסי מחברים חשבון אחד: Google או Microsoft. שניהם יחד: במסלול פרו.",
};

/** How the plan treats a provider: connect freely, connected but paused (a second account), or only on pro. */
export type ProviderGate = "open" | "paused" | "pro";

/**
 * A second account connected before the split (or kept after a downgrade): nothing was disconnected or deleted. One
 * line says which account works now and the two ways on: disconnect one of them, or upgrade.
 */
export function PausedNotice({ inForce, paused, plan, payHref }: { inForce: "microsoft" | "google"; paused: "microsoft" | "google"; plan: EffectivePlan; payHref: string }) {
  return (
    <div role="status" className="mb-5 rounded-2xl border border-honey/40 bg-honey/10 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream sm:px-5">
      <p>
        {plan === "pro" ? "" : `${WHERE[plan]} `}עובדים עם חשבון אחד. עכשיו פעיל {PROVIDER_TITLE[inForce]}, ו-{PROVIDER_TITLE[paused]} מחובר אבל מושהה. אפשר לנתק את אחד מהם, או לשדרג לפרו ולעבוד עם שניהם יחד.
      </p>
      <Link href={payHref as Route} className="mt-2 inline-block rounded-sm font-semibold underline underline-offset-3">
        לשדרוג לפרו
      </Link>
    </div>
  );
}

export function ConnectionItem({
  provider,
  title,
  product,
  row,
  state,
  services,
  gate,
  plan,
  payHref,
}: {
  provider: "microsoft" | "google";
  title: string;
  product: string;
  row: ConnectionRow | null;
  state: ConnectionState;
  services: ServiceView[] | null;
  gate: ProviderGate;
  plan: EffectivePlan;
  payHref: string;
}) {
  const action =
    state === "active" && row ? (
      <form action={disconnectAction}>
        <input type="hidden" name="id" value={row.id} />
        <Cta tone="ghost" size="sm" type="submit" aria-label={`ניתוק ${title}`}>
          ניתוק
        </Cta>
      </form>
    ) : gate === "pro" ? (
      // a second account on a one-account plan: the way there is pro (the start route refuses it as well)
      <Cta tone="ghost" size="sm" href={payHref} aria-label={`${title} בנוסף: במסלול פרו`}>
        במסלול פרו
      </Cta>
    ) : (
      <Cta tone={state === "none" ? "ghost" : "honey"} size="sm" href={`/api/auth/${provider}/start`} aria-label={`${state === "none" ? "חיבור" : "חיבור מחדש"} ${title}`}>
        {state === "none" ? "חיבור" : "חיבור מחדש"}
      </Cta>
    );
  return (
    <Row
      mark={
        <Tile>
          <ProviderLogo provider={provider} className="size-[1.375rem]" />
        </Tile>
      }
      title={title}
      action={action}
      // not connected: the same row, faded - what connecting gives (lib/connections/services.ts previewServices)
      footer={services?.length ? <ServiceRow services={services} label={state === "active" ? `שירותים ב-${title}` : `שירותים שיתחברו עם ${title}`} /> : null}
    >
      {gate === "paused" && state === "active" ? <Status state="expired">מושהה: {plan === "pro" ? "" : `${WHERE[plan]} `}עובדים עם חשבון אחד</Status> : <Status state={state} />}
      {row?.account_email && state !== "none" ? (
        <p className="mt-0.5 truncate text-[0.875rem] text-cream-muted">
          <bdi dir="ltr">{row.account_email}</bdi>
        </p>
      ) : state === "none" ? (
        <p className="mt-0.5 text-[0.875rem] text-cream-muted">{gate === "pro" ? `${product} בנוסף לחשבון המחובר: במסלול פרו` : `מייל ויומן דרך ${product}`}</p>
      ) : null}
    </Row>
  );
}

/** DEMO_MODE: the website chat — the same conversation as WhatsApp, on the site (app/demo/chat). */
export function DemoChatItem() {
  return (
    <Row
      mark={
        <Tile>
          <MascotAvatar sizes="48px" className="size-12 rounded-2xl" />
        </Tile>
      }
      title="הצ'אט באתר"
      action={
        <Cta tone="honey" size="sm" href="/demo/chat">
          לבדוק את {BRAND.name} בצ&apos;אט
        </Cta>
      }
    >
      <p className="mt-1 text-[0.9375rem] text-cream-muted">כותבים, מקליטים ולוחצים על כפתורים, כמו בוואטסאפ.</p>
    </Row>
  );
}

/** The number as it is shown: the website chat's virtual number (+999…, lib/demo-chat/phone.ts) by what it is. */
export function phoneLabel(phone: WaIdentityRow): { text: string; chat: boolean } {
  const chat = isDemoChatPhone(phone.phone_e164);
  return { text: chat ? "הצ'אט באתר" : formatPhone(phone.phone_e164), chat };
}

export function PhoneItem({ phone, timeZone }: { phone: WaIdentityRow; timeZone: string }) {
  const { text: formatted, chat } = phoneLabel(phone);
  return (
    <Row
      mark={
        <Tile>
          <WhatsappGlyph className="size-6 text-[var(--wa-green)]" />
        </Tile>
      }
      title={
        chat ? (
          formatted
        ) : (
          <bdi dir="ltr" className="tabular">
            {formatted}
          </bdi>
        )
      }
      action={
        <form action={unlinkPhoneAction}>
          <input type="hidden" name="id" value={phone.id} />
          <Cta tone="ghost" size="sm" type="submit" aria-label={chat ? `ניתוק ${formatted}` : `ניתוק המספר ${formatted}`}>
            ניתוק
          </Cta>
        </form>
      }
    >
      {phone.status === "blocked" ? <Status state="error">חסום</Status> : <Status state="active">מקושר מ-{formatDay(phone.linked_at, timeZone)}</Status>}
    </Row>
  );
}

export function NoPhoneItem() {
  return (
    <Row
      mark={
        <Tile muted>
          <WhatsappGlyph className="size-6 text-cream-muted" />
        </Tile>
      }
      title="עוד לא קושר מספר"
      action={
        <Cta tone="ghost" size="sm" href="/start/ready">
          קישור מספר
        </Cta>
      }
    >
      <p className="mt-1 text-[0.9375rem] text-cream-muted">קוד חד-פעמי, והשיחה נפתחת בטלפון.</p>
    </Row>
  );
}
