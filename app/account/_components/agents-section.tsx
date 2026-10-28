import type { Route } from "next";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import { CAPABILITIES, CAPABILITY_IDS, type Capability } from "@/lib/agents/capabilities";
import { AGENT_NAME_MAX, AGENT_NAME_MIN, MAX_INSTRUCTIONS, MAX_OUTBOUND_MAX, MAX_OUTBOUND_MIN, DEFAULT_MAX_OUTBOUND } from "@/lib/agents/constraints";
import type { ResolvedAgent } from "@/lib/agents/policy";
import { BUILTIN_AGENTS, BUILTIN_ORDER } from "@/lib/agents/templates";
import type { BuiltinRole } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { createAgentAction, deleteAgentAction, toggleAgentAction, updateAgentAction } from "../actions";
import type { AgentRowView, AgentsView } from "../view";
import { AgentSheet, SheetCancel, SheetFormWatch } from "./agent-sheet";
import { InstructionsField } from "./instructions-field";
import { Section, Tile } from "./parts";

/**
 * "סוכנים" — the agents area (docs/design/agents.md §10): the quota line and the way up, the built-in agents and the
 * user's own as cards in a grid (name, status, origin, what each may do), and "סוכן חדש" from a template. Editing or
 * creating opens a side sheet over the grid (./agent-sheet.tsx) with the same server-action forms as before; a template
 * link (/account?tab=agents&new=<template>) renders the filled form on the server. The approval rule is stated once,
 * plainly, and cannot be switched off.
 */
export function AgentsSection({
  view,
  agents,
  payHref,
  newTemplate,
  banner,
  className,
}: {
  view: AgentsView;
  agents: readonly ResolvedAgent[];
  payHref: string;
  newTemplate: BuiltinRole | "blank" | null;
  /** the result of an agent action (shown here, where the redirect lands) */
  banner?: ReactNode;
  className?: string;
}) {
  const byKey = new Map(agents.map((a) => [a.key as string, a]));
  return (
    <Section
      id="agents"
      title="הסוכנים שלי"
      description="תפקידים עם שם, שאפשר לפנות אליהם בוואטסאפ בתחילת ההודעה: ״@שם״ ואז הבקשה."
      action={
        view.upgrade ? (
          <Cta tone="honey" size="sm" href={payHref}>
            {view.upgrade.label}
          </Cta>
        ) : null
      }
      className={className}
    >
      {banner}
      <p className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-cream">{view.quotaLine}</p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {view.rows.map((row) => (
          <AgentCard key={row.key} row={row} agent={byKey.get(row.key)!} />
        ))}
      </ul>

      {view.canCreate ? <TemplatePicker /> : null}
      {view.canCreate && newTemplate !== null ? <NewAgentSheet template={newTemplate} /> : null}

      <p className="mt-8 flex max-w-[40rem] items-start gap-3 text-[0.9375rem] leading-relaxed text-cream-muted">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none fill-none stroke-sage stroke-2">
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
        </svg>
        <span>כל מייל, פגישה או העברה שסוכן מכין מגיעים אליך לאישור בכפתור בוואטסאפ. אי אפשר לכבות את זה.</span>
      </p>
    </Section>
  );
}

/* ---------- cards ---------- */

const STATUS_STYLE: Record<AgentRowView["status"], { text: string; dot: string }> = {
  active: { text: "text-sage", dot: "bg-sage" },
  disabled: { text: "text-cream-muted", dot: "border-[1.5px] border-cream-muted" },
  locked: { text: "text-honey", dot: "bg-honey" },
  not_in_plan: { text: "text-cream-muted", dot: "border-[1.5px] border-cream-muted" },
};

const dimmed = (row: AgentRowView) => row.status === "locked" || row.status === "not_in_plan";

function AgentMark({ row }: { row: AgentRowView }) {
  const dim = dimmed(row);
  if (row.kind === "custom") {
    return (
      <Tile muted>
        <span className={cn("text-[1.375rem] leading-none font-bold", dim ? "text-cream-muted" : "text-honey")}>{[...row.name][0]}</span>
      </Tile>
    );
  }
  return (
    <Tile muted={dim}>
      <svg viewBox="0 0 24 24" className={cn("size-6 fill-none stroke-2", dim ? "stroke-cream-muted" : "stroke-ink")} strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[row.role as BuiltinRole]}
      </svg>
    </Tile>
  );
}

const GLYPHS: Record<BuiltinRole, ReactNode> = {
  secretary: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  intern: (
    <>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M13 3l5 5v2.5" />
      <circle cx="16" cy="16" r="3" />
      <path d="m20.5 20.5-2.4-2.4" />
    </>
  ),
  bookkeeper: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
};

function StatusLine({ row }: { row: AgentRowView }) {
  const s = STATUS_STYLE[row.status];
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem]">
      <span className={cn("flex items-center gap-2", s.text)}>
        <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", s.dot)} />
        {row.statusLabel}
      </span>
      <span className="text-cream-muted">{row.origin}</span>
    </p>
  );
}

/** One agent: a card on the stage. Editable agents open their form in the sheet. */
function AgentCard({ row, agent }: { row: AgentRowView; agent: ResolvedAgent }) {
  return (
    <li className={cn("flex flex-col rounded-2xl border border-line p-5", dimmed(row) ? "bg-transparent" : "bg-night-2/60")}>
      <div className="flex items-start gap-4">
        <AgentMark row={row} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[1.0625rem] leading-snug font-semibold">{row.name}</h3>
          <StatusLine row={row} />
        </div>
      </div>
      {row.capsLine ? <p className="mt-4 text-[0.875rem] leading-relaxed text-cream-muted">{row.capsLine}</p> : null}
      {row.hint ? <p className="mt-2 text-[0.875rem] leading-relaxed text-cream">{row.hint}</p> : null}
      {row.editable ? (
        <div className="mt-auto pt-5">
          <AgentSheet id={row.key} title={`עריכת ״${row.name}״`} description={row.origin} mark={<AgentMark row={row} />} trigger={{ label: "עריכה", srName: `של ״${row.name}״` }}>
            <AgentForm row={row} agent={agent} />
            {row.toggle || row.deletable ? (
              <div className="mt-8 flex flex-wrap items-start gap-3 border-t border-line pt-6">
                {row.toggle ? (
                  <form action={toggleAgentAction}>
                    <SheetFormWatch />
                    <input type="hidden" name="key" value={row.key} />
                    <input type="hidden" name="enabled" value={row.toggle === "enable" ? "1" : "0"} />
                    <Cta tone="ghost" size="sm" type="submit">
                      {row.toggle === "enable" ? "הפעלת הסוכן" : "השבתת הסוכן"}
                    </Cta>
                  </form>
                ) : null}
                {row.deletable ? <DeleteAgent row={row} /> : null}
              </div>
            ) : null}
          </AgentSheet>
        </div>
      ) : null}
    </li>
  );
}

function DeleteAgent({ row }: { row: AgentRowView }) {
  return (
    <details className="group/del">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full px-2 text-[0.9375rem] font-semibold text-cream-muted underline-offset-3 hover:text-cream hover:underline [&::-webkit-details-marker]:hidden">
        מחיקת הסוכן
      </summary>
      <div className="mt-2 max-w-[32rem]">
        <p className="text-[0.9375rem] leading-relaxed text-cream-muted">ההנחיות של ״{row.name}״ נמחקות. מה שכבר נעשה נשאר ביומן הפעולות.</p>
        <form action={deleteAgentAction} className="mt-3">
          <SheetFormWatch />
          <input type="hidden" name="key" value={row.key} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--alze-error-on-dark)] px-5 text-[0.9375rem] font-semibold text-night transition-[background-color,transform] duration-150 select-none hover:bg-[#F5B3A2] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--alze-error-on-dark)] active:translate-y-px"
          >
            למחוק את ״{row.name}״
          </button>
        </form>
      </div>
    </details>
  );
}

/* ---------- forms ---------- */

const FIELD =
  "h-12 w-full rounded-field border-2 border-cream-muted/60 bg-night px-4 text-[1.0625rem] text-cream transition-[border-color,box-shadow] duration-150 focus-visible:border-honey focus-visible:shadow-[0_0_0_4px_rgb(231_182_92/0.18)] focus-visible:outline-none";
const NAME_PATTERN = `[A-Za-z0-9\\u05D0-\\u05EA\\u05F3\\u05F4'" \\-]{${AGENT_NAME_MIN},${AGENT_NAME_MAX}}`;

/** A labelled input; the hint is announced as its description, not as part of its name. */
function TextField({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold">
        {label}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} className={FIELD} />
      {hint ? (
        <p id={`${id}-hint`} className="text-[0.875rem] leading-relaxed text-cream-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Element ids per form: the agent key ("custom:<uuid>") or "new". */
const fieldId = (scope: string, name: string) => `agent-${scope.replace(/[^a-z0-9-]/gi, "-")}-${name}`;

function CapabilityBoxes({ options, checked }: { options: readonly Capability[]; checked: readonly Capability[] }) {
  return (
    <fieldset>
      <legend className="text-[0.9375rem] font-semibold">יכולות</legend>
      <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {options.map((c) => (
          <label key={c} className="flex min-h-11 cursor-pointer items-center gap-3 text-[1rem]">
            <input type="checkbox" name="capabilities" value={c} defaultChecked={checked.includes(c)} className="size-5 flex-none accent-[var(--alze-honey)]" />
            <span>
              {CAPABILITIES[c].label}
              {CAPABILITIES[c].kind === "outbound" ? <span className="text-cream-muted"> (באישור בכפתור)</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LimitFields({ scope, recipients, maxOutbound }: { scope: string; recipients: readonly string[]; maxOutbound: number | undefined }) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <TextField
        id={fieldId(scope, "recipients")}
        label="כתובות מותרות"
        name="recipients"
        defaultValue={recipients.join(", ")}
        dir="ltr"
        inputMode="email"
        autoComplete="off"
        placeholder="office@example.co.il"
        hint="מיילים, העברות ופגישות עם משתתפים (הזמנה, הזזה או ביטול) רק לכתובות האלה, עד 5, מופרדות בפסיק. ריק: בלי הגבלה, ועדיין הכול באישור."
      />
      <TextField
        id={fieldId(scope, "max")}
        label="פעולות יוצאות ביום"
        name="max_outbound"
        type="number"
        min={MAX_OUTBOUND_MIN}
        max={MAX_OUTBOUND_MAX}
        inputMode="numeric"
        defaultValue={maxOutbound ?? ""}
        placeholder={String(DEFAULT_MAX_OUTBOUND)}
        hint={`עד ${MAX_OUTBOUND_MAX}. ריק: ${DEFAULT_MAX_OUTBOUND}.`}
      />
    </div>
  );
}

function AgentForm({ row, agent }: { row: AgentRowView; agent: ResolvedAgent }) {
  const builtin = row.kind === "builtin";
  const options = builtin ? BUILTIN_AGENTS[row.role as BuiltinRole].capabilities : CAPABILITY_IDS;
  return (
    <form action={updateAgentAction} className="grid gap-6">
      <SheetFormWatch />
      <input type="hidden" name="key" value={row.key} />
      {builtin ? null : (
        <TextField id={fieldId(row.key, "name")} label="שם" name="name" defaultValue={row.name} required minLength={AGENT_NAME_MIN} maxLength={AGENT_NAME_MAX} pattern={NAME_PATTERN} title="אותיות, ספרות, רווח, מקף וגרש; 2 עד 24 תווים" autoComplete="off" />
      )}
      <InstructionsField
        label={builtin ? "הנחיות נוספות" : "מה הסוכן עושה ואיך"}
        hint={builtin ? `מתווספות להנחיות הקבועות של ״${row.name}״.` : "תחום, סגנון, מה חשוב ומה לא לעשות."}
        defaultValue={agent.userInstructions ?? ""}
        max={MAX_INSTRUCTIONS}
        required={!builtin && !agent.template}
      />
      <CapabilityBoxes options={options} checked={agent.capabilities} />
      <LimitFields scope={row.key} recipients={agent.permissions.recipients ?? []} maxOutbound={agent.permissions.max_outbound_per_day} />
      <div>
        <Cta tone="honey" size="sm" type="submit">
          שמירה
        </Cta>
      </div>
    </form>
  );
}

function TemplatePicker() {
  const options: { id: string; name: string; summary: string }[] = [
    ...BUILTIN_ORDER.map((r) => ({ id: r, name: BUILTIN_AGENTS[r].name, summary: BUILTIN_AGENTS[r].summary })),
    { id: "blank", name: "סוכן ריק", summary: "מתחילים מאפס: שם, הנחיות ויכולות" },
  ];
  return (
    <div className="mt-10">
      <h3 className="font-heading text-[1.25rem] leading-tight font-bold">סוכן חדש</h3>
      <p className="mt-1 text-[0.9375rem] text-cream-muted">מאיפה מתחילים? אפשר לשנות הכול אחר כך.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <li key={o.id}>
            <Link
              href={`/account?tab=agents&new=${o.id}` as Route}
              scroll={false}
              className="group flex h-full flex-col rounded-2xl border border-dashed border-cream-muted/35 px-4 py-3.5 transition-colors hover:border-honey/70 hover:bg-cream/[0.03]"
            >
              <span className="flex items-center gap-2 text-[1rem] font-semibold text-cream">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none fill-none stroke-honey stroke-[2.4]">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                {o.name}
              </span>
              <span className="mt-1 text-[0.875rem] leading-relaxed text-cream-muted">{o.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewAgentSheet({ template }: { template: BuiltinRole | "blank" }) {
  const tpl = template === "blank" ? null : BUILTIN_AGENTS[template];
  return (
    <AgentSheet id={`new:${template}`} newTemplate={template} title={tpl ? `סוכן חדש על בסיס ״${tpl.name}״` : "סוכן חדש"} description="אפשר לשנות הכול אחר כך.">
      <form action={createAgentAction} className="grid gap-6">
        <SheetFormWatch />
        <input type="hidden" name="template" value={tpl ? template : ""} />
        <TextField
          id={fieldId("new", "name")}
          label="שם"
          name="name"
          required
          minLength={AGENT_NAME_MIN}
          maxLength={AGENT_NAME_MAX}
          pattern={NAME_PATTERN}
          title="אותיות, ספרות, רווח, מקף וגרש; 2 עד 24 תווים"
          autoComplete="off"
          placeholder={tpl ? `${tpl.name} אישית` : "חשבוניות"}
          hint="בוואטסאפ פונים אליו ב-״@שם״. שמות הסוכנים המובנים שמורים."
        />
        <InstructionsField label="מה הסוכן עושה ואיך" hint={tpl ? "ההנחיות של התבנית כבר כאן. אפשר לערוך ולהוסיף." : "תחום, סגנון, מה חשוב ומה לא לעשות."} defaultValue={tpl?.instructions ?? ""} max={MAX_INSTRUCTIONS} required={!tpl} />
        <CapabilityBoxes options={CAPABILITY_IDS} checked={tpl ? tpl.capabilities : ["mail.read"]} />
        <LimitFields scope="new" recipients={[]} maxOutbound={undefined} />
        <div className="flex flex-wrap items-center gap-4">
          <Cta tone="honey" size="sm" type="submit">
            יצירת הסוכן
          </Cta>
          <SheetCancel>ביטול</SheetCancel>
        </div>
      </form>
    </AgentSheet>
  );
}
