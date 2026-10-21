-- =============================================================================
-- 0002_rls.sql — אבטחה (PLAN.md §2.3): RLS על כל טבלה + הרשאות תפקידים
--
-- מודל "deny by default":
--   1. REVOKE ALL מ-anon ומ-authenticated על כל הטבלאות (גם לעתיד דרך DEFAULT PRIVILEGES).
--      anon = אפס גישה. אין אף טבלה שקוראים בלי JWT.
--   2. ENABLE ROW LEVEL SECURITY על כל טבלה. טבלה עם RLS ובלי policy = אף שורה לאף אחד
--      (חוץ מהבעלים postgres ומ-service_role שמוגדר BYPASSRLS ב-Supabase).
--   3. GRANT מפורש ל-authenticated רק על מה שהאזור האישי צריך, ברמת עמודות כשיש
--      עמודות רגישות (טוקנים מוצפנים, raw של HYP). לקוח חייב לבחור עמודות מפורשות
--      (select=col1,col2) ולא select=* על connections / subscriptions / payments.
--   4. Policies: "רק השורות שלי" — user_id = auth.uid() (בטבלת users: id = auth.uid()).
--      כתיבה מהלקוח מותרת רק ב: users (עמודות פרופיל), reminders (ביטול).
--      (agents היה CRUD כאן; מ-0006 — SELECT בלבד, כתיבה דרך השרת אחרי הוולידציה של שכבת השירות.)
--   5. טבלאות שמנוהלות בשרת בלבד (service_role): auth_otps, link_tokens, wa_link_attempts,
--      graph_subscriptions, wa_templates — ללא GRANT ל-authenticated בכלל;
--      messages, audit_log, payments, subscriptions, usage, jobs — SELECT בלבד על השורות שלי.
--   6. service_role לעולם לא יוצא מהשרת (Vercel env). הבוט כותב רק דרכו.
--
-- הערה: auth.uid() נעטף ב-(select ...) כדי ש-Postgres יחשב אותו פעם אחת לשאילתה (initPlan).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ביטול הרשאות ברירת מחדל של Supabase ל-anon / authenticated
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- טבלאות שייווצרו במיגרציות עתידיות — לא יקבלו הרשאה אוטומטית ללקוחות.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- השרת (service_role) — גישה מלאה. ב-Supabase ל-service_role יש גם BYPASSRLS.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY על כל טבלה
-- -----------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.auth_otps           enable row level security;
alter table public.link_tokens         enable row level security;
alter table public.wa_identities       enable row level security;
alter table public.wa_link_attempts    enable row level security;
alter table public.connections         enable row level security;
alter table public.graph_subscriptions enable row level security;
alter table public.messages            enable row level security;
alter table public.conversation_state  enable row level security;
alter table public.pending_actions     enable row level security;
alter table public.jobs                enable row level security;
alter table public.reminders           enable row level security;
alter table public.usage               enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.payments            enable row level security;
alter table public.audit_log           enable row level security;
alter table public.agents              enable row level security;
alter table public.wa_templates        enable row level security;

-- -----------------------------------------------------------------------------
-- 3. GRANT מפורש ל-authenticated (רמת טבלה/עמודה) + policies "רק שלי"
-- -----------------------------------------------------------------------------

-- users: קריאה מלאה של השורה שלי; עדכון רק עמודות פרופיל (לא email/id/deleted_at).
grant select on public.users to authenticated;
grant update (name, business_name, business_type, timezone, morning_time, locale, profile)
  on public.users to authenticated;

create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- wa_identities: קריאה בלבד. קישור/ניתוק — בשרת.
grant select on public.wa_identities to authenticated;

create policy wa_identities_select_own on public.wa_identities
  for select to authenticated
  using (user_id = (select auth.uid()));

-- connections: קריאה של עמודות לא-רגישות בלבד (בלי enc_access / enc_refresh). ניתוק — בשרת (revoke + Graph).
grant select (id, user_id, provider, account_email, tenant_id, scopes, expires_at, status,
              consent_type, created_at, updated_at, revoked_at)
  on public.connections to authenticated;

create policy connections_select_own on public.connections
  for select to authenticated
  using (user_id = (select auth.uid()));

-- messages: היסטוריה שלי (קריאה). כתיבה — שרת בלבד.
grant select on public.messages to authenticated;

create policy messages_select_own on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- conversation_state: מה הבוט זוכר עליי (קריאה).
grant select on public.conversation_state to authenticated;

create policy conversation_state_select_own on public.conversation_state
  for select to authenticated
  using (user_id = (select auth.uid()));

-- pending_actions: קריאה. אישור/ביטול רק דרך כפתור בוואטסאפ → שרת.
grant select on public.pending_actions to authenticated;

create policy pending_actions_select_own on public.pending_actions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- jobs: קריאה של המשימות שלי (למשל "הסיכום הבא ב-07:30"). כתיבה — שרת.
grant select on public.jobs to authenticated;

create policy jobs_select_own on public.jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- reminders: קריאה + ביטול בלבד (status → cancelled). ה-job בודק status לפני שליחה.
grant select          on public.reminders to authenticated;
grant update (status) on public.reminders to authenticated;

create policy reminders_select_own on public.reminders
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reminders_cancel_own on public.reminders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'cancelled');

-- usage: קריאה ("נשארו לך 3 הודעות").
grant select on public.usage to authenticated;

create policy usage_select_own on public.usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- subscriptions: קריאה ללא טוקן/תוקף/hkid של HYP.
grant select (id, user_id, plan, status, next_charge_at, charge_failures, started_at,
              cancelled_at, created_at, updated_at)
  on public.subscriptions to authenticated;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- payments: קריאה (חשבוניות) ללא raw.
grant select (id, user_id, hyp_trans_id, amount_ils, ccode, acode, invoice_url, created_at)
  on public.payments to authenticated;

create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()));

-- audit_log: קריאה ("מה הבוט עשה בשמי"). append-only מהשרת.
grant select on public.audit_log to authenticated;

create policy audit_log_select_own on public.audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));

-- agents (שלב 2): הלקוח מנהל את הסוכנים שלו — CRUD מלא על השורות שלו.
grant select, insert, update, delete on public.agents to authenticated;

create policy agents_select_own on public.agents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy agents_insert_own on public.agents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy agents_update_own on public.agents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy agents_delete_own on public.agents
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. טבלאות שרת-בלבד: אין GRANT ואין policy ל-authenticated (RLS דלוק → 0 שורות).
--    auth_otps, link_tokens, wa_link_attempts, graph_subscriptions, wa_templates.
-- -----------------------------------------------------------------------------
comment on table public.auth_otps           is 'קודי אימות למייל בהרשמה/כניסה. נשמר רק hash של הקוד (לא הקוד). שרת בלבד (service_role). נמחק ע''י purge_expired_tokens. [RLS: אין policies — service_role בלבד]';
comment on table public.link_tokens         is 'טוקן שמופיע בהודעת wa.me ("היי! לקשר את החשבון שלי: ABCD-1234"). חד-פעמי, 15 דק''. [RLS: אין policies — service_role בלבד]';
comment on table public.wa_link_attempts    is 'מונה ניסיונות טוקן שגויים ממספר שעדיין לא מקושר. אחרי 3 → blocked_until. (נוסף ליישום §2.3.) [RLS: אין policies — service_role בלבד]';
comment on table public.graph_subscriptions is 'מנויי webhook של Graph (מייל חדש → /api/graph/notify). מתחדש ע''י job מסוג renew_subscription. נמחק בקסקדה עם החיבור. [RLS: אין policies — service_role בלבד]';
comment on table public.wa_templates        is 'תבניות הודעה של WhatsApp (נדרשות מחוץ לחלון 24ש''). מפתח (name, language) כמו ב-Meta. גלובלי. [RLS: אין policies — service_role בלבד]';

-- -----------------------------------------------------------------------------
-- 5. anon — אפס גישה, במפורש (גם אם מישהו יוסיף GRANT בטעות בעתיד, ה-RLS בלי policy ל-anon חוסם).
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
