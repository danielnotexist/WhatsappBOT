-- =============================================================================
-- ai_spend_pools.test.sql — מיגרציה 0024: ai_spend_pools / ai_spend_pool_reserve() / ai_spend_pool_adjust()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "AI SPEND POOLS: ALL CHECKS PASSED".
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

select pg_temp.check('a reservation within the pool budget is held',
  public.ai_spend_pool_reserve('support', '2026-10-30', 0.3, 0.5) = 0.3);
select pg_temp.check('one that would pass the pool budget is refused (-1) and changes nothing',
  public.ai_spend_pool_reserve('support', '2026-10-30', 0.3, 0.5) = -1
  and (select cost_usd from public.ai_spend_pools where pool = 'support' and day = '2026-10-30') = 0.3);
select pg_temp.check('the pool never touches the bot''s day row',
  not exists (select 1 from public.ai_spend where day = '2026-10-30'));
select pg_temp.check('a full support pool does not block the bot',
  public.ai_spend_reserve('2026-10-30', 0.4, 3) = 0.4);
select pg_temp.check('the bot''s spend does not fill the support pool',
  public.ai_spend_pool_reserve('support', '2026-10-30', 0.1, 0.5) = 0.4);
select pg_temp.check('settling moves the pool total by the difference, never below 0',
  public.ai_spend_pool_adjust('support', '2026-10-30', -0.15) = 0.25
  and public.ai_spend_pool_adjust('support', '2026-10-30', -5) = 0);
select pg_temp.check('pools are separate from each other',
  public.ai_spend_pool_reserve('other', '2026-10-30', 0.2, 0.5) = 0.2
  and (select cost_usd from public.ai_spend_pools where pool = 'support' and day = '2026-10-30') = 0);
select pg_temp.check('calls counted per pool (2 held, the refused one not counted)',
  (select calls from public.ai_spend_pools where pool = 'support' and day = '2026-10-30') = 2);
select pg_temp.expect_state('a pool name is a short lower-case key', '23514',
  $sql$select public.ai_spend_pool_reserve('Bad Pool!', '2026-10-30', 0.1, 1)$sql$);
select pg_temp.check('anon / authenticated cannot call the functions or read the table',
  not has_function_privilege('anon', 'public.ai_spend_pool_reserve(text, date, numeric, numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.ai_spend_pool_adjust(text, date, numeric)', 'execute')
  and not has_table_privilege('anon', 'public.ai_spend_pools', 'select'));

select 'AI SPEND POOLS: ALL CHECKS PASSED';
rollback;
