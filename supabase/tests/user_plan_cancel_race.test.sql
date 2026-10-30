-- =============================================================================
-- user_plan_cancel_race.test.sql — 0023: user_plan() של שורה active עם cancelled_at = מנוי מבוטל.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "USER PLAN CANCEL RACE: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

insert into public.users (id, email) values
  ('a0230000-0000-4000-8000-000000000001', 'race-1@example.com'),
  ('a0230000-0000-4000-8000-000000000002', 'race-2@example.com'),
  ('a0230000-0000-4000-8000-000000000003', 'race-3@example.com');
insert into public.subscriptions (user_id, plan, status, next_charge_at, cancelled_at) values
  ('a0230000-0000-4000-8000-000000000001', 'pro', 'active', now() + interval '20 days', now()),
  ('a0230000-0000-4000-8000-000000000002', 'pro', 'active', now() - interval '1 day',   now() - interval '40 days'),
  ('a0230000-0000-4000-8000-000000000003', 'basic', 'active', now() + interval '20 days', null);

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

select pg_temp.check('active + cancelled_at, period not over → the plan to the end of it',
  public.user_plan('a0230000-0000-4000-8000-000000000001') = 'pro');
select pg_temp.check('active + cancelled_at, period over → trial (no free service after a raced cancel)',
  public.user_plan('a0230000-0000-4000-8000-000000000002') = 'trial');
select pg_temp.check('a plain active subscription is unchanged',
  public.user_plan('a0230000-0000-4000-8000-000000000003') = 'basic');

select 'USER PLAN CANCEL RACE: ALL CHECKS PASSED';

rollback;
