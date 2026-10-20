-- =============================================================================
-- functions.test.sql — בדיקות עשן לפונקציות של 0003 (כ-postgres / service_role).
-- טרנזקציה אחת + ROLLBACK. הצלחה = "FUNCTIONS: ALL CHECKS PASSED".
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/functions.test.sql
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

-- Clean slate inside the transaction (rolled back at the end): the counting functions below
-- (purge_*, expire_*, claim_due_jobs) act on every row, so seed.sql data must not be present.
delete from public.users;
delete from public.auth_otps;
delete from public.wa_link_attempts;
delete from public.wa_templates;

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

-- ---------- fixtures ----------
insert into public.users (id, email, name, timezone, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'fn-trial@example.com', 'T', 'Asia/Jerusalem', now() - interval '2 days'),
  ('44444444-4444-4444-8444-444444444444', 'fn-pro@example.com',   'P', 'Asia/Jerusalem', now() - interval '60 days'),
  ('55555555-5555-4555-8555-555555555555', 'fn-deleted@example.com', 'D', 'Asia/Jerusalem', now() - interval '2 days');
update public.users set deleted_at = now() where id = '55555555-5555-4555-8555-555555555555';

insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('44444444-4444-4444-8444-444444444444', 'pro', 'active', now() + interval '20 days');

-- ---------- user_plan ----------
select pg_temp.check('user_plan: no subscription → trial',
  public.user_plan('33333333-3333-4333-8333-333333333333') = 'trial');
select pg_temp.check('user_plan: active pro → pro',
  public.user_plan('44444444-4444-4444-8444-444444444444') = 'pro');
update public.subscriptions set status = 'cancelled', cancelled_at = now() where user_id = '44444444-4444-4444-8444-444444444444';
select pg_temp.check('user_plan: cancelled but period not over → still pro',
  public.user_plan('44444444-4444-4444-8444-444444444444') = 'pro');
update public.subscriptions set next_charge_at = now() - interval '1 day' where user_id = '44444444-4444-4444-8444-444444444444';
select pg_temp.check('user_plan: cancelled and period over → trial',
  public.user_plan('44444444-4444-4444-8444-444444444444') = 'trial');
update public.subscriptions set status = 'active', cancelled_at = null, next_charge_at = now() + interval '20 days'
 where user_id = '44444444-4444-4444-8444-444444444444';

-- ---------- plan_message_limit ----------
select pg_temp.check('plan_message_limit: 10 / 750 / 3000',
  public.plan_message_limit('trial') = 10 and public.plan_message_limit('basic') = 750 and public.plan_message_limit('pro') = 3000);

-- ---------- count_trial_message ----------
do $$
declare
  r integer;
begin
  for i in 1..9 loop
    r := public.count_trial_message('33333333-3333-4333-8333-333333333333');
  end loop;
  perform pg_temp.check('count: after 9 messages → 1 remaining', r = 1);
  r := public.count_trial_message('33333333-3333-4333-8333-333333333333');
  perform pg_temp.check('count: 10th message → 0 remaining', r = 0);
  r := public.count_trial_message('33333333-3333-4333-8333-333333333333');
  perform pg_temp.check('count: 11th message → -1 (not counted)', r = -1);
end;
$$;
select pg_temp.check('count: usage row is trial period (signup date), 10 counted, 0 remaining, limit 10',
  (select counted_messages = 10 and free_remaining = 0 and plan_limit = 10
      and period_start = ((now() - interval '2 days') at time zone 'Asia/Jerusalem')::date
     from public.usage where user_id = '33333333-3333-4333-8333-333333333333'));
select pg_temp.check('count: exactly one usage row for the trial user',
  (select count(*) from public.usage where user_id = '33333333-3333-4333-8333-333333333333') = 1);

-- Two statements on purpose: an uncorrelated subquery in the same SELECT is an InitPlan that
-- Postgres evaluates before the function call, so the usage row would not exist yet.
select pg_temp.check('count: pro user → 2999 remaining on first message',
  public.count_trial_message('44444444-4444-4444-8444-444444444444') = 2999);
select pg_temp.check('count: pro user → calendar-month period in the user timezone',
  (select period_start from public.usage where user_id = '44444444-4444-4444-8444-444444444444')
      = date_trunc('month', now() at time zone 'Asia/Jerusalem')::date);

do $$
begin
  perform public.count_trial_message('55555555-5555-4555-8555-555555555555');
  raise exception 'FAILED: count on deleted user should raise';
exception
  when no_data_found then
    raise notice 'ok - count: deleted user raises P0002';
end;
$$;

-- ---------- jobs: claim / finish / requeue ----------
insert into public.jobs (id, user_id, kind, run_at) values
  ('66666666-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'reminder',        now() - interval '3 minutes'),
  ('66666666-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'reminder',        now() - interval '2 minutes'),
  ('66666666-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'morning_summary', now() - interval '1 minute'),
  ('66666666-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 'charge',          now() + interval '1 hour');

select pg_temp.check('claim(2): returns the 2 earliest due jobs, running, attempts=1, locked',
  (select count(*) = 2
      and bool_and(status = 'running' and attempts = 1 and locked_at is not null)
      and array_agg(id order by run_at) = array['66666666-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000002']::uuid[]
     from public.claim_due_jobs(2)));
select pg_temp.check('claim(10): only the remaining due job (future job untouched)',
  (select count(*) = 1 and bool_and(id = '66666666-0000-4000-8000-000000000003') from public.claim_due_jobs(10)));
select pg_temp.check('claim again: nothing left',
  (select count(*) from public.claim_due_jobs(10)) = 0);
select pg_temp.check('future job still queued',
  (select status from public.jobs where id = '66666666-0000-4000-8000-000000000004') = 'queued');

select pg_temp.check('finish_job(ok) → done',
  (select status from public.finish_job('66666666-0000-4000-8000-000000000001')) = 'done');
select pg_temp.check('finish_job(error) with attempts<max → queued with backoff & last_error',
  (select status = 'queued' and run_at > now() + interval '4 minutes' and last_error = 'boom' and locked_at is null
     from public.finish_job('66666666-0000-4000-8000-000000000002', 'boom')));
select pg_temp.check('finish_job(error, explicit retry_at) → queued at that time',
  (select status = 'queued' and run_at between now() + interval '2 days' - interval '1 minute' and now() + interval '2 days' + interval '1 minute'
     from public.finish_job('66666666-0000-4000-8000-000000000003', 'hyp declined', now() + interval '2 days')));
update public.jobs set attempts = 3 where id = '66666666-0000-4000-8000-000000000003';
select pg_temp.check('finish_job(error) with attempts>=max → failed',
  (select status from public.finish_job('66666666-0000-4000-8000-000000000003', 'boom again')) = 'failed');

update public.jobs set status = 'running', locked_at = now() - interval '20 minutes', attempts = 1 where id = '66666666-0000-4000-8000-000000000001';
update public.jobs set status = 'running', locked_at = now() - interval '20 minutes', attempts = 3 where id = '66666666-0000-4000-8000-000000000003';
update public.jobs set status = 'running', locked_at = now() - interval '2 minutes',  attempts = 1 where id = '66666666-0000-4000-8000-000000000002';
-- Function call and status checks in separate statements (see the InitPlan note above).
select pg_temp.check('requeue_stale_jobs: exactly 1 requeued',
  public.requeue_stale_jobs(interval '15 minutes') = 1);
select pg_temp.check('requeue_stale_jobs: stale one requeued, exhausted one failed, fresh one untouched',
  (select status from public.jobs where id = '66666666-0000-4000-8000-000000000001') = 'queued'
  and (select status from public.jobs where id = '66666666-0000-4000-8000-000000000003') = 'failed'
  and (select status from public.jobs where id = '66666666-0000-4000-8000-000000000002') = 'running');

-- ---------- dispatch_due_jobs: בלי pg_net/vault → לא נוגע במשימות ----------
update public.jobs set status = 'queued', locked_at = null, run_at = now() - interval '1 minute' where id = '66666666-0000-4000-8000-000000000001';
do $$
declare
  n integer;
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise notice 'skip - dispatch_due_jobs (pg_net + vault present; would call QStash)';
    return;
  end if;
  n := public.dispatch_due_jobs(10);
  perform pg_temp.check('dispatch_due_jobs without pg_net/vault → 0 and job stays queued',
    n = 0 and (select status from public.jobs where id = '66666666-0000-4000-8000-000000000001') = 'queued');
end;
$$;

-- ---------- expire_pending_actions ----------
insert into public.pending_actions (user_id, kind, created_at, expires_at) values
  ('33333333-3333-4333-8333-333333333333', 'send_mail', now() - interval '20 minutes', now() - interval '10 minutes'),
  ('33333333-3333-4333-8333-333333333333', 'send_mail', now() - interval '1 minute',   now() + interval '9 minutes');
select pg_temp.check('expire_pending_actions: returns 1',
  public.expire_pending_actions() = 1);
select pg_temp.check('expire_pending_actions: 1 expired, 1 still pending',
  (select count(*) filter (where status = 'expired') = 1 and count(*) filter (where status = 'pending') = 1
     from public.pending_actions where user_id = '33333333-3333-4333-8333-333333333333'));

-- ---------- purge_old_messages / purge_old_audit_log ----------
insert into public.messages (user_id, wa_message_id, direction, text, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'wamid.fn.old',  'in', 'ישן',  now() - interval '100 days'),
  ('33333333-3333-4333-8333-333333333333', 'wamid.fn.new',  'in', 'חדש',  now() - interval '10 days'),
  ('44444444-4444-4444-8444-444444444444', 'wamid.fn.pro',  'in', 'פרו',  now() - interval '100 days');
insert into public.audit_log (user_id, action, target, reason, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'send_mail', 'someone@x', 'why', now() - interval '100 days'),
  ('33333333-3333-4333-8333-333333333333', 'send_mail', 'someone@y', 'why', now() - interval '10 days'),
  ('33333333-3333-4333-8333-333333333333', 'send_mail', 'ancient@z', 'why', now() - interval '800 days');

select pg_temp.check('purge_old_messages(90, trial/basic): deletes 1 old message, anonymizes 2 old audit rows',
  (select messages_deleted = 1 and audit_rows_anonymized = 2
     from public.purge_old_messages(90, array['trial', 'basic']::public.plan_kind[])));
select pg_temp.check('purge_old_messages(90, trial/basic): pro untouched, recent rows kept',
  (select count(*) from public.messages where user_id = '33333333-3333-4333-8333-333333333333') = 1
  and (select count(*) from public.messages where wa_message_id = 'wamid.fn.pro') = 1
  and (select count(*) from public.audit_log where user_id = '33333333-3333-4333-8333-333333333333' and anonymized_at is not null and target is null) = 2
  and (select target from public.audit_log where user_id = '33333333-3333-4333-8333-333333333333' and anonymized_at is null) = 'someone@y');
select pg_temp.check('purge_old_messages(365, pro): pro message (100d) kept',
  (select messages_deleted = 0 from public.purge_old_messages(365, array['pro']::public.plan_kind[])));
select pg_temp.check('purge_old_messages(90, null=all): now deletes the pro message',
  (select messages_deleted = 1 from public.purge_old_messages(90)));
select pg_temp.check('purge_old_audit_log(730): returns 1',
  public.purge_old_audit_log(730) = 1);
select pg_temp.check('purge_old_audit_log(730): deletes only the 800-day row',
  (select count(*) from public.audit_log where user_id = '33333333-3333-4333-8333-333333333333') = 2);

-- ---------- purge_expired_tokens ----------
insert into public.auth_otps (email, code_hash, expires_at) values
  ('fn-trial@example.com', 'h', now() - interval '2 days'),
  ('fn-trial@example.com', 'h', now() + interval '5 minutes');
insert into public.link_tokens (user_id, token, expires_at) values
  ('33333333-3333-4333-8333-333333333333', 'FNOL-0001', now() - interval '10 days'),
  ('33333333-3333-4333-8333-333333333333', 'FNNW-0002', now() + interval '10 minutes');
insert into public.wa_link_attempts (phone_e164, attempts, last_attempt_at) values
  ('+972509999001', 2, now() - interval '40 days'),
  ('+972509999002', 3, now() - interval '1 hour');
select pg_temp.check('purge_expired_tokens: (1,1,1)',
  (select otps_deleted = 1 and link_tokens_deleted = 1 and link_attempts_deleted = 1 from public.purge_expired_tokens()));
select pg_temp.check('purge_expired_tokens: fresh rows kept',
  (select count(*) from public.auth_otps where email = 'fn-trial@example.com') = 1
  and (select count(*) from public.link_tokens where user_id = '33333333-3333-4333-8333-333333333333') = 1
  and (select count(*) from public.wa_link_attempts where phone_e164 like '+9725099990%') = 1);

-- ---------- updated_at trigger ----------
update public.users set name = 'T2' where id = '33333333-3333-4333-8333-333333333333';
select pg_temp.check('set_updated_at trigger bumps updated_at',
  (select updated_at > created_at and updated_at >= now() - interval '1 second'
     from public.users where id = '33333333-3333-4333-8333-333333333333'));

-- ---------- cascade: מחיקת משתמש = 0 שורות (PLAN §12.7) ----------
delete from public.users where id = '33333333-3333-4333-8333-333333333333';
select pg_temp.check('delete user cascades to every dependent table',
  (select count(*) from public.messages        where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.jobs            where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.usage           where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.pending_actions where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.audit_log       where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.link_tokens     where user_id = '33333333-3333-4333-8333-333333333333') = 0);

rollback;

\pset tuples_only off
\echo FUNCTIONS: ALL CHECKS PASSED
