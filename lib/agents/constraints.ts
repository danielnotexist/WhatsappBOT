import type { AgentPermissions, AgentRole, BuiltinRole } from "@/lib/db/types";
import { CAPABILITY_IDS } from "./capabilities";

/**
 * The CHECK constraints of supabase/migrations/0006_agents.sql in TypeScript. MemoryDb rejects what Postgres
 * rejects (as `agent_invalid`), and the service layer validates against the same numbers before writing.
 */
export const AGENT_NAME_MIN = 2;
export const AGENT_NAME_MAX = 24;
export const MAX_INSTRUCTIONS = 1500;
export const MAX_RECIPIENTS = 5;
export const MAX_OUTBOUND_MIN = 1;
export const MAX_OUTBOUND_MAX = 30;
export const DEFAULT_MAX_OUTBOUND = 10;

/** Hebrew and Latin letters, digits, space, hyphen, ׳ ״ ' " — fits a WhatsApp list-row title (agents_name_format). */
export const AGENT_NAME_CHARS = /^[A-Za-z0-9א-ת׳״'" -]+$/;
/** What instructions may never contain (agents_instructions_safe): tag brackets and bidi overrides. */
export const UNSAFE_INSTRUCTION_CHARS = /[<>‪-‮⁦-⁩]/;

export const BUILTIN_ROLES: readonly BuiltinRole[] = ["secretary", "intern", "bookkeeper"];

export function isBuiltinRole(x: unknown): x is BuiltinRole {
  return typeof x === "string" && (BUILTIN_ROLES as readonly string[]).includes(x);
}

export interface AgentShape {
  name: string;
  role: AgentRole;
  template?: BuiltinRole | null;
  instructions?: string | null;
  tools?: readonly string[];
  permissions?: AgentPermissions | Record<string, unknown>;
}

/** The first violated constraint, or null when the row would be accepted by Postgres. */
export function agentRowViolation(row: AgentShape): string | null {
  const name = row.name;
  if ([...name].length < AGENT_NAME_MIN || [...name].length > AGENT_NAME_MAX || name !== name.trim() || name.includes("  ") || !AGENT_NAME_CHARS.test(name)) return "agents_name_format";
  if (row.template != null && (row.role !== "custom" || !isBuiltinRole(row.template))) return "agents_template_valid";
  if (row.instructions != null && ([...row.instructions].length > MAX_INSTRUCTIONS || UNSAFE_INSTRUCTION_CHARS.test(row.instructions))) return "agents_instructions_safe";
  const tools = row.tools ?? [];
  if (tools.length > CAPABILITY_IDS.length || tools.some((t) => !(CAPABILITY_IDS as readonly string[]).includes(t))) return "agents_tools_known";
  const p = (row.permissions ?? {}) as Record<string, unknown>;
  if (typeof p !== "object" || Array.isArray(p) || Object.keys(p).some((k) => k !== "recipients" && k !== "max_outbound_per_day")) return "agents_permissions_shape";
  if ("recipients" in p && (!Array.isArray(p.recipients) || p.recipients.length > MAX_RECIPIENTS || p.recipients.some((r) => typeof r !== "string"))) return "agents_permissions_shape";
  if ("max_outbound_per_day" in p) {
    const n = p.max_outbound_per_day;
    if (typeof n !== "number" || !Number.isInteger(n) || n < MAX_OUTBOUND_MIN || n > MAX_OUTBOUND_MAX) return "agents_permissions_shape";
  }
  return null;
}
