/**
 * Errors the data layer raises for agent writes (migration 0006). SupabaseDb maps Postgres errors to these;
 * MemoryDb throws the same ones, so in-memory tests behave like the database (docs/design/agents.md §2.6).
 */
export type AgentRuleCode =
  | "agent_limit_reached"
  | "agent_builtin_requires_pro"
  | "agent_immutable_field"
  | "agent_name_taken"
  | "agent_override_exists"
  | "agent_invalid"
  | "agent_daily_cap_reached";

export class AgentRuleError extends Error {
  constructor(
    readonly code: AgentRuleCode,
    readonly detail: string | null = null,
  ) {
    super(code);
    this.name = "AgentRuleError";
  }
}

/** SQL `agent_limit_reached`: the plan's custom-agent quota is used up (also when two writes race). */
export class AgentLimitError extends AgentRuleError {
  constructor(detail: string | null = null) {
    super("agent_limit_reached", detail);
    this.name = "AgentLimitError";
  }
}

/** SQL `agent_builtin_requires_pro`: customising a built-in agent needs the pro plan. */
export class AgentPlanError extends AgentRuleError {
  constructor(detail: string | null = null) {
    super("agent_builtin_requires_pro", detail);
    this.name = "AgentPlanError";
  }
}

/** 23505 on agents_user_name_unique. */
export class AgentNameTakenError extends AgentRuleError {
  constructor(detail: string | null = null) {
    super("agent_name_taken", detail);
    this.name = "AgentNameTakenError";
  }
}

/**
 * SQL `agent_daily_cap_reached` (trigger enforce_agent_daily_cap on pending_actions): the agent already prepared its
 * max_outbound_per_day drafts since local midnight — also when two messages or parallel tool calls race.
 */
export class AgentDailyCapError extends AgentRuleError {
  /** the cap the database applied (from the error detail "cap=N"), when known */
  readonly cap: number | null;
  constructor(detail: string | null = null) {
    super("agent_daily_cap_reached", detail);
    this.name = "AgentDailyCapError";
    const m = detail?.match(/cap=(\d+)/);
    this.cap = m ? Number(m[1]) : null;
  }
}

/** Maps a PostgREST / Postgres error on the agents table to the matching error, or null when it is something else. */
export function agentErrorFromPostgres(error: { code?: string | null; message?: string | null; details?: string | null } | null): AgentRuleError | null {
  if (!error) return null;
  const message = error.message ?? "";
  const detail = error.details ?? null;
  if (message.includes("agent_limit_reached")) return new AgentLimitError(detail);
  if (message.includes("agent_builtin_requires_pro")) return new AgentPlanError(detail);
  if (message.includes("agent_daily_cap_reached")) return new AgentDailyCapError(detail);
  if (message.includes("agent_immutable_field")) return new AgentRuleError("agent_immutable_field", detail);
  if (error.code === "23505") return message.includes("agents_user_builtin_role_unique") ? new AgentRuleError("agent_override_exists", detail) : new AgentNameTakenError(detail);
  if (error.code === "23514") return new AgentRuleError("agent_invalid", message);
  return null;
}
