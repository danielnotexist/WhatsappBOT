-- =============================================================================
-- 0005_m5_reminders_morning.sql — אבן דרך 5: תזכורות חוזרות + תזמון סיכום בוקר
-- (0004 נשאר פנוי בכוונה — סוכן מקביל עשוי להוסיף מיגרציה משלו.)
--
--   * reminders.recurrence      — כלל חזרה (null = חד-פעמית). due_at = המופע הבא.
--   * reminders.last_fired_at   — מתי נשלחה בפעם האחרונה (אידמפוטנטיות: job כפול לא שולח פעמיים).
--   * reminder_status += 'done' — המשתמש לחץ "טופל" (נבדל מ-'sent' = נשלחה ולא אושרה).
--   * schedule_morning_summaries() — pg_cron כל 10 דקות: job מסוג morning_summary לכל משתמש
--     שבחר שעה (profile.morning_summary_enabled = true) ויש לו מספר פעיל, בימים א׳–ה׳,
--     dedupe_key = morning_summary:<user>:<YYYY-MM-DD>:<HHMM> (זהה לקוד ב-lib/jobs/morning-summary.ts).
--     ה-worker בודק שוב (השעה עדיין זו, לא כבוי/מושהה, לא נשלח היום) — כך שינוי שעה לא שולח פעמיים.
-- =============================================================================

-- ADD VALUE לא משמש באותה מיגרציה (מגבלת Postgres לטרנזקציה אחת).
alter type public.reminder_status add value if not exists 'done';

alter table public.reminders
  add column if not exists recurrence    jsonb,
  add column if not exists last_fired_at timestamptz;

alter table public.reminders
  add constraint reminders_recurrence_shape check (
    recurrence is null
    or (jsonb_typeof(recurrence) = 'object'
        and recurrence ->> 'freq' in ('daily', 'weekly', 'monthly')
        and (recurrence ->> 'hour')::int between 0 and 23
        and (recurrence ->> 'minute')::int between 0 and 59)
  );

comment on column public.reminders.recurrence is
  'כלל חזרה: {"freq":"daily|weekly|monthly","hour":8,"minute":0,"weekdays":[0..6],"monthDay":1..31} בשעון המקומי של המשתמש. null = חד-פעמית. אחרי כל שליחה due_at מתקדם למופע הבא ונוצר job חדש.';
comment on column public.reminders.last_fired_at is
  'מתי נשלחה התזכורת בפעם האחרונה. job שמגיע אחרי שכבר נשלחה לאותו due_at — מדולג.';

create index if not exists reminders_status_due_idx on public.reminders (status, due_at);

-- -----------------------------------------------------------------------------
-- schedule_morning_summaries — מבטיח job של סיכום בוקר ל-p_horizon הקרוב
-- -----------------------------------------------------------------------------
create or replace function public.schedule_morning_summaries(p_horizon interval default interval '36 hours')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  insert into public.jobs (kind, user_id, run_at, payload, dedupe_key)
  select 'morning_summary',
         c.user_id,
         c.run_at,
         jsonb_build_object('local_date', to_char(c.local_day, 'YYYY-MM-DD'), 'time', to_char(c.morning_time, 'HH24:MI')),
         'morning_summary:' || c.user_id::text || ':' || to_char(c.local_day, 'YYYY-MM-DD') || ':' || to_char(c.morning_time, 'HH24MI')
    from (
      select u.id as user_id,
             u.morning_time,
             d.local_day,
             (d.local_day + u.morning_time) at time zone u.timezone as run_at
        from public.users u
        cross join lateral (
          select ((now() at time zone u.timezone)::date + g)::date as local_day
            from generate_series(0, 3) as g
        ) d
       where u.deleted_at is null
         and (u.profile ->> 'morning_summary_enabled') = 'true'
         and exists (select 1 from public.wa_identities w where w.user_id = u.id and w.status = 'active')
         and extract(dow from d.local_day) between 0 and 4          -- א׳–ה׳ (Postgres: 0 = ראשון)
    ) c
   where c.run_at > now()
     and c.run_at <= now() + p_horizon
  on conflict (dedupe_key) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.schedule_morning_summaries(interval) is
  'יוצר משימות morning_summary לכל משתמש שבחר שעת סיכום בוקר (profile.morning_summary_enabled=true) ויש לו מספר וואטסאפ פעיל, לימים א׳–ה׳ בתוך p_horizon הקרוב (לפי users.timezone + morning_time, כולל מעבר שעון קיץ/חורף). אידמפוטנטי לפי dedupe_key. מחזיר כמה נוצרו.';

revoke execute on function public.schedule_morning_summaries(interval) from public, anon, authenticated;
grant  execute on function public.schedule_morning_summaries(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): כל 10 דקות
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — morning summary scheduling not added';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_schedule_morning_summaries', '*/10 * * * *', 'select public.schedule_morning_summaries()');
end;
$$;
