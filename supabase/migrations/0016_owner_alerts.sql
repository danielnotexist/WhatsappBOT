-- =============================================================================
-- 0016_owner_alerts.sql — התראות לבעלים (סבב 1 בתוכנית: "התראות לבעלים")
--
-- רקע: דניאל רוצה לדעת מה קורה במערכת בלי לפתוח את הפאנל: נרשם חדש, פנייה או בקשת מערכת, תשלום שנכשל או חיוב
-- בבדיקה, קפיצה בתקלות, תקציב AI שמתקרב לסוף, וחיבור שפג אצל לקוח משלם. הקוד: lib/admin/alerts.ts, הטאב "התראות"
-- ב-/admin. ההגדרות (מתג לכל סוג, שעות שקט, שבת) נשמרות ב-ops_flags, במפתח owner_alerts:settings.
-- המיגרציה מוסיפה בלבד:
--   * owner_alerts        — יומן ההתראות ותור הלילה: כל התראה פעם אחת (dedupe_key ייחודי). בשעות השקט התראה שאינה
--                           דחופה נשמרת כ-queued, ונשלחת בבוקר במייל מרוכז אחד. נמחק אחרי 90 יום.
--   * owner_alert_claim() — כפילות ומגבלת קצב לכל סוג, אטומי (נעילה לפי הסוג).
--   * owner_alerts_take_queued() — לוקח את התור למייל המרוכז (queued → sending), בלי ששתי ריצות ייקחו אותה שורה.
--   * job_kind 'owner_alerts' + schedule_owner_alerts() — משימת מערכת כל רבע שעה: בדיקת קפיצה בתקלות, ושליחת המייל
--                           המרוכז כששעות השקט נגמרות. אותו מפתח בדיוק כמו בקוד (lib/admin/alerts.ts ownerAlertsSlot),
--                           כך ש-/api/jobs/tick והתזמון כאן לא יוצרים משימה כפולה.
-- שרת בלבד (service_role). RLS פעיל בלי policy, כמו 0008-0015.
-- בלוק pg_cron נפרד בסוף הקובץ (כמו ב-0013 עד 0015): הוא מוחל רק בקידום לסביבת הייצור.
-- =============================================================================

alter type public.job_kind add value if not exists 'owner_alerts';

create table if not exists public.owner_alerts (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type       text        not null check (type in ('signup', 'ticket', 'system_request', 'payment_failed', 'charge_unknown', 'error_spike', 'ai_budget', 'connection_expired_paid', 'test')),
  dedupe_key text        not null check (length(dedupe_key) between 1 and 200),
  status     text        not null check (status in ('sending', 'sent', 'queued', 'failed', 'limited', 'merged')),
  channel    text        check (channel is null or channel in ('email', 'whatsapp', 'email+whatsapp', 'digest')),
  subject    text        not null check (length(subject) between 1 and 300),
  payload    jsonb       not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  sent_at    timestamptz,
  error      text        check (error is null or length(error) <= 500),
  constraint owner_alerts_dedupe_unique unique (dedupe_key)
);
comment on table public.owner_alerts is
  'התראות לבעלים (lib/admin/alerts.ts): כל אירוע פעם אחת (dedupe_key). queued = נאסף בשעות השקט למייל המרוכז של הבוקר; limited = נחסם במגבלת הקצב של הסוג; merged = הבעלים כבר קיבל את אותו מייל (פנייה שנשלחה ל-SUPPORT_EMAIL שהוא גם כתובת בעלים). payload = פרטי האירוע לגוף המייל, בלי סודות. נמחק אחרי 90 יום. שרת בלבד.';
comment on column public.owner_alerts.dedupe_key is
  'מזהה האירוע: signup:<user>, ticket:<id>, payment_failed:<ref>, error_spike:<שעה>, ai_budget:<יום>:<80|100>… — אותו אירוע לא נשלח פעמיים.';
comment on column public.owner_alerts.channel is 'איך נשלח: email / whatsapp / email+whatsapp / digest (במייל המרוכז). null עד שנשלח.';

create index if not exists owner_alerts_created_idx    on public.owner_alerts (created_at desc);
create index if not exists owner_alerts_type_idx       on public.owner_alerts (type, created_at desc);
create index if not exists owner_alerts_queued_idx     on public.owner_alerts (created_at) where status = 'queued';

alter table public.owner_alerts enable row level security;
revoke all on public.owner_alerts from public, anon, authenticated;
grant all on public.owner_alerts to service_role;

-- -----------------------------------------------------------------------------
-- owner_alert_claim — כפילות + מגבלת קצב לסוג, אטומי
--   duplicate: אותו dedupe_key כבר קיים (בכל סטטוס).
--   limited:   בחלון p_window כבר נרשמו p_max התראות מהסוג (שנשלחו, נאספו, נכשלו או מוזגו) — נשמרת שורה limited.
--   queued / claimed: נשמרת שורה queued (שעות שקט) או sending (לשליחה עכשיו).
-- p_max null = בלי מגבלת קצב.
-- -----------------------------------------------------------------------------
create or replace function public.owner_alert_claim(
  p_type       text,
  p_dedupe_key text,
  p_subject    text,
  p_payload    jsonb,
  p_queue      boolean,
  p_max        integer default null,
  p_window     interval default null
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_count  integer;
  v_status text;
  v_id     uuid;
begin
  -- one claim of a type at a time: two events in the same instant cannot both pass the rate limit
  perform pg_advisory_xact_lock(hashtext('owner_alert:' || p_type));

  if exists (select 1 from public.owner_alerts a where a.dedupe_key = p_dedupe_key) then
    return jsonb_build_object('result', 'duplicate');
  end if;

  v_status := case when coalesce(p_queue, false) then 'queued' else 'sending' end;
  if p_max is not null and p_window is not null then
    select count(*) into v_count
      from public.owner_alerts a
     where a.type = p_type
       and a.created_at > now() - p_window
       and a.status <> 'limited';
    if v_count >= greatest(p_max, 0) then
      v_status := 'limited';
    end if;
  end if;

  insert into public.owner_alerts (type, dedupe_key, status, subject, payload)
  values (p_type, p_dedupe_key, v_status, left(p_subject, 300), coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('result', 'duplicate');
  end if;
  return jsonb_build_object('result', case v_status when 'sending' then 'claimed' else v_status end, 'id', v_id);
end;
$$;
comment on function public.owner_alert_claim(text, text, text, jsonb, boolean, integer, interval) is
  'התראה לבעלים (lib/admin/alerts.ts): duplicate כשה-dedupe_key קיים; limited כשהסוג עבר את p_max בחלון p_window; אחרת queued (p_queue, שעות שקט) או claimed (sending). נועל לפי הסוג. service_role בלבד.';

revoke execute on function public.owner_alert_claim(text, text, text, jsonb, boolean, integer, interval) from public, anon, authenticated;
grant  execute on function public.owner_alert_claim(text, text, text, jsonb, boolean, integer, interval) to service_role;

-- -----------------------------------------------------------------------------
-- owner_alerts_take_queued — התור של הלילה למייל המרוכז: queued → sending (הישנה ראשונה), FOR UPDATE SKIP LOCKED
-- -----------------------------------------------------------------------------
create or replace function public.owner_alerts_take_queued(p_limit integer default 100)
returns setof public.owner_alerts
language plpgsql
volatile
set search_path = ''
as $$
begin
  return query
  with picked as (
    select a.id
      from public.owner_alerts a
     where a.status = 'queued'
     order by a.created_at
     limit greatest(coalesce(p_limit, 100), 1)
     for update skip locked
  )
  update public.owner_alerts a
     set status = 'sending', channel = 'digest'
    from picked
   where a.id = picked.id
  returning a.*;
end;
$$;
comment on function public.owner_alerts_take_queued(integer) is
  'לוקח עד p_limit התראות שנאספו בשעות השקט (queued → sending, ערוץ digest) למייל המרוכז של הבוקר. שתי ריצות במקביל לא לוקחות אותה שורה. service_role בלבד.';

revoke execute on function public.owner_alerts_take_queued(integer) from public, anon, authenticated;
grant  execute on function public.owner_alerts_take_queued(integer) to service_role;

-- -----------------------------------------------------------------------------
-- schedule_owner_alerts — משימת המערכת של רבע השעה הנוכחי (user_id ריק)
-- dedupe_key = owner_alerts:<YYYY-MM-DD"T"HH24:MI ב-UTC, תחילת הרבע> (זהה ל-ownerAlertsSlot בקוד)
-- -----------------------------------------------------------------------------
create or replace function public.schedule_owner_alerts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_slot timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_n    integer := 0;
begin
  insert into public.jobs (kind, user_id, run_at, payload, dedupe_key)
  values ('owner_alerts'::public.job_kind, null, v_slot, '{}'::jsonb,
          'owner_alerts:' || to_char(v_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.schedule_owner_alerts() is
  'יוצר את משימת owner_alerts של רבע השעה הנוכחי (בדיקת קפיצה בתקלות ומייל מרוכז בסוף שעות השקט). אידמפוטנטי לפי dedupe_key. מחזיר 1 כשנוצרה.';

revoke execute on function public.schedule_owner_alerts() from public, anon, authenticated;
grant  execute on function public.schedule_owner_alerts() to service_role;

-- -----------------------------------------------------------------------------
-- purge_owner_alerts — מינימום נתונים: שורות בנות יותר מ-90 יום נמחקות
-- -----------------------------------------------------------------------------
create or replace function public.purge_owner_alerts(p_keep interval default interval '90 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.owner_alerts where created_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_owner_alerts(interval) is
  'מוחק שורות owner_alerts ישנות מ-p_keep (ברירת מחדל 90 יום). מחזיר כמה נמחקו.';

revoke execute on function public.purge_owner_alerts(interval) from public, anon, authenticated;
grant  execute on function public.purge_owner_alerts(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): משימת התראות כל רבע שעה, ניקוי פעם ביום. בלוק נפרד — מוחל רק בקידום לייצור (כמו 0013-0015).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — owner alerts not scheduled';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_schedule_owner_alerts', '*/15 * * * *', 'select public.schedule_owner_alerts()');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_owner_alerts', '53 3 * * *', 'select public.purge_owner_alerts()');
end;
$$;
