-- =============================================================================
-- 0001_init.sql — סכמת הבסיס (PLAN.md §3)
-- Supabase Postgres, אזור EU Frankfurt.
--
-- עקרונות:
--   * מפתחות uuid (gen_random_uuid — מובנה ב-Postgres 13+, בלי pgcrypto).
--   * כל הזמנים timestamptz. שעות "מקומיות" (morning_time) הן time + users.timezone.
--   * ערכים סגורים = טיפוסי enum (קל ל-codegen של supabase gen types).
--     הרחבה: ALTER TYPE <enum> ADD VALUE '<new>'; במיגרציה נפרדת (לא באותה טרנזקציה שמשתמשת בערך).
--   * כל טבלה שתלויה במשתמש: FK ל-users עם ON DELETE CASCADE → מחיקת חשבון = 0 שורות (PLAN §12.7).
--   * טוקנים (OAuth / HYP) נשמרים מוצפנים בלבד (AES-256-GCM באפליקציה, TOKEN_ENC_KEY ב-Vercel).
--     ה-DB לא מצפין ולא מפענח אותם. (PLAN §2.3)
--   * RLS, הרשאות ופונקציות — במיגרציות 0002/0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- טיפוסים (enums)
-- -----------------------------------------------------------------------------
create type public.connection_provider   as enum ('microsoft', 'google');
create type public.connection_status     as enum ('active', 'expired', 'revoked', 'error');
create type public.consent_type          as enum ('user', 'admin');
create type public.wa_identity_status    as enum ('active', 'blocked', 'unlinked');
create type public.message_direction     as enum ('in', 'out');
create type public.message_type          as enum ('text', 'audio', 'image', 'doc', 'button', 'template', 'other');
create type public.pending_action_kind   as enum ('send_mail', 'create_event', 'update_event', 'delete_event', 'share_file');
create type public.pending_action_status as enum ('pending', 'approved', 'edited', 'cancelled', 'executed', 'expired', 'failed');
create type public.job_kind              as enum ('morning_summary', 'reminder', 'renew_subscription', 'charge', 'retry');
create type public.job_status            as enum ('queued', 'running', 'done', 'failed', 'cancelled');
create type public.reminder_status       as enum ('scheduled', 'sent', 'cancelled');
create type public.plan_kind             as enum ('trial', 'basic', 'pro');
create type public.subscription_status   as enum ('trial', 'active', 'past_due', 'cancelled');
create type public.agent_role            as enum ('secretary', 'intern', 'bookkeeper', 'custom');
create type public.wa_template_category  as enum ('utility', 'marketing', 'authentication');
create type public.wa_template_status    as enum ('pending', 'approved', 'rejected', 'paused', 'disabled');

-- -----------------------------------------------------------------------------
-- טריגר updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
comment on function public.set_updated_at() is 'טריגר BEFORE UPDATE: מעדכן updated_at=now() בכל שינוי שורה.';

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create table public.users (
  id             uuid        primary key default gen_random_uuid(),
  email          text        not null,
  name           text,
  business_name  text,
  business_type  text,
  timezone       text        not null default 'Asia/Jerusalem',
  morning_time   time        not null default '07:30',
  locale         text        not null default 'he-IL',
  profile        jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint users_email_unique     unique (email),
  constraint users_email_normalized check (email = lower(btrim(email)) and position('@' in email) > 1),
  constraint users_profile_is_object check (jsonb_typeof(profile) = 'object')
);
comment on table  public.users is
  'לקוח אחד = חשבון אחד. id הוא ה-sub ב-JWT של הלקוח (auth.uid()). ההרשמה היא OTP משלנו (auth_otps), לכן אין FK ל-auth.users — השרת מנפיק את ה-JWT עם sub=users.id. deleted_at = מחיקה רכה; מחיקה מלאה (DELETE) מוחקת בקסקדה את כל הנתונים.';
comment on column public.users.email        is 'מנורמל: lowercase + trim (נאכף ב-CHECK). ייחודי.';
comment on column public.users.timezone     is 'IANA tz, למשל Asia/Jerusalem. משמש לשעת סיכום הבוקר ולתקופות usage.';
comment on column public.users.morning_time is 'שעת סיכום הבוקר בזמן מקומי של המשתמש (לפי timezone).';
comment on column public.users.profile      is 'PLAN §2.2 profile: העדפות, תחום, אנשי קשר חשובים וכו''. JSON object חופשי שהבוט מעדכן.';
comment on column public.users.deleted_at   is 'מחיקה רכה (בקשת מחיקה בתהליך). השרת מסיים revoke/Graph ואז מוחק פיזית.';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- auth_otps — קודי OTP למייל (6 ספרות, 10 דק', resend 60 שנ')
-- -----------------------------------------------------------------------------
create table public.auth_otps (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  attempts    integer     not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint auth_otps_email_normalized check (email = lower(btrim(email))),
  constraint auth_otps_attempts_nonneg  check (attempts >= 0)
);
comment on table  public.auth_otps is
  'קודי אימות למייל בהרשמה/כניסה. נשמר רק hash של הקוד (לא הקוד). שרת בלבד (service_role). נמחק ע''י purge_expired_tokens.';
comment on column public.auth_otps.code_hash is 'HMAC-SHA256(code, OTP_PEPPER) או bcrypt — לעולם לא הקוד עצמו.';
comment on column public.auth_otps.attempts  is 'מספר ניסיונות שגויים; השרת חוסם אחרי 5.';

create index auth_otps_email_created_idx on public.auth_otps (email, created_at desc);

-- -----------------------------------------------------------------------------
-- link_tokens — טוקן קישור וואטסאפ (8 תווים, 15 דק', חד-פעמי)
-- -----------------------------------------------------------------------------
create table public.link_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  token       text        not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint link_tokens_token_unique unique (token),
  constraint link_tokens_token_format check (token ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$')
);
comment on table  public.link_tokens is
  'טוקן שמופיע בהודעת wa.me ("היי! לקשר את החשבון שלי: ABCD-1234"). חד-פעמי, 15 דק''. שרת בלבד.';
comment on column public.link_tokens.token is 'פורמט XXXX-XXXX, אותיות גדולות/ספרות. ייחודי.';

create index link_tokens_user_idx on public.link_tokens (user_id);

-- -----------------------------------------------------------------------------
-- wa_identities — מספר וואטסאפ מקושר למשתמש
-- -----------------------------------------------------------------------------
create table public.wa_identities (
  id          uuid                     primary key default gen_random_uuid(),
  user_id     uuid                     not null references public.users (id) on delete cascade,
  phone_e164  text                     not null,
  wa_name     text,
  linked_at   timestamptz              not null default now(),
  status      public.wa_identity_status not null default 'active',
  created_at  timestamptz              not null default now(),
  updated_at  timestamptz              not null default now(),
  constraint wa_identities_phone_unique unique (phone_e164),
  constraint wa_identities_phone_format check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
comment on table  public.wa_identities is
  'קישור מספר טלפון (E.164) לחשבון. מספר אחד → משתמש אחד. ה-webhook מזהה את המשתמש לפי phone_e164 (נתיב חם).';
comment on column public.wa_identities.phone_e164 is 'E.164 עם +, למשל +972501234567. ייחודי גלובלית.';
comment on column public.wa_identities.wa_name    is 'השם כפי שמגיע מ-Meta (contacts[0].profile.name).';

create index wa_identities_user_idx on public.wa_identities (user_id);

create trigger wa_identities_set_updated_at
  before update on public.wa_identities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- wa_link_attempts — ניסיונות טוקן ממספרים לא מקושרים (PLAN §2.3: חסימה אחרי 3)
-- -----------------------------------------------------------------------------
create table public.wa_link_attempts (
  phone_e164       text        primary key,
  attempts         integer     not null default 0,
  last_attempt_at  timestamptz not null default now(),
  blocked_until    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint wa_link_attempts_phone_format check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint wa_link_attempts_nonneg       check (attempts >= 0)
);
comment on table public.wa_link_attempts is
  'מונה ניסיונות טוקן שגויים ממספר שעדיין לא מקושר. אחרי 3 → blocked_until. שרת בלבד. (לא בסכמה המקורית — נוסף ליישום §2.3.)';

create trigger wa_link_attempts_set_updated_at
  before update on public.wa_link_attempts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- connections — חיבורי OAuth (Microsoft 365 / Google)
-- -----------------------------------------------------------------------------
create table public.connections (
  id             uuid                       primary key default gen_random_uuid(),
  user_id        uuid                       not null references public.users (id) on delete cascade,
  provider       public.connection_provider not null,
  account_email  text,
  tenant_id      text,
  scopes         text[]                     not null default '{}',
  enc_access     text,
  enc_refresh    text,
  expires_at     timestamptz,
  status         public.connection_status   not null default 'active',
  consent_type   public.consent_type        not null default 'user',
  created_at     timestamptz                not null default now(),
  updated_at     timestamptz                not null default now(),
  revoked_at     timestamptz,
  constraint connections_user_provider_account_unique unique (user_id, provider, account_email)
);
comment on table  public.connections is
  'חיבור OAuth של משתמש לספק. enc_access/enc_refresh מוצפנים באפליקציה (AES-256-GCM, TOKEN_ENC_KEY) — ה-DB אף פעם לא רואה טוקן גלוי. ללקוח יש SELECT רק על העמודות הלא-רגישות (ראה 0002).';
comment on column public.connections.tenant_id    is 'Entra tenant id (Microsoft בלבד).';
comment on column public.connections.scopes       is 'ה-scopes שאושרו בפועל. scope נוסף רק כשמפעילים יכולת (§2.3).';
comment on column public.connections.enc_access   is 'access token מוצפן (base64 של iv||ciphertext||tag). לעולם לא בלוגים.';
comment on column public.connections.enc_refresh  is 'refresh token מוצפן.';
comment on column public.connections.consent_type is 'user = המשתמש אישר לבד; admin = דרך admin-consent של מנהל ה-IT (PLAN §8.2).';

create index connections_user_idx       on public.connections (user_id);
create index connections_expires_at_idx on public.connections (expires_at) where status = 'active';

create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- graph_subscriptions — Microsoft Graph change notifications (חידוש כל 6 ימים)
-- -----------------------------------------------------------------------------
create table public.graph_subscriptions (
  id               uuid        primary key default gen_random_uuid(),
  connection_id    uuid        not null references public.connections (id) on delete cascade,
  subscription_id  text        not null,
  resource         text        not null,
  expires_at       timestamptz not null,
  client_state     text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint graph_subscriptions_subscription_id_unique unique (subscription_id)
);
comment on table  public.graph_subscriptions is
  'מנויי webhook של Graph (מייל חדש → /api/graph/notify). מתחדש ע''י job מסוג renew_subscription. נמחק בקסקדה עם החיבור. שרת בלבד.';
comment on column public.graph_subscriptions.client_state is 'סוד אקראי לכל מנוי; Graph מחזיר אותו בכל notification ואנחנו משווים (§2.3).';

create index graph_subscriptions_expires_idx on public.graph_subscriptions (expires_at);

create trigger graph_subscriptions_set_updated_at
  before update on public.graph_subscriptions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- messages — היסטוריית השיחה (90 יום בסיסי / 365 פרו)
-- -----------------------------------------------------------------------------
create table public.messages (
  id             uuid                     primary key default gen_random_uuid(),
  user_id        uuid                     not null references public.users (id) on delete cascade,
  wa_message_id  text,
  direction      public.message_direction not null,
  type           public.message_type      not null default 'text',
  text           text,
  media_url      text,
  transcript     text,
  model_used     text,
  tokens_in      integer,
  tokens_out     integer,
  cost_usd       numeric(10, 6),
  created_at     timestamptz              not null default now(),
  constraint messages_wa_message_id_unique unique (wa_message_id),
  constraint messages_inbound_has_wamid   check (direction = 'out' or wa_message_id is not null),
  constraint messages_tokens_nonneg       check (coalesce(tokens_in, 0) >= 0 and coalesce(tokens_out, 0) >= 0)
);
comment on table  public.messages is
  'כל הודעה נכנסת/יוצאת. wa_message_id ייחודי = dedupe של webhooks (INSERT ... ON CONFLICT DO NOTHING). נמחק אחרי 90/365 יום (purge_old_messages). שרת בלבד לכתיבה; הלקוח קורא רק את שלו.';
comment on column public.messages.wa_message_id is 'wamid של Meta. חובה להודעה נכנסת; להודעה יוצאת מתמלא אחרי השליחה.';
comment on column public.messages.transcript    is 'תמלול של הודעה קולית (Soniox).';
comment on column public.messages.media_url     is 'URL למדיה (Supabase Storage). מדיה של Meta פגה אחרי זמן קצר — לא לשמור אותה.';
comment on column public.messages.cost_usd      is 'עלות מודל משוערת להודעה (מעקב מרווח, §4).';

create index messages_user_created_idx on public.messages (user_id, created_at desc);
create index messages_created_at_idx   on public.messages (created_at);

-- -----------------------------------------------------------------------------
-- conversation_state — זיכרון (PLAN §2.2)
-- -----------------------------------------------------------------------------
create table public.conversation_state (
  user_id                 uuid        primary key references public.users (id) on delete cascade,
  summary                 text,
  last_summarized_msg_id  uuid        references public.messages (id) on delete set null,
  facts                   jsonb       not null default '[]'::jsonb,
  updated_at              timestamptz not null default now(),
  constraint conversation_state_facts_is_array check (jsonb_typeof(facts) = 'array')
);
comment on table  public.conversation_state is
  'סיכום שיחה מצטבר (מתעדכן כל ~20 הודעות) + עובדות שהבוט למד. למודל נשלחים הסיכום + 10 ההודעות האחרונות בלבד.';
comment on column public.conversation_state.facts is 'מערך של {text, learned_at, source?}. "הרו''ח שלי הוא X", משימות פתוחות וכו''.';

create trigger conversation_state_set_updated_at
  before update on public.conversation_state
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- pending_actions — פעולות יוצאות שממתינות לאישור בכפתור (PLAN §2.3)
-- -----------------------------------------------------------------------------
create table public.pending_actions (
  id               uuid                         primary key default gen_random_uuid(),
  user_id          uuid                         not null references public.users (id) on delete cascade,
  kind             public.pending_action_kind   not null,
  payload          jsonb                        not null default '{}'::jsonb,
  status           public.pending_action_status not null default 'pending',
  expires_at       timestamptz                  not null default (now() + interval '10 minutes'),
  approved_msg_id  text,
  executed_at      timestamptz,
  error            text,
  created_at       timestamptz                  not null default now(),
  updated_at       timestamptz                  not null default now(),
  constraint pending_actions_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint pending_actions_expires_after_create check (expires_at > created_at)
);
comment on table  public.pending_actions is
  'שום פעולה יוצאת בלי אישור: הבוט יוצר pending_action, שולח כפתורים שלח/ערוך/בטל, ומבצע רק מלחיצת כפתור של אותו משתמש תוך 10 דק''. אחרי זה → expired (expire_pending_actions). שרת בלבד לכתיבה.';
comment on column public.pending_actions.approved_msg_id is 'wa_message_id (wamid) של לחיצת הכפתור שאישרה. נשמר כטקסט כדי לשרוד purge של messages.';
comment on column public.pending_actions.payload         is 'הפעולה המלאה (נמען, נושא, גוף / פרטי אירוע / קובץ). תוכן חיצוני נעטף כ-<data>.';

create index pending_actions_user_status_idx on public.pending_actions (user_id, status);
create index pending_actions_pending_expiry_idx on public.pending_actions (expires_at) where status = 'pending';

create trigger pending_actions_set_updated_at
  before update on public.pending_actions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- jobs — תור משימות מתוזמנות (pg_cron כל דקה → claim → QStash → Vercel)
-- -----------------------------------------------------------------------------
create table public.jobs (
  id            uuid               primary key default gen_random_uuid(),
  user_id       uuid               references public.users (id) on delete cascade,
  kind          public.job_kind    not null,
  run_at        timestamptz        not null default now(),
  payload       jsonb              not null default '{}'::jsonb,
  status        public.job_status  not null default 'queued',
  attempts      integer            not null default 0,
  max_attempts  integer            not null default 3,
  last_error    text,
  locked_at     timestamptz,
  dedupe_key    text,
  created_at    timestamptz        not null default now(),
  updated_at    timestamptz        not null default now(),
  constraint jobs_dedupe_key_unique     unique (dedupe_key),
  constraint jobs_payload_is_object     check (jsonb_typeof(payload) = 'object'),
  constraint jobs_attempts_nonneg       check (attempts >= 0 and max_attempts >= 1)
);
comment on table  public.jobs is
  'משימות עתידיות: סיכום בוקר, תזכורות, חידוש Graph subscription (renew_subscription), חיוב חודשי HYP (charge), ניסיון חוזר (retry). user_id ריק = משימת מערכת. claim_due_jobs() נועל FOR UPDATE SKIP LOCKED ומסמן running; finish_job() מסיים. שרת בלבד לכתיבה.';
comment on column public.jobs.dedupe_key is 'מונע תזמון כפול, למשל morning_summary:<user_id>:<yyyy-mm-dd>. אופציונלי.';
comment on column public.jobs.locked_at  is 'מתי נתפס ע''י worker. requeue_stale_jobs() מחזיר לתור משימות שנתקעו ב-running.';

create index jobs_status_run_at_idx on public.jobs (status, run_at);
create index jobs_user_idx          on public.jobs (user_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- reminders — תזכורות בשפה חופשית
-- -----------------------------------------------------------------------------
create table public.reminders (
  id          uuid                   primary key default gen_random_uuid(),
  user_id     uuid                   not null references public.users (id) on delete cascade,
  text        text                   not null,
  due_at      timestamptz            not null,
  job_id      uuid                   references public.jobs (id) on delete set null,
  status      public.reminder_status not null default 'scheduled',
  created_at  timestamptz            not null default now(),
  updated_at  timestamptz            not null default now()
);
comment on table public.reminders is
  'תזכורת שהמשתמש ביקש. נשלחת כתבנית Utility (מחוץ לחלון 24ש''). ה-job המשויך בודק status=scheduled לפני שליחה, לכן ביטול = עדכון status בלבד (מותר ללקוח).';

create index reminders_user_due_idx on public.reminders (user_id, due_at);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- usage — מונה הודעות לתקופה (ניסיון 10 / בסיסי 750 / פרו 3000)
-- -----------------------------------------------------------------------------
create table public.usage (
  user_id           uuid        not null references public.users (id) on delete cascade,
  period_start      date        not null,
  counted_messages  integer     not null default 0,
  free_remaining    integer     not null default 0,
  plan_limit        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, period_start),
  constraint usage_counts_nonneg check (counted_messages >= 0 and free_remaining >= 0 and plan_limit >= 0)
);
comment on table  public.usage is
  'שורה לכל (משתמש, תקופה). ניסיון: תקופה אחת שמתחילה ביום ההרשמה, 10 הודעות. מנוי: חודש קלנדרי לפי timezone של המשתמש. count_trial_message() מעדכן אטומית. מה נספר — PLAN §3 (רק הודעות נכנסות שגוררות תשובה).';
comment on column public.usage.free_remaining is 'כמה הודעות נשארו בתקופה (plan_limit פחות מה שנספר; ניתן להגדיל ידנית כבונוס).';
comment on column public.usage.plan_limit     is 'המכסה בתקופה בזמן יצירת השורה (10/750/3000).';

create trigger usage_set_updated_at
  before update on public.usage
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- subscriptions — מנוי HYP (יעד שריג). שורה אחת למשתמש.
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id               uuid                       primary key default gen_random_uuid(),
  user_id          uuid                       not null references public.users (id) on delete cascade,
  plan             public.plan_kind           not null default 'trial',
  status           public.subscription_status not null default 'trial',
  hyp_token_enc    text,
  hyp_tokef        text,
  hyp_hkid         text,
  next_charge_at   timestamptz,
  charge_failures  integer                    not null default 0,
  started_at       timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz                not null default now(),
  updated_at       timestamptz                not null default now(),
  constraint subscriptions_user_unique       unique (user_id),
  constraint subscriptions_failures_nonneg   check (charge_failures >= 0),
  constraint subscriptions_tokef_format      check (hyp_tokef is null or hyp_tokef ~ '^[0-9]{4}$')
);
comment on table  public.subscriptions is
  'מצב המנוי. אין webhook ב-HYP: הכול דרך redirect מאומת (APISign VERIFY) + חיוב יזום (job charge). ביטול: status=cancelled ופעיל עד next_charge_at. ללקוח SELECT על עמודות לא-רגישות בלבד.';
comment on column public.subscriptions.hyp_token_enc   is 'טוקן כרטיס של HYP (getToken) מוצפן באפליקציה. לעולם לא ללקוח/לוגים.';
comment on column public.subscriptions.hyp_tokef       is 'תוקף הכרטיס MMYY כפי ש-HYP דורש בחיוב token.';
comment on column public.subscriptions.hyp_hkid        is 'מזהה הוראת קבע/לקוח ב-HYP (אם בשימוש).';
comment on column public.subscriptions.charge_failures is 'כישלונות חיוב רצופים; 3 ניסיונות ביום 1/3/5 → past_due (PLAN §4).';

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payments — עסקאות HYP (כל חיוב, מוצלח או לא)
-- -----------------------------------------------------------------------------
create table public.payments (
  id             uuid           primary key default gen_random_uuid(),
  user_id        uuid           not null references public.users (id) on delete cascade,
  hyp_trans_id   text           not null,
  amount_ils     numeric(10, 2) not null,
  ccode          text           not null,
  acode          text,
  invoice_url    text,
  raw            jsonb          not null default '{}'::jsonb,
  created_at     timestamptz    not null default now(),
  constraint payments_hyp_trans_id_unique unique (hyp_trans_id),
  constraint payments_amount_positive     check (amount_ils > 0)
);
comment on table  public.payments is
  'עסקה ב-HYP. hyp_trans_id ייחודי = הגנה מפני redirect כפול. ccode=''0'' הצלחה; אחרת קוד שגיאה של HYP. raw = התשובה המלאה (ללא פרטי כרטיס). ללקוח: SELECT ללא raw.';
comment on column public.payments.ccode       is 'CCode מ-HYP (0 = אושר).';
comment on column public.payments.acode       is 'קוד אישור (ACode) של חברת האשראי.';
comment on column public.payments.invoice_url is 'קישור לחשבונית מס-קבלה (HYP Invoice, SendHesh).';

create index payments_user_created_idx on public.payments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_log — כל פעולה: מה, מתי, למה, מי אישר (PLAN §2.3)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.users (id) on delete cascade,
  action              text        not null,
  target              text,
  reason              text,
  approved_by_msg_id  text,
  pending_action_id   uuid        references public.pending_actions (id) on delete set null,
  result              text,
  anonymized_at       timestamptz,
  created_at          timestamptz not null default now()
);
comment on table  public.audit_log is
  'יומן ביקורת לכל פעולה יוצאת/רגישה (שליחת מייל, יומן, קבצים, חיבור/ניתוק, חיוב, מחיקה). אחרי 90 יום מאונמם (target/reason/approved_by_msg_id → null), נמחק אחרי 24 חודש (§8 סיכון 7). append-only; שרת בלבד לכתיבה.';
comment on column public.audit_log.action             is 'למשל send_mail, create_event, connect_microsoft, charge, delete_account.';
comment on column public.audit_log.target             is 'על מה (נמען, מזהה אירוע, שם קובץ). מאונמם אחרי 90 יום.';
comment on column public.audit_log.reason             is 'למה (הבקשה של המשתמש בקצרה). מאונמם אחרי 90 יום.';
comment on column public.audit_log.approved_by_msg_id is 'wamid של הודעת האישור (לחיצת כפתור).';
comment on column public.audit_log.result             is 'ok / error:<קוד> / cancelled / expired.';

create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc);
create index audit_log_created_at_idx   on public.audit_log (created_at);

-- -----------------------------------------------------------------------------
-- agents (שלב 2) — סוכנים מותאמים: מזכירה / מתמחה / מנהלת חשבונות / מותאם
-- -----------------------------------------------------------------------------
create table public.agents (
  id            uuid              primary key default gen_random_uuid(),
  user_id       uuid              not null references public.users (id) on delete cascade,
  name          text              not null,
  role          public.agent_role not null default 'custom',
  instructions  text,
  tools         text[]            not null default '{}',
  permissions   jsonb             not null default '{}'::jsonb,
  enabled       boolean           not null default true,
  created_at    timestamptz       not null default now(),
  updated_at    timestamptz       not null default now(),
  constraint agents_user_name_unique      unique (user_id, name),
  constraint agents_name_length           check (char_length(name) between 1 and 60),
  constraint agents_permissions_is_object check (jsonb_typeof(permissions) = 'object')
);
comment on table public.agents is
  'שלב 2: סוכן מותאם למשתמש (פרו). tools = שמות כלים מותרים; permissions = גבולות (למשל {"max_mails_per_day": 20}). הלקוח מנהל בעצמו (CRUD על השורות שלו).';

create index agents_user_idx on public.agents (user_id);

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- wa_templates — תבניות Meta מאושרות (morning_summary, reminder, ...)
-- -----------------------------------------------------------------------------
create table public.wa_templates (
  name              text                        not null,
  language          text                        not null default 'he',
  category          public.wa_template_category not null default 'utility',
  status            public.wa_template_status   not null default 'pending',
  body              text                        not null,
  meta_template_id  text,
  created_at        timestamptz                 not null default now(),
  updated_at        timestamptz                 not null default now(),
  primary key (name, language)
);
comment on table  public.wa_templates is
  'תבניות הודעה של WhatsApp (נדרשות מחוץ לחלון 24ש''). מפתח (name, language) כמו ב-Meta. גלובלי, לא פר-משתמש. שרת בלבד.';
comment on column public.wa_templates.body is 'גוף התבנית עם {{1}}, {{2}} — לתיעוד/תצוגה; האמת היא ב-Meta.';

create trigger wa_templates_set_updated_at
  before update on public.wa_templates
  for each row execute function public.set_updated_at();
