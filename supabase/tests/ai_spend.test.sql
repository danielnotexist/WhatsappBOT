-- =============================================================================
-- ai_spend.test.sql — מיגרציות 0009 ו-0010: ai_spend / ai_spend_users / ai_spend_add() / ai_spend_admit_message() /
-- ai_spend_reserve() / ai_spend_adjust()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "AI SPEND: ALL CHECKS PASSED".
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

-- ---- the daily total ----
select pg_temp.check('first call of the day creates the row and returns its cost',
  public.ai_spend_add('2026-10-22', 0.0123) = 0.0123);
select pg_temp.check('a second call adds up',
  public.ai_spend_add('2026-10-22', 0.5, 1) = 0.5123);
select pg_temp.check('a negative or null cost counts as 0 (the total never goes down)',
  public.ai_spend_add('2026-10-22', -1) = 0.5123 and public.ai_spend_add('2026-10-22', null) = 0.5123);
select pg_temp.check('calls counted (4 calls)',
  (select calls from public.ai_spend where day = '2026-10-22') = 4);
select pg_temp.check('another day starts from zero',
  public.ai_spend_add('2026-10-23', 0.25) = 0.25);
select pg_temp.check('the default day is the calendar day in Asia/Jerusalem',
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'ai_spend' and column_name = 'day')
    like '%Asia/Jerusalem%');
select pg_temp.expect_state('cost_usd cannot be negative', '23514',
  $sql$insert into public.ai_spend (day, cost_usd) values ('2026-01-01', -0.1)$sql$);

-- ---- reserve before a call, settle after (0010) ----
select pg_temp.check('reserve: the first call of a day creates the row with the estimate',
  public.ai_spend_reserve('2026-11-01', 0.4, 1) = 0.4);
select pg_temp.check('reserve: … and counts one call',
  (select calls from public.ai_spend where day = '2026-11-01') = 1);
select pg_temp.check('reserve: a second estimate that still fits → the new total',
  public.ai_spend_reserve('2026-11-01', 0.5, 1) = 0.9);
select pg_temp.check('reserve: an estimate that would pass the budget → -1',
  public.ai_spend_reserve('2026-11-01', 0.2, 1) = -1);
select pg_temp.check('reserve: … and nothing changes',
  (select cost_usd from public.ai_spend where day = '2026-11-01') = 0.9
  and (select calls from public.ai_spend where day = '2026-11-01') = 2);
select pg_temp.check('reserve: exactly up to the budget is allowed',
  public.ai_spend_reserve('2026-11-01', 0.1, 1) = 1.0);
select pg_temp.check('reserve: an estimate larger than the whole budget, or no budget → -1',
  public.ai_spend_reserve('2026-11-02', 2, 1) = -1
  and public.ai_spend_reserve('2026-11-02', 0.1, null) = -1);
select pg_temp.check('reserve: … and no row',
  not exists (select 1 from public.ai_spend where day = '2026-11-02'));
select pg_temp.check('adjust: the actual cost below the estimate gives the difference back',
  public.ai_spend_adjust('2026-11-01', -0.35) = 0.65);
select pg_temp.check('adjust: above the estimate adds the difference',
  public.ai_spend_adjust('2026-11-01', 0.05) = 0.7);
select pg_temp.check('adjust: calls unchanged',
  (select calls from public.ai_spend where day = '2026-11-01') = 3);
select pg_temp.check('adjust: never below 0',
  public.ai_spend_adjust('2026-11-01', -5) = 0);
select pg_temp.check('adjust: null moves nothing',
  public.ai_spend_adjust('2026-11-01', null) = 0);
select pg_temp.check('adjust: a day without a row starts it at max(delta, 0)',
  public.ai_spend_adjust('2026-11-03', -0.1) = 0);
select pg_temp.check('adjust: … a positive one too',
  public.ai_spend_adjust('2026-11-04', 0.25) = 0.25);

-- ---- per-user daily messages ----
insert into public.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'spend-a@example.com'),
  ('82222222-2222-4222-8222-222222222222', 'spend-b@example.com');

select pg_temp.check('admit: 1st message → 1',
  public.ai_spend_admit_message('2026-10-22', '81111111-1111-4111-8111-111111111111', 2) = 1);
select pg_temp.check('admit: 2nd message → 2',
  public.ai_spend_admit_message('2026-10-22', '81111111-1111-4111-8111-111111111111', 2) = 2);
select pg_temp.check('admit: 3rd message with limit 2 → -1, not counted',
  public.ai_spend_admit_message('2026-10-22', '81111111-1111-4111-8111-111111111111', 2) = -1
  and (select messages from public.ai_spend_users where day = '2026-10-22' and user_id = '81111111-1111-4111-8111-111111111111') = 2);
select pg_temp.check('admit: another user has their own count',
  public.ai_spend_admit_message('2026-10-22', '82222222-2222-4222-8222-222222222222', 2) = 1);
select pg_temp.check('admit: the next day starts over',
  public.ai_spend_admit_message('2026-10-23', '81111111-1111-4111-8111-111111111111', 2) = 1);
select pg_temp.check('admit: limit 0 or null admits nothing and creates no row',
  public.ai_spend_admit_message('2026-10-24', '81111111-1111-4111-8111-111111111111', 0) = -1
  and public.ai_spend_admit_message('2026-10-24', '81111111-1111-4111-8111-111111111111', null) = -1
  and not exists (select 1 from public.ai_spend_users where day = '2026-10-24'));
select pg_temp.expect_state('admit: an unknown user is a foreign key violation', '23503',
  $sql$select public.ai_spend_admit_message('2026-10-22', '89999999-9999-4999-8999-999999999999', 5)$sql$);

-- deleting the account removes its counts; the daily total stays (no user data in it)
delete from public.users where id = '81111111-1111-4111-8111-111111111111';
select pg_temp.check('user deleted → their message counts are gone',
  not exists (select 1 from public.ai_spend_users where user_id = '81111111-1111-4111-8111-111111111111'));
select pg_temp.check('user deleted → the daily total is unchanged',
  (select cost_usd from public.ai_spend where day = '2026-10-22') = 0.5123);

-- ---- server only ----
select pg_temp.check('RLS enabled on both tables',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.ai_spend'::regclass, 'public.ai_spend_users'::regclass)));
select pg_temp.check('authenticated / anon cannot read the totals',
  not has_table_privilege('authenticated', 'public.ai_spend', 'select')
  and not has_table_privilege('anon', 'public.ai_spend', 'select'));
select pg_temp.check('authenticated / anon cannot read the per-user counts',
  not has_table_privilege('authenticated', 'public.ai_spend_users', 'select')
  and not has_table_privilege('anon', 'public.ai_spend_users', 'select'));
select pg_temp.check('the functions are not callable by anon / authenticated',
  not has_function_privilege('authenticated', 'public.ai_spend_add(date, numeric, integer)', 'execute')
  and not has_function_privilege('anon', 'public.ai_spend_add(date, numeric, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.ai_spend_admit_message(date, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.ai_spend_admit_message(date, uuid, integer)', 'execute'));
select pg_temp.check('reserve / adjust are not callable by anon / authenticated',
  not has_function_privilege('authenticated', 'public.ai_spend_reserve(date, numeric, numeric)', 'execute')
  and not has_function_privilege('anon', 'public.ai_spend_reserve(date, numeric, numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.ai_spend_adjust(date, numeric)', 'execute')
  and not has_function_privilege('anon', 'public.ai_spend_adjust(date, numeric)', 'execute'));
select pg_temp.check('service_role can call all four functions',
  has_function_privilege('service_role', 'public.ai_spend_add(date, numeric, integer)', 'execute')
  and has_function_privilege('service_role', 'public.ai_spend_admit_message(date, uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.ai_spend_reserve(date, numeric, numeric)', 'execute')
  and has_function_privilege('service_role', 'public.ai_spend_adjust(date, numeric)', 'execute'));

select 'AI SPEND: ALL CHECKS PASSED';
rollback;
