-- =============================================================================
-- m5_reminders.test.sql — אבן דרך 5: reminders.recurrence / 'done' / schedule_morning_summaries()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "M5: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

delete from public.users;

create function pg_temp.check(p_label text, p_ok boolean)
returns void
language plpgsql
as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAILED: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

insert into public.users (id, email, timezone, morning_time, profile) values
  ('61111111-1111-4111-8111-111111111111', 'm5-on@example.com',      'Asia/Jerusalem', '07:30', '{"morning_summary_enabled": true}'),
  ('62222222-2222-4222-8222-222222222222', 'm5-off@example.com',     'Asia/Jerusalem', '07:30', '{"morning_summary_enabled": false}'),
  ('63333333-3333-4333-8333-333333333333', 'm5-nophone@example.com', 'Asia/Jerusalem', '08:00', '{"morning_summary_enabled": true}'),
  ('64444444-4444-4444-8444-444444444444', 'm5-unset@example.com',   'Asia/Jerusalem', '07:30', '{}');

insert into public.wa_identities (user_id, phone_e164) values
  ('61111111-1111-4111-8111-111111111111', '+972500000061'),
  ('62222222-2222-4222-8222-222222222222', '+972500000062'),
  ('64444444-4444-4444-8444-444444444444', '+972500000064');

-- ---------- reminders.recurrence + 'done' ----------
insert into public.reminders (user_id, text, due_at, recurrence) values
  ('61111111-1111-4111-8111-111111111111', 'לקחת תרופה', now() + interval '1 day', '{"freq": "daily", "hour": 8, "minute": 0}');
select pg_temp.check('reminders: recurrence stored',
  (select recurrence ->> 'freq' from public.reminders where text = 'לקחת תרופה') = 'daily');

update public.reminders set status = 'done', last_fired_at = now() where text = 'לקחת תרופה';
select pg_temp.check('reminders: status done + last_fired_at',
  (select status::text from public.reminders where text = 'לקחת תרופה') = 'done');

do $$
begin
  begin
    insert into public.reminders (user_id, text, due_at, recurrence)
    values ('61111111-1111-4111-8111-111111111111', 'רע', now(), '{"freq": "hourly", "hour": 8, "minute": 0}');
    raise exception 'FAILED: bad recurrence accepted';
  exception when check_violation then
    raise notice 'ok - reminders: invalid recurrence rejected';
  end;
end;
$$;

-- ---------- schedule_morning_summaries ----------
select pg_temp.check('schedule_morning_summaries: creates at least one job for the opted-in user',
  public.schedule_morning_summaries(interval '5 days') >= 1);

select pg_temp.check('schedule_morning_summaries: only opted-in users with an active phone',
  not exists (select 1 from public.jobs where kind = 'morning_summary' and user_id <> '61111111-1111-4111-8111-111111111111'));

select pg_temp.check('schedule_morning_summaries: Sunday–Thursday only, at 07:30 local, in the future',
  not exists (
    select 1 from public.jobs
     where kind = 'morning_summary'
       and (extract(dow from (run_at at time zone 'Asia/Jerusalem')) not between 0 and 4
            or to_char(run_at at time zone 'Asia/Jerusalem', 'HH24:MI') <> '07:30'
            or run_at <= now())));

select pg_temp.check('schedule_morning_summaries: dedupe key and payload match the worker',
  not exists (
    select 1 from public.jobs
     where kind = 'morning_summary'
       and (dedupe_key <> 'morning_summary:61111111-1111-4111-8111-111111111111:' || (payload ->> 'local_date') || ':0730'
            or payload ->> 'time' <> '07:30'
            or (payload ->> 'local_date')::date <> (run_at at time zone 'Asia/Jerusalem')::date)));

select pg_temp.check('schedule_morning_summaries: idempotent (second run creates nothing)',
  public.schedule_morning_summaries(interval '5 days') = 0);

-- a changed morning time gets its own key (the worker skips the stale one)
update public.users set morning_time = '08:15' where id = '61111111-1111-4111-8111-111111111111';
select pg_temp.check('schedule_morning_summaries: new time → new jobs',
  public.schedule_morning_summaries(interval '5 days') >= 1);
select pg_temp.check('schedule_morning_summaries: new keys end with :0815',
  exists (select 1 from public.jobs where dedupe_key like 'morning_summary:61111111-%:0815'));

select pg_temp.check('schedule_morning_summaries: callable only by service_role',
  not has_function_privilege('authenticated', 'public.schedule_morning_summaries(interval)', 'execute'));

select 'M5: ALL CHECKS PASSED';
rollback;
