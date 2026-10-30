-- =============================================================================
-- finish_job_guard.test.sql — 0022: finish_job() finishes only a running job, and only the attempt that runs now.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "FINISH JOB GUARD: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

insert into public.users (id, email) values ('a0220000-0000-4000-8000-000000000001', 'finish-guard@example.com');
insert into public.jobs (id, user_id, kind, run_at, status, attempts) values
  ('a0220000-0000-4000-8000-0000000000a1', 'a0220000-0000-4000-8000-000000000001', 'reminder', now(), 'done',      1),
  ('a0220000-0000-4000-8000-0000000000a2', 'a0220000-0000-4000-8000-000000000001', 'reminder', now(), 'cancelled', 0),
  ('a0220000-0000-4000-8000-0000000000a3', 'a0220000-0000-4000-8000-000000000001', 'reminder', now(), 'running',   2),
  ('a0220000-0000-4000-8000-0000000000a4', 'a0220000-0000-4000-8000-000000000001', 'reminder', now(), 'running',   1);

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

select public.finish_job('a0220000-0000-4000-8000-0000000000a1', 'late error');
select pg_temp.check('a late error on a done job leaves it done',
  (select status = 'done' and last_error is null from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a1'));

select public.finish_job('a0220000-0000-4000-8000-0000000000a2', 'late error');
select public.finish_job('a0220000-0000-4000-8000-0000000000a2');
select pg_temp.check('a cancelled job stays cancelled',
  (select status from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a2') = 'cancelled');

select public.finish_job('a0220000-0000-4000-8000-0000000000a3', null, null, 1);
select pg_temp.check('a finish from an earlier attempt does not touch the running one',
  (select status = 'running' and attempts = 2 from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a3'));
select public.finish_job('a0220000-0000-4000-8000-0000000000a3', null, null, 2);
select pg_temp.check('the matching attempt finishes it',
  (select status from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a3') = 'done');
select public.finish_job('a0220000-0000-4000-8000-0000000000a3', 'error after success', null, 2);
select pg_temp.check('an error after success does not re-queue it',
  (select status = 'done' and last_error is null from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a3'));

select public.finish_job('a0220000-0000-4000-8000-0000000000a4', 'boom');
select pg_temp.check('without p_attempts a running job still finishes (error → queued with backoff)',
  (select status = 'queued' and last_error = 'boom' from public.jobs where id = 'a0220000-0000-4000-8000-0000000000a4'));

set local role anon;
do $$
begin
  begin
    perform public.finish_job('a0220000-0000-4000-8000-0000000000a4');
    raise exception 'FAILED: anon ran finish_job';
  exception when insufficient_privilege then
    raise notice 'ok - finish_job: not for anon';
  end;
end;
$$;
reset role;

select 'FINISH JOB GUARD: ALL CHECKS PASSED';

rollback;
