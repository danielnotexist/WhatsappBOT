-- =============================================================================
-- 0025_privacy_retention.sql — שמירת מידע ומחיקה (סבב האבטחה, אזור H)
--
--   * payments — רשומות החיוב נשמרות 7 שנים (מדיניות הפרטיות §5) גם אחרי מחיקת החשבון: user_id → null
--                (on delete set null), ולפני המחיקה נשמרים בשורה המייל והשם של המשלם (payer_email / payer_name),
--                כדי שאפשר יהיה לקשר עסקה ב-HYP ללקוח (חשבונית, בירור חיוב). עד היום המחיקה מחקה אותן (cascade).
--   * support_tickets — נמחקות עם החשבון (on delete cascade, במקום set null). פנייה סגורה נמחקת אחרי 180 יום
--                (purge_support_tickets), כמו שיחות צ'אט התמיכה.
--   * purge_finished_work — פעולות ממתינות שהסתיימו (טיוטות מייל מלאות ב-payload) ומשימות שהסתיימו נמחקות אחרי
--                30 יום. עד היום נשארו לתמיד.
--   * purge_old_content — לפי מסלול, כמו purge_old_messages (90 / 365 יום): תזכורות שנשלחו או בוטלו, והזיכרון
--                (conversation_state: סיכום ועובדות) של מי שלא דיבר עם הבוט בתקופה הזו — הסיכום נבנה מהודעות שכבר
--                נמחקו.
--   * profile_merge — מיזוג אטומי של users.profile (`profile || patch`) במקום קריאה וכתיבה של כל ה-jsonb מה-TS:
--                שני כותבים במקביל לא דורסים זה את זה (ולא מחזירים nonce שכבר נשרף). p_deep: מפתחות שממוזגים
--                רמה אחת לעומק (oauth_pending: Microsoft ו-Google לא דורסים זה את זה).
-- service_role בלבד. pg_cron בבלוק נפרד בסוף.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payments: נשמרות אחרי מחיקת החשבון
-- -----------------------------------------------------------------------------
alter table public.payments add column if not exists payer_email text;
alter table public.payments add column if not exists payer_name  text;
comment on column public.payments.payer_email is
  'מייל המשלם, נשמר רק כשהחשבון נמחק (user_id → null): רשומת החיוב נשמרת 7 שנים לפי דיני המס.';
comment on column public.payments.payer_name is
  'שם המשלם, נשמר רק כשהחשבון נמחק (user_id → null).';

alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments
  add constraint payments_user_id_fkey foreign key (user_id) references public.users (id) on delete set null;
comment on column public.payments.user_id is
  'המשלם. null אחרי מחיקת החשבון — אז payer_email / payer_name מזהים אותו.';

create or replace function public.payments_keep_payer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.payments
     set payer_email = coalesce(payer_email, old.email),
         payer_name  = coalesce(payer_name, old.name)
   where user_id = old.id;
  return old;
end;
$$;
comment on function public.payments_keep_payer() is
  'לפני מחיקת משתמש: המייל והשם שלו נכתבים ברשומות החיוב שלו (שנשארות, user_id → null).';
revoke execute on function public.payments_keep_payer() from public, anon, authenticated;

drop trigger if exists users_keep_payer on public.users;
create trigger users_keep_payer
  before delete on public.users
  for each row execute function public.payments_keep_payer();

-- -----------------------------------------------------------------------------
-- support_tickets: נמחקות עם החשבון; סגורות — אחרי 180 יום
-- -----------------------------------------------------------------------------
alter table public.support_tickets drop constraint if exists support_tickets_user_id_fkey;
alter table public.support_tickets
  add constraint support_tickets_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade;
comment on column public.support_tickets.user_id is
  'המשתמש המחובר שפתח את הפנייה, אם היה מחובר. null לפונה אנונימי. במחיקת החשבון הפנייה נמחקת.';

create or replace function public.purge_support_tickets(p_keep interval default interval '180 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.support_tickets where status = 'closed' and created_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_support_tickets(interval) is
  'מוחק פניות תמיכה סגורות שנפתחו לפני יותר מ-p_keep (ברירת מחדל 180 יום). פנייה פתוחה נשארת עד שמטפלים בה.';

-- -----------------------------------------------------------------------------
-- purge_finished_work — פעולות ממתינות ומשימות שהסתיימו, אחרי 30 יום
-- -----------------------------------------------------------------------------
create or replace function public.purge_finished_work(p_keep interval default interval '30 days')
returns table (pending_actions_deleted bigint, jobs_deleted bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - p_keep;
begin
  return query
  with pa as (
    delete from public.pending_actions
     where status <> 'pending'
       and updated_at < v_cutoff
    returning id
  ),
  j as (
    delete from public.jobs
     where status in ('done', 'failed', 'cancelled')
       and updated_at < v_cutoff
    returning id
  )
  select (select count(*) from pa), (select count(*) from j);
end;
$$;
comment on function public.purge_finished_work(interval) is
  'מוחק פעולות ממתינות שאינן pending (טיוטות שנשלחו / בוטלו / פגו, עם הגוף המלא) ומשימות שהסתיימו (done / failed / cancelled), שלא השתנו מעבר ל-p_keep (ברירת מחדל 30 יום).';

-- -----------------------------------------------------------------------------
-- purge_old_content — תזכורות שהסתיימו והזיכרון של משתמש לא פעיל, לפי מסלול (כמו purge_old_messages)
-- -----------------------------------------------------------------------------
create or replace function public.purge_old_content(
  p_days  integer            default 90,
  p_plans public.plan_kind[] default null
)
returns table (reminders_deleted bigint, memories_cleared bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  return query
  with target as (
    select u.id
      from public.users u
     where p_plans is null
        or public.user_plan(u.id) = any (p_plans)
  ),
  r as (
    delete from public.reminders x
     using target t
     where x.user_id = t.id
       and x.status <> 'scheduled'
       and x.updated_at < v_cutoff
    returning x.id
  ),
  m as (
    update public.conversation_state c
       set summary = null,
           facts = '[]'::jsonb,
           last_summarized_msg_id = null
      from target t
     where c.user_id = t.id
       and c.updated_at < v_cutoff
       and (c.summary is not null or c.facts <> '[]'::jsonb)
    returning c.user_id
  )
  select (select count(*) from r), (select count(*) from m);
end;
$$;
comment on function public.purge_old_content(integer, public.plan_kind[]) is
  'למשתמשים במסלולים p_plans (null = כולם): מוחק תזכורות שנשלחו / בוטלו לפני p_days ימים, ומנקה את הזיכרון (סיכום ועובדות) של מי שהשיחה שלו לא התעדכנה p_days ימים — אותה תקופה שבה ההודעות עצמן נמחקות.';

-- -----------------------------------------------------------------------------
-- profile_merge — מיזוג אטומי של users.profile
-- -----------------------------------------------------------------------------
create or replace function public.profile_merge(p_user_id uuid, p_patch jsonb, p_deep text[] default '{}')
returns setof public.users
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'profile_merge: the patch must be an object' using errcode = '22023';
  end if;
  return query
  update public.users u
     set profile = coalesce(u.profile, '{}'::jsonb) || coalesce((
           select jsonb_object_agg(
                    e.key,
                    case
                      when e.key = any (p_deep) and jsonb_typeof(e.value) = 'object' and jsonb_typeof(u.profile -> e.key) = 'object'
                        then (u.profile -> e.key) || e.value
                      else e.value
                    end)
             from jsonb_each(p_patch) e), '{}'::jsonb)
   where u.id = p_user_id
     and u.deleted_at is null
  returning u.*;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.profile_merge(uuid, jsonb, text[]) is
  'מיזוג אטומי: profile = profile || p_patch (מפתח עם null נשמר כ-null, כמו ב-TS). מפתחות ב-p_deep ממוזגים רמה אחת לעומק. מחזיר את השורה המעודכנת.';

-- -----------------------------------------------------------------------------
-- הרשאות: service_role בלבד
-- -----------------------------------------------------------------------------
revoke execute on function public.purge_support_tickets(interval) from public, anon, authenticated;
grant  execute on function public.purge_support_tickets(interval) to service_role;
revoke execute on function public.purge_finished_work(interval) from public, anon, authenticated;
grant  execute on function public.purge_finished_work(interval) to service_role;
revoke execute on function public.purge_old_content(integer, public.plan_kind[]) from public, anon, authenticated;
grant  execute on function public.purge_old_content(integer, public.plan_kind[]) to service_role;
revoke execute on function public.profile_merge(uuid, jsonb, text[]) from public, anon, authenticated;
grant  execute on function public.profile_merge(uuid, jsonb, text[]) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): ניקוי יומי, ליד שאר הניקויים של 03:xx UTC
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — retention purges not scheduled';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_finished_work', '51 3 * * *', 'select public.purge_finished_work()');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_content_90', '53 3 * * *', 'select public.purge_old_content(90, array[''trial'',''basic'']::public.plan_kind[])');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_content_365', '55 3 * * *', 'select public.purge_old_content(365, array[''pro'']::public.plan_kind[])');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_support_tickets', '57 3 * * *', 'select public.purge_support_tickets()');
end;
$$;
