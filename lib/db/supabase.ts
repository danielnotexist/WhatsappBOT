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
  NewOwnerAlert,
  OwnerAlertChannel,
  OwnerAlertClaimResult,
  OwnerAlertRow,
  OwnerAlertStatus,
  AnalyticsReport,
  FunnelStep,
  NewPageEvent,
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
  LinkAttemptInput,
  LinkAttemptResult,
  LinkConsumeResult,
  LinkTokenRow,
  MessageRow,
  NewMessage,
  NewReminder,
  OtpCheckResult,
  OtpIssueInput,
  OtpIssueResult,
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
  ReferralRow,
} from "./types";

/** An id from a button press is checked before it reaches a uuid column (Postgres would answer 22P02). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  private static SUB_COLS = "id,user_id,plan,status,next_charge_at,cancelled_at,started_at,charge_failures,hyp_tokef,scheduled_plan,billing_cycle,scheduled_cycle";
  private static PAY_COLS = "id,user_id,hyp_trans_id,amount_ils,ccode,acode,invoice_url,raw,created_at,approval_id,billing_cycle";
  private static BA_COLS = "id,user_id,kind,plan,amount_ils,details,phone_e164,status,expires_at,approved_msg_id,approved_at,hyp_trans_id,ccode,error,created_at,billing_cycle";
  private static REFCODE_COLS = "user_id,code,created_at";
  private static REF_COLS = "id,referrer_id,referred_user_id,code,status,reason,referrer_reward,referred_reward,created_at,rewarded_at,payment_id";
  private static JOB_COLS = "id,user_id,kind,run_at,payload,status,attempts,max_attempts,last_error,dedupe_key";
  private static TICKET_COLS = "id,created_at,user_id,name,email,subject,body,transcript,status";
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

  /** One atomic UPDATE (0025 profile_merge): never a read-modify-write of the whole profile. */
  async mergeUserProfile(id: string, patch: Record<string, unknown>, opts: { deep?: readonly string[] } = {}): Promise<UserRow> {
    if (!UUID_RE.test(id)) throw new Error("user not found");
    const { data, error } = await this.client.rpc("profile_merge", { p_user_id: id, p_patch: patch, p_deep: [...(opts.deep ?? [])] });
    if (error) {
      if (/user not found/.test(error.message)) throw new Error("user not found");
      // 0025 not applied yet: the old read-then-write, loudly, so a deploy ahead of the migration keeps working
      if ((error as { code?: string }).code === "PGRST202" || /could not find the function/i.test(error.message)) {
        console.error("[db] profile_merge missing — run supabase/migrations/0025_privacy_retention.sql; using the non-atomic merge");
        return this.mergeUserProfileUnsafe(id, patch, opts.deep ?? []);
      }
      this.fail("mergeUserProfile", error);
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) throw new Error("user not found");
    const cols = SupabaseDb.USER_COLS.split(",");
    return Object.fromEntries(cols.map((c) => [c, row[c] ?? null])) as unknown as UserRow;
  }

  private async mergeUserProfileUnsafe(id: string, patch: Record<string, unknown>, deep: readonly string[]): Promise<UserRow> {
    const current = await this.getUser(id);
    if (!current) throw new Error("user not found");
    const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
    const next: Record<string, unknown> = { ...current.profile };
    for (const [key, value] of Object.entries(patch)) next[key] = deep.includes(key) && isObject(value) && isObject(next[key]) ? { ...next[key], ...value } : value;
    return this.updateUserProfile(id, { profile: next } as Partial<UserRow>);
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
    // 0020 wa_identity_link: an unlinked row of the same number is re-assigned; an active / blocked one is never taken over
    const { data, error } = await this.client.rpc("wa_identity_link", { p_user_id: userId, p_phone: phoneE164, p_wa_name: waName });
    if (error) this.fail("createWaIdentity", error);
    const r = data as unknown as WaIdentityRow & { created_at?: string; updated_at?: string };
    return { id: r.id, user_id: r.user_id, phone_e164: r.phone_e164, wa_name: r.wa_name, linked_at: r.linked_at, status: r.status };
  }

  async recordLinkAttempt(phoneE164: string, input: LinkAttemptInput): Promise<LinkAttemptResult> {
    const { data, error } = await this.client.rpc("wa_link_attempt", {
      p_phone: phoneE164,
      p_strike: input.strike,
      p_message_id: input.waMessageId,
      p_max_attempts: input.maxAttempts,
      p_block_seconds: Math.ceil(input.blockMs / 1000),
      p_pointer_seconds: Math.ceil(input.pointerEveryMs / 1000),
    });
    if (error) this.fail("recordLinkAttempt", error);
    const r = data as { attempts: number; blocked: boolean; reply: boolean };
    return { attempts: Number(r.attempts), blocked: Boolean(r.blocked), reply: Boolean(r.reply) };
  }

  async isPhoneBlocked(phoneE164: string): Promise<boolean> {
    const { data, error } = await this.client.from("wa_link_attempts").select("blocked_until").eq("phone_e164", phoneE164).maybeSingle();
    if (error) this.fail("isPhoneBlocked", error);
    const until = (data as { blocked_until: string | null } | null)?.blocked_until;
    return Boolean(until && Date.parse(until) > Date.now());
  }

  async insertMessage(row: NewMessage): Promise<MessageRow | null> {
    // messages.tools (0015) is named only when a tool ran, so a reply without tools never depends on the column
    const { tools, ...rest } = row;
    const insert = tools?.length ? { ...rest, tools } : rest;
    const { data, error } = await this.client.from("messages").insert(insert).select(SupabaseDb.MSG_COLS).single();
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

  /** One conditional UPDATE … RETURNING: Postgres re-checks `status = 'pending'` on a row another press just changed. */
  async claimPendingAction(id: string, userId: string, status: "approved" | "cancelled" | "edited", now: Date, patch: Partial<Pick<PendingActionRow, "approved_msg_id">> = {}): Promise<PendingActionRow | null> {
    if (!UUID_RE.test(id) || !UUID_RE.test(userId)) return null;
    const { data, error } = await this.client
      .from("pending_actions")
      .update({ ...patch, status })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", now.toISOString())
      .select(SupabaseDb.PA_COLS)
      .maybeSingle();
    if (error) this.fail("claimPendingAction", error);
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

  async issueOtp(input: OtpIssueInput): Promise<OtpIssueResult> {
    const { data, error } = await this.client.rpc("otp_issue", {
      p_email: input.email,
      p_mailbox: input.mailbox,
      p_requester: input.requester,
      p_challenge_hash: input.challengeHash,
      p_code_hash: input.codeHash,
      p_expires_at: input.expiresAt.toISOString(),
      p_cooldown_seconds: Math.ceil(input.cooldownMs / 1000),
      p_max_per_requester: input.maxPerRequester,
      p_max_per_mailbox: input.maxPerMailbox,
      p_max_global: input.maxGlobal,
      p_max_per_requester_all: input.maxPerRequesterAll ?? null,
    });
    if (error) this.fail("issueOtp", error);
    const r = data as { status: OtpIssueResult["status"]; retry_after?: number; id?: string };
    return r.status === "ok" ? { status: "ok", id: String(r.id) } : { status: r.status, retryAfterSeconds: Number(r.retry_after ?? 60) };
  }

  async checkOtp(input: { email: string; challengeHash: string | null; codeHash: string; maxAttempts: number }): Promise<OtpCheckResult> {
    const { data, error } = await this.client.rpc("otp_check", {
      p_email: input.email,
      p_challenge_hash: input.challengeHash,
      p_code_hash: input.codeHash,
      p_max_attempts: input.maxAttempts,
    });
    if (error) this.fail("checkOtp", error);
    const r = data as { status: OtpCheckResult["status"]; attempts_left?: number };
    return { status: r.status, attemptsLeft: Number(r.attempts_left ?? 0) };
  }

  async createLinkToken(userId: string, token: { id: string; tokenHash: string }, expiresAt: Date): Promise<LinkTokenRow> {
    const { data, error } = await this.client
      .from("link_tokens")
      .insert({ id: token.id, user_id: userId, token_hash: token.tokenHash, expires_at: expiresAt.toISOString() })
      .select("*")
      .single();
    if (error) this.fail("createLinkToken", error);
    return data as unknown as LinkTokenRow;
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

  async consumeLinkToken(input: { tokenHash: string; phoneE164: string; waName: string | null; phoneHash: string | null }): Promise<LinkConsumeResult> {
    const { data, error } = await this.client.rpc("link_token_consume", {
      p_token_hash: input.tokenHash,
      p_phone: input.phoneE164,
      p_wa_name: input.waName,
      p_phone_hash: input.phoneHash,
    });
    if (error) this.fail("consumeLinkToken", error);
    const r = data as { result: LinkConsumeResult["result"]; user_id?: string; other_phone?: string; trial_reused?: boolean };
    if (r.result === "linked") return { result: "linked", userId: String(r.user_id), trialReused: Boolean(r.trial_reused) };
    if (r.result === "second_phone") return { result: "second_phone", userId: String(r.user_id), otherPhone: String(r.other_phone) };
    return { result: r.result };
  }

  async findLinkToken(tokenHash: string): Promise<LinkTokenRow | null> {
    const { data, error } = await this.client.from("link_tokens").select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) this.fail("findLinkToken", error);
    return (data as unknown as LinkTokenRow | null) ?? null;
  }

  async consumeConnectLink(nonceHash: string, userId: string, expiresAt: Date): Promise<boolean> {
    if (!UUID_RE.test(userId)) return false;
    const { data, error } = await this.client.rpc("connect_link_consume", { p_nonce_hash: nonceHash, p_user_id: userId, p_expires_at: expiresAt.toISOString() });
    if (error) this.fail("consumeConnectLink", error);
    return data === true;
  }

  async consumeLoginToken(userId: string, nonceHash: string): Promise<boolean> {
    if (!UUID_RE.test(userId)) return false;
    const { data, error } = await this.client.rpc("login_token_consume", { p_user_id: userId, p_nonce_hash: nonceHash });
    if (error) this.fail("consumeLoginToken", error);
    return data === true;
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
    // as MemoryDb: a revoked connection keeps no Graph subscription (the FK cascade fires only on delete), so a late
    // notification for it matches nothing (app/api/graph/notify)
    if (data) {
      const del = await this.client.from("graph_subscriptions").delete().eq("connection_id", id);
      if (del.error) this.fail("revokeConnection", del.error);
    }
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

  async rekeyGoogleScopeGrants(from: string, to: string): Promise<void> {
    if (from === to) return;
    const { data, error } = await this.client.from("google_scope_grants").select("scope").eq("account_hash", from);
    if (error) this.fail("rekeyGoogleScopeGrants", error);
    for (const { scope } of (data as { scope: string }[] | null) ?? []) {
      const { error: moveError } = await this.client.from("google_scope_grants").update({ account_hash: to }).eq("account_hash", from).eq("scope", scope);
      if (moveError?.code === "23505") {
        // already recorded under the new hash: the legacy duplicate goes
        const { error: delError } = await this.client.from("google_scope_grants").delete().eq("account_hash", from).eq("scope", scope);
        if (delError) this.fail("rekeyGoogleScopeGrants", delError);
      } else if (moveError) this.fail("rekeyGoogleScopeGrants", moveError);
    }
  }

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

  async setOpsFlag(key: string, value: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from("ops_flags").upsert({ key, value }, { onConflict: "key" });
    if (error) this.fail("setOpsFlag", error);
  }

  // ---- owner_alerts (0016) ----

  private static readonly OWNER_ALERT_COLS = "id, created_at, type, dedupe_key, status, channel, subject, payload, sent_at, error";

  async claimOwnerAlert(row: NewOwnerAlert): Promise<{ result: OwnerAlertClaimResult; alert: OwnerAlertRow | null }> {
    const { data, error } = await this.client.rpc("owner_alert_claim", {
      p_type: row.type,
      p_dedupe_key: row.dedupe_key,
      p_subject: row.subject,
      p_payload: row.payload,
      p_queue: row.queue,
      p_max: row.limit ? row.limit.max : null,
      p_window: row.limit ? `${Math.max(Math.round(row.limit.windowMs / 1000), 1)} seconds` : null,
    });
    if (error) this.fail("claimOwnerAlert", error);
    const r = (data ?? {}) as { result?: string; id?: string };
    const result: OwnerAlertClaimResult = r.result === "claimed" || r.result === "queued" || r.result === "limited" ? r.result : "duplicate";
    if (result === "duplicate" || !r.id) return { result: "duplicate", alert: null };
    const { data: alert, error: readError } = await this.client.from("owner_alerts").select(SupabaseDb.OWNER_ALERT_COLS).eq("id", r.id).maybeSingle();
    if (readError) this.fail("claimOwnerAlert", readError);
    return { result, alert: (alert as unknown as OwnerAlertRow | null) ?? null };
  }

  async finishOwnerAlerts(ids: string[], patch: { status: OwnerAlertStatus; channel?: OwnerAlertChannel | null; error?: string | null }): Promise<void> {
    if (!ids.length) return;
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.channel !== undefined) update.channel = patch.channel;
    if (patch.error !== undefined) update.error = patch.error === null ? null : patch.error.slice(0, 500);
    if (patch.status === "sent") update.sent_at = new Date().toISOString();
    const { error } = await this.client.from("owner_alerts").update(update).in("id", ids);
    if (error) this.fail("finishOwnerAlerts", error);
  }

  async takeQueuedOwnerAlerts(limit: number): Promise<OwnerAlertRow[]> {
    const { data, error } = await this.client.rpc("owner_alerts_take_queued", { p_limit: limit });
    if (error) this.fail("takeQueuedOwnerAlerts", error);
    return ((data as unknown as OwnerAlertRow[]) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listOwnerAlerts(limit: number): Promise<OwnerAlertRow[]> {
    const { data, error } = await this.client.from("owner_alerts").select(SupabaseDb.OWNER_ALERT_COLS).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("listOwnerAlerts", error);
    return (data as unknown as OwnerAlertRow[]) ?? [];
  }

  // ---- ai_spend / ai_spend_users (migrations 0009, 0010) ----

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

  async reserveAiSpend(day: string, costUsd: number, budgetUsd: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_reserve", { p_day: day, p_cost: Number.isFinite(costUsd) ? costUsd : 0, p_budget: budgetUsd });
    if (error) this.fail("reserveAiSpend", error);
    return Number(data ?? -1);
  }

  async adjustAiSpend(day: string, deltaUsd: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_adjust", { p_day: day, p_delta: Number.isFinite(deltaUsd) ? deltaUsd : 0 });
    if (error) this.fail("adjustAiSpend", error);
    return Number(data ?? 0);
  }

  async getAiPoolSpend(pool: string, day: string): Promise<number> {
    const { data, error } = await this.client.from("ai_spend_pools").select("cost_usd").eq("pool", pool).eq("day", day).maybeSingle();
    if (error) this.fail("getAiPoolSpend", error);
    return Number((data as { cost_usd: number | string } | null)?.cost_usd ?? 0);
  }

  async reserveAiPoolSpend(pool: string, day: string, costUsd: number, budgetUsd: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_pool_reserve", { p_pool: pool, p_day: day, p_cost: Number.isFinite(costUsd) ? costUsd : 0, p_budget: budgetUsd });
    if (error) this.fail("reserveAiPoolSpend", error);
    return Number(data ?? -1);
  }

  async adjustAiPoolSpend(pool: string, day: string, deltaUsd: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_pool_adjust", { p_pool: pool, p_day: day, p_delta: Number.isFinite(deltaUsd) ? deltaUsd : 0 });
    if (error) this.fail("adjustAiPoolSpend", error);
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

  async getJob(id: string): Promise<JobRow | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.client.from("jobs").select(SupabaseDb.JOB_COLS).eq("id", id).maybeSingle();
    if (error) this.fail("getJob", error);
    return (data as unknown as JobRow | null) ?? null;
  }

  async finishJob(id: string, error: string | null = null, retryAt: Date | null = null, attempts: number | null = null): Promise<JobRow | null> {
    const { data, error: rpcError } = await this.client.rpc("finish_job", { p_job_id: id, p_error: error, p_retry_at: retryAt ? retryAt.toISOString() : null, p_attempts: attempts });
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

  // ---- support_tickets (migration 0011) ----
  async createSupportTicket(row: NewSupportTicket): Promise<SupportTicketRow> {
    const { data, error } = await this.client.from("support_tickets").insert(row).select(SupabaseDb.TICKET_COLS).single();
    if (error) this.fail("createSupportTicket", error);
    return data as unknown as SupportTicketRow;
  }

  // ---- the admin panel (migration 0015). Reads across users: called only behind requireOwner() (lib/admin/auth.ts). ----

  private static ADMIN_USER_COLS = `${SupabaseDb.USER_COLS},signup_source,last_seen_at`;
  private static ADMIN_TICKET_COLS = `${SupabaseDb.TICKET_COLS},admin_note,status_changed_at`;
  private static CHAT_COLS = "id,user_id,page,turns,created_at,updated_at";
  private static ERROR_COLS = "id,at,user_id,source,message,context";
  private static AUDIT_COLS = "user_id,action,target,reason,result,approved_by_msg_id,pending_action_id,agent_key,agent_name,created_at";

  async setSignupSource(userId: string, source: SignupSource): Promise<void> {
    const { error } = await this.client.from("users").update({ signup_source: source }).eq("id", userId).is("signup_source", null);
    if (error) this.fail("setSignupSource", error);
  }

  async touchLastSeen(userId: string, at: Date, minIntervalMs: number): Promise<void> {
    const before = new Date(at.getTime() - minIntervalMs).toISOString();
    const { error } = await this.client
      .from("users")
      .update({ last_seen_at: at.toISOString() })
      .eq("id", userId)
      .or(`last_seen_at.is.null,last_seen_at.lt.${before}`);
    if (error) this.fail("touchLastSeen", error);
  }

  async adminUserOverview(): Promise<AdminUserRow[]> {
    const { data, error } = await this.client.rpc("admin_user_overview");
    if (error) this.fail("adminUserOverview", error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as AdminUserRow),
      providers: ((r.providers as string[] | null) ?? []) as AdminUserRow["providers"],
      ai_cost_30d: Number(r.ai_cost_30d ?? 0),
      charge_failures: Number(r.charge_failures ?? 0),
      billing_cycle: r.billing_cycle === "annual" ? "annual" : r.billing_cycle === "monthly" ? "monthly" : null,
      referred: r.referred === true,
    }));
  }

  // ---- page_events (migration 0017) ----

  async insertPageEvent(row: NewPageEvent): Promise<void> {
    const insert = (r: NewPageEvent) => this.client.from("page_events").insert(r);
    let { error } = await insert(row);
    // a session cookie of an account deleted since: keep the anonymous row, without the link (FK violation)
    if (error && (error as { code?: string }).code === "23503" && row.user_id) ({ error } = await insert({ ...row, user_id: null }));
    if (error) this.fail("insertPageEvent", error);
  }

  async analyticsReport(fromDay: string, toDay: string, opts: { top?: number } = {}): Promise<AnalyticsReport> {
    const range = { p_from: fromDay, p_to: toDay };
    const top = Math.min(Math.max(opts.top ?? 10, 1), 100);
    const [daily, pages, sources, devices, funnel] = await Promise.all([
      this.client.rpc("analytics_daily", range),
      this.client.rpc("analytics_top_pages", { ...range, p_limit: top }),
      this.client.rpc("analytics_sources", { ...range, p_limit: top }),
      this.client.rpc("analytics_devices", range),
      this.client.rpc("analytics_funnel", range),
    ]);
    for (const r of [daily, pages, sources, devices, funnel]) if (r.error) this.fail("analyticsReport", r.error);
    const rows = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[];
    return {
      daily: rows(daily).map((r) => ({ day: String(r.day), visitors: Number(r.visitors ?? 0), views: Number(r.views ?? 0) })),
      pages: rows(pages).map((r) => ({ path: String(r.path), views: Number(r.views ?? 0), visitors: Number(r.visitors ?? 0) })),
      sources: rows(sources).map((r) => ({
        source: r.source === null || r.source === undefined ? null : String(r.source),
        kind: r.kind === "utm" || r.kind === "referrer" ? r.kind : "direct",
        visitors: Number(r.visitors ?? 0),
      })),
      devices: (["mobile", "desktop"] as const).map((device) => ({ device, visitors: Number(rows(devices).find((r) => r.device === device)?.visitors ?? 0) })),
      funnel: rows(funnel)
        .slice()
        .sort((a, b) => Number(a.ord) - Number(b.ord))
        .map((r) => ({ step: String(r.step) as FunnelStep, count: Number(r.actors ?? 0) })),
    };
  }

  async adminDailyStats(fromDay: string, toDay: string): Promise<AdminDailyRow[]> {
    const { data, error } = await this.client.rpc("admin_daily_stats", { p_from: fromDay, p_to: toDay });
    if (error) this.fail("adminDailyStats", error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      day: String(r.day),
      signups: Number(r.signups ?? 0),
      active_users: Number(r.active_users ?? 0),
      messages: Number(r.messages ?? 0),
      ai_cost: Number(r.ai_cost ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  }

  async adminGetUser(id: string): Promise<UserRow | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.client.from("users").select(SupabaseDb.ADMIN_USER_COLS).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) this.fail("adminGetUser", error);
    return (data as unknown as UserRow | null) ?? null;
  }

  async adminMessages(userId: string, opts: { before?: string; limit: number }): Promise<MessageRow[]> {
    let q = this.client.from("messages").select(`${SupabaseDb.MSG_COLS},tools`).eq("user_id", userId);
    if (opts.before) q = q.lt("created_at", opts.before);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit);
    if (error) this.fail("adminMessages", error);
    return (data as unknown as MessageRow[]) ?? [];
  }

  async adminAudit(userId: string, limit: number): Promise<AuditRow[]> {
    const { data, error } = await this.client.from("audit_log").select(SupabaseDb.AUDIT_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("adminAudit", error);
    return (data as unknown as AuditRow[]) ?? [];
  }

  async adminJobs(userId: string, limit: number): Promise<JobRow[]> {
    const { data, error } = await this.client.from("jobs").select(SupabaseDb.JOB_COLS).eq("user_id", userId).order("run_at", { ascending: false }).limit(limit);
    if (error) this.fail("adminJobs", error);
    return (data as unknown as JobRow[]) ?? [];
  }

  async adminFailedJobs(since: Date, limit: number): Promise<JobRow[]> {
    const { data, error } = await this.client.from("jobs").select(SupabaseDb.JOB_COLS).eq("status", "failed").gte("updated_at", since.toISOString()).order("updated_at", { ascending: false }).limit(limit);
    if (error) this.fail("adminFailedJobs", error);
    return (data as unknown as JobRow[]) ?? [];
  }

  async adminProactiveAlerts(userId: string, limit: number): Promise<ProactiveAlertRow[]> {
    const { data, error } = await this.client.from("proactive_alerts").select(SupabaseDb.PROACTIVE_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("adminProactiveAlerts", error);
    return (data as unknown as ProactiveAlertRow[]) ?? [];
  }

  async adminMeetingSummaries(userId: string, limit: number): Promise<MeetingSummaryRow[]> {
    const { data, error } = await this.client.from("meeting_summaries").select(SupabaseDb.MEETING_COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("adminMeetingSummaries", error);
    return (data as unknown as MeetingSummaryRow[]) ?? [];
  }

  async listSupportTickets(opts: { status?: SupportTicketStatus; userId?: string; limit: number }): Promise<SupportTicketRow[]> {
    let q = this.client.from("support_tickets").select(SupabaseDb.ADMIN_TICKET_COLS);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit);
    if (error) this.fail("listSupportTickets", error);
    return (data as unknown as SupportTicketRow[]) ?? [];
  }

  async setSupportTicketStatus(id: string, status: SupportTicketStatus, note?: string | null): Promise<SupportTicketRow | null> {
    if (!UUID_RE.test(id)) return null;
    const patch: Record<string, unknown> = { status, status_changed_at: new Date().toISOString() };
    if (note !== undefined) patch.admin_note = note?.trim() ? note.trim().slice(0, 2000) : null;
    const { data, error } = await this.client.from("support_tickets").update(patch).eq("id", id).select(SupabaseDb.ADMIN_TICKET_COLS).maybeSingle();
    if (error) this.fail("setSupportTicketStatus", error);
    return (data as unknown as SupportTicketRow | null) ?? null;
  }

  async appendSupportChat(id: string, row: { userId: string | null; page: string | null; turns: SupportChatTurn[]; max?: number }): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const { data, error } = await this.client.rpc("support_chat_append", { p_id: id, p_user: row.userId, p_page: row.page, p_turns: row.turns, p_max: row.max ?? 60 });
    if (error) this.fail("appendSupportChat", error);
    return data === true;
  }

  async listSupportChats(opts: { userId?: string; limit: number }): Promise<SupportChatRow[]> {
    let q = this.client.from("support_chats").select(SupabaseDb.CHAT_COLS);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(opts.limit);
    if (error) this.fail("listSupportChats", error);
    return (data as unknown as SupportChatRow[]) ?? [];
  }

  async insertAppError(row: NewAppError): Promise<void> {
    const { error } = await this.client.from("app_errors").insert({ user_id: row.user_id ?? null, source: row.source, message: row.message, context: row.context ?? {} });
    if (error) this.fail("insertAppError", error);
  }

  async listAppErrors(opts: { source?: string; userId?: string; limit: number }): Promise<AppErrorRow[]> {
    let q = this.client.from("app_errors").select(SupabaseDb.ERROR_COLS);
    if (opts.source) q = q.eq("source", opts.source);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q.order("at", { ascending: false }).limit(opts.limit);
    if (error) this.fail("listAppErrors", error);
    return (data as unknown as AppErrorRow[]) ?? [];
  }

  // ---- proactive_alerts (0013) ----

  private static readonly PROACTIVE_COLS = "id, user_id, item_key, kind, channel, status, local_day, payload, created_at";

  async claimProactiveAlert(item: NewProactiveItem, opts: { cap: number; deliver: boolean }): Promise<{ result: ProactiveClaimResult; alert: ProactiveAlertRow | null }> {
    const { data, error } = await this.client.rpc("proactive_alert_claim", {
      p_user: item.user_id,
      p_item_key: item.item_key,
      p_kind: item.kind,
      p_day: item.local_day,
      p_payload: item.payload,
      p_cap: opts.cap,
      p_deliver: opts.deliver,
    });
    if (error) this.fail("claimProactiveAlert", error);
    const r = (data ?? {}) as { result?: string; id?: string };
    const result: ProactiveClaimResult = r.result === "claimed" || r.result === "cap" || r.result === "deferred" ? r.result : "duplicate";
    if (result === "duplicate" || !r.id) return { result, alert: null };
    return { result, alert: await this.getProactiveAlert(item.user_id, r.id) };
  }

  async addProactiveSummaryItem(item: NewProactiveItem): Promise<ProactiveAlertRow> {
    const { data, error } = await this.client
      .from("proactive_alerts")
      .upsert({ ...item, channel: "summary", status: "listed" }, { onConflict: "user_id,channel,item_key,local_day" })
      .select(SupabaseDb.PROACTIVE_COLS)
      .single();
    if (error) this.fail("addProactiveSummaryItem", error);
    return data as unknown as ProactiveAlertRow;
  }

  async getProactiveAlert(userId: string, id: string): Promise<ProactiveAlertRow | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.client.from("proactive_alerts").select(SupabaseDb.PROACTIVE_COLS).eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) this.fail("getProactiveAlert", error);
    return (data as unknown as ProactiveAlertRow | null) ?? null;
  }

  async foldDeferredProactiveAlerts(userId: string, since: Date): Promise<ProactiveAlertRow[]> {
    const { data, error } = await this.client
      .from("proactive_alerts")
      .update({ status: "folded" })
      .eq("user_id", userId)
      .eq("channel", "urgent")
      .eq("status", "deferred")
      .gte("created_at", since.toISOString())
      .select(SupabaseDb.PROACTIVE_COLS);
    if (error) this.fail("foldDeferredProactiveAlerts", error);
    return ((data ?? []) as unknown as ProactiveAlertRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async setProactiveAlertStatus(userId: string, id: string, status: ProactiveStatus): Promise<void> {
    if (status === "listed" || !UUID_RE.test(id)) return;
    const { error } = await this.client.from("proactive_alerts").update({ status }).eq("id", id).eq("user_id", userId).eq("channel", "urgent");
    if (error) this.fail("setProactiveAlertStatus", error);
  }

  // ---- meeting_summaries (0014) ----

  private static readonly MEETING_COLS = "id, user_id, provider, event_key, event_id, title, meeting_start, meeting_end, attendees, content, done, created_at";

  async saveMeetingSummary(row: NewMeetingSummary): Promise<MeetingSummaryRow> {
    // one row per (user, event_key): a second save keeps the first summary (ignoreDuplicates), then reads it back
    const { error } = await this.client.from("meeting_summaries").upsert(row, { onConflict: "user_id,event_key", ignoreDuplicates: true });
    if (error) this.fail("saveMeetingSummary", error);
    const saved = await this.findMeetingSummary(row.user_id, row.event_key);
    if (!saved) this.fail("saveMeetingSummary", { message: "row not found after upsert" });
    return saved;
  }

  async getMeetingSummary(userId: string, id: string): Promise<MeetingSummaryRow | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await this.client.from("meeting_summaries").select(SupabaseDb.MEETING_COLS).eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) this.fail("getMeetingSummary", error);
    return (data as unknown as MeetingSummaryRow | null) ?? null;
  }

  async findMeetingSummary(userId: string, eventKey: string): Promise<MeetingSummaryRow | null> {
    const { data, error } = await this.client.from("meeting_summaries").select(SupabaseDb.MEETING_COLS).eq("user_id", userId).eq("event_key", eventKey).maybeSingle();
    if (error) this.fail("findMeetingSummary", error);
    return (data as unknown as MeetingSummaryRow | null) ?? null;
  }

  async markMeetingSummaryAction(userId: string, id: string, action: MeetingSummaryAction): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    const { data, error } = await this.client.rpc("meeting_summary_mark", { p_user: userId, p_id: id, p_action: action });
    if (error) this.fail("markMeetingSummaryAction", error);
    return data === true;
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
      .insert({ user_id: row.user_id, kind: row.kind, plan: row.plan, amount_ils: row.amount_ils, details: row.details ?? {}, phone_e164: row.phone_e164, billing_cycle: row.billing_cycle ?? "monthly" })
      .select(SupabaseDb.BA_COLS)
      .single();
    if (error) this.fail("createBillingApproval", error);
    return SupabaseDb.approval(data);
  }

  async openRenewalCharge(row: { user_id: string; plan: "basic" | "pro"; amount_ils: number; details?: Record<string, unknown>; billing_cycle?: "monthly" | "annual" }): Promise<BillingApprovalRow | null> {
    const { data, error } = await this.client
      .from("billing_approvals")
      .insert({ user_id: row.user_id, kind: "renewal", plan: row.plan, amount_ils: row.amount_ils, details: row.details ?? {}, phone_e164: null, status: "processing", billing_cycle: row.billing_cycle ?? "monthly" })
      .select(SupabaseDb.BA_COLS)
      .single();
    if (error) {
      if (error.code === "23505") return null; // another charge of this user is open (billing_approvals_one_open_charge_per_user)
      this.fail("openRenewalCharge", error);
    }
    return SupabaseDb.approval(data);
  }

  async openWebCharge(row: NewWebCharge): Promise<BillingApprovalRow | null> {
    const { data, error } = await this.client
      .from("billing_approvals")
      .insert({
        id: row.id,
        user_id: row.user_id,
        kind: "upgrade",
        plan: row.plan,
        billing_cycle: row.billing_cycle ?? "monthly",
        amount_ils: row.amount_ils,
        details: row.details ?? {},
        phone_e164: null,
        status: "processing",
        approved_msg_id: `web:${row.id}`,
        approved_at: new Date().toISOString(),
      })
      .select(SupabaseDb.BA_COLS)
      .single();
    if (error) {
      // the same form again (primary key / approved_msg_id) or another open charge of this user (one_open_charge_per_user)
      if (error.code === "23505") return null;
      this.fail("openWebCharge", error);
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

  // ---- referrals (migration 0018) ----

  async getReferralCode(userId: string): Promise<ReferralCodeRow | null> {
    const { data, error } = await this.client.from("referral_codes").select(SupabaseDb.REFCODE_COLS).eq("user_id", userId).maybeSingle();
    if (error) this.fail("getReferralCode", error);
    return (data as unknown as ReferralCodeRow | null) ?? null;
  }

  async ensureReferralCode(userId: string, generate: () => string): Promise<ReferralCodeRow> {
    for (let i = 0; i < 8; i++) {
      const existing = await this.getReferralCode(userId);
      if (existing) return existing;
      const { data, error } = await this.client.from("referral_codes").insert({ user_id: userId, code: generate().toUpperCase() }).select(SupabaseDb.REFCODE_COLS).single();
      if (!error) return data as unknown as ReferralCodeRow;
      // 23505: the code is taken (try another) or a parallel request made this user's code (read it on the next turn)
      if (error.code !== "23505") this.fail("ensureReferralCode", error);
    }
    throw new Error("Supabase ensureReferralCode: could not make a unique referral code");
  }

  async findReferralCode(code: string): Promise<ReferralCodeRow | null> {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,16}$/.test(c)) return null;
    const { data, error } = await this.client.from("referral_codes").select(SupabaseDb.REFCODE_COLS).eq("code", c).maybeSingle();
    if (error) this.fail("findReferralCode", error);
    if (!data) return null;
    const row = data as unknown as ReferralCodeRow;
    return (await this.getUser(row.user_id)) ? row : null; // the owner deleted the account (soft delete): the code is dead
  }

  async createReferral(row: { referrer_id: string; referred_user_id: string; code: string; status: "pending" | "rejected"; reason?: string | null }): Promise<ReferralRow | null> {
    const { data, error } = await this.client
      .from("referrals")
      .insert({ referrer_id: row.referrer_id, referred_user_id: row.referred_user_id, code: row.code.toUpperCase(), status: row.status, reason: row.reason ?? null })
      .select(SupabaseDb.REF_COLS)
      .single();
    if (error) {
      if (error.code === "23505") return null; // referrals_referred_user_id_key: referred once
      this.fail("createReferral", error);
    }
    return data as unknown as ReferralRow;
  }

  async getReferralOf(referredUserId: string): Promise<ReferralRow | null> {
    const { data, error } = await this.client.from("referrals").select(SupabaseDb.REF_COLS).eq("referred_user_id", referredUserId).maybeSingle();
    if (error) this.fail("getReferralOf", error);
    return (data as unknown as ReferralRow | null) ?? null;
  }

  async listReferralsBy(referrerId: string): Promise<ReferralRow[]> {
    const { data, error } = await this.client.from("referrals").select(SupabaseDb.REF_COLS).eq("referrer_id", referrerId).order("created_at", { ascending: false }).limit(500);
    if (error) this.fail("listReferralsBy", error);
    return (data as unknown as ReferralRow[]) ?? [];
  }

  async rejectReferral(referredUserId: string, reason: string): Promise<ReferralRow | null> {
    const { data, error } = await this.client.from("referrals").update({ status: "rejected", reason }).eq("referred_user_id", referredUserId).eq("status", "pending").select(SupabaseDb.REF_COLS).maybeSingle();
    if (error) this.fail("rejectReferral", error);
    return (data as unknown as ReferralRow | null) ?? null;
  }

  async rewardReferral(referredUserId: string, opts: { paymentId: string | null; days: number; cap: number }): Promise<ReferralRewardResult> {
    const { data, error } = await this.client.rpc("referral_reward", { p_referred: referredUserId, p_payment: opts.paymentId, p_days: opts.days, p_cap: opts.cap });
    if (error) this.fail("rewardReferral", error);
    const r = (data ?? {}) as { result?: string; referral?: ReferralRow | null; referrer_next?: string | null; referred_next?: string | null };
    return { result: r.result === "rewarded" ? "rewarded" : "none", referral: r.referral ?? null, referrerNextChargeAt: r.referrer_next ?? null, referredNextChargeAt: r.referred_next ?? null };
  }

  async applyReferralCredit(userId: string, days: number): Promise<{ applied: number; nextChargeAt: string | null }> {
    const { data, error } = await this.client.rpc("referral_apply_credit", { p_user: userId, p_days: days });
    if (error) this.fail("applyReferralCredit", error);
    const r = (data ?? {}) as { applied?: number; next_charge_at?: string | null };
    return { applied: Number(r.applied ?? 0), nextChargeAt: r.next_charge_at ?? null };
  }

  async adminReferrals(limit: number): Promise<AdminReferralRow[]> {
    const { data, error } = await this.client
      .from("referrals")
      .select(`${SupabaseDb.REF_COLS},referrer:users!referrals_referrer_id_fkey(email),referred:users!referrals_referred_user_id_fkey(email)`)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) this.fail("adminReferrals", error);
    return ((data ?? []) as unknown as (ReferralRow & { referrer: { email: string } | null; referred: { email: string } | null })[]).map(({ referrer, referred, ...r }) => ({
      ...r,
      referrer_email: referrer?.email ?? null,
      referred_email: referred?.email ?? null,
    }));
  }
}
