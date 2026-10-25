/**
 * Data access layer — one interface, two implementations:
 *   - `SupabaseDb` (lib/db/supabase.ts): service-role client, server only (PLAN §2.3).
 *   - `MemoryDb`   (lib/db/memory.ts):   in-memory, for tests and `DATA_MODE=memory` dev runs.
 *
 * Only the server ever talks to this layer. Row shapes mirror supabase/migrations/0001_init.sql.
 */

import type { DeviceClass, FunnelEvent } from "@/lib/analytics/events";

export type ConnectionProvider = "microsoft" | "google";
export type ConnectionStatus = "active" | "expired" | "revoked" | "error";
export type PlanKind = "trial" | "basic" | "pro";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";
export type WaIdentityStatus = "active" | "blocked" | "unlinked";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  business_type: string | null;
  timezone: string;
  morning_time: string;
  locale: string;
  /** free-form JSON the bot maintains (PLAN §2.2 profile, onboarding state, preferences) */
  profile: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
  /** migration 0015 — read by the admin panel only (adminGetUser / adminUserOverview), not by the everyday user reads */
  signup_source?: SignupSource | null;
  last_seen_at?: string | null;
}

/** Where a person came from on their first visit (proxy.ts sets the alze_src cookie; signIn copies it to a new user). */
export interface SignupSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** the referring site's host, when it was another site */
  ref?: string;
  /** the first page (path only) */
  landing?: string;
  /** ISO time of that first visit */
  at?: string;
}

export interface OtpRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  used_at: string | null;
  created_at: string;
}

export interface LinkTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface WaIdentityRow {
  id: string;
  user_id: string;
  phone_e164: string;
  wa_name: string | null;
  linked_at: string;
  status: WaIdentityStatus;
}

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: ConnectionProvider;
  account_email: string | null;
  tenant_id: string | null;
  scopes: string[];
  status: ConnectionStatus;
  consent_type: "user" | "admin";
  /** access-token expiry */
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Encrypted tokens — read only by the token store, never listed with the row. */
export interface ConnectionSecret {
  enc_access: string | null;
  enc_refresh: string | null;
  expires_at: string | null;
}

export interface NewConnection {
  user_id: string;
  provider: ConnectionProvider;
  account_email: string | null;
  tenant_id: string | null;
  scopes: string[];
  consent_type: "user" | "admin";
  enc_access: string;
  enc_refresh: string | null;
  expires_at: string;
}

/**
 * google_scope_grants (migration 0008): Google accounts that ever granted a scope Google counts toward the
 * unverified-app user cap (lib/google/user-cap.ts). Kept after revoke (still linked to the user) and after account
 * deletion (user_id → null), because Google's cap counts users who granted, for the lifetime of the project.
 */
export interface GoogleScopeGrantRow {
  /** sha256 hex of the lowercased Google account email */
  account_hash: string;
  scope: string;
  user_id: string | null;
  first_granted_at: string;
}

/** ops_flags (migration 0008): operator alerts set once (e.g. `google_user_cap:80`). Server only. */
export interface OpsFlagRow {
  key: string;
  value: Record<string, unknown>;
  created_at: string;
}

export interface GraphSubscriptionRow {
  id: string;
  connection_id: string;
  subscription_id: string;
  resource: string;
  expires_at: string;
  client_state: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: PlanKind;
  status: SubscriptionStatus;
  next_charge_at: string | null;
  cancelled_at: string | null;
  started_at: string | null;
  charge_failures: number;
  /** card expiry YYMM from HYP getToken */
  hyp_tokef: string | null;
  /** plan that takes effect at the next monthly charge (pro → basic from the chat; migration 0007) */
  scheduled_plan?: PlanKind | null;
}

/** Only the billing module reads the encrypted token (separate call, never listed with the row). */
export interface SubscriptionSecret {
  hyp_token_enc: string | null;
  hyp_tokef: string | null;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  hyp_trans_id: string;
  amount_ils: number;
  ccode: string;
  acode: string | null;
  invoice_url: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  /** the WhatsApp approval that led to this charge (migration 0007); null for monthly / web payments */
  approval_id?: string | null;
}

export type JobKind = "morning_summary" | "reminder" | "renew_subscription" | "charge" | "retry" | "proactive_scan" | "meeting_plan" | "meeting_summary" | "owner_alerts";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  user_id: string | null;
  kind: JobKind;
  run_at: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
}

/** Recurring reminder rule (reminders.recurrence, migration 0005). Times are wall-clock in the user's time zone. */
export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  /** weekly: 0 = Sunday … 6 = Saturday */
  weekdays?: number[];
  /** monthly: 1–31 (clamped to the month's last day) */
  monthDay?: number;
}

/** scheduled → fired: sent (one-off) / done (user pressed "טופל"); recurring reminders stay scheduled with the next due_at. */
export type ReminderStatus = "scheduled" | "sent" | "done" | "cancelled";

export interface ReminderRow {
  id: string;
  user_id: string;
  text: string;
  due_at: string;
  job_id: string | null;
  status: ReminderStatus;
  recurrence: RecurrenceRule | null;
  last_fired_at: string | null;
  created_at: string;
}

export interface NewReminder {
  user_id: string;
  text: string;
  due_at: Date;
  recurrence?: RecurrenceRule | null;
}

export interface UsageRow {
  user_id: string;
  period_start: string;
  counted_messages: number;
  free_remaining: number;
  plan_limit: number;
}

export type MessageDirection = "in" | "out";
export type MessageType = "text" | "audio" | "image" | "doc" | "button" | "template" | "other";

export interface MessageRow {
  id: string;
  user_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  text: string | null;
  media_url: string | null;
  transcript: string | null;
  model_used: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  /** which agent answered (migration 0006); null = the main assistant */
  agent_key: string | null;
  /** agent management in WhatsApp (step 5b): stored, but never in the model's history or the rolling summary (0006, I5) */
  hidden_from_model: boolean;
  /** the tools the model called for this reply (migration 0015); read by the admin panel */
  tools?: string[];
  created_at: string;
}

export interface NewMessage {
  user_id: string;
  wa_message_id?: string | null;
  direction: MessageDirection;
  type?: MessageType;
  text?: string | null;
  media_url?: string | null;
  transcript?: string | null;
  model_used?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  agent_key?: AgentKey | null;
  hidden_from_model?: boolean;
  /** sent only when non-empty, so an outbound row without tools never names the column */
  tools?: string[];
}

export interface ConversationStateRow {
  user_id: string;
  summary: string | null;
  last_summarized_msg_id: string | null;
  facts: string[];
  updated_at: string;
}

export type PendingActionKind = "send_mail" | "create_event" | "update_event" | "delete_event" | "share_file" | "forward_mail";
export type PendingActionStatus = "pending" | "approved" | "edited" | "cancelled" | "executed" | "expired" | "failed";

export interface PendingActionRow {
  id: string;
  user_id: string;
  kind: PendingActionKind;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  expires_at: string;
  approved_msg_id: string | null;
  executed_at: string | null;
  error: string | null;
  /** the agent that prepared the draft (migration 0006); null = the main assistant */
  agent_key: string | null;
  /** the agent's name when the draft was made (the WhatsApp header) */
  agent_name: string | null;
  created_at: string;
}

/** Who prepared a pending action — stored on the row, used for the header, the daily cap and the audit. */
export interface PendingActionMeta {
  agentKey: AgentKey;
  agentName: string;
}

// ---- billing approvals (migration 0007): one-tap charges / subscription changes from WhatsApp ----
/** `renewal` = the automatic monthly charge taking the per-user charge lock (no phone, never pending) */
export type BillingApprovalKind = "upgrade" | "retry" | "renew" | "resume" | "cancel" | "downgrade" | "keep_pro" | "renewal";
export type BillingApprovalStatus = "pending" | "processing" | "succeeded" | "failed" | "declined" | "expired" | "unknown";

/** An offer sent with buttons. Executed only from a press by `phone_e164` within 10 minutes (expires_at). */
export interface BillingApprovalRow {
  id: string;
  user_id: string;
  kind: BillingApprovalKind;
  plan: "basic" | "pro";
  /** the amount shown to the user, VAT included — charged exactly as shown */
  amount_ils: number;
  details: Record<string, unknown>;
  /** the linked number the offer was sent to; null only for `renewal` and for an upgrade approved on the pay page (approved_msg_id "web:…") */
  phone_e164: string | null;
  status: BillingApprovalStatus;
  expires_at: string;
  approved_msg_id: string | null;
  approved_at: string | null;
  hyp_trans_id: string | null;
  ccode: string | null;
  error: string | null;
  created_at: string;
}

export interface NewBillingApproval {
  user_id: string;
  kind: Exclude<BillingApprovalKind, "renewal">;
  plan: "basic" | "pro";
  amount_ils: number;
  details?: Record<string, unknown>;
  phone_e164: string;
}

/** An upgrade approved on the pay page (/pay/<token>) — see Db.openWebCharge. */
export interface NewWebCharge {
  /** the single-use nonce of the form that was submitted (a UUID minted when the page was rendered) */
  id: string;
  user_id: string;
  kind: "upgrade";
  plan: "pro";
  amount_ils: number;
  details?: Record<string, unknown>;
}

export interface LinkAttemptResult {
  attempts: number;
  blocked: boolean;
}

export interface AuditEntry {
  user_id: string | null;
  action: string;
  target?: string | null;
  reason?: string | null;
  result?: string | null;
  approved_by_msg_id?: string | null;
  pending_action_id?: string | null;
  /** migration 0006: which agent acted (from the pending action, or the managed agent for agent.* entries) */
  agent_key?: string | null;
  agent_name?: string | null;
}

// ---- agents (migration 0006, docs/design/agents.md §2) ----

export type BuiltinRole = "secretary" | "intern" | "bookkeeper";
export type AgentRole = BuiltinRole | "custom";
/** Stable attribution key: `builtin:secretary` or `custom:<agents.id>`. */
export type AgentKey = `builtin:${BuiltinRole}` | `custom:${string}`;

/** Narrowing only — approval by button is structural and is never a permission (I1). */
export interface AgentPermissions {
  /** up to 5 addresses; empty / absent = no restriction (still with approval) */
  recipients?: string[];
  /** 1–30; absent = the default (10) */
  max_outbound_per_day?: number;
}

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  role: AgentRole;
  /** custom agents only: the built-in template it started from */
  template: BuiltinRole | null;
  /** custom: the user's instructions; built-in override: additional instructions */
  instructions: string | null;
  /** capability ids (lib/agents/capabilities.ts), not tool names */
  tools: string[];
  permissions: AgentPermissions;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewAgent {
  user_id: string;
  name: string;
  role: AgentRole;
  template?: BuiltinRole | null;
  instructions?: string | null;
  tools?: string[];
  permissions?: AgentPermissions;
  enabled?: boolean;
}

/** The only fields that change after insert (user_id / role / template are immutable — SQL enforce_agent_rules). */
export type AgentPatch = Partial<Pick<AgentRow, "name" | "instructions" | "tools" | "permissions" | "enabled">>;

/** Website support tickets (migration 0011) — server only; `transcript` = the support chat so far, capped. */
export type SupportTicketStatus = "open" | "in_progress" | "closed";

export interface SupportTicketTurn {
  role: "user" | "assistant";
  text: string;
}

// ---- proactive alerts (migration 0013, lib/proactive) ----

/** What an item is about: a mail, a calendar clash, a meeting to prepare for. */
export type ProactiveKind = "urgent_mail" | "conflict" | "back_to_back" | "awaiting_reply" | "deadline" | "external_meeting" | "phishing";
/** `urgent`: an alert of its own (at most 2 a day); `summary`: a line of the morning summary's section. */
export type ProactiveChannel = "urgent" | "summary";
/** urgent: sent / deferred (the window was closed or the day's cap reached) / folded (shown in a morning summary); summary: listed */
export type ProactiveStatus = "sent" | "deferred" | "folded" | "listed";

export interface ProactiveAlertRow {
  id: string;
  user_id: string;
  /** the thing itself ("mail:microsoft:<id>", "conflict:<a>|<b>") — urgent: once ever; summary: once per day */
  item_key: string;
  kind: ProactiveKind;
  channel: ProactiveChannel;
  status: ProactiveStatus;
  /** the user's local day, YYYY-MM-DD */
  local_day: string;
  /** what the buttons need (provider, message id, sender, subject, event titles) — mail metadata only, no bodies */
  payload: Record<string, unknown>;
  created_at: string;
}

export interface NewProactiveItem {
  user_id: string;
  item_key: string;
  kind: ProactiveKind;
  local_day: string;
  payload: Record<string, unknown>;
}

/** claimed = send it now; cap / deferred = recorded as deferred (folded into the next morning summary); duplicate = known */
export type ProactiveClaimResult = "claimed" | "cap" | "deferred" | "duplicate";

// ---- meeting summaries (migration 0014, lib/meetings) ----

/** What the summary's buttons did: the tasks document, the action items in a task list, the summary mail (recorded). */
export type MeetingSummaryAction = "mail" | "doc" | "tasks";

export interface MeetingSummaryRow {
  id: string;
  user_id: string;
  provider: "microsoft" | "google";
  /** <provider>:<event id>:<end ISO> — one row per occurrence */
  event_key: string;
  event_id: string;
  title: string;
  meeting_start: string;
  meeting_end: string;
  /** everyone on the invitation but the user */
  attendees: { name: string; email: string }[];
  /** the summary (lib/meetings/summarize.ts MeetingSummaryContent) — never the transcript */
  content: Record<string, unknown>;
  done: MeetingSummaryAction[];
  created_at: string;
}

export type NewMeetingSummary = Omit<MeetingSummaryRow, "id" | "done" | "created_at">;

export interface SupportTicketRow {
  id: string;
  created_at: string;
  /** the signed-in person, if any; null after the account is deleted (on delete set null) */
  user_id: string | null;
  name: string;
  email: string;
  subject: string | null;
  body: string;
  transcript: SupportTicketTurn[] | null;
  status: SupportTicketStatus;
  /** migration 0015: the owner's note from /admin, and when the status last changed */
  admin_note?: string | null;
  status_changed_at?: string | null;
}

// ---- the admin panel (migration 0015, lib/admin) ----

/** A turn of the website support chat as stored (support_chats.turns). */
export interface SupportChatTurn {
  role: "user" | "assistant";
  text: string;
  at?: string;
}

export interface SupportChatRow {
  /** made in the browser, one per conversation */
  id: string;
  user_id: string | null;
  page: string | null;
  turns: SupportChatTurn[];
  created_at: string;
  updated_at: string;
}

export interface AppErrorRow {
  id: string;
  at: string;
  user_id: string | null;
  source: string;
  message: string;
  context: Record<string, unknown>;
}

export type NewAppError = Pick<AppErrorRow, "source" | "message"> & { user_id?: string | null; context?: Record<string, unknown> };

export interface AuditRow extends AuditEntry {
  created_at: string;
}

/** One row per live user (SQL admin_user_overview()). */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  signup_source: SignupSource | null;
  onboarding_step: string | null;
  plan: PlanKind;
  sub_status: SubscriptionStatus | null;
  charge_failures: number;
  /** the active linked number */
  phone: string | null;
  /** any number was ever linked */
  wa_linked: boolean;
  connections_active: number;
  connections_broken: number;
  connections_ever: number;
  providers: ConnectionProvider[];
  usage_used: number | null;
  usage_limit: number | null;
  /** inbound messages in the last 30 days */
  messages_30d: number;
  ai_cost_30d: number;
  errors_7d: number;
  failed_jobs_7d: number;
  /** a successful payment exists */
  paid: boolean;
  open_tickets: number;
}

/** One day (Asia/Jerusalem) of SQL admin_daily_stats(). */
export interface AdminDailyRow {
  day: string;
  signups: number;
  active_users: number;
  messages: number;
  ai_cost: number;
  revenue: number;
}

// ---- owner alerts (migration 0016, lib/admin/alerts.ts) ----

/** What the owner is told about. `test` = the "שליחת מייל בדיקה" button of the alerts tab. */
export type OwnerAlertType = "signup" | "ticket" | "system_request" | "payment_failed" | "charge_unknown" | "error_spike" | "ai_budget" | "connection_expired_paid" | "test";
/** sending → sent / failed; queued (quiet hours) → sending (the digest) → sent; limited (the type's rate limit); merged (the owner already got that same mail) */
export type OwnerAlertStatus = "sending" | "sent" | "queued" | "failed" | "limited" | "merged";
export type OwnerAlertChannel = "email" | "whatsapp" | "email+whatsapp" | "digest";

export interface OwnerAlertRow {
  id: string;
  created_at: string;
  type: OwnerAlertType;
  /** the event itself (signup:<user>, ticket:<id>, error_spike:<hour>…) — unique: never mailed twice */
  dedupe_key: string;
  status: OwnerAlertStatus;
  channel: OwnerAlertChannel | null;
  subject: string;
  /** the event's details, for the morning digest (no secrets) */
  payload: Record<string, unknown>;
  sent_at: string | null;
  error: string | null;
}

export interface NewOwnerAlert {
  type: OwnerAlertType;
  dedupe_key: string;
  subject: string;
  payload: Record<string, unknown>;
  /** quiet hours: stored as queued for the morning digest */
  queue: boolean;
  /** at most `max` of this type within `windowMs` (limited rows do not count); absent = no limit */
  limit?: { max: number; windowMs: number } | null;
}

/** claimed = send it now; queued = kept for the digest; limited = over the type's rate limit (recorded); duplicate = known */
export type OwnerAlertClaimResult = "claimed" | "queued" | "limited" | "duplicate";

// ---- first-party analytics (migration 0017, lib/analytics) ----

/** A page view (event null) or a funnel step. No IP, no User-Agent: `visitor` is the anonymous daily hash. */
export interface NewPageEvent {
  /** "YYYY-MM-DD" in Asia/Jerusalem - also the day of the salt */
  day: string;
  /** sha256 hex (lib/analytics/visitor.ts) */
  visitor: string;
  user_id: string | null;
  path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: DeviceClass | null;
  event: FunnelEvent | null;
  /** defaults to now */
  at?: string;
}

export interface PageEventRow extends NewPageEvent {
  id: string;
  at: string;
}

export type FunnelStep = "visit" | FunnelEvent;

/**
 * The "תנועה" tab's numbers for a range of days (SQL analytics_daily / _top_pages / _sources / _devices / _funnel).
 * A visitor id lasts one day, so every "visitors" figure over a range counts visitor-days.
 */
export interface AnalyticsReport {
  /** every day of the range, oldest first, also the empty ones */
  daily: { day: string; visitors: number; views: number }[];
  /** most viewed first */
  pages: { path: string; views: number; visitors: number }[];
  /** per visitor-day: the first source seen that day - utm_source, else the referring host; null = direct */
  sources: { source: string | null; kind: "utm" | "referrer" | "direct"; visitors: number }[];
  /** mobile, then desktop */
  devices: { device: DeviceClass; visitors: number }[];
  /** visit, signup_start ... paid, in order */
  funnel: { step: FunnelStep; count: number }[];
}

export interface NewSupportTicket {
  user_id: string | null;
  name: string;
  email: string;
  subject: string | null;
  body: string;
  transcript: SupportTicketTurn[] | null;
}

export interface Db {
  // users
  findUserByEmail(email: string): Promise<UserRow | null>;
  getUser(id: string): Promise<UserRow | null>;
  createUser(email: string): Promise<UserRow>;
  updateUserProfile(
    id: string,
    patch: Partial<Pick<UserRow, "name" | "business_name" | "business_type" | "morning_time" | "timezone">>,
  ): Promise<UserRow>;
  /** Hard delete — cascades to every dependent table (PLAN §12.7). */
  deleteUser(id: string): Promise<void>;

  // auth_otps
  createOtp(email: string, codeHash: string, expiresAt: Date): Promise<OtpRow>;
  /** Latest unused OTP for the email (expired or not — the caller decides). */
  latestOtp(email: string): Promise<OtpRow | null>;
  countOtpsSince(email: string, since: Date): Promise<number>;
  incrementOtpAttempts(id: string): Promise<number>;
  markOtpUsed(id: string): Promise<void>;

  // link_tokens
  createLinkToken(userId: string, token: string, expiresAt: Date): Promise<LinkTokenRow>;
  findLinkToken(token: string): Promise<LinkTokenRow | null>;
  latestLinkToken(userId: string): Promise<LinkTokenRow | null>;
  markLinkTokenUsed(id: string): Promise<void>;

  /** user whose profile.oauth_pending.<provider>.state equals `state` (OAuth callback lookup) */
  findUserByOauthState(provider: "microsoft" | "google", state: string): Promise<UserRow | null>;
  /** Deep-merges into users.profile (top-level keys replaced). */
  mergeUserProfile(id: string, patch: Record<string, unknown>): Promise<UserRow>;

  // wa_identities
  listWaIdentities(userId: string): Promise<WaIdentityRow[]>;
  unlinkWaIdentity(userId: string, id: string): Promise<boolean>;
  findWaIdentityByPhone(phoneE164: string): Promise<WaIdentityRow | null>;
  createWaIdentity(userId: string, phoneE164: string, waName: string | null): Promise<WaIdentityRow>;

  // wa_link_attempts (unlinked numbers trying tokens; blocked after 3 — PLAN §2.3)
  recordLinkAttempt(phoneE164: string, maxAttempts: number, blockMs: number): Promise<LinkAttemptResult>;
  isPhoneBlocked(phoneE164: string): Promise<boolean>;

  // messages
  /** Inserts; returns null when wa_message_id already exists (webhook redelivery). */
  insertMessage(row: NewMessage): Promise<MessageRow | null>;
  /** The last `limit` messages, oldest first. `forModel`: without the agent-management turns (hidden_from_model). */
  recentMessages(userId: string, limit: number, opts?: { forModel?: boolean }): Promise<MessageRow[]>;
  /** Keeps a stored message out of the model's history and the summary (an inbound turn step 5b answered). */
  hideMessageFromModel(userId: string, id: string): Promise<void>;
  countMessagesSince(userId: string, since: Date): Promise<number>;
  /** voice notes: stores the STT transcript on the inbound audio message, with the STT route and its cost when known */
  setMessageTranscript(id: string, transcript: string, stt?: { model?: string | null; costUsd?: number | null }): Promise<void>;

  // conversation_state
  getConversationState(userId: string): Promise<ConversationStateRow | null>;
  upsertConversationState(userId: string, patch: Partial<Pick<ConversationStateRow, "summary" | "last_summarized_msg_id" | "facts">>): Promise<ConversationStateRow>;

  // pending_actions
  createPendingAction(userId: string, kind: PendingActionKind, payload: Record<string, unknown>, expiresAt: Date, meta?: PendingActionMeta): Promise<PendingActionRow>;
  getPendingAction(id: string): Promise<PendingActionRow | null>;
  updatePendingAction(id: string, patch: Partial<Pick<PendingActionRow, "status" | "payload" | "approved_msg_id" | "executed_at" | "error">>): Promise<PendingActionRow | null>;
  listPendingActions(userId: string, status: PendingActionStatus): Promise<PendingActionRow[]>;

  // usage — atomic counter (SQL: count_trial_message). Returns messages left after counting, or -1 when exhausted.
  countTrialMessage(userId: string): Promise<number>;

  // connections
  listConnections(userId: string): Promise<ConnectionRow[]>;
  revokeConnection(userId: string, id: string): Promise<ConnectionRow | null>;
  getConnection(id: string): Promise<ConnectionRow | null>;
  /** one active connection per (user, provider, account) — re-connecting replaces the tokens */
  upsertConnection(row: NewConnection): Promise<ConnectionRow>;
  getConnectionSecret(id: string): Promise<ConnectionSecret | null>;
  updateConnectionTokens(id: string, patch: { enc_access: string; enc_refresh?: string | null; expires_at: string }): Promise<void>;
  setConnectionStatus(id: string, status: ConnectionStatus): Promise<void>;

  // google_scope_grants / ops_flags (migration 0008) — Google's unverified-app user cap (lib/google/user-cap.ts)
  /** idempotent; true when the (account, scope) pair was not recorded before */
  recordGoogleScopeGrant(row: { account_hash: string; scope: string; user_id: string | null }): Promise<boolean>;
  /** distinct accounts that granted any of `scopes` (ever) */
  countGoogleScopeAccounts(scopes: string[]): Promise<number>;
  hasGoogleScopeGrant(accountHash: string, scopes: string[]): Promise<boolean>;
  /** sets the flag only if absent; true when this call set it */
  setOpsFlagOnce(key: string, value: Record<string, unknown>): Promise<boolean>;
  getOpsFlag(key: string): Promise<OpsFlagRow | null>;
  /** sets (inserts or replaces) the flag's value — settings such as `owner_alerts:settings` (migration 0016) */
  setOpsFlag(key: string, value: Record<string, unknown>): Promise<void>;

  // ai_spend / ai_spend_users (migration 0009) — the daily spend cap and the per-user daily message cap (lib/ai/budget.ts).
  // `day` is the calendar day in Asia/Jerusalem, "YYYY-MM-DD".
  /** what the paid AI / STT calls cost on that day (USD); 0 when nothing was spent */
  getAiSpend(day: string): Promise<number>;
  /** adds one call's cost to the day (negative counts as 0); returns the day's new total */
  addAiSpend(day: string, costUsd: number, calls?: number): Promise<number>;
  /**
   * Before a paid call (migration 0010): adds an upper-bound estimate and one call to the day, only when the new total
   * stays within `budgetUsd` (atomic — calls in flight at once each hold their own share). The new total, or -1 = refused.
   */
  reserveAiSpend(day: string, costUsd: number, budgetUsd: number): Promise<number>;
  /** After it (migration 0010): moves the day's total by `deltaUsd` (actual − estimate, may be negative), never below 0. */
  adjustAiSpend(day: string, deltaUsd: number): Promise<number>;
  /** how many of the user's messages reached a paid call on that day */
  getAiUserMessages(day: string, userId: string): Promise<number>;
  /** counts one more message for the user unless `limit` is reached (atomic); the new count, or -1 when the cap is full */
  admitAiUserMessage(day: string, userId: string, limit: number): Promise<number>;

  // graph_subscriptions
  upsertGraphSubscription(row: Omit<GraphSubscriptionRow, "id">): Promise<GraphSubscriptionRow>;
  findGraphSubscription(subscriptionId: string): Promise<GraphSubscriptionRow | null>;
  listGraphSubscriptionsForConnection(connectionId: string): Promise<GraphSubscriptionRow[]>;
  listGraphSubscriptionsExpiring(before: Date, limit: number): Promise<GraphSubscriptionRow[]>;
  deleteGraphSubscription(subscriptionId: string): Promise<void>;

  // subscriptions / usage
  getSubscription(userId: string): Promise<SubscriptionRow | null>;
  cancelSubscription(userId: string): Promise<SubscriptionRow | null>;
  getCurrentUsage(userId: string): Promise<UsageRow | null>;
  upsertSubscription(userId: string, patch: Partial<Omit<SubscriptionRow, "id" | "user_id">> & { hyp_token_enc?: string | null }): Promise<SubscriptionRow>;
  getSubscriptionSecret(userId: string): Promise<SubscriptionSecret | null>;
  /** subscriptions whose next_charge_at <= now and that still have a token (active / past_due) */
  listSubscriptionsDue(now: Date, limit: number): Promise<SubscriptionRow[]>;

  // payments
  /** null when hyp_trans_id already recorded (idempotent redirect / retry) */
  insertPayment(row: Omit<PaymentRow, "id" | "created_at">): Promise<PaymentRow | null>;
  listPayments(userId: string, limit: number): Promise<PaymentRow[]>;

  // jobs (pg_cron claims and dispatches; the worker finishes)
  createJob(job: { kind: JobKind; user_id: string | null; run_at: Date; payload?: Record<string, unknown>; dedupe_key?: string | null; max_attempts?: number }): Promise<JobRow | null>;
  finishJob(id: string, error?: string | null, retryAt?: Date | null): Promise<JobRow | null>;
  cancelJobs(userId: string, kind: JobKind): Promise<number>;
  /** one queued job → cancelled (e.g. the old job of a snoozed reminder) */
  cancelJob(id: string): Promise<void>;
  /** SQL claim_due_jobs(): queued + run_at <= now → running, attempts + 1. Used by the dev tick route (pg_cron uses dispatch_due_jobs). */
  claimDueJobs(limit: number): Promise<JobRow[]>;

  // reminders (Milestone 5)
  createReminder(row: NewReminder): Promise<ReminderRow>;
  getReminder(id: string): Promise<ReminderRow | null>;
  updateReminder(id: string, patch: Partial<Pick<ReminderRow, "text" | "status" | "due_at" | "job_id" | "recurrence" | "last_fired_at">>): Promise<ReminderRow | null>;
  /** ordered by due_at; `dueFrom` (inclusive) / `dueBefore` (exclusive) bound due_at */
  listReminders(userId: string, opts: { statuses: ReminderStatus[]; dueFrom?: Date; dueBefore?: Date; limit?: number }): Promise<ReminderRow[]>;

  // agents (migration 0006). Every method filters by the owner, also when an id is given.
  // Writes throw AgentLimitError / AgentPlanError / AgentNameTakenError / AgentRuleError (lib/db/errors.ts).
  /** ordered by created_at (oldest first — the quota keeps the oldest agents active after a downgrade) */
  listAgents(userId: string): Promise<AgentRow[]>;
  getAgent(userId: string, id: string): Promise<AgentRow | null>;
  createAgent(row: NewAgent): Promise<AgentRow>;
  updateAgent(userId: string, id: string, patch: AgentPatch): Promise<AgentRow | null>;
  deleteAgent(userId: string, id: string): Promise<boolean>;
  /** drafts the agent prepared since `since` that still count toward its daily cap (not cancelled / expired / failed) */
  countAgentActionsSince(userId: string, agentKey: AgentKey, since: Date): Promise<number>;

  // audit
  addAudit(entry: AuditEntry): Promise<void>;

  // support tickets (migration 0011) — from the website's support chat
  createSupportTicket(row: NewSupportTicket): Promise<SupportTicketRow>;

  // ---- the admin panel (migration 0015, lib/admin). Reads across users — called only behind requireOwner(). ----
  /** the first-touch source of a new user: set once, never overwritten */
  setSignupSource(userId: string, source: SignupSource): Promise<void>;
  /** users.last_seen_at = at, unless it was set less than `minIntervalMs` before */
  touchLastSeen(userId: string, at: Date, minIntervalMs: number): Promise<void>;
  /** one row per live user, newest first (SQL admin_user_overview) */
  adminUserOverview(): Promise<AdminUserRow[]>;
  /** per day, inclusive, "YYYY-MM-DD" in Asia/Jerusalem (SQL admin_daily_stats) */
  adminDailyStats(fromDay: string, toDay: string): Promise<AdminDailyRow[]>;
  /** the user with signup_source and last_seen_at */
  adminGetUser(id: string): Promise<UserRow | null>;
  /** newest first; `before` = an ISO time to page back from */
  adminMessages(userId: string, opts: { before?: string; limit: number }): Promise<MessageRow[]>;
  /** newest first */
  adminAudit(userId: string, limit: number): Promise<AuditRow[]>;
  /** newest first (by run_at) */
  adminJobs(userId: string, limit: number): Promise<JobRow[]>;
  /** failed jobs of any user since `since`, newest first (the "צריך עזרה" list) */
  adminFailedJobs(since: Date, limit: number): Promise<JobRow[]>;
  adminProactiveAlerts(userId: string, limit: number): Promise<ProactiveAlertRow[]>;
  adminMeetingSummaries(userId: string, limit: number): Promise<MeetingSummaryRow[]>;
  /** newest first */
  listSupportTickets(opts: { status?: SupportTicketStatus; userId?: string; limit: number }): Promise<SupportTicketRow[]>;
  /** null when no such ticket */
  setSupportTicketStatus(id: string, status: SupportTicketStatus, note?: string | null): Promise<SupportTicketRow | null>;
  /** SQL support_chat_append(): creates the chat on the first call; false when the chat belongs to another user */
  appendSupportChat(id: string, row: { userId: string | null; page: string | null; turns: SupportChatTurn[]; max?: number }): Promise<boolean>;
  /** newest first (by updated_at) */
  listSupportChats(opts: { userId?: string; limit: number }): Promise<SupportChatRow[]>;
  insertAppError(row: NewAppError): Promise<void>;
  /** newest first */
  listAppErrors(opts: { source?: string; userId?: string; limit: number }): Promise<AppErrorRow[]>;

  // owner alerts (migration 0016) — lib/admin/alerts.ts
  /** SQL owner_alert_claim(): once per dedupe key, the type's rate limit, atomic per type */
  claimOwnerAlert(row: NewOwnerAlert): Promise<{ result: OwnerAlertClaimResult; alert: OwnerAlertRow | null }>;
  /** the outcome of a send: status, channel and error (sent_at is set when it becomes sent) */
  finishOwnerAlerts(ids: string[], patch: { status: OwnerAlertStatus; channel?: OwnerAlertChannel | null; error?: string | null }): Promise<void>;
  /** SQL owner_alerts_take_queued(): queued → sending on the digest channel (atomic), oldest first */
  takeQueuedOwnerAlerts(limit: number): Promise<OwnerAlertRow[]>;
  /** newest first */
  listOwnerAlerts(limit: number): Promise<OwnerAlertRow[]>;

  // first-party analytics (migration 0017) - lib/analytics, the admin tab "תנועה"
  /** one page view or funnel step; a user id that no longer exists is stored as null */
  insertPageEvent(row: NewPageEvent): Promise<void>;
  /** the tab's numbers for fromDay..toDay inclusive ("YYYY-MM-DD", Asia/Jerusalem); `top` caps pages and sources */
  analyticsReport(fromDay: string, toDay: string, opts?: { top?: number }): Promise<AnalyticsReport>;

  // proactive alerts (migration 0013) — lib/proactive
  /**
   * SQL proactive_alert_claim(): an urgent alert, atomically per user (the user row is locked). `duplicate` when the
   * item was already alerted (any day) or listed in today's summary; otherwise a row is inserted — `sent` when
   * `deliver` and fewer than `cap` alerts were sent that day (→ "claimed"), else `deferred` (→ "cap" / "deferred").
   */
  claimProactiveAlert(item: NewProactiveItem, opts: { cap: number; deliver: boolean }): Promise<{ result: ProactiveClaimResult; alert: ProactiveAlertRow | null }>;
  /** a line of the morning summary's section: one row per (item, day) — an existing one is returned with the new payload */
  addProactiveSummaryItem(item: NewProactiveItem): Promise<ProactiveAlertRow>;
  /** the user's own row (any other user's id → null) */
  getProactiveAlert(userId: string, id: string): Promise<ProactiveAlertRow | null>;
  /** urgent alerts deferred since `since` → folded (atomic), returned oldest first — the morning summary shows them */
  foldDeferredProactiveAlerts(userId: string, since: Date): Promise<ProactiveAlertRow[]>;
  /** sets an urgent alert's status (e.g. back to deferred when its send failed after the claim) */
  setProactiveAlertStatus(userId: string, id: string, status: ProactiveStatus): Promise<void>;

  // meeting summaries (migration 0014) — lib/meetings
  /** one row per (user, event_key): when it exists already, the existing row is returned unchanged */
  saveMeetingSummary(row: NewMeetingSummary): Promise<MeetingSummaryRow>;
  /** the user's own row (any other user's id → null) */
  getMeetingSummary(userId: string, id: string): Promise<MeetingSummaryRow | null>;
  findMeetingSummary(userId: string, eventKey: string): Promise<MeetingSummaryRow | null>;
  /** SQL meeting_summary_mark(): records `action` once, atomically — false when it was recorded before (a second press) */
  markMeetingSummaryAction(userId: string, id: string, action: MeetingSummaryAction): Promise<boolean>;

  // billing approvals (migration 0007) — expires_at is always created_at + 10 minutes (DB default + CHECK)
  createBillingApproval(row: NewBillingApproval): Promise<BillingApprovalRow>;
  getBillingApproval(id: string): Promise<BillingApprovalRow | null>;
  /** the monthly charge's lock: inserts a `renewal` row as processing; null when another charge of the user is open */
  openRenewalCharge(row: { user_id: string; plan: "basic" | "pro"; amount_ils: number; details?: Record<string, unknown> }): Promise<BillingApprovalRow | null>;
  /**
   * The pay page's [לשדרג עכשיו] (migration 0012): an `upgrade` approval inserted already claimed (processing) — the form
   * post is the press. `id` = the form's single-use nonce, approved_msg_id = "web:<id>", no phone. null when that id
   * already exists (a replayed / double-submitted form) or another charge of the user is open.
   */
  openWebCharge(row: NewWebCharge): Promise<BillingApprovalRow | null>;
  /** SQL claim_billing_approval(): pending + not expired + owner + same number → processing (atomic); else null */
  claimBillingApproval(id: string, claim: { userId: string; phoneE164: string; waMessageId: string }): Promise<BillingApprovalRow | null>;
  /** conditional update: only when the current status is one of `fromStatus` (when given) */
  updateBillingApproval(id: string, patch: Partial<Pick<BillingApprovalRow, "status" | "hyp_trans_id" | "ccode" | "error" | "details">>, fromStatus?: BillingApprovalStatus[]): Promise<BillingApprovalRow | null>;
  /** newest first */
  listBillingApprovals(userId: string, opts?: { statuses?: BillingApprovalStatus[]; kinds?: BillingApprovalKind[]; limit?: number }): Promise<BillingApprovalRow[]>;
  /** SQL raise_plan_limit(): the current month's quota → newLimit (upgrade mid-month). Remaining after, or null when unchanged. */
  raiseUsageLimit(userId: string, newLimit: number): Promise<number | null>;
  /** SQL lower_plan_limit(): the current month's quota → newLimit (a downgrade taking effect), remaining clamped at 0. Remaining after, or null when unchanged. */
  lowerUsageLimit(userId: string, newLimit: number): Promise<number | null>;
}
