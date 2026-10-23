-- =============================================================================
-- support_tickets.test.sql — מיגרציה 0011: support_tickets
-- טרנזקציה אחת + ROLLBACK. הצלחה = "SUPPORT TICKETS: ALL CHECKS PASSED".
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

insert into public.users (id, email) values ('91111111-1111-4111-8111-111111111111', 'ticket-a@example.com');

-- ---- a ticket: defaults ----
insert into public.support_tickets (id, user_id, name, email, subject, body, transcript) values
  ('a1111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'דנה', 'dana@example.com', 'חיוב',
   'חויבתי פעמיים החודש', '[{"role": "user", "text": "כמה זה עולה?"}, {"role": "assistant", "text": "99 ₪"}]'::jsonb);
insert into public.support_tickets (id, name, email, body) values
  ('a2222222-2222-4222-8222-222222222222', 'אורח', 'guest@example.com', 'שאלה על החיבור');

select pg_temp.check('a new ticket is open, with an id and a time',
  (select status = 'open' and created_at is not null from public.support_tickets where id = 'a1111111-1111-4111-8111-111111111111'));
select pg_temp.check('an anonymous ticket: no user, no subject, no transcript',
  (select user_id is null and subject is null and transcript is null from public.support_tickets where id = 'a2222222-2222-4222-8222-222222222222'));
update public.support_tickets set status = 'closed' where id = 'a2222222-2222-4222-8222-222222222222';
select pg_temp.check('the status can move on',
  (select status = 'closed' from public.support_tickets where id = 'a2222222-2222-4222-8222-222222222222'));

-- ---- checks ----
select pg_temp.expect_state('an unknown status is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body, status) values ('x', 'x@example.com', 'y', 'spam')$sql$);
select pg_temp.expect_state('an empty name is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body) values ('  ', 'x@example.com', 'y')$sql$);
select pg_temp.expect_state('a name over 80 characters is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body) values (repeat('א', 81), 'x@example.com', 'y')$sql$);
select pg_temp.expect_state('an address without @ is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body) values ('x', 'not-an-address', 'y')$sql$);
select pg_temp.expect_state('an empty description is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body) values ('x', 'x@example.com', ' ')$sql$);
select pg_temp.expect_state('a description over 4000 characters is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body) values ('x', 'x@example.com', repeat('א', 4001))$sql$);
select pg_temp.expect_state('a subject over 120 characters is refused', '23514',
  $sql$insert into public.support_tickets (name, email, subject, body) values ('x', 'x@example.com', repeat('א', 121), 'y')$sql$);
select pg_temp.expect_state('a transcript that is not an array is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body, transcript) values ('x', 'x@example.com', 'y', '{"role": "user"}'::jsonb)$sql$);
select pg_temp.expect_state('a transcript of more than 20 messages is refused', '23514',
  $sql$insert into public.support_tickets (name, email, body, transcript)
       select 'x', 'x@example.com', 'y', jsonb_agg(jsonb_build_object('role', 'user', 'text', 'שאלה')) from generate_series(1, 21)$sql$);
select pg_temp.expect_state('an unknown user is a foreign key violation', '23503',
  $sql$insert into public.support_tickets (user_id, name, email, body) values ('99999999-9999-4999-8999-999999999999', 'x', 'x@example.com', 'y')$sql$);

-- ---- the account is deleted: the ticket stays, without the link ----
delete from public.users where id = '91111111-1111-4111-8111-111111111111';
select pg_temp.check('user deleted → the ticket stays with user_id null',
  (select user_id is null from public.support_tickets where id = 'a1111111-1111-4111-8111-111111111111'));

-- ---- server only ----
select pg_temp.check('RLS enabled',
  (select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass));
select pg_temp.check('no policies (server only)',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets'));
select pg_temp.check('anon / authenticated have no privileges on support_tickets',
  not has_table_privilege('anon', 'public.support_tickets', 'select')
  and not has_table_privilege('anon', 'public.support_tickets', 'insert')
  and not has_table_privilege('authenticated', 'public.support_tickets', 'select')
  and not has_table_privilege('authenticated', 'public.support_tickets', 'insert')
  and not has_table_privilege('authenticated', 'public.support_tickets', 'update'));
select pg_temp.check('service_role can read and write',
  has_table_privilege('service_role', 'public.support_tickets', 'select')
  and has_table_privilege('service_role', 'public.support_tickets', 'insert')
  and has_table_privilege('service_role', 'public.support_tickets', 'update'));

-- an authenticated client sees nothing, even its own ticket
insert into public.users (id, email) values ('92222222-2222-4222-8222-222222222222', 'ticket-b@example.com');
insert into public.support_tickets (user_id, name, email, body) values ('92222222-2222-4222-8222-222222222222', 'ב', 'b@example.com', 'שאלה');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select pg_temp.expect_state('authenticated: select on support_tickets is denied', '42501',
  'select count(*) from public.support_tickets');
reset role;

select 'SUPPORT TICKETS: ALL CHECKS PASSED';
rollback;
