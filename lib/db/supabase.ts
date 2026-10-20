import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
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

/**
 * Supabase implementation of `Db` using the service-role key (bypasses RLS — server only, never in the browser).
 * Column lists are explicit so encrypted token columns are never read here.
 */
export class SupabaseDb implements Db {
  constructor(private readonly client: SupabaseClient) {}

  static fromEnv(): SupabaseDb {
    const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseDb(client);
  }

  private static USER_COLS =
    "id,email,name,business_name,business_type,timezone,morning_time,locale,profile,created_at,deleted_at";
  private static PA_COLS = "id,user_id,kind,payload,status,expires_at,approved_msg_id,executed_at,error,created_at";
  private static MSG_COLS = "id,user_id,wa_message_id,direction,type,text,media_url,transcript,model_used,tokens_in,tokens_out,cost_usd,created_at";
  private static CONN_COLS =
    "id,user_id,provider,account_email,tenant_id,scopes,status,consent_type,created_at,revoked_at";
  private static SUB_COLS = "id,user_id,plan,status,next_charge_at,cancelled_at,started_at";

  private fail(op: string, error: { message: string } | null): never {
    throw new Error(`Supabase ${op}: ${error?.message ?? "unknown error"}`);
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from("users")
      .select(SupabaseDb.USER_COLS)
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) this.fail("findUserByEmail", error);
    return (data as unknown as UserRow | null) ?? null;
  }

  async getUser(id: string): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from("users")
      .select(SupabaseDb.USER_COLS)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) this.fail("getUser", error);
    return (data as unknown as UserRow | null) ?? null;
  }

  async createUser(email: string): Promise<UserRow> {
    const { data, error } = await this.client
      .from("users")
      .insert({ email })
      .select(SupabaseDb.USER_COLS)
      .single();
    if (error) this.fail("createUser", error);
    return data as unknown as UserRow;
  }

  async updateUserProfile(id: string, patch: Partial<UserRow>): Promise<UserRow> {
    const { data, error } = await this.client
      .from("users")
      .update(patch)
      .eq("id", id)
      .select(SupabaseDb.USER_COLS)
      .single();
    if (error) this.fail("updateUserProfile", error);
    return data as unknown as UserRow;
  }

  async mergeUserProfile(id: string, patch: Record<string, unknown>): Promise<UserRow> {
    const current = await this.getUser(id);
    if (!current) throw new Error("user not found");
    return this.updateUserProfile(id, { profile: { ...current.profile, ...patch } } as Partial<UserRow>);
  }

  async findWaIdentityByPhone(phoneE164: string): Promise<WaIdentityRow | null> {
    const { data, error } = await this.client
      .from("wa_identities")
      .select("id,user_id,phone_e164,wa_name,linked_at,status")
      .eq("phone_e164", phoneE164)
      .neq("status", "unlinked")
      .maybeSingle();
    if (error) this.fail("findWaIdentityByPhone", error);
    return (data as unknown as WaIdentityRow | null) ?? null;
  }

  async createWaIdentity(userId: string, phoneE164: string, waName: string | null): Promise<WaIdentityRow> {
    // phone_e164 is unique: an unlinked row for the same number is re-assigned instead of inserted
    const { data, error } = await this.client
      .from("wa_identities")
      .upsert({ user_id: userId, phone_e164: phoneE164, wa_name: waName, status: "active", linked_at: new Date().toISOString() }, { onConflict: "phone_e164" })
      .select("id,user_id,phone_e164,wa_name,linked_at,status")
      .single();
    if (error) this.fail("createWaIdentity", error);
    return data as unknown as WaIdentityRow;
  }

  async recordLinkAttempt(phoneE164: string, maxAttempts: number, blockMs: number): Promise<LinkAttemptResult> {
    const now = new Date();
    const { data: cur, error: readError } = await this.client
      .from("wa_link_attempts")
      .select("attempts,blocked_until")
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (readError) this.fail("recordLinkAttempt", readError);
    const row = cur as { attempts: number; blocked_until: string | null } | null;
    if (row?.blocked_until && Date.parse(row.blocked_until) > now.getTime()) return { attempts: row.attempts, blocked: true };
    const attempts = (row?.attempts ?? 0) + 1;
    const blockedUntil = attempts >= maxAttempts ? new Date(now.getTime() + blockMs).toISOString() : null;
    const { error } = await this.client
      .from("wa_link_attempts")
      .upsert({ phone_e164: phoneE164, attempts, last_attempt_at: now.toISOString(), blocked_until: blockedUntil }, { onConflict: "phone_e164" });
    if (error) this.fail("recordLinkAttempt", error);
    return { attempts, blocked: blockedUntil !== null };
  }

  async isPhoneBlocked(phoneE164: string): Promise<boolean> {
    const { data, error } = await this.client.from("wa_link_attempts").select("blocked_until").eq("phone_e164", phoneE164).maybeSingle();
    if (error) this.fail("isPhoneBlocked", error);
    const until = (data as { blocked_until: string | null } | null)?.blocked_until;
    return Boolean(until && Date.parse(until) > Date.now());
  }

  async insertMessage(row: NewMessage): Promise<MessageRow | null> {
    const { data, error } = await this.client.from("messages").insert(row).select(SupabaseDb.MSG_COLS).single();
    if (error) {
      if (error.code === "23505") return null; // unique_violation on wa_message_id → redelivery
      this.fail("insertMessage", error);
    }
    return data as unknown as MessageRow;
  }

  async recentMessages(userId: string, limit: number): Promise<MessageRow[]> {
    const { data, error } = await this.client
      .from("messages")
      .select(SupabaseDb.MSG_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) this.fail("recentMessages", error);
    return ((data as unknown as MessageRow[]) ?? []).reverse();
  }

  async countMessagesSince(userId: string, since: Date): Promise<number> {
    const { count, error } = await this.client
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (error) this.fail("countMessagesSince", error);
    return count ?? 0;
  }

  async getConversationState(userId: string): Promise<ConversationStateRow | null> {
    const { data, error } = await this.client.from("conversation_state").select("*").eq("user_id", userId).maybeSingle();
    if (error) this.fail("getConversationState", error);
    return (data as unknown as ConversationStateRow | null) ?? null;
  }

  async upsertConversationState(userId: string, patch: Partial<Pick<ConversationStateRow, "summary" | "last_summarized_msg_id" | "facts">>): Promise<ConversationStateRow> {
    const { data, error } = await this.client
      .from("conversation_state")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) this.fail("upsertConversationState", error);
    return data as unknown as ConversationStateRow;
  }

  async createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date): Promise<PendingActionRow> {
    const { data, error } = await this.client
      .from("pending_actions")
      .insert({ user_id: userId, kind, payload, expires_at: expiresAt.toISOString() })
      .select(SupabaseDb.PA_COLS)
      .single();
    if (error) this.fail("createPendingAction", error);
    return data as unknown as PendingActionRow;
  }

  async getPendingAction(id: string): Promise<PendingActionRow | null> {
    const { data, error } = await this.client.from("pending_actions").select(SupabaseDb.PA_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getPendingAction", error);
    return (data as unknown as PendingActionRow | null) ?? null;
  }

  async updatePendingAction(id: string, patch: Partial<Pick<PendingActionRow, "status" | "payload" | "approved_msg_id" | "executed_at" | "error">>): Promise<PendingActionRow | null> {
    const { data, error } = await this.client.from("pending_actions").update(patch).eq("id", id).select(SupabaseDb.PA_COLS).maybeSingle();
    if (error) this.fail("updatePendingAction", error);
    return (data as unknown as PendingActionRow | null) ?? null;
  }

  async listPendingActions(userId: string, status: PendingActionStatus): Promise<PendingActionRow[]> {
    const { data, error } = await this.client
      .from("pending_actions")
      .select(SupabaseDb.PA_COLS)
      .eq("user_id", userId)
      .eq("status", status)
      .order("created_at", { ascending: true });
    if (error) this.fail("listPendingActions", error);
    return (data as unknown as PendingActionRow[]) ?? [];
  }

  async countTrialMessage(userId: string): Promise<number> {
    const { data, error } = await this.client.rpc("count_trial_message", { p_user_id: userId });
    if (error) this.fail("countTrialMessage", error);
    return Number(data);
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await this.client.from("users").delete().eq("id", id);
    if (error) this.fail("deleteUser", error);
  }

  async createOtp(email: string, codeHash: string, expiresAt: Date): Promise<OtpRow> {
    const { data, error } = await this.client
      .from("auth_otps")
      .insert({ email, code_hash: codeHash, expires_at: expiresAt.toISOString() })
      .select("*")
      .single();
    if (error) this.fail("createOtp", error);
    return data as unknown as OtpRow;
  }

  async latestOtp(email: string): Promise<OtpRow | null> {
    const { data, error } = await this.client
      .from("auth_otps")
      .select("*")
      .eq("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail("latestOtp", error);
    return (data as unknown as OtpRow | null) ?? null;
  }

  async countOtpsSince(email: string, since: Date): Promise<number> {
    const { count, error } = await this.client
      .from("auth_otps")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since.toISOString());
    if (error) this.fail("countOtpsSince", error);
    return count ?? 0;
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const { data: row, error: readError } = await this.client
      .from("auth_otps")
      .select("attempts")
      .eq("id", id)
      .single();
    if (readError) this.fail("incrementOtpAttempts", readError);
    const attempts = ((row as { attempts: number }).attempts ?? 0) + 1;
    const { error } = await this.client.from("auth_otps").update({ attempts }).eq("id", id);
    if (error) this.fail("incrementOtpAttempts", error);
    return attempts;
  }

  async markOtpUsed(id: string): Promise<void> {
    const { error } = await this.client
      .from("auth_otps")
      .update({ used_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail("markOtpUsed", error);
  }

  async createLinkToken(userId: string, token: string, expiresAt: Date): Promise<LinkTokenRow> {
    const { data, error } = await this.client
      .from("link_tokens")
      .insert({ user_id: userId, token, expires_at: expiresAt.toISOString() })
      .select("*")
      .single();
    if (error) this.fail("createLinkToken", error);
    return data as unknown as LinkTokenRow;
  }

  async findLinkToken(token: string): Promise<LinkTokenRow | null> {
    const { data, error } = await this.client
      .from("link_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (error) this.fail("findLinkToken", error);
    return (data as unknown as LinkTokenRow | null) ?? null;
  }

  async latestLinkToken(userId: string): Promise<LinkTokenRow | null> {
    const { data, error } = await this.client
      .from("link_tokens")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail("latestLinkToken", error);
    return (data as unknown as LinkTokenRow | null) ?? null;
  }

  async markLinkTokenUsed(id: string): Promise<void> {
    const { error } = await this.client
      .from("link_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.fail("markLinkTokenUsed", error);
  }

  async listWaIdentities(userId: string): Promise<WaIdentityRow[]> {
    const { data, error } = await this.client
      .from("wa_identities")
      .select("id,user_id,phone_e164,wa_name,linked_at,status")
      .eq("user_id", userId);
    if (error) this.fail("listWaIdentities", error);
    return (data as unknown as WaIdentityRow[]) ?? [];
  }

  async unlinkWaIdentity(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("wa_identities")
      .update({ status: "unlinked" })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id");
    if (error) this.fail("unlinkWaIdentity", error);
    return (data?.length ?? 0) > 0;
  }

  async listConnections(userId: string): Promise<ConnectionRow[]> {
    const { data, error } = await this.client
      .from("connections")
      .select(SupabaseDb.CONN_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) this.fail("listConnections", error);
    return (data as unknown as ConnectionRow[]) ?? [];
  }

  async revokeConnection(userId: string, id: string): Promise<ConnectionRow | null> {
    const { data, error } = await this.client
      .from("connections")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), enc_access: null, enc_refresh: null })
      .eq("id", id)
      .eq("user_id", userId)
      .select(SupabaseDb.CONN_COLS)
      .maybeSingle();
    if (error) this.fail("revokeConnection", error);
    return (data as unknown as ConnectionRow | null) ?? null;
  }

  async getSubscription(userId: string): Promise<SubscriptionRow | null> {
    const { data, error } = await this.client
      .from("subscriptions")
      .select(SupabaseDb.SUB_COLS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) this.fail("getSubscription", error);
    return (data as unknown as SubscriptionRow | null) ?? null;
  }

  async cancelSubscription(userId: string): Promise<SubscriptionRow | null> {
    const { data, error } = await this.client
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select(SupabaseDb.SUB_COLS)
      .maybeSingle();
    if (error) this.fail("cancelSubscription", error);
    return (data as unknown as SubscriptionRow | null) ?? null;
  }

  async getCurrentUsage(userId: string): Promise<UsageRow | null> {
    const { data, error } = await this.client
      .from("usage")
      .select("user_id,period_start,counted_messages,free_remaining,plan_limit")
      .eq("user_id", userId)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail("getCurrentUsage", error);
    return (data as unknown as UsageRow | null) ?? null;
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    const { error } = await this.client.from("audit_log").insert({
      user_id: entry.user_id,
      action: entry.action,
      target: entry.target ?? null,
      reason: entry.reason ?? null,
      result: entry.result ?? null,
      approved_by_msg_id: entry.approved_by_msg_id ?? null,
    });
    if (error) this.fail("addAudit", error);
  }
}
