-- =============================================================================
-- meeting_summaries.test.sql — מיגרציה 0014: meeting_summaries / meeting_summary_mark() / schedule_meeting_plans() /
-- purge_meeting_summaries() / job_kind 'meeting_plan', 'meeting_summary'
-- טרנזקציה אחת + ROLLBACK. הצלחה = "MEETING SUMMARIES: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

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

create function pg_temp.expect_state(p_label text, p_state text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate = p_state then
        raise notice 'ok - % (%)', p_label, p_state;
        return;
      end if;
      raise exception 'FAILED: % — expected %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — expected % but the statement succeeded', p_label, p_state;
end;
$$;

insert into public.users (id, email, timezone, profile) values
  ('e1111111-1111-4111-8111-111111111111', 'pro-meetings@example.com',   'Asia/Jerusalem', '{}'),
  ('e2222222-2222-4222-8222-222222222222', 'basic-meetings@example.com', 'Asia/Jerusalem', '{}'),
  ('e3333333-3333-4333-8333-333333333333', 'pro-off@example.com',        'Asia/Jerusalem', '{"meeting_summaries_disabled": true}'),
  ('e4444444-4444-4444-8444-444444444444', 'pro-noconn@example.com',     'Asia/Jerusalem', '{}');
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('e1111111-1111-4111-8111-111111111111', 'pro',   'active', now() + interval '20 days'),
  ('e2222222-2222-4222-8222-222222222222', 'basic', 'active', now() + interval '20 days'),
  ('e3333333-3333-4333-8333-333333333333', 'pro',   'active', now() + interval '20 days'),
  ('e4444444-4444-4444-8444-444444444444', 'pro',   'active', now() + interval '20 days');
insert into public.wa_identities (user_id, phone_e164) values
  ('e1111111-1111-4111-8111-111111111111', '+972500000921'),
  ('e2222222-2222-4222-8222-222222222222', '+972500000922'),
  ('e3333333-3333-4333-8333-333333333333', '+972500000923'),
  ('e4444444-4444-4444-8444-444444444444', '+972500000924');
insert into public.connections (user_id, provider, account_email) values
  ('e1111111-1111-4111-8111-111111111111', 'microsoft', 'pro@levi-law.co.il'),
  ('e2222222-2222-4222-8222-222222222222', 'google',    'basic@gmail.com'),
  ('e3333333-3333-4333-8333-333333333333', 'microsoft', 'off@levi-law.co.il');

-- ---------- the job kinds ----------
select pg_temp.check('job_kind has meeting_plan and meeting_summary',
  'meeting_plan' = any (enum_range(null::public.job_kind)::text[]) and 'meeting_summary' = any (enum_range(null::public.job_kind)::text[]));

-- ---------- the table ----------
insert into public.meeting_summaries (id, user_id, provider, event_key, event_id, title, meeting_start, meeting_end, attendees, content) values
  ('f1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 'microsoft', 'microsoft:AAMk1:2026-10-21T06:45:00.000Z', 'AAMk1', 'סטטוס פרויקט כהן',
   '2026-10-21T06:00:00Z', '2026-10-21T06:45:00Z', '[{"name": "יוסי כהן", "email": "yossi@kohen.co.il"}]', '{"summary": "סוכם להגיש עד 28.10", "actionItems": []}');
select pg_temp.check('a summary row starts with nothing done', (select done = '{}' from public.meeting_summaries where id = 'f1111111-1111-4111-8111-111111111111'));

select pg_temp.expect_state('one row per (user, occurrence)', '23505',
  $sql$insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content) values ('e1111111-1111-4111-8111-111111111111', 'microsoft', 'microsoft:AAMk1:2026-10-21T06:45:00.000Z', 'AAMk1', now(), now(), '{}')$sql$);
select pg_temp.expect_state('unknown provider rejected', '23514',
  $sql$insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content) values ('e1111111-1111-4111-8111-111111111111', 'zoom', 'k2', 'e', now(), now(), '{}')$sql$);
select pg_temp.expect_state('content must be an object', '23514',
  $sql$insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content) values ('e1111111-1111-4111-8111-111111111111', 'google', 'k3', 'e', now(), now(), '[]')$sql$);
select pg_temp.expect_state('attendees must be an array', '23514',
  $sql$insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content, attendees) values ('e1111111-1111-4111-8111-111111111111', 'google', 'k4', 'e', now(), now(), '{}', '{}')$sql$);
select pg_temp.expect_state('the end is not before the start', '23514',
  $sql$insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content) values ('e1111111-1111-4111-8111-111111111111', 'google', 'k5', 'e', now(), now() - interval '1 hour', '{}')$sql$);
select pg_temp.expect_state('only known actions in done', '23514',
  $sql$update public.meeting_summaries set done = array['send'] where id = 'f1111111-1111-4111-8111-111111111111'$sql$);

-- ---------- meeting_summary_mark: once per action, the owner only ----------
select pg_temp.check('first mark of tasks → true',
  public.meeting_summary_mark('e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'tasks'));
select pg_temp.check('second mark of tasks → false (a second press adds nothing)',
  not public.meeting_summary_mark('e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'tasks'));
select pg_temp.check('another action is independent',
  public.meeting_summary_mark('e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'doc'));
select pg_temp.check('another user cannot mark the row',
  not public.meeting_summary_mark('e2222222-2222-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111', 'mail'));
select pg_temp.check('done holds tasks and doc, once each',
  (select done = array['tasks', 'doc'] from public.meeting_summaries where id = 'f1111111-1111-4111-8111-111111111111'));
select pg_temp.expect_state('an unknown action is an error', '22023',
  $sql$select public.meeting_summary_mark('e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'send')$sql$);

-- ---------- schedule_meeting_plans: pro + phone + connection + summaries on, 07:00–22:59 local ----------
do $$
declare
  v_local_hour integer := extract(hour from ((date_trunc('hour', now()) + interval '1 hour') at time zone 'Asia/Jerusalem'));
  v_n integer := public.schedule_meeting_plans();
begin
  if v_local_hour between 7 and 22 then
    perform pg_temp.check('schedule_meeting_plans: one job, for the pro user with a connection and the summaries on only', v_n = 1
      and (select user_id from public.jobs where kind = 'meeting_plan') = 'e1111111-1111-4111-8111-111111111111');
    perform pg_temp.check('schedule_meeting_plans: next round hour, dedupe key matches the worker, two attempts',
      (select run_at = date_trunc('hour', now()) + interval '1 hour'
              and dedupe_key = 'meeting_plan:e1111111-1111-4111-8111-111111111111:' || (payload ->> 'slot')
              and max_attempts = 2
         from public.jobs where kind = 'meeting_plan'));
    perform pg_temp.check('schedule_meeting_plans: idempotent', public.schedule_meeting_plans() = 0);
  else
    perform pg_temp.check('schedule_meeting_plans: nothing outside 07:00–22:59', v_n = 0);
  end if;
end;
$$;

-- ---------- purge ----------
insert into public.meeting_summaries (user_id, provider, event_key, event_id, meeting_start, meeting_end, content, created_at) values
  ('e1111111-1111-4111-8111-111111111111', 'google', 'google:old:x', 'old', now() - interval '40 days', now() - interval '40 days', '{}', now() - interval '31 days');
select pg_temp.check('purge_meeting_summaries removes rows older than 30 days', public.purge_meeting_summaries() = 1);
select pg_temp.check('… the recent row stays', exists (select 1 from public.meeting_summaries where id = 'f1111111-1111-4111-8111-111111111111'));

-- ---------- privileges ----------
select pg_temp.check('anon / authenticated have no table privileges',
  not has_table_privilege('anon', 'public.meeting_summaries', 'select')
  and not has_table_privilege('authenticated', 'public.meeting_summaries', 'select')
  and not has_table_privilege('authenticated', 'public.meeting_summaries', 'update'));
select pg_temp.check('the functions are service_role only',
  not has_function_privilege('authenticated', 'public.meeting_summary_mark(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.schedule_meeting_plans()', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_meeting_summaries(interval)', 'execute')
  and has_function_privilege('service_role', 'public.meeting_summary_mark(uuid, uuid, text)', 'execute'));

-- deleting the user removes the rows
delete from public.users where id = 'e1111111-1111-4111-8111-111111111111';
select pg_temp.check('on delete cascade', not exists (select 1 from public.meeting_summaries where user_id = 'e1111111-1111-4111-8111-111111111111'));

select 'MEETING SUMMARIES: ALL CHECKS PASSED';
rollback;
