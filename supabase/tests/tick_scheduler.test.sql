-- =============================================================================
-- tick_scheduler.test.sql — מיגרציה 0019: tick_dispatch()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "TICK SCHEDULER: ALL CHECKS PASSED".
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

-- בלי pg_net / vault (הסביבה המקומית): מתריעה ולא שולחת, בלי שגיאה
select pg_temp.check('without pg_net/vault nothing is sent and nothing throws', public.tick_dispatch() = false);

select pg_temp.check('security definer with an empty search_path',
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.tick_dispatch()'::regprocedure));

select pg_temp.check('server only: no anon/authenticated execute, service_role can',
  not has_function_privilege('anon', 'public.tick_dispatch()', 'execute')
  and not has_function_privilege('authenticated', 'public.tick_dispatch()', 'execute')
  and has_function_privilege('service_role', 'public.tick_dispatch()', 'execute'));

select 'TICK SCHEDULER: ALL CHECKS PASSED';
rollback;
