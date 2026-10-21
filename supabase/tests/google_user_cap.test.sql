-- =============================================================================
-- google_user_cap.test.sql — מיגרציה 0008: google_scope_grants / ops_flags / google_scope_account_count()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "GOOGLE USER CAP: ALL CHECKS PASSED".
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

-- the SQL backfill hash = lib/google/user-cap.ts googleAccountHash() (sha256 hex of the lowercased email)
select pg_temp.check('account hash expression matches the TypeScript one',
  encode(sha256(convert_to(lower('Dana.Levi@Gmail.com'), 'UTF8')), 'hex')
    = '6329af6e825cf5d306bd9ee890deeeadeca084acfc597c7801cb0c365e90e947');

insert into public.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'cap-a@example.com'),
  ('72222222-2222-4222-8222-222222222222', 'cap-b@example.com');

insert into public.google_scope_grants (account_hash, scope, user_id) values
  (repeat('a', 64), 'https://www.googleapis.com/auth/gmail.readonly',  '71111111-1111-4111-8111-111111111111'),
  (repeat('a', 64), 'https://www.googleapis.com/auth/calendar.events', '71111111-1111-4111-8111-111111111111'),
  (repeat('b', 64), 'https://www.googleapis.com/auth/calendar.events', '72222222-2222-4222-8222-222222222222'),
  (repeat('c', 64), 'https://www.googleapis.com/auth/gmail.send',      null);

select pg_temp.check('count: gmail.readonly only → 1 account',
  public.google_scope_account_count(array['https://www.googleapis.com/auth/gmail.readonly']) = 1);
select pg_temp.check('count: readonly + sensitive → 3 distinct accounts (a counted once)',
  public.google_scope_account_count(array['https://www.googleapis.com/auth/gmail.readonly',
                                          'https://www.googleapis.com/auth/calendar.events',
                                          'https://www.googleapis.com/auth/gmail.send']) = 3);
select pg_temp.check('count: no scopes → 0', public.google_scope_account_count(array[]::text[]) = 0);

select pg_temp.expect_state('the same (account, scope) twice is a unique violation', '23505',
  $sql$insert into public.google_scope_grants (account_hash, scope) values (repeat('a', 64), 'https://www.googleapis.com/auth/gmail.readonly')$sql$);
select pg_temp.expect_state('account_hash must be 64 hex chars', '23514',
  $sql$insert into public.google_scope_grants (account_hash, scope) values ('dana@gmail.com', 'https://www.googleapis.com/auth/gmail.readonly')$sql$);
select pg_temp.expect_state('scope must be a Google scope URL', '23514',
  $sql$insert into public.google_scope_grants (account_hash, scope) values (repeat('d', 64), 'openid')$sql$);

-- deleting the account keeps the grant (Google still counts it) and clears the user link
delete from public.users where id = '71111111-1111-4111-8111-111111111111';
select pg_temp.check('user deleted → grants stay, user_id null',
  (select count(*) from public.google_scope_grants where account_hash = repeat('a', 64) and user_id is null) = 2);
select pg_temp.check('user deleted → still counted',
  public.google_scope_account_count(array['https://www.googleapis.com/auth/gmail.readonly']) = 1);

-- ops_flags: set once
insert into public.ops_flags (key, value) values ('google_user_cap:80', '{"count": 80, "cap": 95}');
select pg_temp.expect_state('ops flag is set only once', '23505',
  $sql$insert into public.ops_flags (key, value) values ('google_user_cap:80', '{}')$sql$);
select pg_temp.check('ops flag value stored',
  (select (value ->> 'count')::int from public.ops_flags where key = 'google_user_cap:80') = 80);

-- server only
select pg_temp.check('RLS enabled on both tables',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.google_scope_grants'::regclass, 'public.ops_flags'::regclass)));
select pg_temp.check('authenticated cannot read the ledger',
  not has_table_privilege('authenticated', 'public.google_scope_grants', 'select'));
select pg_temp.check('authenticated cannot read ops flags',
  not has_table_privilege('authenticated', 'public.ops_flags', 'select'));
select pg_temp.check('anon has nothing on the ledger',
  not has_table_privilege('anon', 'public.google_scope_grants', 'select,insert,update,delete'));
select pg_temp.check('count function: service_role only',
  not has_function_privilege('authenticated', 'public.google_scope_account_count(text[])', 'execute')
  and not has_function_privilege('anon', 'public.google_scope_account_count(text[])', 'execute')
  and has_function_privilege('service_role', 'public.google_scope_account_count(text[])', 'execute'));
select pg_temp.check('service_role can write the ledger',
  has_table_privilege('service_role', 'public.google_scope_grants', 'insert,select'));

select 'GOOGLE USER CAP: ALL CHECKS PASSED';
rollback;
