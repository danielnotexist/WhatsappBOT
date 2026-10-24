-- =============================================================================
-- 0015_admin.sql — פאנל הניהול לבעלים (/admin)
--
-- רקע: דניאל צריך לראות את כל המשתמשים (מתי נרשמו, מאיפה הגיעו, כמה ובמה השתמשו, מה חיברו ואילו תקלות היו),
-- את כל הפניות מהאתר ואת כל השיחות עם בוט התמיכה באתר. הקוד: lib/admin, app/admin.
-- המיגרציה מוסיפה בלבד (אין מחיקה של עמודות או טבלאות):
--   * users.signup_source  — מקור ההרשמה: utm_*, דומיין המפנה, דף הנחיתה, זמן (העוגייה alze_src מ-proxy.ts).
--   * users.last_seen_at   — מתי נראה לאחרונה (כניסה, הודעה נכנסת, טעינת /account; לכל היותר פעם בשעה).
--   * messages.tools       — הכלים שהמודל הפעיל בכל תשובה (lib/ai/orchestrator.ts toolsUsed).
--   * support_tickets.admin_note / status_changed_at — טיפול בפנייה מהפאנל.
--   * support_chats        — שיחות בוט התמיכה באתר (נשמרות כדי שנוכל לעזור), support_chat_append(). נמחקות אחרי 180 יום.
--   * app_errors           — יומן תקלות מרכזי (lib/errors/report.ts). נמחק אחרי 90 יום.
--   * admin_user_overview() / admin_daily_stats() — סיכום לכל המשתמשים בשאילתה אחת, ומספרים לפי יום.
--   * תיקון: audit_log.user_id יכול להיות null (מחיקת חשבון כותבת רשומה בלי משתמש, lib/account/service.ts).
-- שרת בלבד (service_role). RLS פעיל בלי policy על הטבלאות החדשות, כמו 0008-0014.
-- בלוק pg_cron נפרד בסוף הקובץ (כמו ב-0013 ו-0014): הוא מוחל רק בקידום לסביבת הייצור.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users: מקור ההרשמה ומתי נראה לאחרונה
-- -----------------------------------------------------------------------------
alter table public.users add column if not exists signup_source jsonb
  check (signup_source is null or (jsonb_typeof(signup_source) = 'object' and pg_column_size(signup_source) <= 2048));
alter table public.users add column if not exists last_seen_at timestamptz;
comment on column public.users.signup_source is
  'מקור ההרשמה מהביקור הראשון באתר (העוגייה alze_src): utm_source/medium/campaign/term/content, ref (דומיין המפנה), landing (הדף), at. null = לא ידוע.';
comment on column public.users.last_seen_at is
  'מתי המשתמש נראה לאחרונה: כניסה, הודעה נכנסת בוואטסאפ, טעינת האזור האישי. מתעדכן לכל היותר פעם בשעה.';
create index if not exists users_last_seen_idx on public.users (last_seen_at desc nulls last);

-- -----------------------------------------------------------------------------
-- audit_log: רשומה בלי משתמש (מחיקת חשבון — המשתמש כבר לא קיים כשהרשומה נשארת)
-- -----------------------------------------------------------------------------
alter table public.audit_log alter column user_id drop not null;
comment on column public.audit_log.user_id is
  'המשתמש שהפעולה שלו. null לרשומה שנשארת אחרי מחיקת החשבון (account.delete). ב-admin.* — הבעלים שצפה.';

-- -----------------------------------------------------------------------------
-- messages.tools: הכלים שהופעלו בתשובה
-- -----------------------------------------------------------------------------
alter table public.messages add column if not exists tools text[] not null default '{}'
  check (cardinality(tools) <= 40);
comment on column public.messages.tools is 'שמות הכלים שהמודל הפעיל כדי לענות (הודעה יוצאת). ריק כשלא הופעל כלי.';

-- -----------------------------------------------------------------------------
-- support_tickets: הערה וזמן שינוי הסטטוס
-- -----------------------------------------------------------------------------
alter table public.support_tickets add column if not exists admin_note text
  check (admin_note is null or length(admin_note) <= 2000);
alter table public.support_tickets add column if not exists status_changed_at timestamptz;
comment on column public.support_tickets.admin_note is 'הערת טיפול מהפאנל (/admin). לא נשלחת לפונה.';

-- -----------------------------------------------------------------------------
-- support_chats: שיחות בוט התמיכה באתר
-- -----------------------------------------------------------------------------
create table if not exists public.support_chats (
  id         uuid        primary key,
  user_id    uuid        references public.users (id) on delete cascade,
  page       text        check (page is null or length(page) between 1 and 200),
  turns      jsonb       not null default '[]'::jsonb
             check (jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) <= 60 and pg_column_size(turns) <= 131072),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.support_chats is
  'שיחות בוט התמיכה באתר ("שאלות ותמיכה"): כל שאלה ותשובה, כדי שנוכל לעזור. id נוצר בדפדפן לכל שיחה. נמחק אחרי 180 יום. שרת בלבד.';
comment on column public.support_chats.user_id is 'המשתמש המחובר, אם היה מחובר. נמחק עם החשבון.';
comment on column public.support_chats.turns is '[{role: user|assistant, text, at}], עד 60 האחרונות.';

create index if not exists support_chats_updated_idx on public.support_chats (updated_at desc);
create index if not exists support_chats_user_idx    on public.support_chats (user_id, updated_at desc) where user_id is not null;

alter table public.support_chats enable row level security;
revoke all on public.support_chats from public, anon, authenticated;
grant all on public.support_chats to service_role;

-- support_chat_append — מוסיף תורות לשיחה (יוצר אותה בפעם הראשונה), שומר את p_max האחרונות.
-- שיחה של משתמש מחובר לא מקבלת תורות ממשתמש אחר או מאנונימי: false ושום דבר לא נשמר.
create or replace function public.support_chat_append(p_id uuid, p_user uuid, p_page text, p_turns jsonb, p_max integer default 60)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_owner uuid;
  v_found boolean;
  v_all   jsonb;
begin
  if p_turns is null or jsonb_typeof(p_turns) <> 'array' then
    raise exception 'support_chat_append: turns must be an array' using errcode = '22023';
  end if;
  select c.user_id, true into v_owner, v_found from public.support_chats c where c.id = p_id for update;
  if not coalesce(v_found, false) then
    insert into public.support_chats (id, user_id, page, turns)
    values (p_id, p_user, nullif(left(p_page, 200), ''), '[]'::jsonb)
    on conflict (id) do nothing;
    select c.user_id into v_owner from public.support_chats c where c.id = p_id for update;
  end if;
  if v_owner is not null and v_owner is distinct from p_user then
    return false;
  end if;
  select coalesce(c.turns, '[]'::jsonb) || p_turns into v_all from public.support_chats c where c.id = p_id;
  update public.support_chats c
     set turns = (
           select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
             from jsonb_array_elements(v_all) with ordinality as t(e, ord)
            where t.ord > jsonb_array_length(v_all) - greatest(p_max, 1)
         ),
         user_id = coalesce(c.user_id, p_user),
         updated_at = now()
   where c.id = p_id;
  return true;
end;
$$;
comment on function public.support_chat_append(uuid, uuid, text, jsonb, integer) is
  'מוסיף תורות לשיחת תמיכה (יוצר אותה אם אין), משאיר את p_max האחרונות. false כשהשיחה שייכת למשתמש אחר. service_role בלבד.';

revoke execute on function public.support_chat_append(uuid, uuid, text, jsonb, integer) from public, anon, authenticated;
grant  execute on function public.support_chat_append(uuid, uuid, text, jsonb, integer) to service_role;

-- -----------------------------------------------------------------------------
-- app_errors: יומן תקלות מרכזי
-- -----------------------------------------------------------------------------
create table if not exists public.app_errors (
  id      uuid        primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  user_id uuid        references public.users (id) on delete cascade,
  source  text        not null check (length(source) between 1 and 60),
  message text        not null check (length(message) between 1 and 1000),
  context jsonb       not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 8192)
);
comment on table public.app_errors is
  'יומן תקלות (lib/errors/report.ts reportError): מקור, הודעה מקוצרת בלי סודות וטוקנים, הקשר קטן. נמחק אחרי 90 יום. שרת בלבד.';

create index if not exists app_errors_at_idx     on public.app_errors (at desc);
create index if not exists app_errors_user_idx   on public.app_errors (user_id, at desc) where user_id is not null;
create index if not exists app_errors_source_idx on public.app_errors (source, at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from public, anon, authenticated;
grant all on public.app_errors to service_role;

-- -----------------------------------------------------------------------------
-- admin_user_overview — שורה לכל משתמש: תוכנית, שימוש, חיבורים, עלות AI ותקלות
-- -----------------------------------------------------------------------------
create or replace function public.admin_user_overview()
returns table (
  id                 uuid,
  email              text,
  name               text,
  business_name      text,
  created_at         timestamptz,
  last_seen_at       timestamptz,
  signup_source      jsonb,
  onboarding_step    text,
  plan               text,
  sub_status         text,
  charge_failures    integer,
  phone              text,
  wa_linked          boolean,
  connections_active integer,
  connections_broken integer,
  connections_ever   integer,
  providers          text[],
  usage_used         integer,
  usage_limit        integer,
  messages_30d       integer,
  ai_cost_30d        numeric,
  errors_7d          integer,
  failed_jobs_7d     integer,
  paid               boolean,
  open_tickets       integer
)
language sql
stable
set search_path = ''
as $$
  select u.id,
         u.email,
         u.name,
         u.business_name,
         u.created_at,
         u.last_seen_at,
         u.signup_source,
         u.profile -> 'onboarding' ->> 'step',
         public.user_plan(u.id)::text,
         s.status::text,
         coalesce(s.charge_failures, 0),
         (select w.phone_e164 from public.wa_identities w where w.user_id = u.id and w.status = 'active' order by w.linked_at desc limit 1),
         exists (select 1 from public.wa_identities w where w.user_id = u.id),
         (select count(*)::integer from public.connections c where c.user_id = u.id and c.status = 'active'),
         (select count(*)::integer from public.connections c where c.user_id = u.id and c.status in ('expired', 'error')),
         (select count(*)::integer from public.connections c where c.user_id = u.id),
         (select coalesce(array_agg(distinct c.provider::text), '{}') from public.connections c where c.user_id = u.id and c.status = 'active'),
         us.counted_messages,
         us.plan_limit,
         (select count(*)::integer from public.messages m where m.user_id = u.id and m.direction = 'in' and m.created_at >= now() - interval '30 days'),
         (select coalesce(sum(m.cost_usd), 0) from public.messages m where m.user_id = u.id and m.created_at >= now() - interval '30 days'),
         (select count(*)::integer from public.app_errors e where e.user_id = u.id and e.at >= now() - interval '7 days'),
         (select count(*)::integer from public.jobs j where j.user_id = u.id and j.status = 'failed' and j.updated_at >= now() - interval '7 days'),
         exists (select 1 from public.payments p where p.user_id = u.id and p.ccode = '0'),
         (select count(*)::integer from public.support_tickets t where t.user_id = u.id and t.status <> 'closed')
    from public.users u
    left join public.subscriptions s on s.user_id = u.id
    left join lateral (
      select x.counted_messages, x.plan_limit from public.usage x where x.user_id = u.id order by x.period_start desc limit 1
    ) us on true
   where u.deleted_at is null
   order by u.created_at desc
   limit 5000;
$$;
comment on function public.admin_user_overview() is
  'פאנל הניהול: שורה לכל משתמש פעיל (עד 5000) — תוכנית, סטטוס מנוי, מספר וואטסאפ, חיבורים פעילים ופגומים, שימוש בתקופה, הודעות ועלות AI ב-30 יום, תקלות ועבודות שנכשלו ב-7 ימים, תשלום מוצלח, פניות פתוחות. service_role בלבד.';

revoke execute on function public.admin_user_overview() from public, anon, authenticated;
grant  execute on function public.admin_user_overview() to service_role;

-- -----------------------------------------------------------------------------
-- admin_daily_stats — לכל יום (לוח השנה של Asia/Jerusalem): הרשמות, משתמשים פעילים, הודעות, עלות AI, הכנסות
-- -----------------------------------------------------------------------------
create or replace function public.admin_daily_stats(p_from date, p_to date)
returns table (
  day          date,
  signups      integer,
  active_users integer,
  messages     integer,
  ai_cost      numeric,
  revenue      numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'admin_daily_stats: bad range % .. %', p_from, p_to using errcode = '22023';
  end if;
  return query
  with days as (
    select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  ins as (
    select (m.created_at at time zone 'Asia/Jerusalem')::date as day, m.user_id
      from public.messages m
     where m.direction = 'in'
       and m.created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
       and m.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  ),
  ups as (
    select (u.created_at at time zone 'Asia/Jerusalem')::date as day
      from public.users u
     where u.deleted_at is null
       and u.created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
       and u.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  ),
  pays as (
    select (p.created_at at time zone 'Asia/Jerusalem')::date as day, p.amount_ils
      from public.payments p
     where p.ccode = '0'
       and p.created_at >= (p_from::timestamp at time zone 'Asia/Jerusalem')
       and p.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jerusalem')
  )
  select d.day,
         (select count(*)::integer from ups where ups.day = d.day),
         (select count(distinct ins.user_id)::integer from ins where ins.day = d.day),
         (select count(*)::integer from ins where ins.day = d.day),
         coalesce((select a.cost_usd from public.ai_spend a where a.day = d.day), 0)::numeric,
         coalesce((select sum(pays.amount_ils) from pays where pays.day = d.day), 0)::numeric
    from days d
   order by d.day;
end;
$$;
comment on function public.admin_daily_stats(date, date) is
  'פאנל הניהול: לכל יום בטווח (עד 367 ימים, לוח השנה של Asia/Jerusalem) — הרשמות, משתמשים עם הודעה נכנסת, הודעות נכנסות, עלות AI (ai_spend), הכנסות (תשלומים מוצלחים). service_role בלבד.';

revoke execute on function public.admin_daily_stats(date, date) from public, anon, authenticated;
grant  execute on function public.admin_daily_stats(date, date) to service_role;

-- -----------------------------------------------------------------------------
-- ניקוי: שיחות האתר אחרי 180 יום, התקלות אחרי 90 יום
-- -----------------------------------------------------------------------------
create or replace function public.purge_support_chats(p_keep interval default interval '180 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.support_chats where updated_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_support_chats(interval) is
  'מוחק שיחות תמיכה מהאתר שלא עודכנו מעבר ל-p_keep (ברירת מחדל 180 יום). מחזיר כמה נמחקו.';
revoke execute on function public.purge_support_chats(interval) from public, anon, authenticated;
grant  execute on function public.purge_support_chats(interval) to service_role;

create or replace function public.purge_app_errors(p_keep interval default interval '90 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.app_errors where at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_app_errors(interval) is
  'מוחק רשומות app_errors ישנות מ-p_keep (ברירת מחדל 90 יום). מחזיר כמה נמחקו.';
revoke execute on function public.purge_app_errors(interval) from public, anon, authenticated;
grant  execute on function public.purge_app_errors(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): ניקוי פעם ביום. בלוק נפרד — מוחל רק בקידום לייצור (כמו 0013, 0014).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — admin purges not scheduled';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_support_chats', '41 3 * * *', 'select public.purge_support_chats()');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_app_errors', '47 3 * * *', 'select public.purge_app_errors()');
end;
$$;
