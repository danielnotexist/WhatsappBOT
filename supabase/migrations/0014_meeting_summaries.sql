-- =============================================================================
-- 0014_meeting_summaries.sql — סיכומי פגישות מהתמליל של הפלטפורמה (מסלול פרו)
--
-- רקע: אחרי פגישת Teams או Google Meet, עלזה לוקחת את התמליל שהפלטפורמה עצמה שמרה (שום בוט לא מצטרף לפגישה),
-- מסכמת בעברית (סיכום קצר, החלטות, משימות עם אחראי ותאריך, שאלות פתוחות) ומציעה בכפתורים: מייל סיכום למשתתפים
-- (טיוטה לאישור), מסמך משימות, והוספת המשימות ל-Google Tasks / To Do. Zoom — בקרוב. הקוד: lib/meetings.
-- המיגרציה מוסיפה:
--   * job_kind 'meeting_plan'    — סריקת יומן של משתמש אחד: לכל פגישה מקוונת שמסתיימת בקרוב, משימת meeting_summary
--                                  לשעת הסיום + 10 דקות (lib/meetings/jobs.ts).
--   * job_kind 'meeting_summary' — פגישה אחת: מציאת התמליל, סיכום, שליחה עם כפתורים (ניסיון חוזר כשהתמליל עוד לא מוכן).
--   * meeting_summaries          — הסיכום בלבד (לא התמליל), כדי שהכפתורים ("מייל למשתתפים", "מסמך משימות",
--                                  "להוסיף למשימות" — mt:<verb>:<id>) יעבדו גם אחרי שעות. נמחק אחרי 30 יום.
--   * meeting_summary_mark()     — סימון אטומי של פעולה שבוצעה (משימות / מסמך), כדי שלחיצה כפולה לא תוסיף משימות פעמיים.
--   * schedule_meeting_plans()   — יוצר משימת meeting_plan לשעה העגולה הבאה, למשתמשי פרו עם מספר פעיל וחיבור פעיל
--                                  שלא כיבו סיכומי פגישות (profile.meeting_summaries_disabled) או הודעות יזומות,
--                                  כשהשעה המקומית 07:00–22:59.
--   * purge_meeting_summaries()  — מינימום נתונים: סיכומים בני יותר מ-30 יום נמחקים.
-- שרת בלבד (service_role). RLS פעיל בלי policy — אף שורה ללקוח, כמו 0008-0013.
-- בלוק pg_cron נפרד בסוף הקובץ (כמו ב-0013): הוא מוחל רק בקידום לסביבת הייצור.
-- =============================================================================

alter type public.job_kind add value if not exists 'meeting_plan';
alter type public.job_kind add value if not exists 'meeting_summary';

create table public.meeting_summaries (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.users (id) on delete cascade,
  provider      text        not null check (provider in ('microsoft', 'google')),
  event_key     text        not null check (length(event_key) between 1 and 700),
  event_id      text        not null check (length(event_id) between 1 and 600),
  title         text        not null default '' check (length(title) <= 300),
  meeting_start timestamptz not null,
  meeting_end   timestamptz not null,
  attendees     jsonb       not null default '[]'::jsonb check (jsonb_typeof(attendees) = 'array' and pg_column_size(attendees) <= 16384),
  content       jsonb       not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 32768),
  done          text[]      not null default '{}' check (done <@ array['mail', 'doc', 'tasks']::text[]),
  created_at    timestamptz not null default now(),
  constraint meeting_summaries_event_unique unique (user_id, event_key),
  constraint meeting_summaries_times check (meeting_end >= meeting_start)
);
comment on table public.meeting_summaries is
  'סיכומי פגישות (פרו, lib/meetings): הסיכום, ההחלטות, המשימות והשאלות הפתוחות (content), המשתתפים (attendees) — בלי התמליל עצמו. שורה אחת לכל מופע של פגישה (event_key). נמחק אחרי 30 יום. שרת בלבד.';
comment on column public.meeting_summaries.event_key is
  '<provider>:<event id>:<שעת הסיום ISO> — מופע אחד של פגישה (בפגישה חוזרת לכל תאריך סיכום משלו).';
comment on column public.meeting_summaries.done is
  'פעולות שכבר בוצעו מהכפתורים (doc / tasks; mail נרשם לתיעוד) — meeting_summary_mark() מונע ביצוע כפול.';

create index meeting_summaries_user_idx    on public.meeting_summaries (user_id, created_at desc);
create index meeting_summaries_created_idx on public.meeting_summaries (created_at);

alter table public.meeting_summaries enable row level security;
revoke all on public.meeting_summaries from public, anon, authenticated;
grant all on public.meeting_summaries to service_role;

-- -----------------------------------------------------------------------------
-- meeting_summary_mark — פעולה מהכפתורים, פעם אחת: true כשנרשמה עכשיו, false כשכבר נרשמה (או שהשורה לא של המשתמש)
-- -----------------------------------------------------------------------------
create or replace function public.meeting_summary_mark(p_user uuid, p_id uuid, p_action text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_action is null or p_action not in ('mail', 'doc', 'tasks') then
    raise exception 'meeting_summary_mark: unknown action %', p_action using errcode = '22023';
  end if;
  update public.meeting_summaries s
     set done = array_append(s.done, p_action)
   where s.id = p_id
     and s.user_id = p_user
     and not (p_action = any (s.done));
  return found;
end;
$$;
comment on function public.meeting_summary_mark(uuid, uuid, text) is
  'מסמן פעולה (mail / doc / tasks) על סיכום פגישה של המשתמש, אטומית: true בפעם הראשונה, false אחר כך (לחיצה כפולה) או כשהשורה לא שלו. service_role בלבד.';

revoke execute on function public.meeting_summary_mark(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.meeting_summary_mark(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- schedule_meeting_plans — משימת meeting_plan לשעה העגולה הבאה (07:00–22:59 מקומי), למשתמשי פרו בלבד
-- dedupe_key = meeting_plan:<user>:<YYYY-MM-DD>T<HH> (זהה לקוד ב-lib/meetings/jobs.ts)
-- -----------------------------------------------------------------------------
create or replace function public.schedule_meeting_plans()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  insert into public.jobs (kind, user_id, run_at, payload, dedupe_key, max_attempts)
  select 'meeting_plan'::public.job_kind,
         c.user_id,
         c.run_at,
         jsonb_build_object('slot', to_char(c.local_at, 'YYYY-MM-DD"T"HH24')),
         'meeting_plan:' || c.user_id::text || ':' || to_char(c.local_at, 'YYYY-MM-DD"T"HH24'),
         2
    from (
      select u.id as user_id,
             s.run_at,
             s.run_at at time zone u.timezone as local_at
        from public.users u
        cross join lateral (select date_trunc('hour', now()) + interval '1 hour' as run_at) s
       where u.deleted_at is null
         and public.user_plan(u.id) = 'pro'
         and coalesce(u.profile ->> 'meeting_summaries_disabled', 'false') <> 'true'
         and coalesce(u.profile ->> 'proactive_disabled', 'false') <> 'true'
         and exists (select 1 from public.wa_identities w where w.user_id = u.id and w.status = 'active')
         and exists (select 1 from public.connections k where k.user_id = u.id and k.status = 'active')
    ) c
   where extract(hour from c.local_at) between 7 and 22
  on conflict (dedupe_key) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.schedule_meeting_plans() is
  'יוצר משימת meeting_plan לשעה העגולה הבאה לכל משתמש פרו עם מספר וואטסאפ פעיל וחיבור פעיל, שלא כיבה סיכומי פגישות, כשהשעה המקומית שלו 07:00–22:59. אידמפוטנטי לפי dedupe_key. מחזיר כמה נוצרו.';

revoke execute on function public.schedule_meeting_plans() from public, anon, authenticated;
grant  execute on function public.schedule_meeting_plans() to service_role;

-- -----------------------------------------------------------------------------
-- purge_meeting_summaries — מינימום נתונים: סיכומים בני יותר מ-30 יום נמחקים
-- -----------------------------------------------------------------------------
create or replace function public.purge_meeting_summaries(p_keep interval default interval '30 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.meeting_summaries where created_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_meeting_summaries(interval) is
  'מוחק שורות meeting_summaries ישנות מ-p_keep (ברירת מחדל 30 יום). מחזיר כמה נמחקו.';

revoke execute on function public.purge_meeting_summaries(interval) from public, anon, authenticated;
grant  execute on function public.purge_meeting_summaries(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): תכנון כל 20 דקות, ניקוי פעם ביום. בלוק נפרד — מוחל רק בקידום לייצור (כמו 0013).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — meeting summary planning not added';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_schedule_meeting_plans', '*/20 * * * *', 'select public.schedule_meeting_plans()');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_meeting_summaries', '27 3 * * *', 'select public.purge_meeting_summaries()');
end;
$$;
