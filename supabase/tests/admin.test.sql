-- =============================================================================
-- admin.test.sql — מיגרציה 0015: פאנל הניהול — users.signup_source / last_seen_at, messages.tools,
-- support_tickets.admin_note, support_chats + support_chat_append(), app_errors, admin_user_overview(),
-- admin_daily_stats(), purge_support_chats() / purge_app_errors(), audit_log.user_id null, RLS ו-grants.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "ADMIN: ALL CHECKS PASSED".
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

insert into public.users (id, email, profile, signup_source, created_at) values
  ('d1111111-1111-4111-8111-111111111111', 'admin-a@example.com', '{"onboarding": {"step": "ask_name"}}', '{"utm_source": "test", "landing": "/"}', now() - interval '2 days'),
  ('d2222222-2222-4222-8222-222222222222', 'admin-b@example.com', '{}', null, now() - interval '1 hour');
insert into public.subscriptions (user_id, plan, status, next_charge_at, charge_failures) values
  ('d1111111-1111-4111-8111-111111111111', 'basic', 'past_due', now() + interval '3 days', 2);
insert into public.wa_identities (user_id, phone_e164) values ('d1111111-1111-4111-8111-111111111111', '+972500000951');
insert into public.connections (user_id, provider, account_email, status) values
  ('d1111111-1111-4111-8111-111111111111', 'google',    'a@gmail.com', 'active'),
  ('d1111111-1111-4111-8111-111111111111', 'microsoft', 'a@levi.co.il', 'expired');
insert into public.messages (user_id, wa_message_id, direction, text) values
  ('d1111111-1111-4111-8111-111111111111', 'wamid.admin.1', 'in', 'מה יש לי מחר?');
insert into public.messages (user_id, direction, text, model_used, cost_usd, tools) values
  ('d1111111-1111-4111-8111-111111111111', 'out', 'מחר בעשר פגישה.', 'claude-sonnet', 0.0123, array['calendar_list']);
insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode) values
  ('d1111111-1111-4111-8111-111111111111', 'T-ADMIN-1', 116.82, '0');

-- ---------- the new columns ----------
select pg_temp.check('users.signup_source holds an object', (select signup_source ->> 'utm_source' = 'test' from public.users where id = 'd1111111-1111-4111-8111-111111111111'));
select pg_temp.expect_state('signup_source must be an object', '23514',
  $sql$update public.users set signup_source = '[]' where id = 'd2222222-2222-4222-8222-222222222222'$sql$);
select pg_temp.check('users.last_seen_at starts empty', (select last_seen_at is null from public.users where id = 'd2222222-2222-4222-8222-222222222222'));
select pg_temp.check('messages.tools defaults to empty and keeps the tool names',
  (select count(*) = 1 from public.messages where tools = '{}' and direction = 'in' and user_id = 'd1111111-1111-4111-8111-111111111111')
  and (select tools = array['calendar_list'] from public.messages where direction = 'out' and user_id = 'd1111111-1111-4111-8111-111111111111'));

-- ---------- the audit_log fix: a row without a user (account.delete) ----------
insert into public.audit_log (user_id, action, target, result) values (null, 'account.delete', 'gone@example.com', 'ok');
select pg_temp.check('audit_log accepts user_id null', (select count(*) = 1 from public.audit_log where action = 'account.delete' and user_id is null));

-- ---------- support_tickets: the note ----------
insert into public.support_tickets (id, user_id, name, email, body) values
  ('d5555555-5555-4555-8555-555555555555', 'd1111111-1111-4111-8111-111111111111', 'דנה', 'a@example.com', 'החיבור נפל');
update public.support_tickets set status = 'in_progress', admin_note = 'חזרתי אליה במייל', status_changed_at = now() where id = 'd5555555-5555-4555-8555-555555555555';
select pg_temp.check('a ticket keeps its status and note', (select status = 'in_progress' and admin_note is not null from public.support_tickets where id = 'd5555555-5555-4555-8555-555555555555'));
select pg_temp.expect_state('the note has a ceiling', '23514',
  $sql$update public.support_tickets set admin_note = repeat('x', 2001) where id = 'd5555555-5555-4555-8555-555555555555'$sql$);

-- ---------- support_chats + support_chat_append ----------
select pg_temp.check('an anonymous chat is created on the first append',
  public.support_chat_append('d6666666-6666-4666-8666-666666666666', null, '/', '[{"role": "user", "text": "כמה זה עולה?"}, {"role": "assistant", "text": "99 ₪"}]'));
select pg_temp.check('the visitor signs in: the append is accepted',
  public.support_chat_append('d6666666-6666-4666-8666-666666666666', 'd1111111-1111-4111-8111-111111111111', '/account', '[{"role": "user", "text": "ואיך מתחברים?"}]'));
select pg_temp.check('the chat is linked to the account, the first page kept',
  (select user_id = 'd1111111-1111-4111-8111-111111111111' and jsonb_array_length(turns) = 3 and page = '/' from public.support_chats where id = 'd6666666-6666-4666-8666-666666666666'));
select pg_temp.check('another user cannot append to it',
  not public.support_chat_append('d6666666-6666-4666-8666-666666666666', 'd2222222-2222-4222-8222-222222222222', '/', '[{"role": "user", "text": "x"}]'));
select pg_temp.check('nor can an anonymous visitor',
  not public.support_chat_append('d6666666-6666-4666-8666-666666666666', null, '/', '[{"role": "user", "text": "x"}]'));
select pg_temp.check('nothing was added by them',
  (select jsonb_array_length(turns) = 3 from public.support_chats where id = 'd6666666-6666-4666-8666-666666666666'));
select pg_temp.check('a longer chat is accepted',
  public.support_chat_append('d6666666-6666-4666-8666-666666666666', 'd1111111-1111-4111-8111-111111111111', null, '[{"role": "user", "text": "4"}, {"role": "assistant", "text": "5"}]', 3));
select pg_temp.check('only the last p_max turns are kept, in order',
  (select turns -> 0 ->> 'text' = 'ואיך מתחברים?' and turns -> 2 ->> 'text' = '5' and jsonb_array_length(turns) = 3 from public.support_chats where id = 'd6666666-6666-4666-8666-666666666666'));
select pg_temp.expect_state('turns must be an array', '22023',
  $sql$select public.support_chat_append('d7777777-7777-4777-8777-777777777777', null, '/', '{}')$sql$);

-- ---------- app_errors ----------
insert into public.app_errors (user_id, source, message, context) values
  ('d1111111-1111-4111-8111-111111111111', 'bot', 'assistant failed: timeout', '{"route": "wa"}'),
  ('d1111111-1111-4111-8111-111111111111', 'jobs', 'reminder failed', '{}');
select pg_temp.expect_state('an error needs a message', '23514',
  $sql$insert into public.app_errors (source, message) values ('x', '')$sql$);
select pg_temp.expect_state('the context is an object', '23514',
  $sql$insert into public.app_errors (source, message, context) values ('x', 'y', '[]')$sql$);

-- ---------- admin_user_overview ----------
select pg_temp.check('admin_user_overview: one row per live user',
  (select count(*) from public.admin_user_overview() where id in ('d1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222')) = 2);
select pg_temp.check('admin_user_overview: plan, status, phone, connections, usage of A',
  (select plan = 'basic' and sub_status = 'past_due' and charge_failures = 2 and phone = '+972500000951' and wa_linked
          and connections_active = 1 and connections_broken = 1 and connections_ever = 2 and providers = array['google']
          and onboarding_step = 'ask_name' and signup_source ->> 'utm_source' = 'test'
     from public.admin_user_overview() where id = 'd1111111-1111-4111-8111-111111111111'));
select pg_temp.check('admin_user_overview: messages, cost, errors, payment and open tickets of A',
  (select messages_30d = 1 and ai_cost_30d = 0.0123 and errors_7d = 2 and paid and open_tickets = 1
     from public.admin_user_overview() where id = 'd1111111-1111-4111-8111-111111111111'));
select pg_temp.check('admin_user_overview: B is a fresh trial with nothing linked',
  (select plan = 'trial' and sub_status is null and not wa_linked and connections_ever = 0 and not paid and messages_30d = 0
     from public.admin_user_overview() where id = 'd2222222-2222-4222-8222-222222222222'));

-- ---------- admin_daily_stats ----------
do $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  r record;
begin
  select * into r from public.admin_daily_stats(v_today - 6, v_today) where day = v_today;
  perform pg_temp.check('admin_daily_stats: today has the message, the active user and the payment',
    r.messages >= 1 and r.active_users >= 1 and r.revenue >= 116.82 and r.signups >= 1);
  perform pg_temp.check('admin_daily_stats: one row per day', (select count(*) = 7 from public.admin_daily_stats(v_today - 6, v_today)));
end;
$$;
select pg_temp.expect_state('admin_daily_stats: the range is bounded', '22023',
  $sql$select * from public.admin_daily_stats('2020-01-01', '2026-01-01')$sql$);

-- ---------- purges ----------
update public.support_chats set updated_at = now() - interval '181 days' where id = 'd6666666-6666-4666-8666-666666666666';
update public.app_errors set at = now() - interval '91 days' where source = 'jobs';
select pg_temp.check('purge_support_chats removes chats older than 180 days', public.purge_support_chats() >= 1);
select pg_temp.check('the old chat is gone',
  not exists (select 1 from public.support_chats where id = 'd6666666-6666-4666-8666-666666666666'));
select pg_temp.check('purge_app_errors removes errors older than 90 days', public.purge_app_errors() >= 1);
select pg_temp.check('the recent error stays',
  exists (select 1 from public.app_errors where source = 'bot'));

-- ---------- deleting a user ----------
select public.support_chat_append('d8888888-8888-4888-8888-888888888888', 'd1111111-1111-4111-8111-111111111111', '/', '[{"role": "user", "text": "שלום"}]');
delete from public.users where id = 'd1111111-1111-4111-8111-111111111111';
select pg_temp.check('the user''s chats and errors go with the account',
  not exists (select 1 from public.support_chats where id = 'd8888888-8888-4888-8888-888888888888')
  and not exists (select 1 from public.app_errors where user_id = 'd1111111-1111-4111-8111-111111111111'));
select pg_temp.check('the account.delete audit row stays', exists (select 1 from public.audit_log where action = 'account.delete' and user_id is null));

-- ---------- server only ----------
select pg_temp.check('RLS on support_chats and app_errors, no policies',
  (select relrowsecurity from pg_class where oid = 'public.support_chats'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.app_errors'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('support_chats', 'app_errors')));
select pg_temp.check('anon / authenticated have no privileges on the new tables',
  not has_table_privilege('anon', 'public.support_chats', 'select')
  and not has_table_privilege('authenticated', 'public.support_chats', 'select')
  and not has_table_privilege('authenticated', 'public.support_chats', 'insert')
  and not has_table_privilege('anon', 'public.app_errors', 'select')
  and not has_table_privilege('authenticated', 'public.app_errors', 'select')
  and not has_table_privilege('authenticated', 'public.app_errors', 'insert'));
select pg_temp.check('service_role reads and writes them',
  has_table_privilege('service_role', 'public.support_chats', 'select')
  and has_table_privilege('service_role', 'public.support_chats', 'insert')
  and has_table_privilege('service_role', 'public.app_errors', 'insert')
  and has_table_privilege('service_role', 'public.app_errors', 'select'));
select pg_temp.check('the admin functions run for service_role only',
  has_function_privilege('service_role', 'public.admin_user_overview()', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_user_overview()', 'execute')
  and not has_function_privilege('anon', 'public.admin_user_overview()', 'execute')
  and has_function_privilege('service_role', 'public.admin_daily_stats(date, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_daily_stats(date, date)', 'execute')
  and has_function_privilege('service_role', 'public.support_chat_append(uuid, uuid, text, jsonb, integer)', 'execute')
  and not has_function_privilege('anon', 'public.support_chat_append(uuid, uuid, text, jsonb, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.support_chat_append(uuid, uuid, text, jsonb, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_support_chats(interval)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_app_errors(interval)', 'execute'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select pg_temp.expect_state('authenticated: select on support_chats is denied', '42501', 'select count(*) from public.support_chats');
select pg_temp.expect_state('authenticated: select on app_errors is denied', '42501', 'select count(*) from public.app_errors');
select pg_temp.expect_state('authenticated: admin_user_overview is denied', '42501', 'select count(*) from public.admin_user_overview()');
reset role;

select 'ADMIN: ALL CHECKS PASSED';
rollback;
