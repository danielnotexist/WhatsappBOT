import { UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { ctaClass, Cta } from "@/components/brand/cta";
import { ProviderLogo, WhatsappGlyph } from "@/components/brand/provider-logo";
import type { WaIdentityRow } from "@/lib/db/types";
import type { AccountArea } from "../areas";
import { formatDay, type ConnectionState } from "../view";
import { AreaLink } from "./area-nav";
import { Row, Tile } from "./parts";
import { DemoChatItem, Status, phoneLabel } from "./rows";

/**
 * "סקירה": one quiet row per area — what is set up there, in a word or two, and the way in (the area itself, or the
 * missing step). The explanations stay in the areas.
 * The plan is the paper slip beside it (./plan-slip.tsx, "summary").
 */
export function OverviewRows({
  microsoft,
  google,
  phone,
  timeZone,
  activeAgents,
  demo,
}: {
  microsoft: { state: ConnectionState; label?: string };
  google: { state: ConnectionState; label?: string };
  phone: WaIdentityRow | null;
  timeZone: string;
  /** the names of the agents at work */
  activeAgents: readonly string[];
  demo: boolean;
}) {
  const number = phone ? phoneLabel(phone) : null;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {demo ? <DemoChatItem /> : null}
      <Row
        mark={
          <Tile>
            <span className="flex items-center gap-1">
              <ProviderLogo provider="microsoft" className="size-[0.9375rem]" />
              <ProviderLogo provider="google" className="size-[0.9375rem]" />
            </span>
          </Tile>
        }
        title="חיבורים"
        action={<Manage area="connections" label="ניהול החיבורים" />}
      >
        <Status state={microsoft.state}>Microsoft 365: {microsoft.label ?? stateWord(microsoft.state)}</Status>
        <Status state={google.state} className="mt-0.5">
          Google: {google.label ?? stateWord(google.state)}
        </Status>
      </Row>
      <Row
        mark={
          <Tile muted={!phone}>
            <WhatsappGlyph className={phone ? "size-6 text-[var(--wa-green)]" : "size-6 text-cream-muted"} />
          </Tile>
        }
        title="וואטסאפ"
        action={
          phone ? (
            <Manage area="whatsapp" label="ניהול המספר" />
          ) : (
            <Cta tone="honey" size="sm" href="/start/ready">
              קישור מספר
            </Cta>
          )
        }
      >
        {phone && number ? (
          phone.status === "blocked" ? (
            <Status state="error">{number.chat ? number.text : <bdi dir="ltr">{number.text}</bdi>}: חסום</Status>
          ) : (
            <>
              <Status state="active">{number.chat ? number.text : <bdi dir="ltr" className="tabular whitespace-nowrap">{number.text}</bdi>}</Status>
              <p className="mt-0.5 text-[0.875rem] text-cream-muted">מקושר מ-{formatDay(phone.linked_at, timeZone)}</p>
            </>
          )
        ) : (
          <Status state="none">לא מקושר</Status>
        )}
      </Row>
      <Row
        mark={
          <Tile muted>
            <UsersRound aria-hidden="true" strokeWidth={1.9} className="size-6 text-honey" />
          </Tile>
        }
        title="סוכנים"
        action={<Manage area="agents" label="ניהול הסוכנים" />}
      >
        <p className="mt-1 text-[0.9375rem] text-cream">{activeAgents.length ? `פעילים: ${activeAgents.join(", ")}` : "אין סוכנים פעילים כרגע."}</p>
      </Row>
    </ul>
  );
}

function stateWord(state: ConnectionState): string {
  return state === "active" ? "מחובר" : state === "expired" ? "צריך לחבר מחדש" : state === "error" ? "יש תקלה" : "לא מחובר";
}

/** "ניהול": the way into an area, styled as the rows' ghost buttons. */
function Manage({ area, label }: { area: AccountArea; label: string }): ReactNode {
  return (
    <AreaLink area={area} aria-label={label} className={ctaClass({ tone: "ghost", size: "sm" })}>
      ניהול
    </AreaLink>
  );
}
