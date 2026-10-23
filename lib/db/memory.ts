import { randomUUID } from "node:crypto";
import { DEFAULT_MAX_OUTBOUND, agentRowViolation } from "@/lib/agents/constraints";
import { customAgentLimit, effectivePlan, type EffectivePlan } from "@/lib/billing/plans";
import { localDateOf, zonedToUtc } from "@/lib/time/zoned";
import { AgentDailyCapError, AgentLimitError, AgentNameTakenError, AgentPlanError, AgentRuleError } from "./errors";
import type {
  AgentKey,
  AgentPatch,
  AgentRow,
  AuditEntry,
  NewAgent,
  PendingActionMeta,
  BillingApprovalKind,
  BillingApprovalRow,
  BillingApprovalStatus,
  NewBillingApproval,
  NewWebCharge,
  ConnectionRow,
  ConnectionSecret,
  ConnectionStatus,
  ConversationStateRow,
  Db,
  GraphSubscriptionRow,
  NewConnection,
  JobKind,
  JobRow,
  PaymentRow,
  SubscriptionSecret,
  LinkAttemptResult,
  LinkTokenRow,
  MessageRow,
  NewMessage,
  NewReminder,
  OtpRow,
  PendingActionKind,
  PendingActionRow,
  PendingActionStatus,
  ReminderRow,
  ReminderStatus,
  NewSupportTicket,
  SupportTicketRow,
  SubscriptionRow,
  UsageRow,
  UserRow,
  WaIdentityRow,
} from "./types";

const iso = (d: Date = new Date()) => d.toISOString();

/**
 * In-memory implementation of `Db` — used by unit tests and by `DATA_MODE=memory`.
 * Behaves like the SQL schema where it matters (unique email, unique token, cascade on delete).
 */
export class MemoryDb implements Db {
  users = new Map<string, UserRow>();
  otps: OtpRow[] = [];
  linkTokens: LinkTokenRow[] = [];
  waIdentities: WaIdentityRow[] = [];
  connections: ConnectionRow[] = [];
  subscriptions = new Map<string, SubscriptionRow>();
  usage: UsageRow[] = [];
  audit: (AuditEntry & { created_at: string })[] = [];
  messages: MessageRow[] = [];
  states = new Map<string, ConversationStateRow>();
  pendingActions: PendingActionRow[] = [];
  linkAttempts = new Map<string, { attempts: number; last: number; blockedUntil: number | null }>();
  secrets = new Map<string, SubscriptionSecret>();
  connectionSecrets = new Map<string, ConnectionSecret>();
  graphSubscriptions: GraphSubscriptionRow[] = [];
  payments: PaymentRow[] = [];
  jobs: JobRow[] = [];
  reminders: ReminderRow[] = [];
  agents: AgentRow[] = [];
  billingApprovals: BillingApprovalRow[] = [];
  supportTickets: SupportTicketRow[] = [];
  /** test clock */
  now: () => Date = () => new Date();
  /** user id for a new email — random by default; DEMO_MODE derives it from the email (lib/auth/demo-user.ts) */
  private readonly userIdFor: (email: string) => string;

  constructor(opts: { userIdFor?: (email: string) => string } = {}) {
    this.userIdFor = opts.userIdFor ?? (() => randomUUID());
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    for (const u of this.users.values()) if (u.email === email && !u.deleted_at) return u;
    return null;
  }

  async getUser(id: string): Promise<UserRow | null> {
    const u = this.users.get(id);
    return u && !u.deleted_at ? u : null;
  }

  async createUser(email: string): Promise<UserRow> {
    if (await this.findUserByEmail(email)) throw new Error(`duplicate email: ${email}`);
    return this.insertUser(this.userIdFor(email), email);
  }

  /**
   * DEMO_MODE only: brings back a user this instance never saw, under the id and email of a signed session
   * (another serverless instance created it). Null when the email already belongs to a different live user.
   */
  async restoreUser(id: string, email: string): Promise<UserRow | null> {
    const existing = this.users.get(id);
    if (existing) return existing.deleted_at ? null : existing;
    const sameEmail = await this.findUserByEmail(email);
    if (sameEmail) return null;
    const user = this.insertUser(id, email);
    this.audit.push({ user_id: id, action: "demo.restore_user", target: email, result: "ok", created_at: iso() });
    return user;
  }

  private insertUser(id: string, email: string): UserRow {
    if (this.users.has(id)) throw new Error(`duplicate user id: ${id}`);
    const user: UserRow = {
      id,
      email,
      name: null,
      business_name: null,
      business_type: null,
      timezone: "Asia/Jerusalem",
      morning_time: "07:30",
      locale: "he-IL",
      profile: {},
      created_at: iso(),
      deleted_at: null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByOauthState(provider: "microsoft" | "google", state: string): Promise<UserRow | null> {
    for (const u of this.users.values()) {
      const pending = u.profile.oauth_pending as Record<string, { state?: string } | null> | undefined;
      if (pending?.[provider]?.state === state && !u.deleted_at) return u;
    }
    return null;
  }

  async mergeUserProfile(id: string, patch: Record<string, unknown>): Promise<UserRow> {
    const u = this.users.get(id);
    if (!u) throw new Error("user not found");
    u.profile = { ...u.profile, ...patch };
    return u;
  }

  async updateUserProfile(id: string, patch: Partial<UserRow>): Promise<UserRow> {
    const u = this.users.get(id);
    if (!u) throw new Error("user not found");
    Object.assign(u, patch);
    return u;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    this.linkTokens = this.linkTokens.filter((t) => t.user_id !== id);
    this.waIdentities = this.waIdentities.filter((w) => w.user_id !== id);
    this.connections = this.connections.filter((c) => c.user_id !== id);
    this.subscriptions.delete(id);
    this.usage = this.usage.filter((u) => u.user_id !== id);
    this.messages = this.messages.filter((m) => m.user_id !== id);
    this.states.delete(id);
    this.pendingActions = this.pendingActions.filter((p) => p.user_id !== id);
    this.reminders = this.reminders.filter((r) => r.user_id !== id);
    this.jobs = this.jobs.filter((j) => j.user_id !== id);
    // the Google user-cap ledger stays (Google still counts the account) without the link — SQL: on delete set null
    for (const g of this.googleScopeGrants) if (g.user_id === id) g.user_id = null;
    this.agents = this.agents.filter((a) => a.user_id !== id);
    this.billingApprovals = this.billingApprovals.filter((a) => a.user_id !== id);
    for (const key of [...this.aiSpendUsers.keys()]) if (key.endsWith(`|${id}`)) this.aiSpendUsers.delete(key); // the day totals stay
    for (const t of this.supportTickets) if (t.user_id === id) t.user_id = null; // SQL: on delete set null
  }

  async createOtp(email: string, codeHash: string, expiresAt: Date): Promise<OtpRow> {
    const row: OtpRow = {
      id: randomUUID(),
      email,
      code_hash: codeHash,
      expires_at: iso(expiresAt),
      attempts: 0,
      used_at: null,
      created_at: iso(),
    };
    this.otps.push(row);
    return row;
  }

  async latestOtp(email: string): Promise<OtpRow | null> {
    const rows = this.otps.filter((o) => o.email === email && !o.used_at);
    return rows.length ? rows[rows.length - 1]! : null;
  }

  async countOtpsSince(email: string, since: Date): Promise<number> {
    return this.otps.filter((o) => o.email === email && o.created_at >= iso(since)).length;
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const row = this.otps.find((o) => o.id === id);
    if (!row) throw new Error("otp not found");
    row.attempts += 1;
    return row.attempts;
  }

  async markOtpUsed(id: string): Promise<void> {
    const row = this.otps.find((o) => o.id === id);
    if (row) row.used_at = iso();
  }

  async createLinkToken(userId: string, token: string, expiresAt: Date): Promise<LinkTokenRow> {
    if (this.linkTokens.some((t) => t.token === token)) throw new Error("duplicate token");
    const row: LinkTokenRow = {
      id: randomUUID(),
      user_id: userId,
      token,
      expires_at: iso(expiresAt),
      used_at: null,
      created_at: iso(),
    };
    this.linkTokens.push(row);
    return row;
  }

  async findLinkToken(token: string): Promise<LinkTokenRow | null> {
    return this.linkTokens.find((t) => t.token === token) ?? null;
  }

  async latestLinkToken(userId: string): Promise<LinkTokenRow | null> {
    const rows = this.linkTokens.filter((t) => t.user_id === userId);
    return rows.length ? rows[rows.length - 1]! : null;
  }

  async markLinkTokenUsed(id: string): Promise<void> {
    const row = this.linkTokens.find((t) => t.id === id);
    if (row) row.used_at = iso();
  }

  async listWaIdentities(userId: string): Promise<WaIdentityRow[]> {
    return this.waIdentities.filter((w) => w.user_id === userId);
  }

  async unlinkWaIdentity(userId: string, id: string): Promise<boolean> {
    const row = this.waIdentities.find((w) => w.id === id && w.user_id === userId);
    if (!row) return false;
    row.status = "unlinked";
    return true;
  }

  async findWaIdentityByPhone(phoneE164: string): Promise<WaIdentityRow | null> {
    return this.waIdentities.find((w) => w.phone_e164 === phoneE164 && w.status !== "unlinked") ?? null;
  }

  async createWaIdentity(userId: string, phoneE164: string, waName: string | null): Promise<WaIdentityRow> {
    const existing = this.waIdentities.find((w) => w.phone_e164 === phoneE164);
    if (existing) {
      if (existing.status !== "unlinked") throw new Error("duplicate phone");
      existing.user_id = userId;
      existing.status = "active";
      existing.wa_name = waName;
      existing.linked_at = iso(this.now());
      return existing;
    }
    const row: WaIdentityRow = { id: randomUUID(), user_id: userId, phone_e164: phoneE164, wa_name: waName, linked_at: iso(this.now()), status: "active" };
    this.waIdentities.push(row);
    return row;
  }

  async recordLinkAttempt(phoneE164: string, maxAttempts: number, blockMs: number): Promise<LinkAttemptResult> {
    const t = this.now().getTime();
    const cur = this.linkAttempts.get(phoneE164) ?? { attempts: 0, last: t, blockedUntil: null };
    if (cur.blockedUntil && cur.blockedUntil > t) return { attempts: cur.attempts, blocked: true };
    cur.attempts += 1;
    cur.last = t;
    if (cur.attempts >= maxAttempts) cur.blockedUntil = t + blockMs;
    this.linkAttempts.set(phoneE164, cur);
    return { attempts: cur.attempts, blocked: cur.blockedUntil !== null && cur.blockedUntil > t };
  }

  async isPhoneBlocked(phoneE164: string): Promise<boolean> {
    const cur = this.linkAttempts.get(phoneE164);
    return Boolean(cur?.blockedUntil && cur.blockedUntil > this.now().getTime());
  }

  async insertMessage(row: NewMessage): Promise<MessageRow | null> {
    if (row.wa_message_id && this.messages.some((m) => m.wa_message_id === row.wa_message_id)) return null;
    const full: MessageRow = {
      id: randomUUID(),
      user_id: row.user_id,
      wa_message_id: row.wa_message_id ?? null,
      direction: row.direction,
      type: row.type ?? "text",
      text: row.text ?? null,
      media_url: row.media_url ?? null,
      transcript: row.transcript ?? null,
      model_used: row.model_used ?? null,
      tokens_in: row.tokens_in ?? null,
      tokens_out: row.tokens_out ?? null,
      cost_usd: row.cost_usd ?? null,
      agent_key: row.agent_key ?? null,
      hidden_from_model: row.hidden_from_model ?? false,
      created_at: iso(this.now()),
    };
    this.messages.push(full);
    return full;
  }

  async recentMessages(userId: string, limit: number, opts: { forModel?: boolean } = {}): Promise<MessageRow[]> {
    return this.messages.filter((m) => m.user_id === userId && !(opts.forModel && m.hidden_from_model)).slice(-limit);
  }

  async hideMessageFromModel(userId: string, id: string): Promise<void> {
    const row = this.messages.find((m) => m.id === id && m.user_id === userId);
    if (row) row.hidden_from_model = true;
  }

  async countMessagesSince(userId: string, since: Date): Promise<number> {
    return this.messages.filter((m) => m.user_id === userId && m.created_at >= iso(since)).length;
  }

  async setMessageTranscript(id: string, transcript: string, stt?: { model?: string | null; costUsd?: number | null }): Promise<void> {
    const row = this.messages.find((m) => m.id === id);
    if (!row) return;
    row.transcript = transcript;
    if (stt?.model) row.model_used = stt.model;
    if (typeof stt?.costUsd === "number") row.cost_usd = stt.costUsd;
  }

  async getConversationState(userId: string): Promise<ConversationStateRow | null> {
    return this.states.get(userId) ?? null;
  }

  async upsertConversationState(userId: string, patch: Partial<Pick<ConversationStateRow, "summary" | "last_summarized_msg_id" | "facts">>): Promise<ConversationStateRow> {
    const cur = this.states.get(userId) ?? { user_id: userId, summary: null, last_summarized_msg_id: null, facts: [], updated_at: iso(this.now()) };
    const next = { ...cur, ...patch, updated_at: iso(this.now()) };
    this.states.set(userId, next);
    return next;
  }

  async createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date, meta?: PendingActionMeta): Promise<PendingActionRow> {
    if (meta && !/^(builtin:(secretary|intern|bookkeeper)|custom:[0-9a-f-]{36})$/.test(meta.agentKey)) throw new Error("pending_actions_agent_key_format");
    if (meta) this.enforceDailyCap(userId, meta.agentKey); // trigger enforce_agent_daily_cap (synchronous here, so atomic)
    const row: PendingActionRow = { id: randomUUID(), user_id: userId, kind, payload, status: "pending", expires_at: iso(expiresAt), approved_msg_id: null, executed_at: null, error: null, agent_key: meta?.agentKey ?? null, agent_name: meta?.agentName ?? null, created_at: iso(this.now()) };
    this.pendingActions.push(row);
    return row;
  }

  /** Mirrors public.enforce_agent_daily_cap(): the agent's max_outbound_per_day (default 10) since local midnight. */
  private enforceDailyCap(userId: string, agentKey: AgentKey): void {
    const [kind, ref] = agentKey.split(":") as [string, string];
    const row = this.agents.find((a) => a.user_id === userId && (kind === "custom" ? a.role === "custom" && a.id === ref : a.role === ref));
    const n = (row?.permissions as Record<string, unknown> | undefined)?.max_outbound_per_day;
    const cap = typeof n === "number" && Number.isInteger(n) ? n : DEFAULT_MAX_OUTBOUND;
    const tz = this.users.get(userId)?.timezone || "Asia/Jerusalem";
    const since = zonedToUtc({ ...localDateOf(this.now(), tz), hour: 0, minute: 0 }, tz).getTime();
    const used = this.pendingActions.filter((p) => p.user_id === userId && p.agent_key === agentKey && Date.parse(p.created_at) >= since && !["cancelled", "expired", "failed"].includes(p.status)).length;
    if (used >= cap) throw new AgentDailyCapError(`cap=${cap}`);
  }

  async getPendingAction(id: string): Promise<PendingActionRow | null> {
    return this.pendingActions.find((p) => p.id === id) ?? null;
  }

  async updatePendingAction(id: string, patch: Partial<Pick<PendingActionRow, "status" | "payload" | "approved_msg_id" | "executed_at" | "error">>): Promise<PendingActionRow | null> {
    const row = this.pendingActions.find((p) => p.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }

  async listPendingActions(userId: string, status: PendingActionStatus): Promise<PendingActionRow[]> {
    return this.pendingActions.filter((p) => p.user_id === userId && p.status === status);
  }

  /** Mirrors public.user_plan(). */
  private planOf(userId: string): EffectivePlan {
    return effectivePlan(this.subscriptions.get(userId) ?? null, this.now());
  }

  /** Mirrors public.count_trial_message(): trial = one period from signup (10), paid = calendar month (750/3000). */
  async countTrialMessage(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user || user.deleted_at) throw new Error(`count_trial_message: user ${userId} not found`);
    const plan = this.planOf(userId);
    const limit = plan === "trial" ? 10 : plan === "basic" ? 750 : 3000;
    const period = plan === "trial" ? user.created_at.slice(0, 10) : iso(this.now()).slice(0, 7) + "-01";
    let row = this.usage.find((u) => u.user_id === userId && u.period_start === period);
    if (!row) {
      row = { user_id: userId, period_start: period, counted_messages: 0, free_remaining: limit, plan_limit: limit };
      this.usage.push(row);
    }
    if (row.free_remaining <= 0) return -1;
    row.counted_messages += 1;
    row.free_remaining -= 1;
    return row.free_remaining;
  }

  async listConnections(userId: string): Promise<ConnectionRow[]> {
    return this.connections.filter((c) => c.user_id === userId);
  }

  async revokeConnection(userId: string, id: string): Promise<ConnectionRow | null> {
    const row = this.connections.find((c) => c.id === id && c.user_id === userId);
    if (!row) return null;
    row.status = "revoked";
    row.revoked_at = iso();
    this.connectionSecrets.delete(id);
    this.graphSubscriptions = this.graphSubscriptions.filter((s) => s.connection_id !== id);
    return row;
  }

  async getConnection(id: string): Promise<ConnectionRow | null> {
    return this.connections.find((c) => c.id === id) ?? null;
  }

  async upsertConnection(row: NewConnection): Promise<ConnectionRow> {
    let existing = this.connections.find((c) => c.user_id === row.user_id && c.provider === row.provider && c.account_email === row.account_email);
    if (!existing) {
      existing = { id: randomUUID(), user_id: row.user_id, provider: row.provider, account_email: row.account_email, tenant_id: row.tenant_id, scopes: row.scopes, status: "active", consent_type: row.consent_type, expires_at: row.expires_at, created_at: iso(this.now()), revoked_at: null };
      this.connections.push(existing);
    } else {
      Object.assign(existing, { tenant_id: row.tenant_id, scopes: row.scopes, status: "active", consent_type: row.consent_type, expires_at: row.expires_at, revoked_at: null });
    }
    this.connectionSecrets.set(existing.id, { enc_access: row.enc_access, enc_refresh: row.enc_refresh, expires_at: row.expires_at });
    return existing;
  }

  async getConnectionSecret(id: string): Promise<ConnectionSecret | null> {
    return this.connectionSecrets.get(id) ?? null;
  }

  async updateConnectionTokens(id: string, patch: { enc_access: string; enc_refresh?: string | null; expires_at: string }): Promise<void> {
    const cur = this.connectionSecrets.get(id) ?? { enc_access: null, enc_refresh: null, expires_at: null };
    this.connectionSecrets.set(id, { enc_access: patch.enc_access, enc_refresh: patch.enc_refresh === undefined ? cur.enc_refresh : patch.enc_refresh, expires_at: patch.expires_at });
    const row = this.connections.find((c) => c.id === id);
    if (row) row.expires_at = patch.expires_at;
  }

  async setConnectionStatus(id: string, status: ConnectionStatus): Promise<void> {
    const row = this.connections.find((c) => c.id === id);
    if (row) row.status = status;
  }

  // ---- google_scope_grants / ops_flags (migration 0008): survive revoke and user deletion (deleteUser sets user_id null), like the SQL table ----
  googleScopeGrants: import("./types").GoogleScopeGrantRow[] = [];
  opsFlags = new Map<string, import("./types").OpsFlagRow>();

  async recordGoogleScopeGrant(row: { account_hash: string; scope: string; user_id: string | null }): Promise<boolean> {
    if (this.googleScopeGrants.some((g) => g.account_hash === row.account_hash && g.scope === row.scope)) return false;
    this.googleScopeGrants.push({ ...row, first_granted_at: iso(this.now()) });
    return true;
  }

  async countGoogleScopeAccounts(scopes: string[]): Promise<number> {
    return new Set(this.googleScopeGrants.filter((g) => scopes.includes(g.scope)).map((g) => g.account_hash)).size;
  }

  async hasGoogleScopeGrant(accountHash: string, scopes: string[]): Promise<boolean> {
    return this.googleScopeGrants.some((g) => g.account_hash === accountHash && scopes.includes(g.scope));
  }

  async setOpsFlagOnce(key: string, value: Record<string, unknown>): Promise<boolean> {
    if (this.opsFlags.has(key)) return false;
    this.opsFlags.set(key, { key, value, created_at: iso(this.now()) });
    return true;
  }

  async getOpsFlag(key: string): Promise<import("./types").OpsFlagRow | null> {
    return this.opsFlags.get(key) ?? null;
  }

  // ---- ai_spend / ai_spend_users (migrations 0009, 0010): the day total has no user in it; the per-user counts go with the user ----
  aiSpend = new Map<string, { cost_usd: number; calls: number }>();
  aiSpendUsers = new Map<string, number>();

  async getAiSpend(day: string): Promise<number> {
    return this.aiSpend.get(day)?.cost_usd ?? 0;
  }

  async addAiSpend(day: string, costUsd: number, calls = 1): Promise<number> {
    const cur = this.aiSpend.get(day) ?? { cost_usd: 0, calls: 0 };
    // numeric(12, 6) in SQL — round the same way so both layers report the same total
    cur.cost_usd = Math.round((cur.cost_usd + Math.max(Number.isFinite(costUsd) ? costUsd : 0, 0)) * 1e6) / 1e6;
    cur.calls += Math.max(calls, 0);
    this.aiSpend.set(day, cur);
    return cur.cost_usd;
  }

  async reserveAiSpend(day: string, costUsd: number, budgetUsd: number): Promise<number> {
    const cost = Math.max(Number.isFinite(costUsd) ? costUsd : 0, 0);
    const cur = this.aiSpend.get(day) ?? { cost_usd: 0, calls: 0 };
    const next = Math.round((cur.cost_usd + cost) * 1e6) / 1e6;
    if (!Number.isFinite(budgetUsd) || next > budgetUsd) return -1;
    this.aiSpend.set(day, { cost_usd: next, calls: cur.calls + 1 });
    return next;
  }

  async adjustAiSpend(day: string, deltaUsd: number): Promise<number> {
    const cur = this.aiSpend.get(day) ?? { cost_usd: 0, calls: 0 };
    cur.cost_usd = Math.max(Math.round((cur.cost_usd + (Number.isFinite(deltaUsd) ? deltaUsd : 0)) * 1e6) / 1e6, 0);
    this.aiSpend.set(day, cur);
    return cur.cost_usd;
  }

  async getAiUserMessages(day: string, userId: string): Promise<number> {
    return this.aiSpendUsers.get(`${day}|${userId}`) ?? 0;
  }

  async admitAiUserMessage(day: string, userId: string, limit: number): Promise<number> {
    if (!this.users.has(userId)) throw new Error(`ai_spend_users: unknown user ${userId}`); // the SQL foreign key
    if (!(limit >= 1)) return -1;
    const key = `${day}|${userId}`;
    const cur = this.aiSpendUsers.get(key) ?? 0;
    if (cur >= limit) return -1;
    this.aiSpendUsers.set(key, cur + 1);
    return cur + 1;
  }

  async upsertGraphSubscription(row: Omit<GraphSubscriptionRow, "id">): Promise<GraphSubscriptionRow> {
    let existing = this.graphSubscriptions.find((s) => s.subscription_id === row.subscription_id);
    if (existing) Object.assign(existing, row);
    else {
      existing = { id: randomUUID(), ...row };
      this.graphSubscriptions.push(existing);
    }
    return existing;
  }

  async findGraphSubscription(subscriptionId: string): Promise<GraphSubscriptionRow | null> {
    return this.graphSubscriptions.find((s) => s.subscription_id === subscriptionId) ?? null;
  }

  async listGraphSubscriptionsForConnection(connectionId: string): Promise<GraphSubscriptionRow[]> {
    return this.graphSubscriptions.filter((s) => s.connection_id === connectionId);
  }

  async listGraphSubscriptionsExpiring(before: Date, limit: number): Promise<GraphSubscriptionRow[]> {
    return this.graphSubscriptions.filter((s) => Date.parse(s.expires_at) <= before.getTime()).slice(0, limit);
  }

  async deleteGraphSubscription(subscriptionId: string): Promise<void> {
    this.graphSubscriptions = this.graphSubscriptions.filter((s) => s.subscription_id !== subscriptionId);
  }

  async getSubscription(userId: string): Promise<SubscriptionRow | null> {
    return this.subscriptions.get(userId) ?? null;
  }

  async cancelSubscription(userId: string): Promise<SubscriptionRow | null> {
    const row = this.subscriptions.get(userId);
    if (!row) return null;
    row.status = "cancelled";
    row.cancelled_at = iso();
    return row;
  }

  async upsertSubscription(userId: string, patch: Partial<Omit<SubscriptionRow, "id" | "user_id">> & { hyp_token_enc?: string | null }): Promise<SubscriptionRow> {
    const { hyp_token_enc, ...rest } = patch;
    const cur = this.subscriptions.get(userId) ?? { id: randomUUID(), user_id: userId, plan: "trial" as const, status: "trial" as const, next_charge_at: null, cancelled_at: null, started_at: null, charge_failures: 0, hyp_tokef: null };
    const next: SubscriptionRow = { ...cur, ...rest };
    this.subscriptions.set(userId, next);
    if (hyp_token_enc !== undefined || rest.hyp_tokef !== undefined) {
      const sec = this.secrets.get(userId) ?? { hyp_token_enc: null, hyp_tokef: null };
      this.secrets.set(userId, { hyp_token_enc: hyp_token_enc === undefined ? sec.hyp_token_enc : hyp_token_enc, hyp_tokef: rest.hyp_tokef === undefined ? sec.hyp_tokef : rest.hyp_tokef });
    }
    return next;
  }

  async getSubscriptionSecret(userId: string): Promise<SubscriptionSecret | null> {
    return this.subscriptions.has(userId) ? (this.secrets.get(userId) ?? { hyp_token_enc: null, hyp_tokef: null }) : null;
  }

  async listSubscriptionsDue(now: Date, limit: number): Promise<SubscriptionRow[]> {
    return [...this.subscriptions.values()]
      .filter((s) => (s.status === "active" || s.status === "past_due") && s.next_charge_at && Date.parse(s.next_charge_at) <= now.getTime() && this.secrets.get(s.user_id)?.hyp_token_enc)
      .slice(0, limit);
  }

  async insertPayment(row: Omit<PaymentRow, "id" | "created_at">): Promise<PaymentRow | null> {
    if (this.payments.some((p) => p.hyp_trans_id === row.hyp_trans_id)) return null;
    // payments_one_success_per_approval (0007)
    if (row.approval_id && row.ccode === "0" && this.payments.some((p) => p.approval_id === row.approval_id && p.ccode === "0")) return null;
    const full: PaymentRow = { ...row, id: randomUUID(), created_at: iso(this.now()) };
    this.payments.push(full);
    return full;
  }

  async listPayments(userId: string, limit: number): Promise<PaymentRow[]> {
    return this.payments.filter((p) => p.user_id === userId).slice(-limit).reverse();
  }

  async createJob(job: { kind: JobKind; user_id: string | null; run_at: Date; payload?: Record<string, unknown>; dedupe_key?: string | null; max_attempts?: number }): Promise<JobRow | null> {
    if (job.dedupe_key && this.jobs.some((j) => j.dedupe_key === job.dedupe_key)) return null;
    const row: JobRow = { id: randomUUID(), user_id: job.user_id, kind: job.kind, run_at: iso(job.run_at), payload: job.payload ?? {}, status: "queued", attempts: 0, max_attempts: job.max_attempts ?? 3, last_error: null, dedupe_key: job.dedupe_key ?? null };
    this.jobs.push(row);
    return row;
  }

  async finishJob(id: string, error: string | null = null, retryAt: Date | null = null): Promise<JobRow | null> {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return null;
    if (!error) job.status = "done";
    else if (job.attempts < job.max_attempts) {
      job.status = "queued";
      job.last_error = error;
      job.run_at = iso(retryAt ?? new Date(this.now().getTime() + 5 * 60_000 * 2 ** Math.max(job.attempts - 1, 0)));
    } else {
      job.status = "failed";
      job.last_error = error;
    }
    return job;
  }

  async cancelJobs(userId: string, kind: JobKind): Promise<number> {
    let n = 0;
    for (const j of this.jobs) if (j.user_id === userId && j.kind === kind && j.status === "queued") { j.status = "cancelled"; n++; }
    return n;
  }

  async cancelJob(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id);
    if (job && job.status === "queued") job.status = "cancelled";
  }

  /** Mirrors public.claim_due_jobs(): oldest due first, queued → running, attempts + 1. */
  async claimDueJobs(limit: number): Promise<JobRow[]> {
    const now = this.now().getTime();
    const due = this.jobs
      .filter((j) => j.status === "queued" && Date.parse(j.run_at) <= now)
      .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at))
      .slice(0, Math.max(limit, 1));
    for (const j of due) {
      j.status = "running";
      j.attempts += 1;
    }
    return due.map((j) => ({ ...j }));
  }

  async createReminder(row: NewReminder): Promise<ReminderRow> {
    const full: ReminderRow = { id: randomUUID(), user_id: row.user_id, text: row.text, due_at: iso(row.due_at), job_id: null, status: "scheduled", recurrence: row.recurrence ?? null, last_fired_at: null, created_at: iso(this.now()) };
    this.reminders.push(full);
    return { ...full };
  }

  async getReminder(id: string): Promise<ReminderRow | null> {
    const r = this.reminders.find((x) => x.id === id);
    return r ? { ...r } : null;
  }

  async updateReminder(id: string, patch: Partial<Pick<ReminderRow, "text" | "status" | "due_at" | "job_id" | "recurrence" | "last_fired_at">>): Promise<ReminderRow | null> {
    const r = this.reminders.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    return { ...r };
  }

  async listReminders(userId: string, opts: { statuses: ReminderStatus[]; dueFrom?: Date; dueBefore?: Date; limit?: number }): Promise<ReminderRow[]> {
    return this.reminders
      .filter((r) => r.user_id === userId && opts.statuses.includes(r.status))
      .filter((r) => (!opts.dueFrom || Date.parse(r.due_at) >= opts.dueFrom.getTime()) && (!opts.dueBefore || Date.parse(r.due_at) < opts.dueBefore.getTime()))
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
      .slice(0, opts.limit ?? 100)
      .map((r) => ({ ...r }));
  }

  async getCurrentUsage(userId: string): Promise<UsageRow | null> {
    const rows = this.usage.filter((u) => u.user_id === userId);
    return rows.length ? rows[rows.length - 1]! : null;
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    this.audit.push({ ...entry, created_at: iso() });
  }

  // ---- support_tickets (migration 0011) ----
  async createSupportTicket(row: NewSupportTicket): Promise<SupportTicketRow> {
    if (row.user_id && !this.users.has(row.user_id)) throw new Error(`support_tickets: unknown user ${row.user_id}`); // the SQL foreign key
    const ticket: SupportTicketRow = { id: randomUUID(), created_at: iso(this.now()), status: "open", ...row };
    this.supportTickets.push(ticket);
    return ticket;
  }

  // ---- agents: mirrors the 0006 constraints and the enforce_agent_rules trigger ----

  async listAgents(userId: string): Promise<AgentRow[]> {
    return this.agents
      .filter((a) => a.user_id === userId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)) // stable: insertion order on equal timestamps
      .map((a) => structuredClone(a));
  }

  async getAgent(userId: string, id: string): Promise<AgentRow | null> {
    const a = this.agents.find((x) => x.id === id && x.user_id === userId);
    return a ? structuredClone(a) : null;
  }

  async createAgent(row: NewAgent): Promise<AgentRow> {
    const user = this.users.get(row.user_id);
    if (!user) throw new Error("agent_user_not_found");
    const full: AgentRow = {
      id: randomUUID(),
      user_id: row.user_id,
      name: row.name,
      role: row.role,
      template: row.template ?? null,
      instructions: row.instructions ?? null,
      tools: [...(row.tools ?? [])],
      permissions: structuredClone(row.permissions ?? {}),
      enabled: row.enabled ?? true,
      created_at: iso(this.now()),
      updated_at: iso(this.now()),
    };
    // trigger first (as in Postgres: BEFORE INSERT), then the constraints and unique indexes
    const plan = this.planOf(row.user_id);
    if (row.role === "custom") {
      const limit = customAgentLimit(plan);
      if (this.agents.filter((a) => a.user_id === row.user_id && a.role === "custom").length >= limit) throw new AgentLimitError(`plan=${plan} limit=${limit}`);
    } else if (plan !== "pro") {
      throw new AgentPlanError(`plan=${plan}`);
    }
    const violation = agentRowViolation(full);
    if (violation) throw new AgentRuleError("agent_invalid", violation);
    if (this.agents.some((a) => a.user_id === row.user_id && a.name === row.name)) throw new AgentNameTakenError();
    if (row.role !== "custom" && this.agents.some((a) => a.user_id === row.user_id && a.role === row.role)) throw new AgentRuleError("agent_override_exists");
    this.agents.push(full);
    return structuredClone(full);
  }

  async updateAgent(userId: string, id: string, patch: AgentPatch): Promise<AgentRow | null> {
    const a = this.agents.find((x) => x.id === id && x.user_id === userId);
    if (!a) return null;
    const forbidden = patch as Record<string, unknown>;
    if ("user_id" in forbidden || "role" in forbidden || "template" in forbidden) throw new AgentRuleError("agent_immutable_field");
    const next: AgentRow = { ...structuredClone(a), ...structuredClone(patch), updated_at: iso(this.now()) };
    const violation = agentRowViolation(next);
    if (violation) throw new AgentRuleError("agent_invalid", violation);
    if (patch.name !== undefined && this.agents.some((x) => x.user_id === userId && x.id !== id && x.name === patch.name)) throw new AgentNameTakenError();
    Object.assign(a, next);
    return structuredClone(a);
  }

  async deleteAgent(userId: string, id: string): Promise<boolean> {
    const before = this.agents.length;
    this.agents = this.agents.filter((a) => !(a.id === id && a.user_id === userId));
    return this.agents.length < before;
  }

  async countAgentActionsSince(userId: string, agentKey: AgentKey, since: Date): Promise<number> {
    return this.pendingActions.filter(
      (p) => p.user_id === userId && p.agent_key === agentKey && Date.parse(p.created_at) >= since.getTime() && !["cancelled", "expired", "failed"].includes(p.status),
    ).length;
  }

  // ---- billing approvals (mirrors 0007_billing_whatsapp.sql) ----
  async createBillingApproval(row: NewBillingApproval): Promise<BillingApprovalRow> {
    if (row.plan !== "basic" && row.plan !== "pro") throw new Error("billing_approvals_paid_plan");
    if (["upgrade", "retry", "renew"].includes(row.kind) && !(row.amount_ils > 0)) throw new Error("billing_approvals_charge_amount");
    const now = this.now();
    const full: BillingApprovalRow = {
      id: randomUUID(),
      user_id: row.user_id,
      kind: row.kind,
      plan: row.plan,
      amount_ils: row.amount_ils,
      details: row.details ?? {},
      phone_e164: row.phone_e164,
      status: "pending",
      expires_at: iso(new Date(now.getTime() + 10 * 60_000)),
      approved_msg_id: null,
      approved_at: null,
      hyp_trans_id: null,
      ccode: null,
      error: null,
      created_at: iso(now),
    };
    this.billingApprovals.push(full);
    return { ...full };
  }

  async openRenewalCharge(row: { user_id: string; plan: "basic" | "pro"; amount_ils: number; details?: Record<string, unknown> }): Promise<BillingApprovalRow | null> {
    if (this.hasOpenCharge(row.user_id)) return null;
    const now = this.now();
    const full: BillingApprovalRow = {
      id: randomUUID(),
      user_id: row.user_id,
      kind: "renewal",
      plan: row.plan,
      amount_ils: row.amount_ils,
      details: row.details ?? {},
      phone_e164: null,
      status: "processing",
      expires_at: iso(new Date(now.getTime() + 10 * 60_000)),
      approved_msg_id: null,
      approved_at: null,
      hyp_trans_id: null,
      ccode: null,
      error: null,
      created_at: iso(now),
    };
    this.billingApprovals.push(full);
    return { ...full };
  }

  async openWebCharge(row: NewWebCharge): Promise<BillingApprovalRow | null> {
    if (!(row.amount_ils > 0)) throw new Error("billing_approvals_charge_amount");
    // the primary key (a replayed form) and billing_approvals_one_open_charge_per_user
    if (this.billingApprovals.some((a) => a.id === row.id) || this.hasOpenCharge(row.user_id)) return null;
    const now = this.now();
    const full: BillingApprovalRow = {
      id: row.id,
      user_id: row.user_id,
      kind: "upgrade",
      plan: "pro",
      amount_ils: row.amount_ils,
      details: row.details ?? {},
      phone_e164: null,
      status: "processing",
      expires_at: iso(new Date(now.getTime() + 10 * 60_000)),
      approved_msg_id: `web:${row.id}`,
      approved_at: iso(now),
      hyp_trans_id: null,
      ccode: null,
      error: null,
      created_at: iso(now),
    };
    this.billingApprovals.push(full);
    return { ...full };
  }

  /** billing_approvals_one_open_charge_per_user */
  private hasOpenCharge(userId: string, exceptId?: string): boolean {
    const charge: BillingApprovalKind[] = ["upgrade", "retry", "renew", "renewal"];
    return this.billingApprovals.some((a) => a.user_id === userId && a.id !== exceptId && charge.includes(a.kind) && (a.status === "processing" || a.status === "unknown"));
  }

  async getBillingApproval(id: string): Promise<BillingApprovalRow | null> {
    const row = this.billingApprovals.find((a) => a.id === id);
    return row ? { ...row } : null;
  }

  async claimBillingApproval(id: string, claim: { userId: string; phoneE164: string; waMessageId: string }): Promise<BillingApprovalRow | null> {
    const row = this.billingApprovals.find((a) => a.id === id);
    if (!row || row.user_id !== claim.userId || row.phone_e164 !== claim.phoneE164 || row.status !== "pending") return null;
    if (Date.parse(row.expires_at) <= this.now().getTime()) return null;
    // the number is still the account's active linked number
    if (!this.waIdentities.some((w) => w.user_id === claim.userId && w.phone_e164 === claim.phoneE164 && w.status === "active")) return null;
    if (this.billingApprovals.some((a) => a.approved_msg_id === claim.waMessageId)) return null;
    if (["upgrade", "retry", "renew"].includes(row.kind) && this.hasOpenCharge(row.user_id, row.id)) return null;
    Object.assign(row, { status: "processing", approved_msg_id: claim.waMessageId, approved_at: iso(this.now()) });
    return { ...row };
  }

  async updateBillingApproval(id: string, patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error" | "details">>, fromStatus?: BillingApprovalStatus[]): Promise<BillingApprovalRow | null> {
    const row = this.billingApprovals.find((a) => a.id === id);
    if (!row || (fromStatus && !fromStatus.includes(row.status))) return null;
    Object.assign(row, patch);
    return { ...row };
  }

  async listBillingApprovals(userId: string, opts: { statuses?: BillingApprovalStatus[]; kinds?: BillingApprovalKind[]; limit?: number } = {}): Promise<BillingApprovalRow[]> {
    return this.billingApprovals
      .filter((a) => a.user_id === userId && (!opts.statuses || opts.statuses.includes(a.status)) && (!opts.kinds || opts.kinds.includes(a.kind)))
      .slice()
      .reverse()
      .slice(0, opts.limit ?? 50)
      .map((a) => ({ ...a }));
  }

  /** Mirrors public.raise_plan_limit() (the memory usage period is the UTC calendar month, like countTrialMessage). */
  async raiseUsageLimit(userId: string, newLimit: number): Promise<number | null> {
    const period = iso(this.now()).slice(0, 7) + "-01";
    const row = this.usage.find((u) => u.user_id === userId && u.period_start === period);
    if (!row || row.plan_limit >= newLimit) return null;
    row.free_remaining += newLimit - row.plan_limit;
    row.plan_limit = newLimit;
    return row.free_remaining;
  }

  /** Mirrors public.lower_plan_limit(). */
  async lowerUsageLimit(userId: string, newLimit: number): Promise<number | null> {
    const period = iso(this.now()).slice(0, 7) + "-01";
    const row = this.usage.find((u) => u.user_id === userId && u.period_start === period);
    if (!row || row.plan_limit <= newLimit) return null;
    row.free_remaining = Math.max(0, row.free_remaining - (row.plan_limit - newLimit));
    row.plan_limit = newLimit;
    return row.free_remaining;
  }

  // ---- test helpers ----
  seedConnection(userId: string, provider: ConnectionRow["provider"], accountEmail: string): ConnectionRow {
    const row: ConnectionRow = {
      id: randomUUID(),
      user_id: userId,
      provider,
      account_email: accountEmail,
      tenant_id: null,
      scopes: [],
      status: "active",
      consent_type: "user",
      expires_at: null,
      created_at: iso(),
      revoked_at: null,
    };
    this.connections.push(row);
    return row;
  }

  seedSubscription(userId: string, plan: SubscriptionRow["plan"], status: SubscriptionRow["status"]): SubscriptionRow {
    const row: SubscriptionRow = {
      id: randomUUID(),
      user_id: userId,
      plan,
      status,
      next_charge_at: status === "active" ? iso(new Date(Date.now() + 20 * 86_400_000)) : null,
      cancelled_at: null,
      started_at: iso(),
      charge_failures: 0,
      hyp_tokef: null,
    };
    this.subscriptions.set(userId, row);
    return row;
  }

  seedWaIdentity(userId: string, phone: string): WaIdentityRow {
    const row: WaIdentityRow = {
      id: randomUUID(),
      user_id: userId,
      phone_e164: phone,
      wa_name: null,
      linked_at: iso(),
      status: "active",
    };
    this.waIdentities.push(row);
    return row;
  }
}
