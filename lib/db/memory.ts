import { randomUUID } from "node:crypto";
import type {
  AuditEntry,
  ConnectionRow,
  Db,
  LinkTokenRow,
  OtpRow,
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
      created_at: iso(),
      deleted_at: null,
    };
    this.users.set(user.id, user);
    return user;
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
