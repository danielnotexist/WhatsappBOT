import { randomUUID } from "node:crypto";
import { DEFAULT_MAX_OUTBOUND, agentRowViolation } from "@/lib/agents/constraints";
import { customAgentLimit, effectivePlan, type EffectivePlan } from "@/lib/billing/plans";
import { addDays, compareDates, dateKey, localDateOf, parseDateKey, zonedToUtc } from "@/lib/time/zoned";
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
  NewProactiveItem,
  ProactiveAlertRow,
  ProactiveClaimResult,
  ProactiveStatus,
  MeetingSummaryAction,
  MeetingSummaryRow,
  NewMeetingSummary,
  AdminDailyRow,
  AdminUserRow,
  AppErrorRow,
  AuditRow,
  NewAppError,
  NewOwnerAlert,
  OwnerAlertChannel,
  OwnerAlertClaimResult,
  OwnerAlertRow,
  OwnerAlertStatus,
  AnalyticsReport,
  FunnelStep,
  NewPageEvent,
  PageEventRow,
  SignupSource,
  SupportChatRow,
  SupportChatTurn,
  SupportTicketStatus,
  SubscriptionRow,
  UsageRow,
  UserRow,
  WaIdentityRow,
  AdminReferralRow,
  ReferralCodeRow,
  ReferralRewardResult,
  ReferralRewardState,
  ReferralRow,
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
  proactiveAlerts: ProactiveAlertRow[] = [];
  meetingSummaries: MeetingSummaryRow[] = [];
  supportChats: SupportChatRow[] = [];
  appErrors: AppErrorRow[] = [];
  ownerAlerts: OwnerAlertRow[] = [];
  pageEvents: PageEventRow[] = [];
  referralCodes: ReferralCodeRow[] = [];
  referrals: ReferralRow[] = [];
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
    this.proactiveAlerts = this.proactiveAlerts.filter((a) => a.user_id !== id);
    this.meetingSummaries = this.meetingSummaries.filter((s) => s.user_id !== id);
    this.supportChats = this.supportChats.filter((c) => c.user_id !== id); // SQL: on delete cascade
    this.appErrors = this.appErrors.filter((e) => e.user_id !== id);
    for (const e of this.pageEvents) if (e.user_id === id) e.user_id = null; // SQL: on delete set null (the anonymous row stays)
    // migration 0018: the code and every referral of either side go with the user (on delete cascade)
    this.referralCodes = this.referralCodes.filter((c) => c.user_id !== id);
    this.referrals = this.referrals.filter((r) => r.referrer_id !== id && r.referred_user_id !== id);
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
      tools: [...(row.tools ?? [])],
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
    const row = this.opsFlags.get(key);
    return row ? structuredClone(row) : null;
  }

  async setOpsFlag(key: string, value: Record<string, unknown>): Promise<void> {
    const prev = this.opsFlags.get(key);
    this.opsFlags.set(key, { key, value: structuredClone(value), created_at: prev?.created_at ?? iso(this.now()) });
  }

  // ---- owner_alerts (migration 0016): mirrors owner_alert_claim() / owner_alerts_take_queued() ----

  async claimOwnerAlert(row: NewOwnerAlert): Promise<{ result: OwnerAlertClaimResult; alert: OwnerAlertRow | null }> {
    if (this.ownerAlerts.some((a) => a.dedupe_key === row.dedupe_key)) return { result: "duplicate", alert: null };
    const t = this.now().getTime();
    let status: OwnerAlertStatus = row.queue ? "queued" : "sending";
    if (row.limit) {
      const since = t - row.limit.windowMs;
      const count = this.ownerAlerts.filter((a) => a.type === row.type && Date.parse(a.created_at) > since && a.status !== "limited").length;
      if (count >= Math.max(row.limit.max, 0)) status = "limited";
    }
    const alert: OwnerAlertRow = {
      id: randomUUID(),
      created_at: iso(this.now()),
      type: row.type,
      dedupe_key: row.dedupe_key,
      status,
      channel: null,
      subject: row.subject.slice(0, 300),
      payload: structuredClone(row.payload),
      sent_at: null,
      error: null,
    };
    this.ownerAlerts.push(alert);
    return { result: status === "sending" ? "claimed" : status === "queued" ? "queued" : "limited", alert: structuredClone(alert) };
  }

  async finishOwnerAlerts(ids: string[], patch: { status: OwnerAlertStatus; channel?: OwnerAlertChannel | null; error?: string | null }): Promise<void> {
    for (const a of this.ownerAlerts) {
      if (!ids.includes(a.id)) continue;
      a.status = patch.status;
      if (patch.channel !== undefined) a.channel = patch.channel;
      if (patch.error !== undefined) a.error = patch.error === null ? null : patch.error.slice(0, 500);
      if (patch.status === "sent") a.sent_at = iso(this.now());
    }
  }

  async takeQueuedOwnerAlerts(limit: number): Promise<OwnerAlertRow[]> {
    const picked = this.ownerAlerts
      .filter((a) => a.status === "queued")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, Math.max(limit, 1));
    for (const a of picked) {
      a.status = "sending";
      a.channel = "digest";
    }
    return picked.map((a) => structuredClone(a));
  }

  async listOwnerAlerts(limit: number): Promise<OwnerAlertRow[]> {
    return this.ownerAlerts
      .slice()
      .reverse()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((a) => structuredClone(a));
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
    const cur: SubscriptionRow = this.subscriptions.get(userId) ?? { id: randomUUID(), user_id: userId, plan: "trial" as const, status: "trial" as const, next_charge_at: null, cancelled_at: null, started_at: null, charge_failures: 0, hyp_tokef: null, billing_cycle: "monthly", scheduled_cycle: null };
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
    const full: PaymentRow = { ...row, billing_cycle: row.billing_cycle ?? "monthly", id: randomUUID(), created_at: iso(this.now()) };
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

  // ---- the admin panel (migration 0015): mirrors admin_user_overview(), admin_daily_stats(), support_chat_append() ----

  async setSignupSource(userId: string, source: SignupSource): Promise<void> {
    const u = this.users.get(userId);
    if (u && !u.signup_source) u.signup_source = structuredClone(source);
  }

  async touchLastSeen(userId: string, at: Date, minIntervalMs: number): Promise<void> {
    const u = this.users.get(userId);
    if (!u) return;
    if (u.last_seen_at && at.getTime() - Date.parse(u.last_seen_at) < minIntervalMs) return;
    u.last_seen_at = iso(at);
  }

  async adminUserOverview(): Promise<AdminUserRow[]> {
    const now = this.now().getTime();
    const since30 = now - 30 * 86_400_000;
    const since7 = now - 7 * 86_400_000;
    return [...this.users.values()]
      .filter((u) => !u.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((u) => {
        const sub = this.subscriptions.get(u.id) ?? null;
        const conns = this.connections.filter((c) => c.user_id === u.id);
        const phones = this.waIdentities.filter((w) => w.user_id === u.id);
        const usage = this.usage.filter((x) => x.user_id === u.id).sort((a, b) => b.period_start.localeCompare(a.period_start))[0] ?? null;
        const recent = this.messages.filter((m) => m.user_id === u.id && Date.parse(m.created_at) >= since30);
        const onboarding = (u.profile.onboarding as { step?: unknown } | undefined)?.step;
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          business_name: u.business_name,
          created_at: u.created_at,
          last_seen_at: u.last_seen_at ?? null,
          signup_source: u.signup_source ? structuredClone(u.signup_source) : null,
          onboarding_step: typeof onboarding === "string" ? onboarding : null,
          plan: this.planOf(u.id),
          sub_status: sub?.status ?? null,
          charge_failures: sub?.charge_failures ?? 0,
          phone: phones.filter((w) => w.status === "active").sort((a, b) => b.linked_at.localeCompare(a.linked_at))[0]?.phone_e164 ?? null,
          wa_linked: phones.length > 0,
          connections_active: conns.filter((c) => c.status === "active").length,
          connections_broken: conns.filter((c) => c.status === "expired" || c.status === "error").length,
          connections_ever: conns.length,
          providers: [...new Set(conns.filter((c) => c.status === "active").map((c) => c.provider))].sort(),
          usage_used: usage?.counted_messages ?? null,
          usage_limit: usage?.plan_limit ?? null,
          messages_30d: recent.filter((m) => m.direction === "in").length,
          ai_cost_30d: Math.round(recent.reduce((sum, m) => sum + (m.cost_usd ?? 0), 0) * 1e6) / 1e6,
          errors_7d: this.appErrors.filter((e) => e.user_id === u.id && Date.parse(e.at) >= since7).length,
          // the memory job has no updated_at: a failed job counts by its run time
          failed_jobs_7d: this.jobs.filter((j) => j.user_id === u.id && j.status === "failed" && Date.parse(j.run_at) >= since7).length,
          paid: this.payments.some((p) => p.user_id === u.id && p.ccode === "0"),
          open_tickets: this.supportTickets.filter((t) => t.user_id === u.id && t.status !== "closed").length,
          billing_cycle: sub ? (sub.billing_cycle ?? "monthly") : null,
          referred: this.referrals.some((r) => r.referred_user_id === u.id),
        };
      });
  }

  // ---- page_events (migration 0017): mirrors analytics_daily / _top_pages / _sources / _devices / _funnel ----

  async insertPageEvent(row: NewPageEvent): Promise<void> {
    const userId = row.user_id && this.users.has(row.user_id) ? row.user_id : null; // SQL: the FK; the route retries without it
    this.pageEvents.push({ ...structuredClone(row), user_id: userId, id: randomUUID(), at: row.at ?? iso(this.now()) });
  }

  async analyticsReport(fromDay: string, toDay: string, opts: { top?: number } = {}): Promise<AnalyticsReport> {
    const from = parseDateKey(fromDay);
    const to = parseDateKey(toDay);
    if (!from || !to || compareDates(to, from) < 0 || compareDates(addDays(from, 366), to) < 0) throw new Error("analytics: bad range");
    const top = Math.min(Math.max(opts.top ?? 10, 1), 100);
    const inRange = this.pageEvents.filter((e) => e.day >= fromDay && e.day <= toDay).sort((a, b) => a.at.localeCompare(b.at));
    const views = inRange.filter((e) => e.event === null);
    const visitDay = (e: PageEventRow) => `${e.day}|${e.visitor}`;

    const daily: AnalyticsReport["daily"] = [];
    for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
      const key = dateKey(d);
      const day = views.filter((e) => e.day === key);
      daily.push({ day: key, visitors: new Set(day.map((e) => e.visitor)).size, views: day.length });
    }

    const byPath = new Map<string, { views: number; visits: Set<string> }>();
    for (const e of views) {
      const p = byPath.get(e.path!) ?? { views: 0, visits: new Set<string>() };
      p.views++;
      p.visits.add(visitDay(e));
      byPath.set(e.path!, p);
    }
    const pages = [...byPath.entries()]
      .map(([path, p]) => ({ path, views: p.views, visitors: p.visits.size }))
      .sort((a, b) => b.views - a.views || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .slice(0, top);

    // per visitor-day: the first source and the first device seen that day (views are in time order)
    const visits = new Map<string, { source: string | null; kind: "utm" | "referrer" | "direct"; device: PageEventRow["device"] }>();
    for (const e of views) {
      const v = visits.get(visitDay(e)) ?? { source: null, kind: "direct" as const, device: null };
      if (v.source === null && (e.utm_source || e.referrer_host)) {
        v.source = e.utm_source ?? e.referrer_host;
        v.kind = e.utm_source ? "utm" : "referrer";
      }
      if (!v.device && e.device) v.device = e.device;
      visits.set(visitDay(e), v);
    }
    const bySource = new Map<string, AnalyticsReport["sources"][number]>();
    for (const v of visits.values()) {
      const key = `${v.kind}|${v.source ?? ""}`;
      const s = bySource.get(key) ?? { source: v.source, kind: v.kind, visitors: 0 };
      s.visitors++;
      bySource.set(key, s);
    }
    const sources = [...bySource.values()]
      .sort((a, b) => b.visitors - a.visitors || (a.source === null ? 1 : b.source === null ? -1 : a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
      .slice(0, top);
    const devices: AnalyticsReport["devices"] = (["mobile", "desktop"] as const).map((device) => ({ device, visitors: [...visits.values()].filter((v) => v.device === device).length }));

    const steps: FunnelStep[] = ["visit", "signup_start", "code_sent", "code_ok", "wa_linked", "mail_connected", "paid"];
    const funnel = steps.map((step) => ({ step, count: new Set(inRange.filter((e) => (e.event ?? "visit") === step).map(visitDay)).size }));
    return { daily, pages, sources, devices, funnel };
  }

  async adminDailyStats(fromDay: string, toDay: string): Promise<AdminDailyRow[]> {
    const from = parseDateKey(fromDay);
    const to = parseDateKey(toDay);
    if (!from || !to || compareDates(to, from) < 0) throw new Error("admin_daily_stats: bad range");
    const day = (at: string) => dateKey(localDateOf(new Date(at)));
    const rows: AdminDailyRow[] = [];
    for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
      if (rows.length >= 367) throw new Error("admin_daily_stats: bad range");
      const key = dateKey(d);
      const ins = this.messages.filter((m) => m.direction === "in" && day(m.created_at) === key);
      rows.push({
        day: key,
        signups: [...this.users.values()].filter((u) => !u.deleted_at && day(u.created_at) === key).length,
        active_users: new Set(ins.map((m) => m.user_id)).size,
        messages: ins.length,
        ai_cost: this.aiSpend.get(key)?.cost_usd ?? 0,
        revenue: this.payments.filter((p) => p.ccode === "0" && day(p.created_at) === key).reduce((sum, p) => sum + p.amount_ils, 0),
      });
    }
    return rows;
  }

  async adminGetUser(id: string): Promise<UserRow | null> {
    const u = this.users.get(id);
    return u && !u.deleted_at ? structuredClone(u) : null;
  }

  async adminMessages(userId: string, opts: { before?: string; limit: number }): Promise<MessageRow[]> {
    return this.messages
      .filter((m) => m.user_id === userId && (!opts.before || m.created_at < opts.before))
      .slice()
      .reverse()
      .slice(0, opts.limit)
      .map((m) => ({ ...m }));
  }

  async adminAudit(userId: string, limit: number): Promise<AuditRow[]> {
    return this.audit
      .filter((a) => a.user_id === userId)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async adminJobs(userId: string, limit: number): Promise<JobRow[]> {
    return this.jobs
      .filter((j) => j.user_id === userId)
      .sort((a, b) => b.run_at.localeCompare(a.run_at))
      .slice(0, limit)
      .map((j) => ({ ...j }));
  }

  async adminFailedJobs(since: Date, limit: number): Promise<JobRow[]> {
    return this.jobs
      .filter((j) => j.status === "failed" && Date.parse(j.run_at) >= since.getTime())
      .sort((a, b) => b.run_at.localeCompare(a.run_at))
      .slice(0, limit)
      .map((j) => ({ ...j }));
  }

  async adminProactiveAlerts(userId: string, limit: number): Promise<ProactiveAlertRow[]> {
    return this.proactiveAlerts
      .filter((a) => a.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((a) => structuredClone(a));
  }

  async adminMeetingSummaries(userId: string, limit: number): Promise<MeetingSummaryRow[]> {
    return this.meetingSummaries
      .filter((s) => s.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async listSupportTickets(opts: { status?: SupportTicketStatus; userId?: string; limit: number }): Promise<SupportTicketRow[]> {
    return this.supportTickets
      .filter((t) => (!opts.status || t.status === opts.status) && (!opts.userId || t.user_id === opts.userId))
      .slice()
      .reverse()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit)
      .map((t) => structuredClone(t));
  }

  async setSupportTicketStatus(id: string, status: SupportTicketStatus, note?: string | null): Promise<SupportTicketRow | null> {
    const t = this.supportTickets.find((x) => x.id === id);
    if (!t) return null;
    if (t.status !== status) t.status_changed_at = iso(this.now());
    t.status = status;
    if (note !== undefined) t.admin_note = note?.trim() ? note.trim().slice(0, 2000) : null;
    return structuredClone(t);
  }

  async appendSupportChat(id: string, row: { userId: string | null; page: string | null; turns: SupportChatTurn[]; max?: number }): Promise<boolean> {
    if (row.userId && !this.users.has(row.userId)) throw new Error(`support_chats: unknown user ${row.userId}`); // the SQL foreign key
    let chat = this.supportChats.find((c) => c.id === id);
    if (!chat) {
      chat = { id, user_id: row.userId, page: row.page?.slice(0, 200) || null, turns: [], created_at: iso(this.now()), updated_at: iso(this.now()) };
      this.supportChats.push(chat);
    }
    if (chat.user_id && chat.user_id !== row.userId) return false;
    chat.turns = [...chat.turns, ...structuredClone(row.turns)].slice(-Math.max(row.max ?? 60, 1));
    chat.user_id ??= row.userId;
    chat.updated_at = iso(this.now());
    return true;
  }

  async listSupportChats(opts: { userId?: string; limit: number }): Promise<SupportChatRow[]> {
    return this.supportChats
      .filter((c) => !opts.userId || c.user_id === opts.userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, opts.limit)
      .map((c) => structuredClone(c));
  }

  async insertAppError(row: NewAppError): Promise<void> {
    // the SQL foreign key would refuse an unknown user: keep the error, without the link
    const userId = row.user_id && this.users.has(row.user_id) ? row.user_id : null;
    this.appErrors.push({ id: randomUUID(), at: iso(this.now()), user_id: userId, source: row.source, message: row.message, context: structuredClone(row.context ?? {}) });
  }

  async listAppErrors(opts: { source?: string; userId?: string; limit: number }): Promise<AppErrorRow[]> {
    return this.appErrors
      .filter((e) => (!opts.source || e.source === opts.source) && (!opts.userId || e.user_id === opts.userId))
      .slice()
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, opts.limit)
      .map((e) => structuredClone(e));
  }

  // ---- proactive_alerts (migration 0013): mirrors proactive_alert_claim() and the (user, channel, item, day) key ----

  async claimProactiveAlert(item: NewProactiveItem, opts: { cap: number; deliver: boolean }): Promise<{ result: ProactiveClaimResult; alert: ProactiveAlertRow | null }> {
    if (!this.users.has(item.user_id)) throw new Error(`proactive_alerts: unknown user ${item.user_id}`);
    const known = this.proactiveAlerts.some((a) => a.user_id === item.user_id && a.item_key === item.item_key && (a.channel === "urgent" || a.local_day === item.local_day));
    if (known) return { result: "duplicate", alert: null };
    const sent = this.proactiveAlerts.filter((a) => a.user_id === item.user_id && a.channel === "urgent" && a.local_day === item.local_day && a.status === "sent").length;
    const capped = opts.deliver && sent >= Math.max(opts.cap, 0);
    const deliver = opts.deliver && !capped;
    const row: ProactiveAlertRow = { id: randomUUID(), ...item, payload: structuredClone(item.payload), channel: "urgent", status: deliver ? "sent" : "deferred", created_at: iso(this.now()) };
    this.proactiveAlerts.push(row);
    return { result: deliver ? "claimed" : capped ? "cap" : "deferred", alert: structuredClone(row) };
  }

  async addProactiveSummaryItem(item: NewProactiveItem): Promise<ProactiveAlertRow> {
    if (!this.users.has(item.user_id)) throw new Error(`proactive_alerts: unknown user ${item.user_id}`);
    const existing = this.proactiveAlerts.find((a) => a.user_id === item.user_id && a.channel === "summary" && a.item_key === item.item_key && a.local_day === item.local_day);
    if (existing) {
      existing.payload = structuredClone(item.payload);
      return structuredClone(existing);
    }
    const row: ProactiveAlertRow = { id: randomUUID(), ...item, payload: structuredClone(item.payload), channel: "summary", status: "listed", created_at: iso(this.now()) };
    this.proactiveAlerts.push(row);
    return structuredClone(row);
  }

  async getProactiveAlert(userId: string, id: string): Promise<ProactiveAlertRow | null> {
    const row = this.proactiveAlerts.find((a) => a.id === id && a.user_id === userId);
    return row ? structuredClone(row) : null;
  }

  async foldDeferredProactiveAlerts(userId: string, since: Date): Promise<ProactiveAlertRow[]> {
    const rows = this.proactiveAlerts
      .filter((a) => a.user_id === userId && a.channel === "urgent" && a.status === "deferred" && Date.parse(a.created_at) >= since.getTime())
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const r of rows) r.status = "folded";
    return rows.map((r) => structuredClone(r));
  }

  async setProactiveAlertStatus(userId: string, id: string, status: ProactiveStatus): Promise<void> {
    const row = this.proactiveAlerts.find((a) => a.id === id && a.user_id === userId && a.channel === "urgent");
    if (row && status !== "listed") row.status = status;
  }

  // ---- meeting_summaries (migration 0014): one row per (user, event_key); meeting_summary_mark() ----

  async saveMeetingSummary(row: NewMeetingSummary): Promise<MeetingSummaryRow> {
    if (!this.users.has(row.user_id)) throw new Error(`meeting_summaries: unknown user ${row.user_id}`);
    const existing = this.meetingSummaries.find((s) => s.user_id === row.user_id && s.event_key === row.event_key);
    if (existing) return structuredClone(existing);
    const saved: MeetingSummaryRow = { id: randomUUID(), ...structuredClone(row), done: [], created_at: iso(this.now()) };
    this.meetingSummaries.push(saved);
    return structuredClone(saved);
  }

  async getMeetingSummary(userId: string, id: string): Promise<MeetingSummaryRow | null> {
    const row = this.meetingSummaries.find((s) => s.id === id && s.user_id === userId);
    return row ? structuredClone(row) : null;
  }

  async findMeetingSummary(userId: string, eventKey: string): Promise<MeetingSummaryRow | null> {
    const row = this.meetingSummaries.find((s) => s.user_id === userId && s.event_key === eventKey);
    return row ? structuredClone(row) : null;
  }

  async markMeetingSummaryAction(userId: string, id: string, action: MeetingSummaryAction): Promise<boolean> {
    const row = this.meetingSummaries.find((s) => s.id === id && s.user_id === userId);
    if (!row || row.done.includes(action)) return false;
    row.done.push(action);
    return true;
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
      billing_cycle: row.billing_cycle ?? "monthly",
    };
    this.billingApprovals.push(full);
    return { ...full };
  }

  async openRenewalCharge(row: { user_id: string; plan: "basic" | "pro"; amount_ils: number; details?: Record<string, unknown>; billing_cycle?: "monthly" | "annual" }): Promise<BillingApprovalRow | null> {
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
      billing_cycle: row.billing_cycle ?? "monthly",
    };
    this.billingApprovals.push(full);
    return { ...full };
  }

  async openWebCharge(row: NewWebCharge): Promise<BillingApprovalRow | null> {
    if (!(row.amount_ils > 0)) throw new Error("billing_approvals_charge_amount");
    if (row.plan !== "basic" && row.plan !== "pro") throw new Error("billing_approvals_paid_plan");
    // the primary key (a replayed form) and billing_approvals_one_open_charge_per_user
    if (this.billingApprovals.some((a) => a.id === row.id) || this.hasOpenCharge(row.user_id)) return null;
    const now = this.now();
    const full: BillingApprovalRow = {
      id: row.id,
      user_id: row.user_id,
      kind: "upgrade",
      plan: row.plan,
      billing_cycle: row.billing_cycle ?? "monthly",
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

  // ---- referrals (mirrors 0018_annual_referrals.sql) ----

  async getReferralCode(userId: string): Promise<ReferralCodeRow | null> {
    const row = this.referralCodes.find((c) => c.user_id === userId);
    return row ? { ...row } : null;
  }

  async ensureReferralCode(userId: string, generate: () => string): Promise<ReferralCodeRow> {
    const existing = await this.getReferralCode(userId);
    if (existing) return existing;
    if (!this.users.has(userId)) throw new Error("referral_codes_user_id_fkey");
    for (let i = 0; i < 8; i++) {
      const code = generate().toUpperCase();
      if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,12}$/.test(code)) throw new Error("referral_codes_code_format");
      if (this.referralCodes.some((c) => c.code === code)) continue; // referral_codes_code_key — try another
      const row: ReferralCodeRow = { user_id: userId, code, created_at: iso(this.now()) };
      this.referralCodes.push(row);
      return { ...row };
    }
    throw new Error("could not make a unique referral code");
  }

  async findReferralCode(code: string): Promise<ReferralCodeRow | null> {
    const c = code.trim().toUpperCase();
    const row = this.referralCodes.find((r) => r.code === c);
    if (!row) return null;
    const owner = this.users.get(row.user_id);
    return owner && !owner.deleted_at ? { ...row } : null;
  }

  async createReferral(row: { referrer_id: string; referred_user_id: string; code: string; status: "pending" | "rejected"; reason?: string | null }): Promise<ReferralRow | null> {
    if (row.referrer_id === row.referred_user_id) throw new Error("referrals_not_self");
    if (!this.users.has(row.referrer_id) || !this.users.has(row.referred_user_id)) throw new Error("referrals_user_fkey");
    if (this.referrals.some((r) => r.referred_user_id === row.referred_user_id)) return null; // referrals_referred_user_id_key
    const full: ReferralRow = {
      id: randomUUID(),
      referrer_id: row.referrer_id,
      referred_user_id: row.referred_user_id,
      code: row.code.toUpperCase(),
      status: row.status,
      reason: row.reason ?? null,
      referrer_reward: null,
      referred_reward: null,
      created_at: iso(this.now()),
      rewarded_at: null,
      payment_id: null,
    };
    this.referrals.push(full);
    return { ...full };
  }

  async getReferralOf(referredUserId: string): Promise<ReferralRow | null> {
    const row = this.referrals.find((r) => r.referred_user_id === referredUserId);
    return row ? { ...row } : null;
  }

  async listReferralsBy(referrerId: string): Promise<ReferralRow[]> {
    return this.referrals
      .filter((r) => r.referrer_id === referrerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({ ...r }));
  }

  async rejectReferral(referredUserId: string, reason: string): Promise<ReferralRow | null> {
    const row = this.referrals.find((r) => r.referred_user_id === referredUserId && r.status === "pending");
    if (!row) return null;
    Object.assign(row, { status: "rejected", reason });
    return { ...row };
  }

  /** Mirrors public.referral_push(): the free days onto next_charge_at, when the subscription can take them now. */
  private referralPush(userId: string, days: number): boolean {
    const sub = this.subscriptions.get(userId);
    const now = this.now().getTime();
    if (!sub || (sub.plan !== "basic" && sub.plan !== "pro") || !sub.next_charge_at || Date.parse(sub.next_charge_at) <= now) return false;
    const open = (sub.status === "active" && !sub.cancelled_at && sub.charge_failures === 0) || sub.status === "cancelled";
    if (!open || this.hasOpenCharge(userId)) return false;
    sub.next_charge_at = iso(new Date(Date.parse(sub.next_charge_at) + days * 86_400_000));
    return true;
  }

  async rewardReferral(referredUserId: string, opts: { paymentId: string | null; days: number; cap: number }): Promise<ReferralRewardResult> {
    const ref = this.referrals.find((r) => r.referred_user_id === referredUserId);
    if (!ref || ref.status !== "pending") return { result: "none", referral: ref ? { ...ref } : null, referrerNextChargeAt: null, referredNextChargeAt: null };
    const now = this.now();
    const yearAgo = now.getTime() - 365 * 86_400_000;
    const counted = this.referrals.filter(
      (r) => r.referrer_id === ref.referrer_id && r.id !== ref.id && r.status === "rewarded" && (r.referrer_reward === "applied" || r.referrer_reward === "pending") && r.rewarded_at && Date.parse(r.rewarded_at) > yearAgo,
    ).length;
    const referrer: ReferralRewardState = counted >= opts.cap ? "capped" : this.referralPush(ref.referrer_id, opts.days) ? "applied" : "pending";
    const referred: ReferralRewardState = this.referralPush(referredUserId, opts.days) ? "applied" : "pending";
    Object.assign(ref, { status: "rewarded", rewarded_at: iso(now), payment_id: opts.paymentId, referrer_reward: referrer, referred_reward: referred });
    const next = (id: string, state: ReferralRewardState) => (state === "applied" ? (this.subscriptions.get(id)?.next_charge_at ?? null) : null);
    return { result: "rewarded", referral: { ...ref }, referrerNextChargeAt: next(ref.referrer_id, referrer), referredNextChargeAt: next(referredUserId, referred) };
  }

  async applyReferralCredit(userId: string, days: number): Promise<{ applied: number; nextChargeAt: string | null }> {
    const mine = (r: ReferralRow) => r.status === "rewarded" && ((r.referrer_id === userId && r.referrer_reward === "pending") || (r.referred_user_id === userId && r.referred_reward === "pending"));
    const pending = this.referrals.filter(mine);
    const current = () => this.subscriptions.get(userId)?.next_charge_at ?? null;
    if (!pending.length || !this.referralPush(userId, days * pending.length)) return { applied: 0, nextChargeAt: current() };
    for (const r of pending) {
      if (r.referrer_id === userId && r.referrer_reward === "pending") r.referrer_reward = "applied";
      if (r.referred_user_id === userId && r.referred_reward === "pending") r.referred_reward = "applied";
    }
    return { applied: pending.length, nextChargeAt: current() };
  }

  async adminReferrals(limit: number): Promise<AdminReferralRow[]> {
    return this.referrals
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((r) => ({ ...r, referrer_email: this.users.get(r.referrer_id)?.email ?? null, referred_email: this.users.get(r.referred_user_id)?.email ?? null }));
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
      billing_cycle: "monthly",
      scheduled_cycle: null,
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
