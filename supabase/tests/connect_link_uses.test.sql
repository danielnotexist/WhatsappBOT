-- =============================================================================
-- connect_link_uses.test.sql — 0021: connect_link_consume (single use, cleanup) and that only service_role runs it.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "CONNECT LINK USES: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

delete from public.connect_link_uses;
insert into public.users (id, email) values ('a0210000-0000-4000-8000-000000000001', 'connect-link@example.com');

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

select pg_temp.check('connect_link_consume: the first use → true',
  public.connect_link_consume('nh-1', 'a0210000-0000-4000-8000-000000000001', now() + interval '30 minutes') = true);
select pg_temp.check('connect_link_consume: the same nonce again → false',
  public.connect_link_consume('nh-1', 'a0210000-0000-4000-8000-000000000001', now() + interval '30 minutes') = false);
select pg_temp.check('connect_link_consume: another nonce → true',
  public.connect_link_consume('nh-2', 'a0210000-0000-4000-8000-000000000001', now() + interval '30 minutes') = true);

-- a row whose link expired more than a day ago is removed by the next call
insert into public.connect_link_uses (nonce_hash, user_id, expires_at) values ('nh-old', 'a0210000-0000-4000-8000-000000000001', now() - interval '2 days');
select pg_temp.check('connect_link_consume: a new nonce after the cleanup → true',
  public.connect_link_consume('nh-3', 'a0210000-0000-4000-8000-000000000001', now() + interval '30 minutes') = true);
select pg_temp.check('connect_link_consume: cleans rows expired over a day ago, keeps the rest',
  not exists (select 1 from public.connect_link_uses where nonce_hash = 'nh-old')
  and exists (select 1 from public.connect_link_uses where nonce_hash = 'nh-1'));

-- deleting the account removes its rows
delete from public.users where id = 'a0210000-0000-4000-8000-000000000001';
select pg_temp.check('connect_link_uses: rows go with the account',
  not exists (select 1 from public.connect_link_uses where user_id = 'a0210000-0000-4000-8000-000000000001'));

set local role authenticated;
do $$
begin
  begin
    perform public.connect_link_consume('x', 'a0210000-0000-4000-8000-000000000001', now());
    raise exception 'FAILED: authenticated ran connect_link_consume';
  exception when insufficient_privilege then
    raise notice 'ok - connect_link_consume: not for authenticated';
  end;
  begin
    perform 1 from public.connect_link_uses;
    raise exception 'FAILED: authenticated read connect_link_uses';
  exception when insufficient_privilege then
    raise notice 'ok - connect_link_uses: not readable by authenticated';
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.connect_link_consume('x', 'a0210000-0000-4000-8000-000000000001', now());
    raise exception 'FAILED: anon ran connect_link_consume';
  exception when insufficient_privilege then
    raise notice 'ok - connect_link_consume: not for anon';
  end;
end;
$$;
reset role;

select 'CONNECT LINK USES: ALL CHECKS PASSED';

rollback;
