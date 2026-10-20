import { randomUUID } from "node:crypto";
import type {
  AuditEntry,
  ConnectionRow,
  ConversationStateRow,
  Db,
  LinkAttemptResult,
  LinkTokenRow,
  MessageRow,
  NewMessage,
  OtpRow,
  PendingActionKind,
  PendingActionRow,
  PendingActionStatus,
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
  /** test clock */
  now: () => Date = () => new Date();

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
    const user: UserRow = {
      id: randomUUID(),
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
      created_at: iso(this.now()),
    };
    this.messages.push(full);
    return full;
  }

  async recentMessages(userId: string, limit: number): Promise<MessageRow[]> {
    return this.messages.filter((m) => m.user_id === userId).slice(-limit);
  }

  async countMessagesSince(userId: string, since: Date): Promise<number> {
    return this.messages.filter((m) => m.user_id === userId && m.created_at >= iso(since)).length;
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

  async createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date): Promise<PendingActionRow> {
    const row: PendingActionRow = { id: randomUUID(), user_id: userId, kind, payload, status: "pending", expires_at: iso(expiresAt), approved_msg_id: null, executed_at: null, error: null, created_at: iso(this.now()) };
    this.pendingActions.push(row);
    return row;
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

  /** Mirrors public.count_trial_message(): trial = one period from signup (10), paid = calendar month (750/3000). */
  async countTrialMessage(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user || user.deleted_at) throw new Error(`count_trial_message: user ${userId} not found`);
    const sub = this.subscriptions.get(userId);
    const plan = sub && (sub.status === "active" || sub.status === "past_due" || (sub.status === "cancelled" && sub.next_charge_at && Date.parse(sub.next_charge_at) > this.now().getTime())) ? sub.plan : "trial";
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
    return row;
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

  async getCurrentUsage(userId: string): Promise<UsageRow | null> {
    const rows = this.usage.filter((u) => u.user_id === userId);
    return rows.length ? rows[rows.length - 1]! : null;
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    this.audit.push({ ...entry, created_at: iso() });
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
