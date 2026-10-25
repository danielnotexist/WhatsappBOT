-- =============================================================================
-- 0017_analytics.sql — אנליטיקה משלנו, בלי עוגיות (סבב 2 בתוכנית: "אנליטיקה ו-SEO")
--
-- רקע: דניאל רוצה לדעת מי מגיע, מאיפה, ואיפה נוטשים בהרשמה — בלי חבילות חדשות ובלי עוגיות מעקב. הקוד:
-- lib/analytics (ה-beacon בדפדפן, /api/a, השלבים בצד השרת), והטאב "תנועה" ב-/admin.
-- המיגרציה מוסיפה בלבד:
--   * page_events          — שורה לכל צפייה בדף (event ריק) או שלב במשפך ההרשמה (event). visitor = מזהה יומי
--                            אנונימי: sha256 של מלח יומי + IP + User-Agent (המלח נגזר מ-TOKEN_ENC_KEY ומהתאריך, ולא נשמר).
--                            אין IP ואין User-Agent בטבלה — רק ה-hash וסוג המכשיר. נמחק אחרי 13 חודשים.
--   * analytics_daily() / analytics_top_pages() / analytics_sources() / analytics_devices() / analytics_funnel()
--                          — המספרים של הטאב, לפי יום בשעון ישראל.
--   * purge_page_events()  — המחיקה אחרי 13 חודשים.
-- שרת בלבד (service_role). RLS פעיל בלי policy, כמו 0008-0016.
-- אין כאן `alter type ... add value`: אפשר להריץ את הקובץ כולו בטרנזקציה אחת.
-- בלוק pg_cron נפרד בסוף הקובץ (כמו ב-0013 עד 0016): הוא מוחל רק בקידום לסביבת הייצור.
-- =============================================================================

create table if not exists public.page_events (
  id            uuid        primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  day           date        not null default ((now() at time zone 'Asia/Jerusalem')::date),
  visitor       text        not null check (visitor ~ '^[0-9a-f]{64}$'),
  user_id       uuid        references public.users (id) on delete set null,
  path          text        check (path is null or (length(path) between 1 and 200 and left(path, 1) = '/')),
  referrer_host text        check (referrer_host is null or length(referrer_host) between 1 and 120),
  utm_source    text        check (utm_source is null or length(utm_source) between 1 and 120),
  utm_medium    text        check (utm_medium is null or length(utm_medium) between 1 and 120),
  utm_campaign  text        check (utm_campaign is null or length(utm_campaign) between 1 and 120),
  device        text        check (device is null or device in ('mobile', 'desktop')),
  event         text        check (event is null or event in ('signup_start', 'code_sent', 'code_ok', 'wa_linked', 'mail_connected', 'paid')),
  -- a page view has a path; a funnel step may come from the server, without one
  constraint page_events_view_or_event check (event is not null or path is not null)
);
comment on table public.page_events is
  'אנליטיקה בלי עוגיות (lib/analytics): צפייה בדף (event ריק) או שלב במשפך ההרשמה. visitor = sha256(מלח יומי + IP + User-Agent) — מזהה אנונימי שמתחלף כל יום; ה-IP וה-User-Agent לא נשמרים. user_id רק כשהיה session. נמחק אחרי 13 חודשים. שרת בלבד.';
comment on column public.page_events.day is 'היום בשעון ישראל — גם היום של המלח.';
comment on column public.page_events.visitor is 'מזהה יומי אנונימי (hex של sha256). שלב בצד השרת (וואטסאפ, חיבור מייל, תשלום): hash של המשתמש באותו מלח.';
comment on column public.page_events.referrer_host is 'הדומיין המפנה בלבד, בדף הראשון של הביקור. unknown = היה מפנה שאינו כתובת.';
comment on column public.page_events.device is 'mobile / desktop לפי רוחב החלון. בלי User-Agent.';
comment on column public.page_events.event is 'שלב במשפך: signup_start, code_sent, code_ok (בדפדפן), wa_linked, mail_connected, paid (בשרת). ריק = צפייה בדף.';

create index if not exists page_events_day_idx       on public.page_events (day);
create index if not exists page_events_event_day_idx on public.page_events (event, day);
create index if not exists page_events_user_idx      on public.page_events (user_id) where user_id is not null;

alter table public.page_events enable row level security;
revoke all on public.page_events from public, anon, authenticated;
grant all on public.page_events to service_role;

-- -----------------------------------------------------------------------------
-- the range every report takes: p_from .. p_to inclusive, at most a year
-- -----------------------------------------------------------------------------
create or replace function public.analytics_check_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'analytics: bad range % .. %', p_from, p_to using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.analytics_check_range(date, date) from public, anon, authenticated;
grant  execute on function public.analytics_check_range(date, date) to service_role;

-- -----------------------------------------------------------------------------
-- analytics_daily — לכל יום בטווח (גם יום בלי ביקורים): מבקרים ייחודיים וצפיות בדפים
-- -----------------------------------------------------------------------------
create or replace function public.analytics_daily(p_from date, p_to date)
returns table (day date, visitors integer, views integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.analytics_check_range(p_from, p_to);
  return query
  with days as (
    select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  views as (
    select e.day, count(distinct e.visitor)::integer as visitors, count(*)::integer as views
      from public.page_events e
     where e.day between p_from and p_to and e.event is null
     group by e.day
  )
  select d.day, coalesce(v.visitors, 0), coalesce(v.views, 0)
    from days d left join views v on v.day = d.day
   order by d.day;
end;
$$;
comment on function public.analytics_daily(date, date) is
  'לכל יום בטווח (כולל): מבקרים ייחודיים (המזהה מתחלף כל יום) וצפיות בדפים. service_role בלבד.';

-- -----------------------------------------------------------------------------
-- analytics_top_pages — הדפים עם הכי הרבה צפיות; visitors = מבקרים-ביום (המזהה יומי)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_top_pages(p_from date, p_to date, p_limit integer default 10)
returns table (path text, views integer, visitors integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.analytics_check_range(p_from, p_to);
  return query
  select e.path, count(*)::integer as views, count(distinct (e.day, e.visitor))::integer as visitors
    from public.page_events e
   where e.day between p_from and p_to and e.event is null
   group by e.path
   order by 2 desc, 1
   limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;
comment on function public.analytics_top_pages(date, date, integer) is
  'הדפים המובילים בטווח: צפיות ומבקרים (מבקר-ביום). service_role בלבד.';

-- -----------------------------------------------------------------------------
-- analytics_sources — מאיפה הגיעו: לכל מבקר-ביום המקור של הצפייה הראשונה שיש לה מקור (utm_source, אחרת הדומיין
-- המפנה); בלי מקור באף צפייה = ישיר (source ריק, kind = direct)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_sources(p_from date, p_to date, p_limit integer default 8)
returns table (source text, kind text, visitors integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.analytics_check_range(p_from, p_to);
  return query
  with per_visit as (
    select e.day, e.visitor,
           (array_agg(coalesce(e.utm_source, e.referrer_host) order by e.at)
              filter (where coalesce(e.utm_source, e.referrer_host) is not null))[1] as source,
           (array_agg(case when e.utm_source is not null then 'utm' else 'referrer' end order by e.at)
              filter (where coalesce(e.utm_source, e.referrer_host) is not null))[1] as kind
      from public.page_events e
     where e.day between p_from and p_to and e.event is null
     group by e.day, e.visitor
  )
  select p.source, coalesce(p.kind, 'direct'), count(*)::integer as visitors
    from per_visit p
   group by p.source, coalesce(p.kind, 'direct')
   order by 3 desc, 1 nulls last
   limit least(greatest(coalesce(p_limit, 8), 1), 100);
end;
$$;
comment on function public.analytics_sources(date, date, integer) is
  'מקורות הביקורים: utm_source או הדומיין המפנה של הצפייה הראשונה של כל מבקר-ביום; source ריק = ישיר. service_role בלבד.';

-- -----------------------------------------------------------------------------
-- analytics_devices — טלפון מול מחשב: לכל מבקר-ביום סוג המכשיר של הצפייה הראשונה
-- -----------------------------------------------------------------------------
create or replace function public.analytics_devices(p_from date, p_to date)
returns table (device text, visitors integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.analytics_check_range(p_from, p_to);
  return query
  with per_visit as (
    select (array_agg(e.device order by e.at) filter (where e.device is not null))[1] as device
      from public.page_events e
     where e.day between p_from and p_to and e.event is null
     group by e.day, e.visitor
  )
  select d.device, count(p.device)::integer
    from (values ('mobile'), ('desktop')) as d(device)
    left join per_visit p on p.device = d.device
   group by d.device
   order by d.device = 'desktop', d.device;
end;
$$;
comment on function public.analytics_devices(date, date) is
  'מבקרים-ביום לפי סוג המכשיר (mobile, desktop). service_role בלבד.';

-- -----------------------------------------------------------------------------
-- analytics_funnel — משפך ההרשמה: לכל שלב, כמה מבקרים-ביום הגיעו אליו (ביקור = צפייה בדף)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_funnel(p_from date, p_to date)
returns table (step text, ord integer, actors integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.analytics_check_range(p_from, p_to);
  return query
  with steps(step, ord) as (
    values ('visit', 0), ('signup_start', 1), ('code_sent', 2), ('code_ok', 3), ('wa_linked', 4), ('mail_connected', 5), ('paid', 6)
  ),
  reached as (
    select coalesce(e.event, 'visit') as step, count(distinct (e.day, e.visitor))::integer as actors
      from public.page_events e
     where e.day between p_from and p_to
     group by coalesce(e.event, 'visit')
  )
  select s.step, s.ord, coalesce(r.actors, 0)
    from steps s left join reached r on r.step = s.step
   order by s.ord;
end;
$$;
comment on function public.analytics_funnel(date, date) is
  'משפך ההרשמה בטווח: ביקור ← התחלת הרשמה ← קוד נשלח ← קוד אומת ← וואטסאפ ← מייל ← תשלום, כמה מבקרים-ביום בכל שלב. service_role בלבד.';

revoke execute on function public.analytics_daily(date, date)                from public, anon, authenticated;
revoke execute on function public.analytics_top_pages(date, date, integer)   from public, anon, authenticated;
revoke execute on function public.analytics_sources(date, date, integer)     from public, anon, authenticated;
revoke execute on function public.analytics_devices(date, date)              from public, anon, authenticated;
revoke execute on function public.analytics_funnel(date, date)               from public, anon, authenticated;
grant  execute on function public.analytics_daily(date, date)                to service_role;
grant  execute on function public.analytics_top_pages(date, date, integer)   to service_role;
grant  execute on function public.analytics_sources(date, date, integer)     to service_role;
grant  execute on function public.analytics_devices(date, date)              to service_role;
grant  execute on function public.analytics_funnel(date, date)               to service_role;

-- -----------------------------------------------------------------------------
-- purge_page_events — מינימום נתונים: שורות בנות יותר מ-13 חודשים נמחקות
-- -----------------------------------------------------------------------------
create or replace function public.purge_page_events(p_keep interval default interval '13 months')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.page_events where at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_page_events(interval) is
  'מוחק שורות page_events ישנות מ-p_keep (ברירת מחדל 13 חודשים). מחזיר כמה נמחקו.';

revoke execute on function public.purge_page_events(interval) from public, anon, authenticated;
grant  execute on function public.purge_page_events(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): ניקוי פעם ביום. בלוק נפרד — מוחל רק בקידום לייצור (כמו 0013-0016).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — page_events purge not scheduled';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_page_events', '41 3 * * *', 'select public.purge_page_events()');
end;
$$;
