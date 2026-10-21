import { customAgentLimit, effectivePlan, type EffectivePlan } from "@/lib/billing/plans";
import { AgentLimitError, AgentNameTakenError, AgentPlanError, AgentRuleError } from "@/lib/db/errors";
import type { AgentKey, AgentPermissions, AgentRow, BuiltinRole, Db, SubscriptionRow } from "@/lib/db/types";
import { normalizeCapabilities, type Capability } from "./capabilities";
import { MAX_INSTRUCTIONS, MAX_OUTBOUND_MAX, MAX_OUTBOUND_MIN, MAX_RECIPIENTS } from "./constraints";
import { asksToBypassApproval, builtinKey, cleanInstructions, customKey, parseAgentKey, parseRecipients, permissionsSchema, resolveAgents, validateAgentName, type ResolvedAgent } from "./policy";
import { BUILTIN_AGENTS } from "./templates";

/**
 * Agent management (docs/design/agents.md §8, §10) — framework-free, used by the WhatsApp commands and by the
 * /account server actions, tested with MemoryDb. The quota is checked here first (a friendly message before the
 * write); the SQL trigger stays the source of truth, and a race it catches maps to the same message.
 * Every lookup is scoped by `userId` (from the WhatsApp identity or the session — never from a form or the model).
 */
export type AgentSource = "whatsapp" | "account";

export type AgentFailCode =
  | "limit_trial"
  | "limit_basic"
  | "limit_pro"
  | "builtin_needs_pro"
  | "trial_builtin_edit"
  | "builtin_no_delete"
  | "builtin_no_rename"
  | "name_length"
  | "name_chars"
  | "name_reserved"
  | "name_taken"
  | "instructions_empty"
  | "instructions_too_long"
  | "no_capabilities"
  | "recipients_invalid"
  | "recipients_too_many"
  | "max_outbound_invalid"
  | "not_found"
  | "invalid";

export type AgentResult =
  | { ok: true; message: string; agent: ResolvedAgent; approvalNote: boolean }
  | { ok: false; code: AgentFailCode; message: string; /** the existing custom agent (limit_basic) or the bad address */ detail?: string };

/** Site-facing text for each failure (the WhatsApp flow maps the codes to its own copy, with the pay link). */
export const AGENT_FAIL_MESSAGES: Record<AgentFailCode, string> = {
  limit_trial: "סוכן משלך נפתח עם מנוי: במסלול הבסיסי סוכן אחד, ובמסלול פרו עד שלושה.",
  limit_basic: "במסלול הבסיסי אפשר סוכן אחד משלך, והוא כבר קיים. במסלול פרו — עד שלושה.",
  limit_pro: "יש כבר שלושה סוכנים משלך — המקסימום במסלול פרו. אפשר למחוק אחד כדי לפנות מקום.",
  builtin_needs_pro: "התאמה והשבתה של הסוכנים המובנים כלולות במסלול פרו.",
  trial_builtin_edit: "בתקופת הניסיון אפשר לנסות את הסוכנים המובנים כמו שהם. התאמה אישית נפתחת במסלול פרו.",
  builtin_no_delete: "סוכן מובנה אי אפשר למחוק, אבל אפשר להשבית אותו.",
  builtin_no_rename: "לסוכן מובנה אי אפשר לשנות את השם.",
  name_length: "השם צריך להיות באורך 2 עד 24 תווים.",
  name_chars: "בשם אפשר להשתמש באותיות, בספרות, ברווח, במקף ובגרש.",
  name_reserved: "השם הזה שמור לסוכן מובנה או לפקודה. אפשר לבחור שם אחר.",
  name_taken: "כבר יש סוכן בשם הזה. אפשר לבחור שם אחר.",
  instructions_empty: "חסרות הנחיות: מה הסוכן עושה ואיך.",
  instructions_too_long: `ההנחיות ארוכות מדי — עד ${MAX_INSTRUCTIONS.toLocaleString("he-IL")} תווים.`,
  no_capabilities: "צריך לבחור לפחות יכולת אחת.",
  recipients_invalid: "אחת הכתובות לא נראית תקינה.",
  recipients_too_many: `אפשר עד ${MAX_RECIPIENTS} כתובות.`,
  max_outbound_invalid: `מספר הפעולות היומי צריך להיות בין ${MAX_OUTBOUND_MIN} ל-${MAX_OUTBOUND_MAX}.`,
  not_found: "הסוכן לא נמצא.",
  invalid: "השמירה לא הצליחה. כדאי לבדוק את השדות ולנסות שוב.",
};

const fail = (code: AgentFailCode, detail?: string): AgentResult => ({ ok: false, code, message: AGENT_FAIL_MESSAGES[code], ...(detail ? { detail } : {}) });

export interface UserAgents {
  plan: EffectivePlan;
  rows: AgentRow[];
  agents: ResolvedAgent[];
}

/**
 * The user's plan, rows and resolved agents — one place for the pipeline, the commands and the site. Pass `sub` when
 * the caller already loaded the subscription (the pipeline does), to save a query.
 */
export async function loadAgents(db: Db, userId: string, now: Date, sub?: SubscriptionRow | null): Promise<UserAgents> {
  const [subscription, rows] = await Promise.all([sub === undefined ? db.getSubscription(userId) : Promise.resolve(sub), db.listAgents(userId)]);
  const plan = effectivePlan(subscription, now);
  return { plan, rows, agents: resolveAgents(userId, rows, plan) };
}

function limitCode(plan: EffectivePlan): AgentFailCode {
  return plan === "trial" ? "limit_trial" : plan === "basic" ? "limit_basic" : "limit_pro";
}

/** Whether one more custom agent fits — the check the WhatsApp flow runs before it starts asking questions. */
export function canCreateCustom(state: UserAgents): { ok: true } | { ok: false; code: AgentFailCode; existing?: string } {
  const customs = state.agents.filter((a) => a.kind === "custom");
  if (customs.length < customAgentLimit(state.plan)) return { ok: true };
  return { ok: false, code: limitCode(state.plan), existing: customs[0]?.name };
}

// ---------------------------------------------------------------- field validation

type Checked<T> = { ok: true; value: T } | { ok: false; result: AgentResult };

function checkInstructions(raw: string | null | undefined, required: boolean): Checked<string | null> {
  const clean = cleanInstructions(raw);
  if ([...clean].length > MAX_INSTRUCTIONS) return { ok: false, result: fail("instructions_too_long") };
  if (!clean && required) return { ok: false, result: fail("instructions_empty") };
  return { ok: true, value: clean || null };
}

function checkPermissions(recipients: string[] | string | undefined, maxOutbound: number | string | null | undefined, current: AgentPermissions): Checked<AgentPermissions> {
  const next: AgentPermissions = { ...current };
  if (recipients !== undefined) {
    const parsed = Array.isArray(recipients) ? parseRecipients(recipients.join(",")) : parseRecipients(recipients);
    if (!parsed.ok) return { ok: false, result: fail(parsed.reason === "too_many" ? "recipients_too_many" : "recipients_invalid", parsed.bad) };
    if (parsed.recipients.length) next.recipients = parsed.recipients;
    else delete next.recipients;
  }
  if (maxOutbound !== undefined) {
    if (maxOutbound === null || maxOutbound === "") delete next.max_outbound_per_day;
    else {
      const n = typeof maxOutbound === "number" ? maxOutbound : Number(String(maxOutbound).trim());
      if (!Number.isInteger(n) || n < MAX_OUTBOUND_MIN || n > MAX_OUTBOUND_MAX) return { ok: false, result: fail("max_outbound_invalid") };
      next.max_outbound_per_day = n;
    }
  }
  const strict = permissionsSchema.safeParse(next);
  if (!strict.success) return { ok: false, result: fail("invalid") };
  return { ok: true, value: strict.data };
}

function mapWriteError(e: unknown, plan: EffectivePlan): AgentResult {
  if (e instanceof AgentLimitError) return fail(limitCode(plan));
  if (e instanceof AgentPlanError) return fail(plan === "trial" ? "trial_builtin_edit" : "builtin_needs_pro");
  if (e instanceof AgentNameTakenError) return fail("name_taken");
  if (e instanceof AgentRuleError) return fail("invalid", e.detail ?? undefined);
  throw e;
}

function resolvedFor(userId: string, rows: AgentRow[], plan: EffectivePlan, key: AgentKey): ResolvedAgent {
  return resolveAgents(userId, rows, plan).find((a) => a.key === key)!;
}

async function audit(db: Db, userId: string, action: string, key: AgentKey | "new", name: string | null, source: AgentSource, result = "ok"): Promise<void> {
  await db.addAudit({ user_id: userId, action, target: key, reason: source, result, agent_key: key === "new" ? null : key, agent_name: name });
}

// ---------------------------------------------------------------- create

export interface CreateAgentInput {
  name: string;
  template: BuiltinRole | null;
  instructions: string;
  capabilities: readonly string[];
  recipients?: string[] | string;
  maxOutboundPerDay?: number | string | null;
}

export async function createAgentFor(db: Db, userId: string, input: CreateAgentInput, opts: { source: AgentSource; now: Date }): Promise<AgentResult> {
  const state = await loadAgents(db, userId, opts.now);
  const room = canCreateCustom(state);
  if (!room.ok) {
    await audit(db, userId, "agent.limit", "new", null, opts.source, state.plan);
    return fail(room.code, room.existing);
  }
  const name = validateAgentName(input.name, state.rows);
  if (!name.ok) return fail(`name_${name.reason}`);
  const instructions = checkInstructions(input.instructions, input.template === null);
  if (!instructions.ok) return instructions.result;
  const capabilities = normalizeCapabilities(input.capabilities);
  if (!capabilities.length) return fail("no_capabilities");
  const permissions = checkPermissions(input.recipients, input.maxOutboundPerDay, {});
  if (!permissions.ok) return permissions.result;
  try {
    const row = await db.createAgent({ user_id: userId, name: name.name, role: "custom", template: input.template, instructions: instructions.value, tools: capabilities, permissions: permissions.value, enabled: true });
    const rows = await db.listAgents(userId);
    const agent = resolvedFor(userId, rows, state.plan, customKey(row.id));
    await audit(db, userId, "agent.create", agent.key, agent.name, opts.source);
    return { ok: true, message: `הסוכן ״${agent.name}״ נשמר.`, agent, approvalNote: asksToBypassApproval(instructions.value) };
  } catch (e) {
    const result = mapWriteError(e, state.plan);
    if (!result.ok && result.code.startsWith("limit_")) await audit(db, userId, "agent.limit", "new", null, opts.source, state.plan);
    return result;
  }
}

// ---------------------------------------------------------------- update / enable / disable

export interface UpdateAgentInput {
  name?: string;
  instructions?: string | null;
  capabilities?: readonly string[];
  recipients?: string[] | string;
  maxOutboundPerDay?: number | string | null;
  enabled?: boolean;
}

/** A custom agent's row, or a built-in's override (created on the first change — pro only). */
export async function updateAgentFor(db: Db, userId: string, key: string, input: UpdateAgentInput, opts: { source: AgentSource; now: Date }): Promise<AgentResult> {
  const parsed = parseAgentKey(key);
  if (!parsed) return fail("not_found");
  const state = await loadAgents(db, userId, opts.now);
  const current = state.agents.find((a) => a.key === key);
  if (!current) return fail("not_found");

  if (parsed.kind === "builtin") {
    if (state.plan === "trial") return fail("trial_builtin_edit");
    if (state.plan !== "pro") return fail("builtin_needs_pro");
    if (input.name !== undefined && input.name.trim() && input.name.trim() !== current.name) return fail("builtin_no_rename");
  }

  const row = current.rowId ? (state.rows.find((r) => r.id === current.rowId) ?? null) : null;
  const patch: { name?: string; instructions?: string | null; tools?: string[]; permissions?: AgentPermissions; enabled?: boolean } = {};

  if (parsed.kind === "custom" && input.name !== undefined) {
    const name = validateAgentName(input.name, state.rows, current.rowId ?? undefined);
    if (!name.ok) return fail(`name_${name.reason}`);
    patch.name = name.name;
  }
  if (input.instructions !== undefined) {
    const instructions = checkInstructions(input.instructions, parsed.kind === "custom" && !current.template);
    if (!instructions.ok) return instructions.result;
    patch.instructions = instructions.value;
  }
  if (input.capabilities !== undefined) {
    let caps: Capability[] = normalizeCapabilities(input.capabilities);
    if (parsed.kind === "builtin") caps = caps.filter((c) => BUILTIN_AGENTS[parsed.role].capabilities.includes(c));
    if (!caps.length) return fail("no_capabilities");
    patch.tools = caps;
  }
  if (input.recipients !== undefined || input.maxOutboundPerDay !== undefined) {
    const permissions = checkPermissions(input.recipients, input.maxOutboundPerDay, current.permissions);
    if (!permissions.ok) return permissions.result;
    patch.permissions = permissions.value;
  }
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  try {
    if (parsed.kind === "builtin" && !row) {
      const tpl = BUILTIN_AGENTS[parsed.role];
      await db.createAgent({ user_id: userId, name: tpl.name, role: parsed.role, instructions: patch.instructions ?? null, tools: patch.tools ?? [], permissions: patch.permissions ?? {}, enabled: patch.enabled ?? true });
    } else {
      const updated = await db.updateAgent(userId, current.rowId!, patch);
      if (!updated) return fail("not_found");
    }
  } catch (e) {
    return mapWriteError(e, state.plan);
  }
  const rows = await db.listAgents(userId);
  const agent = resolvedFor(userId, rows, state.plan, current.key);
  const action = input.enabled === undefined || Object.keys(patch).length > 1 ? "agent.update" : input.enabled ? "agent.enable" : "agent.disable";
  await audit(db, userId, action, agent.key, agent.name, opts.source);
  const message =
    action === "agent.enable" ? `הסוכן ״${agent.name}״ פעיל.` : action === "agent.disable" ? `הסוכן ״${agent.name}״ הושבת.` : `השינויים בסוכן ״${agent.name}״ נשמרו.`;
  return { ok: true, message, agent, approvalNote: patch.instructions ? asksToBypassApproval(patch.instructions) : false };
}

export async function setAgentEnabledFor(db: Db, userId: string, key: string, enabled: boolean, opts: { source: AgentSource; now: Date }): Promise<AgentResult> {
  return updateAgentFor(db, userId, key, { enabled }, opts);
}

// ---------------------------------------------------------------- delete

/** Custom agents only (built-ins are disabled instead). History keeps agent_key / agent_name. */
export async function deleteAgentFor(db: Db, userId: string, key: string, opts: { source: AgentSource; now: Date }): Promise<AgentResult> {
  const parsed = parseAgentKey(key);
  if (!parsed) return fail("not_found");
  if (parsed.kind === "builtin") return fail("builtin_no_delete");
  const state = await loadAgents(db, userId, opts.now);
  const current = state.agents.find((a) => a.key === key);
  if (!current) return fail("not_found");
  const ok = await db.deleteAgent(userId, parsed.id);
  if (!ok) return fail("not_found");
  await audit(db, userId, "agent.delete", current.key, current.name, opts.source);
  return { ok: true, message: `הסוכן ״${current.name}״ נמחק.`, agent: current, approvalNote: false };
}

export { builtinKey, customKey };
