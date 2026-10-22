import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import { AgentDailyCapError, agentErrorFromPostgres } from "./errors";
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
  private static PA_COLS = "id,user_id,kind,payload,status,expires_at,approved_msg_id,executed_at,error,agent_key,agent_name,created_at";
  private static MSG_COLS = "id,user_id,wa_message_id,direction,type,text,media_url,transcript,model_used,tokens_in,tokens_out,cost_usd,agent_key,hidden_from_model,created_at";
  private static AGENT_COLS = "id,user_id,name,role,template,instructions,tools,permissions,enabled,created_at,updated_at";
  private static CONN_COLS =
    "id,user_id,provider,account_email,tenant_id,scopes,status,consent_type,expires_at,created_at,revoked_at";
  private static GSUB_COLS = "id,connection_id,subscription_id,resource,expires_at,client_state";
  private static SUB_COLS = "id,user_id,plan,status,next_charge_at,cancelled_at,started_at,charge_failures,hyp_tokef,scheduled_plan";
  private static PAY_COLS = "id,user_id,hyp_trans_id,amount_ils,ccode,acode,invoice_url,raw,created_at,approval_id";
  private static BA_COLS = "id,user_id,kind,plan,amount_ils,details,phone_e164,status,expires_at,approved_msg_id,approved_at,hyp_trans_id,ccode,error,created_at";
  private static JOB_COLS = "id,user_id,kind,run_at,payload,status,attempts,max_attempts,last_error,dedupe_key";
  private static REM_COLS = "id,user_id,text,due_at,job_id,status,recurrence,last_fired_at,created_at";

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

  async findUserByOauthState(provider: "microsoft" | "google", state: string): Promise<UserRow | null> {
    const { data, error } = await this.client
      .from("users")
      .select(SupabaseDb.USER_COLS)
      .eq(`profile->oauth_pending->${provider}->>state`, state)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (error) this.fail("findUserByOauthState", error);
    return (data as unknown as UserRow | null) ?? null;
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

  async recentMessages(userId: string, limit: number, opts: { forModel?: boolean } = {}): Promise<MessageRow[]> {
    let q = this.client.from("messages").select(SupabaseDb.MSG_COLS).eq("user_id", userId);
    if (opts.forModel) q = q.eq("hidden_from_model", false);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("recentMessages", error);
    return ((data as unknown as MessageRow[]) ?? []).reverse();
  }

  async hideMessageFromModel(userId: string, id: string): Promise<void> {
    const { error } = await this.client.from("messages").update({ hidden_from_model: true }).eq("user_id", userId).eq("id", id);
    if (error) this.fail("hideMessageFromModel", error);
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

  async setMessageTranscript(id: string, transcript: string, stt?: { model?: string | null; costUsd?: number | null }): Promise<void> {
    const patch = { transcript, ...(stt?.model ? { model_used: stt.model } : {}), ...(typeof stt?.costUsd === "number" ? { cost_usd: stt.costUsd } : {}) };
    const { error } = await this.client.from("messages").update(patch).eq("id", id);
    if (error) this.fail("setMessageTranscript", error);
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

  async createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date, meta?: PendingActionMeta): Promise<PendingActionRow> {
    const { data, error } = await this.client
      .from("pending_actions")
      .insert({ user_id: userId, kind, payload, expires_at: expiresAt.toISOString(), ...(meta ? { agent_key: meta.agentKey, agent_name: meta.agentName } : {}) })
      .select(SupabaseDb.PA_COLS)
      .single();
    if (error) {
      // the daily cap trigger (enforce_agent_daily_cap) → a typed error; anything else stays generic
      if (error.message?.includes("agent_daily_cap_reached")) throw new AgentDailyCapError(error.details ?? null);
      this.fail("createPendingAction", error);
    }
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

  async getConnection(id: string): Promise<ConnectionRow | null> {
    const { data, error } = await this.client.from("connections").select(SupabaseDb.CONN_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getConnection", error);
    return (data as unknown as ConnectionRow | null) ?? null;
  }

  async upsertConnection(row: NewConnection): Promise<ConnectionRow> {
    const { data, error } = await this.client
      .from("connections")
      .upsert({ ...row, status: "active", revoked_at: null }, { onConflict: "user_id,provider,account_email" })
      .select(SupabaseDb.CONN_COLS)
      .single();
    if (error) this.fail("upsertConnection", error);
    return data as unknown as ConnectionRow;
  }

  async getConnectionSecret(id: string): Promise<ConnectionSecret | null> {
    const { data, error } = await this.client.from("connections").select("enc_access,enc_refresh,expires_at").eq("id", id).maybeSingle();
    if (error) this.fail("getConnectionSecret", error);
    return (data as unknown as ConnectionSecret | null) ?? null;
  }

  async updateConnectionTokens(id: string, patch: { enc_access: string; enc_refresh?: string | null; expires_at: string }): Promise<void> {
    const { error } = await this.client.from("connections").update(patch).eq("id", id);
    if (error) this.fail("updateConnectionTokens", error);
  }

  async setConnectionStatus(id: string, status: ConnectionStatus): Promise<void> {
    const { error } = await this.client.from("connections").update({ status }).eq("id", id);
    if (error) this.fail("setConnectionStatus", error);
  }

  // ---- google_scope_grants / ops_flags (migration 0008) ----

  async recordGoogleScopeGrant(row: { account_hash: string; scope: string; user_id: string | null }): Promise<boolean> {
    const { error } = await this.client.from("google_scope_grants").insert(row);
    if (error?.code === "23505") return false; // already recorded (primary key account_hash + scope)
    if (error) this.fail("recordGoogleScopeGrant", error);
    return true;
  }

  async countGoogleScopeAccounts(scopes: string[]): Promise<number> {
    const { data, error } = await this.client.rpc("google_scope_account_count", { p_scopes: scopes });
    if (error) this.fail("countGoogleScopeAccounts", error);
    return Number(data ?? 0);
  }

  async hasGoogleScopeGrant(accountHash: string, scopes: string[]): Promise<boolean> {
    const { data, error } = await this.client.from("google_scope_grants").select("scope").eq("account_hash", accountHash).in("scope", scopes).limit(1);
    if (error) this.fail("hasGoogleScopeGrant", error);
    return (data ?? []).length > 0;
  }

  async setOpsFlagOnce(key: string, value: Record<string, unknown>): Promise<boolean> {
    const { error } = await this.client.from("ops_flags").insert({ key, value });
    if (error?.code === "23505") return false;
    if (error) this.fail("setOpsFlagOnce", error);
    return true;
  }

  async getOpsFlag(key: string): Promise<import("./types").OpsFlagRow | null> {
    const { data, error } = await this.client.from("ops_flags").select("key,value,created_at").eq("key", key).maybeSingle();
    if (error) this.fail("getOpsFlag", error);
    return (data as unknown as import("./types").OpsFlagRow | null) ?? null;
  }

  // ---- ai_spend / ai_spend_users (migration 0009) ----

  async getAiSpend(day: string): Promise<number> {
    const { data, error } = await this.client.from("ai_spend").select("cost_usd").eq("day", day).maybeSingle();
    if (error) this.fail("getAiSpend", error);
    return Number((data as { cost_usd: number | string } | null)?.cost_usd ?? 0);
  }

  async addAiSpend(day: string, costUsd: number, calls = 1): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_add", { p_day: day, p_cost: Number.isFinite(costUsd) ? costUsd : 0, p_calls: calls });
    if (error) this.fail("addAiSpend", error);
    return Number(data ?? 0);
  }

  async getAiUserMessages(day: string, userId: string): Promise<number> {
    const { data, error } = await this.client.from("ai_spend_users").select("messages").eq("day", day).eq("user_id", userId).maybeSingle();
    if (error) this.fail("getAiUserMessages", error);
    return Number((data as { messages: number } | null)?.messages ?? 0);
  }

  async admitAiUserMessage(day: string, userId: string, limit: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_admit_message", { p_day: day, p_user_id: userId, p_limit: limit });
    if (error) this.fail("admitAiUserMessage", error);
    return typeof data === "number" ? data : Number(data ?? -1);
  }

  async upsertGraphSubscription(row: Omit<GraphSubscriptionRow, "id">): Promise<GraphSubscriptionRow> {
    const { data, error } = await this.client.from("graph_subscriptions").upsert(row, { onConflict: "subscription_id" }).select(SupabaseDb.GSUB_COLS).single();
    if (error) this.fail("upsertGraphSubscription", error);
    return data as unknown as GraphSubscriptionRow;
  }

  async findGraphSubscription(subscriptionId: string): Promise<GraphSubscriptionRow | null> {
    const { data, error } = await this.client.from("graph_subscriptions").select(SupabaseDb.GSUB_COLS).eq("subscription_id", subscriptionId).maybeSingle();
    if (error) this.fail("findGraphSubscription", error);
    return (data as unknown as GraphSubscriptionRow | null) ?? null;
  }

  async listGraphSubscriptionsForConnection(connectionId: string): Promise<GraphSubscriptionRow[]> {
    const { data, error } = await this.client.from("graph_subscriptions").select(SupabaseDb.GSUB_COLS).eq("connection_id", connectionId);
    if (error) this.fail("listGraphSubscriptionsForConnection", error);
    return (data as unknown as GraphSubscriptionRow[]) ?? [];
  }

  async listGraphSubscriptionsExpiring(before: Date, limit: number): Promise<GraphSubscriptionRow[]> {
    const { data, error } = await this.client.from("graph_subscriptions").select(SupabaseDb.GSUB_COLS).lte("expires_at", before.toISOString()).order("expires_at", { ascending: true }).limit(limit);
    if (error) this.fail("listGraphSubscriptionsExpiring", error);
    return (data as unknown as GraphSubscriptionRow[]) ?? [];
  }

  async deleteGraphSubscription(subscriptionId: string): Promise<void> {
    const { error } = await this.client.from("graph_subscriptions").delete().eq("subscription_id", subscriptionId);
    if (error) this.fail("deleteGraphSubscription", error);
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

  async upsertSubscription(userId: string, patch: Partial<Omit<SubscriptionRow, "id" | "user_id">> & { hyp_token_enc?: string | null }): Promise<SubscriptionRow> {
    const { data, error } = await this.client
      .from("subscriptions")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select(SupabaseDb.SUB_COLS)
      .single();
    if (error) this.fail("upsertSubscription", error);
    return data as unknown as SubscriptionRow;
  }

  async getSubscriptionSecret(userId: string): Promise<SubscriptionSecret | null> {
    const { data, error } = await this.client.from("subscriptions").select("hyp_token_enc,hyp_tokef").eq("user_id", userId).maybeSingle();
    if (error) this.fail("getSubscriptionSecret", error);
    return (data as unknown as SubscriptionSecret | null) ?? null;
  }

  async listSubscriptionsDue(now: Date, limit: number): Promise<SubscriptionRow[]> {
    const { data, error } = await this.client
      .from("subscriptions")
      .select(SupabaseDb.SUB_COLS)
      .in("status", ["active", "past_due"])
      .lte("next_charge_at", now.toISOString())
      .not("hyp_token_enc", "is", null)
      .order("next_charge_at", { ascending: true })
      .limit(limit);
    if (error) this.fail("listSubscriptionsDue", error);
    return (data as unknown as SubscriptionRow[]) ?? [];
  }

  async insertPayment(row: Omit<PaymentRow, "id" | "created_at">): Promise<PaymentRow | null> {
    const { data, error } = await this.client.from("payments").insert(row).select(SupabaseDb.PAY_COLS).single();
    if (error) {
      if (error.code === "23505") return null;
      this.fail("insertPayment", error);
    }
    return data as unknown as PaymentRow;
  }

  async listPayments(userId: string, limit: number): Promise<PaymentRow[]> {
    const { data, error } = await this.client.from("payments").select(SupabaseDb.PAY_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("listPayments", error);
    return (data as unknown as PaymentRow[]) ?? [];
  }

  async createJob(job: { kind: JobKind; user_id: string | null; run_at: Date; payload?: Record<string, unknown>; dedupe_key?: string | null; max_attempts?: number }): Promise<JobRow | null> {
    const { data, error } = await this.client
      .from("jobs")
      .insert({ kind: job.kind, user_id: job.user_id, run_at: job.run_at.toISOString(), payload: job.payload ?? {}, dedupe_key: job.dedupe_key ?? null, max_attempts: job.max_attempts ?? 3 })
      .select(SupabaseDb.JOB_COLS)
      .single();
    if (error) {
      if (error.code === "23505") return null;
      this.fail("createJob", error);
    }
    return data as unknown as JobRow;
  }

  async finishJob(id: string, error: string | null = null, retryAt: Date | null = null): Promise<JobRow | null> {
    const { data, error: rpcError } = await this.client.rpc("finish_job", { p_job_id: id, p_error: error, p_retry_at: retryAt ? retryAt.toISOString() : null });
    if (rpcError) this.fail("finishJob", rpcError);
    return (data as unknown as JobRow | null) ?? null;
  }

  async cancelJobs(userId: string, kind: JobKind): Promise<number> {
    const { data, error } = await this.client.from("jobs").update({ status: "cancelled" }).eq("user_id", userId).eq("kind", kind).eq("status", "queued").select("id");
    if (error) this.fail("cancelJobs", error);
    return data?.length ?? 0;
  }

  async cancelJob(id: string): Promise<void> {
    const { error } = await this.client.from("jobs").update({ status: "cancelled" }).eq("id", id).eq("status", "queued");
    if (error) this.fail("cancelJob", error);
  }

  async claimDueJobs(limit: number): Promise<JobRow[]> {
    const { data, error } = await this.client.rpc("claim_due_jobs", { p_limit: limit });
    if (error) this.fail("claimDueJobs", error);
    return ((data as JobRow[] | null) ?? []).map((j) => ({ id: j.id, user_id: j.user_id, kind: j.kind, run_at: j.run_at, payload: j.payload, status: j.status, attempts: j.attempts, max_attempts: j.max_attempts, last_error: j.last_error, dedupe_key: j.dedupe_key }));
  }

  async createReminder(row: NewReminder): Promise<ReminderRow> {
    const { data, error } = await this.client
      .from("reminders")
      .insert({ user_id: row.user_id, text: row.text, due_at: row.due_at.toISOString(), recurrence: row.recurrence ?? null })
      .select(SupabaseDb.REM_COLS)
      .single();
    if (error) this.fail("createReminder", error);
    return data as unknown as ReminderRow;
  }

  async getReminder(id: string): Promise<ReminderRow | null> {
    const { data, error } = await this.client.from("reminders").select(SupabaseDb.REM_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getReminder", error);
    return (data as unknown as ReminderRow | null) ?? null;
  }

  async updateReminder(id: string, patch: Partial<Pick<ReminderRow, "text" | "status" | "due_at" | "job_id" | "recurrence" | "last_fired_at">>): Promise<ReminderRow | null> {
    const { data, error } = await this.client.from("reminders").update(patch).eq("id", id).select(SupabaseDb.REM_COLS).maybeSingle();
    if (error) this.fail("updateReminder", error);
    return (data as unknown as ReminderRow | null) ?? null;
  }

  async listReminders(userId: string, opts: { statuses: ReminderStatus[]; dueFrom?: Date; dueBefore?: Date; limit?: number }): Promise<ReminderRow[]> {
    let q = this.client.from("reminders").select(SupabaseDb.REM_COLS).eq("user_id", userId).in("status", opts.statuses);
    if (opts.dueFrom) q = q.gte("due_at", opts.dueFrom.toISOString());
    if (opts.dueBefore) q = q.lt("due_at", opts.dueBefore.toISOString());
    const { data, error } = await q.order("due_at", { ascending: true }).limit(opts.limit ?? 100);
    if (error) this.fail("listReminders", error);
    return (data as unknown as ReminderRow[]) ?? [];
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
      pending_action_id: entry.pending_action_id ?? null,
      agent_key: entry.agent_key ?? null,
      agent_name: entry.agent_name ?? null,
    });
    if (error) this.fail("addAudit", error);
  }

  // ---- agents (0006). Every query is scoped by user_id, also when the id is known. ----

  /** Agent writes: the trigger / constraint errors become AgentLimitError, AgentPlanError, AgentNameTakenError … */
  private failAgent(op: string, error: { code?: string; message: string; details?: string } | null): never {
    const mapped = agentErrorFromPostgres(error);
    if (mapped) throw mapped;
    this.fail(op, error);
  }

  async listAgents(userId: string): Promise<AgentRow[]> {
    const { data, error } = await this.client
      .from("agents")
      .select(SupabaseDb.AGENT_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) this.fail("listAgents", error);
    return (data as unknown as AgentRow[]) ?? [];
  }

  async getAgent(userId: string, id: string): Promise<AgentRow | null> {
    const { data, error } = await this.client.from("agents").select(SupabaseDb.AGENT_COLS).eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) this.fail("getAgent", error);
    return (data as unknown as AgentRow | null) ?? null;
  }

  async createAgent(row: NewAgent): Promise<AgentRow> {
    const { data, error } = await this.client
      .from("agents")
      .insert({
        user_id: row.user_id,
        name: row.name,
        role: row.role,
        template: row.template ?? null,
        instructions: row.instructions ?? null,
        tools: row.tools ?? [],
        permissions: row.permissions ?? {},
        enabled: row.enabled ?? true,
      })
      .select(SupabaseDb.AGENT_COLS)
      .single();
    if (error) this.failAgent("createAgent", error);
    return data as unknown as AgentRow;
  }

  async updateAgent(userId: string, id: string, patch: AgentPatch): Promise<AgentRow | null> {
    const allowed: AgentPatch = {};
    if (patch.name !== undefined) allowed.name = patch.name;
    if (patch.instructions !== undefined) allowed.instructions = patch.instructions;
    if (patch.tools !== undefined) allowed.tools = patch.tools;
    if (patch.permissions !== undefined) allowed.permissions = patch.permissions;
    if (patch.enabled !== undefined) allowed.enabled = patch.enabled;
    const { data, error } = await this.client.from("agents").update(allowed).eq("user_id", userId).eq("id", id).select(SupabaseDb.AGENT_COLS).maybeSingle();
    if (error) this.failAgent("updateAgent", error);
    return (data as unknown as AgentRow | null) ?? null;
  }

  async deleteAgent(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.client.from("agents").delete().eq("user_id", userId).eq("id", id).select("id");
    if (error) this.fail("deleteAgent", error);
    return (data?.length ?? 0) > 0;
  }

  async countAgentActionsSince(userId: string, agentKey: AgentKey, since: Date): Promise<number> {
    const { count, error } = await this.client
      .from("pending_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("agent_key", agentKey)
      .gte("created_at", since.toISOString())
      .not("status", "in", "(cancelled,expired,failed)");
    if (error) this.fail("countAgentActionsSince", error);
    return count ?? 0;
  }

  // ---- billing approvals (0007_billing_whatsapp.sql) ----
  private static approval(row: unknown): BillingApprovalRow {
    const r = row as BillingApprovalRow;
    return { ...r, amount_ils: Number(r.amount_ils) };
  }

  async createBillingApproval(row: NewBillingApproval): Promise<BillingApprovalRow> {
    // expires_at / created_at come from the DB defaults (now() + 10 minutes, enforced by a CHECK)
    const { data, error } = await this.client
      .from("billing_approvals")
      .insert({ user_id: row.user_id, kind: row.kind, plan: row.plan, amount_ils: row.amount_ils, details: row.details ?? {}, phone_e164: row.phone_e164 })
      .select(SupabaseDb.BA_COLS)
      .single();
    if (error) this.fail("createBillingApproval", error);
    return SupabaseDb.approval(data);
  }

  async openRenewalCharge(row: { user_id: string; plan: "basic" | "pro"; amount_ils: number; details?: Record<string, unknown> }): Promise<BillingApprovalRow | null> {
    const { data, error } = await this.client
      .from("billing_approvals")
      .insert({ user_id: row.user_id, kind: "renewal", plan: row.plan, amount_ils: row.amount_ils, details: row.details ?? {}, phone_e164: null, status: "processing" })
      .select(SupabaseDb.BA_COLS)
      .single();
    if (error) {
      if (error.code === "23505") return null; // another charge of this user is open (billing_approvals_one_open_charge_per_user)
      this.fail("openRenewalCharge", error);
    }
    return SupabaseDb.approval(data);
  }

  async getBillingApproval(id: string): Promise<BillingApprovalRow | null> {
    const { data, error } = await this.client.from("billing_approvals").select(SupabaseDb.BA_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getBillingApproval", error);
    return data ? SupabaseDb.approval(data) : null;
  }

  async claimBillingApproval(id: string, claim: { userId: string; phoneE164: string; waMessageId: string }): Promise<BillingApprovalRow | null> {
    const { data, error } = await this.client.rpc("claim_billing_approval", { p_id: id, p_user_id: claim.userId, p_phone: claim.phoneE164, p_msg_id: claim.waMessageId });
    if (error) this.fail("claimBillingApproval", error);
    const rows = (data as unknown[] | null) ?? [];
    return rows.length ? SupabaseDb.approval(rows[0]) : null;
  }

  async updateBillingApproval(id: string, patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error" | "details">>, fromStatus?: BillingApprovalStatus[]): Promise<BillingApprovalRow | null> {
    let q = this.client.from("billing_approvals").update(patch).eq("id", id);
    if (fromStatus) q = q.in("status", fromStatus);
    const { data, error } = await q.select(SupabaseDb.BA_COLS).maybeSingle();
    if (error) this.fail("updateBillingApproval", error);
    return data ? SupabaseDb.approval(data) : null;
  }

  async listBillingApprovals(userId: string, opts: { statuses?: BillingApprovalStatus[]; kinds?: BillingApprovalKind[]; limit?: number } = {}): Promise<BillingApprovalRow[]> {
    let q = this.client.from("billing_approvals").select(SupabaseDb.BA_COLS).eq("user_id", userId);
    if (opts.statuses) q = q.in("status", opts.statuses);
    if (opts.kinds) q = q.in("kind", opts.kinds);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 50);
    if (error) this.fail("listBillingApprovals", error);
    return ((data as unknown[] | null) ?? []).map((r) => SupabaseDb.approval(r));
  }

  async raiseUsageLimit(userId: string, newLimit: number): Promise<number | null> {
    const { data, error } = await this.client.rpc("raise_plan_limit", { p_user_id: userId, p_new_limit: newLimit });
    if (error) this.fail("raiseUsageLimit", error);
    return typeof data === "number" ? data : null;
  }

  async lowerUsageLimit(userId: string, newLimit: number): Promise<number | null> {
    const { data, error } = await this.client.rpc("lower_plan_limit", { p_user_id: userId, p_new_limit: newLimit });
    if (error) this.fail("lowerUsageLimit", error);
    return typeof data === "number" ? data : null;
  }
}
