import { z } from "zod";
import { builtinAgentsIncluded, customAgentLimit, type EffectivePlan } from "@/lib/billing/plans";
import { PRODUCT_NAME } from "@/lib/brand";
import type { AgentKey, AgentPermissions, AgentRole, AgentRow, BuiltinRole } from "@/lib/db/types";
import { normalizeCapabilities, type Capability } from "./capabilities";
import { AGENT_NAME_CHARS, AGENT_NAME_MAX, AGENT_NAME_MIN, DEFAULT_MAX_OUTBOUND, MAX_INSTRUCTIONS, MAX_OUTBOUND_MAX, MAX_OUTBOUND_MIN, MAX_RECIPIENTS, isBuiltinRole } from "./constraints";
import { BUILTIN_AGENTS, BUILTIN_ORDER } from "./templates";
import { foldName } from "./text";

/**
 * Agent policy (docs/design/agents.md §6.2, §8): sanitising and validating what the user writes, the plan quotas, and
 * the runtime resolver that decides which agents are active, disabled, locked (over the quota after a downgrade) or
 * not in the plan. Pure — no I/O.
 */

/** The last agent that answered stays the preferred context for 10 minutes (§5.3). */
export const AGENT_STICKY_MS = 10 * 60_000;
/** A WhatsApp create / edit flow is dropped after 30 minutes without activity (§9.2). */
export const AGENT_DRAFT_TTL_MS = 30 * 60_000;

// ---------------------------------------------------------------- keys

export function builtinKey(role: BuiltinRole): AgentKey {
  return `builtin:${role}`;
}
export function customKey(id: string): AgentKey {
  return `custom:${id}`;
}
export function parseAgentKey(key: string): { kind: "builtin"; role: BuiltinRole } | { kind: "custom"; id: string } | null {
  const m = key.match(/^(builtin:(secretary|intern|bookkeeper)|custom:([0-9a-f-]{36}))$/);
  if (!m) return null;
  return m[2] ? { kind: "builtin", role: m[2] as BuiltinRole } : { kind: "custom", id: m[3]! };
}

// ---------------------------------------------------------------- instructions

const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const BIDI = /[‪-‮⁦-⁩]/g;
const ZERO_WIDTH = /[​-‍﻿]/g;

/**
 * NFC → no control characters (except \n), bidi overrides or zero-width characters → < > become ‹ › (the
 * `<agent_instructions>` tag can be neither closed nor faked) → at most two empty lines in a row → 1,500 characters.
 * Runs when saving and again when the prompt is built, in case a row was written straight to the database.
 */
export function sanitizeInstructions(raw: string | null | undefined): string {
  return [...cleanInstructions(raw)].slice(0, MAX_INSTRUCTIONS).join("").trim();
}

/** `sanitizeInstructions` without the length cut — the service rejects (rather than silently cuts) a text that is too long. */
export function cleanInstructions(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(BIDI, "")
    .replace(ZERO_WIDTH, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Phrases that ask to skip the approval (§6.4): a UX notice only — the real guard is structural (I1). */
const BYPASS = [
  /בלי\s+(ל)?אישור/,
  /ללא\s+אישור/,
  /בלי\s+לשאול/,
  /בלי\s+לבקש\s+אישור/,
  /(שלחי|שלח|תשלחי|תשלח|להעביר|לשלוח|העבירי|תעבירי)\s+(ישר|ישירות|מיד|אוטומטית)/,
  /without\s+(asking|approval|confirmation)/i,
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /(התעלמי|התעלם|להתעלם)\s+מ(כל\s+)?(ה)?(הוראות|הנחיות|כללים)/,
];

export function asksToBypassApproval(text: string | null | undefined): boolean {
  return Boolean(text) && BYPASS.some((re) => re.test(text!));
}

// ---------------------------------------------------------------- names

/**
 * Whole-message words a user types as a reply or a keyword. A name is addressed by itself as a vocative ("<name>"
 * alone), so an agent named "כן" would swallow every "כן" — these can never be names.
 */
const REPLY_WORDS = [
  "כן", "לא", "תודה", "תודה רבה", "שלום", "היי", "הי", "בסדר", "אוקיי", "אוקי", "טוב", "סבבה", "מעולה", "יופי", "נכון",
  "אישור", "מאשר", "מאשרת", "שמירה", "שמור", "לשמור", "מתאים", "לשנות", "שינוי", "ריק", "אין", "בלי הגבלה", "ללא הגבלה", "בלי תוספות",
  "עזרה", "כניסה", "ok", "okay", "yes", "no", "thanks", "hi", "hello", "help", "login",
];

/** Names no custom agent may take: the built-ins and their aliases, the product name, command words and reply words. */
export function reservedNames(): string[] {
  return [...BUILTIN_ORDER.flatMap((r) => [BUILTIN_AGENTS[r].name, ...BUILTIN_AGENTS[r].aliases]), PRODUCT_NAME, "סוכן", "סוכנים", "סיום", "ביטול", ...REPLY_WORDS];
}

/** NFC, no niqqud / invisible characters, curly quotes → straight, one space between words, trimmed. */
export function sanitizeName(raw: string): string {
  const s = raw
    .normalize("NFC")
    .replace(/[֑-ֽֿ-ׇ]/g, "")
    .replace(/־/g, "-")
    .replace(BIDI, "")
    .replace(ZERO_WIDTH, "")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  // "״חשבוניות״": quotes around the whole name are the user quoting it, not part of the name
  const wrapped = s.match(/^["״](.+)["״]$/);
  return wrapped ? wrapped[1]!.trim() : s;
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "length" | "chars" | "reserved" | "taken" };

/** Validates a custom agent's name against the 0006 constraint, the reserved list and the user's other agents. */
export function validateAgentName(raw: string, existing: readonly Pick<AgentRow, "id" | "name">[], selfId?: string): NameCheck {
  const name = sanitizeName(raw);
  const len = [...name].length;
  if (len < AGENT_NAME_MIN || len > AGENT_NAME_MAX) return { ok: false, reason: "length" };
  if (!AGENT_NAME_CHARS.test(name)) return { ok: false, reason: "chars" };
  const folded = foldName(name);
  if (reservedNames().some((r) => foldName(r) === folded)) return { ok: false, reason: "reserved" };
  if (existing.some((a) => a.id !== selfId && foldName(a.name) === folded)) return { ok: false, reason: "taken" };
  return { ok: true, name };
}

// ---------------------------------------------------------------- permissions

const EMAIL = z.email();

/** Writing: strict — unknown keys are rejected (`requires_approval: false` included), values bounded. */
export const permissionsSchema = z.strictObject({
  recipients: z.array(EMAIL).max(MAX_RECIPIENTS).optional(),
  max_outbound_per_day: z.number().int().min(MAX_OUTBOUND_MIN).max(MAX_OUTBOUND_MAX).optional(),
});

/** Runtime: whatever is stored, only the two known keys survive (unknown keys are swallowed, never read as a grant). */
export function readPermissions(raw: unknown): AgentPermissions {
  const out: AgentPermissions = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.recipients)) {
    const list = r.recipients.filter((x): x is string => typeof x === "string" && EMAIL.safeParse(x.trim()).success).map((x) => x.trim().toLowerCase());
    if (list.length) out.recipients = [...new Set(list)].slice(0, MAX_RECIPIENTS);
  }
  const n = r.max_outbound_per_day;
  if (typeof n === "number" && Number.isInteger(n) && n >= MAX_OUTBOUND_MIN && n <= MAX_OUTBOUND_MAX) out.max_outbound_per_day = n;
  return out;
}

export function maxOutboundPerDay(p: AgentPermissions): number {
  return p.max_outbound_per_day ?? DEFAULT_MAX_OUTBOUND;
}

export type RecipientsParse = { ok: true; recipients: string[] } | { ok: false; reason: "invalid" | "too_many"; bad?: string };

/** "a@x.co, b@y.co" (commas, semicolons, spaces or new lines) → up to 5 lower-cased addresses. */
export function parseRecipients(text: string): RecipientsParse {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^[<(]+|[>).]+$/g, ""))
    .filter(Boolean);
  const list: string[] = [];
  for (const p of parts) {
    if (!EMAIL.safeParse(p).success) return { ok: false, reason: "invalid", bad: p };
    const lower = p.toLowerCase();
    if (!list.includes(lower)) list.push(lower);
  }
  if (list.length > MAX_RECIPIENTS) return { ok: false, reason: "too_many" };
  return { ok: true, recipients: list };
}

// ---------------------------------------------------------------- resolver

export type AgentStatus = "active" | "disabled" | "locked" | "not_in_plan";

export interface ResolvedAgent {
  key: AgentKey;
  kind: "builtin" | "custom";
  role: AgentRole;
  /** the agents row (custom agent, or a built-in's override) */
  rowId: string | null;
  name: string;
  /** other forms the built-in answers to */
  aliases: readonly string[];
  /** built-in: its own role; custom: the template it started from */
  template: BuiltinRole | null;
  capabilities: Capability[];
  /** our text (trusted) — built-ins only */
  templateInstructions: string | null;
  /** the user's text (untrusted): a custom agent's instructions, or a pro override's additional instructions */
  userInstructions: string | null;
  permissions: AgentPermissions;
  status: AgentStatus;
  createdAt: string | null;
}

/**
 * Which agents exist for the user and in what state (§8):
 *   - built-ins: trial and pro → active (pro may disable them, add instructions and narrow capabilities); basic → not_in_plan.
 *   - custom: by age, the first `customAgentLimit(plan)` follow `enabled`, the rest are locked. A downgrade deletes
 *     nothing: the oldest keeps working, the others wait for an upgrade or a deletion.
 * Rows of any other user are ignored (I3).
 */
export function resolveAgents(userId: string, rows: readonly AgentRow[], plan: EffectivePlan): ResolvedAgent[] {
  const own = rows.filter((r) => r.user_id === userId);
  const builtinsOn = builtinAgentsIncluded(plan);
  const editable = plan === "pro";
  const out: ResolvedAgent[] = BUILTIN_ORDER.map((role) => {
    const tpl = BUILTIN_AGENTS[role];
    const override = editable ? (own.find((r) => r.role === role) ?? null) : null;
    const narrowed = override ? normalizeCapabilities(override.tools).filter((c) => tpl.capabilities.includes(c)) : [];
    return {
      key: builtinKey(role),
      kind: "builtin",
      role,
      rowId: override?.id ?? null,
      name: tpl.name,
      aliases: tpl.aliases,
      template: role,
      // an empty list means "not narrowed" (saving requires at least one capability)
      capabilities: narrowed.length ? narrowed : normalizeCapabilities(tpl.capabilities),
      templateInstructions: tpl.instructions,
      userInstructions: override ? sanitizeInstructions(override.instructions) || null : null,
      permissions: override ? readPermissions(override.permissions) : {},
      status: !builtinsOn ? "not_in_plan" : override && !override.enabled ? "disabled" : "active",
      createdAt: override?.created_at ?? null,
    } satisfies ResolvedAgent;
  });

  const limit = customAgentLimit(plan);
  const customs = own.filter((r) => r.role === "custom").sort((a, b) => a.created_at.localeCompare(b.created_at));
  customs.forEach((row, i) => {
    out.push({
      key: customKey(row.id),
      kind: "custom",
      role: "custom",
      rowId: row.id,
      name: row.name,
      aliases: [],
      template: isBuiltinRole(row.template) ? row.template : null,
      capabilities: normalizeCapabilities(row.tools),
      templateInstructions: null,
      userInstructions: sanitizeInstructions(row.instructions) || null,
      permissions: readPermissions(row.permissions),
      status: i >= limit ? "locked" : row.enabled ? "active" : "disabled",
      createdAt: row.created_at,
    });
  });
  return out;
}

export function activeAgents(agents: readonly ResolvedAgent[]): ResolvedAgent[] {
  return agents.filter((a) => a.status === "active");
}

export function findAgentByKey(agents: readonly ResolvedAgent[], key: string | null | undefined): ResolvedAgent | null {
  return key ? (agents.find((a) => a.key === key) ?? null) : null;
}

/** Exact name / alias match (folded), for the management commands ("עריכת סוכן מזכירה"). */
export function findAgentByName(agents: readonly ResolvedAgent[], raw: string): ResolvedAgent | null {
  const folded = foldName(sanitizeName(raw));
  if (!folded) return null;
  return agents.find((a) => [a.name, ...a.aliases].some((n) => foldName(n) === folded)) ?? null;
}

/** Counts for the quota line: custom agents used / allowed. */
export function quotaOf(agents: readonly ResolvedAgent[], plan: EffectivePlan): { used: number; limit: number; builtins: boolean } {
  return { used: agents.filter((a) => a.kind === "custom").length, limit: customAgentLimit(plan), builtins: builtinAgentsIncluded(plan) };
}
