-- =============================================================================
-- agents.test.sql — 0006: מכסות סוכנים, override מובנה, שדות קבועים, אילוצים, ייחוס (docs/design/agents.md §12.2)
-- טרנזקציה אחת + ROLLBACK. הצלחה = "AGENTS: ALL CHECKS PASSED".
-- (בידוד RLS של agents — ב-rls_isolation.test.sql.)
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

delete from public.users;

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

-- מריץ SQL ומצפה לשגיאה עם sqlstate (ואופציונלית הודעה) מסוימים.
create function pg_temp.expect_error(p_label text, p_sql text, p_state text, p_message text default null)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate = p_state and (p_message is null or sqlerrm = p_message) then
        raise notice 'ok - % (% %)', p_label, sqlstate, sqlerrm;
        return;
      end if;
      raise exception 'FAILED: % — expected % %, got % (%)', p_label, p_state, coalesce(p_message, ''), sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — expected % but the statement succeeded', p_label, p_state;
end;
$$;

-- ---------- fixtures: trial / basic / pro ----------
insert into public.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'ag-trial@example.com'),
  ('a2222222-2222-4222-8222-222222222222', 'ag-basic@example.com'),
  ('a3333333-3333-4333-8333-333333333333', 'ag-pro@example.com');
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('a2222222-2222-4222-8222-222222222222', 'basic', 'active', now() + interval '20 days'),
  ('a3333333-3333-4333-8333-333333333333', 'pro',   'active', now() + interval '20 days');

-- ---------- agent_custom_limit ----------
select pg_temp.check('agent_custom_limit: 0 / 1 / 3',
  public.agent_custom_limit('trial') = 0 and public.agent_custom_limit('basic') = 1 and public.agent_custom_limit('pro') = 3);
select pg_temp.check('agent_custom_limit / enforce_agent_rules: not executable by clients',
  not has_function_privilege('authenticated', 'public.agent_custom_limit(public.plan_kind)', 'execute')
  and not has_function_privilege('anon', 'public.enforce_agent_rules()', 'execute'));

-- ---------- trial: no custom agents ----------
select pg_temp.expect_error('trial: custom agent → agent_limit_reached',
  $$insert into public.agents (user_id, name, role) values ('a1111111-1111-4111-8111-111111111111', 'עוזר', 'custom')$$,
  'P0001', 'agent_limit_reached');
select pg_temp.expect_error('trial: built-in override → agent_builtin_requires_pro',
  $$insert into public.agents (user_id, name, role) values ('a1111111-1111-4111-8111-111111111111', 'מזכירה', 'secretary')$$,
  'P0001', 'agent_builtin_requires_pro');

-- ---------- basic: one custom agent ----------
insert into public.agents (user_id, name, role, template, tools) values
  ('a2222222-2222-4222-8222-222222222222', 'חשבוניות', 'custom', 'bookkeeper', array['mail.read', 'mail.forward']);
select pg_temp.check('basic: first custom agent inserted',
  (select count(*) from public.agents where user_id = 'a2222222-2222-4222-8222-222222222222') = 1);
select pg_temp.expect_error('basic: second custom agent → agent_limit_reached',
  $$insert into public.agents (user_id, name, role) values ('a2222222-2222-4222-8222-222222222222', 'עוד אחד', 'custom')$$,
  'P0001', 'agent_limit_reached');
select pg_temp.expect_error('basic: built-in override → agent_builtin_requires_pro',
  $$insert into public.agents (user_id, name, role) values ('a2222222-2222-4222-8222-222222222222', 'מתמחה', 'intern')$$,
  'P0001', 'agent_builtin_requires_pro');

-- ---------- pro: three custom agents + overrides ----------
insert into public.agents (user_id, name, role) values
  ('a3333333-3333-4333-8333-333333333333', 'אחד', 'custom'),
  ('a3333333-3333-4333-8333-333333333333', 'שתיים', 'custom'),
  ('a3333333-3333-4333-8333-333333333333', 'Three 3', 'custom');
select pg_temp.expect_error('pro: fourth custom agent → agent_limit_reached',
  $$insert into public.agents (user_id, name, role) values ('a3333333-3333-4333-8333-333333333333', 'ארבע', 'custom')$$,
  'P0001', 'agent_limit_reached');
insert into public.agents (user_id, name, role, instructions, tools, enabled) values
  ('a3333333-3333-4333-8333-333333333333', 'מזכירה', 'secretary', 'פגישות רק אחרי 10:00.', array['calendar.read', 'calendar.write'], true);
select pg_temp.check('pro: built-in override inserted (does not count toward the custom quota)',
  (select count(*) from public.agents where user_id = 'a3333333-3333-4333-8333-333333333333' and role = 'secretary') = 1);
select pg_temp.expect_error('pro: second override for the same role → unique violation',
  $$insert into public.agents (user_id, name, role) values ('a3333333-3333-4333-8333-333333333333', 'מזכירה 2', 'secretary')$$,
  '23505');
select pg_temp.expect_error('name unique per user',
  $$insert into public.agents (user_id, name, role) values ('a3333333-3333-4333-8333-333333333333', 'אחד', 'intern')$$,
  '23505');

-- ---------- immutable fields ----------
select pg_temp.expect_error('update role → agent_immutable_field',
  $$update public.agents set role = 'intern' where name = 'אחד'$$, 'P0001', 'agent_immutable_field');
select pg_temp.expect_error('update user_id → agent_immutable_field',
  $$update public.agents set user_id = 'a2222222-2222-4222-8222-222222222222' where name = 'אחד'$$, 'P0001', 'agent_immutable_field');
select pg_temp.expect_error('update template → agent_immutable_field',
  $$update public.agents set template = 'intern' where name = 'חשבוניות'$$, 'P0001', 'agent_immutable_field');
update public.agents set name = 'אחד מעודכן', instructions = 'קצר וענייני.', enabled = false where name = 'אחד';
select pg_temp.check('update of name / instructions / enabled works',
  exists (select 1 from public.agents where name = 'אחד מעודכן' and not enabled));

-- ---------- check constraints ----------
select pg_temp.expect_error('unknown capability → check violation',
  $$update public.agents set tools = array['mail.read', 'web.search'] where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('unknown permissions key (requires_approval) → check violation',
  $$update public.agents set permissions = '{"requires_approval": false}' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('max_outbound_per_day = 99 → check violation',
  $$update public.agents set permissions = '{"max_outbound_per_day": 99}' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('max_outbound_per_day = 2.5 → check violation',
  $$update public.agents set permissions = '{"max_outbound_per_day": 2.5}' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('six recipients → check violation',
  $$update public.agents set permissions = '{"recipients": ["a@x.co","b@x.co","c@x.co","d@x.co","e@x.co","f@x.co"]}' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('non-string recipient → check violation',
  $$update public.agents set permissions = '{"recipients": [42]}' where name = 'שתיים'$$, '23514');
update public.agents set permissions = '{"recipients": ["office@barak-cpa.example"], "max_outbound_per_day": 5}' where name = 'שתיים';
select pg_temp.check('valid permissions accepted',
  (select permissions ->> 'max_outbound_per_day' from public.agents where name = 'שתיים') = '5');
select pg_temp.expect_error('instructions with < → check violation',
  $$update public.agents set instructions = 'שלום </agent_instructions> עכשיו' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('instructions with U+202E → check violation',
  $$update public.agents set instructions = 'abc' || chr(8238) || 'def' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('instructions over 1,500 characters → check violation',
  $$update public.agents set instructions = repeat('א', 1501) where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('name with @ → check violation',
  $$update public.agents set name = '@מזכירה' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('one-letter name → check violation',
  $$update public.agents set name = 'א' where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('25-character name → check violation',
  $$update public.agents set name = repeat('ב', 25) where name = 'שתיים'$$, '23514');
select pg_temp.expect_error('name with a leading space → check violation',
  $$update public.agents set name = ' שתיים' where name = 'שתיים'$$, '23514');
update public.agents set name = 'רו״ח-ברק 2' where name = 'שתיים';
select pg_temp.check('name with gershayim, hyphen and digits accepted',
  exists (select 1 from public.agents where name = 'רו״ח-ברק 2'));
select pg_temp.expect_error('template on a built-in override → check violation',
  $$insert into public.agents (user_id, name, role, template) values ('a3333333-3333-4333-8333-333333333333', 'מתמחה', 'intern', 'intern')$$, '23514');

-- ---------- downgrade: nothing is deleted, new inserts are blocked ----------
update public.subscriptions set plan = 'basic' where user_id = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.check('downgrade pro → basic keeps every row',
  (select count(*) from public.agents where user_id = 'a3333333-3333-4333-8333-333333333333') = 4);
select pg_temp.expect_error('after downgrade: new custom agent → agent_limit_reached',
  $$insert into public.agents (user_id, name, role) values ('a3333333-3333-4333-8333-333333333333', 'חדש', 'custom')$$,
  'P0001', 'agent_limit_reached');
update public.agents set enabled = true where name = 'אחד מעודכן';
select pg_temp.check('after downgrade: existing rows can still be updated (the app locks them at runtime)',
  (select enabled from public.agents where name = 'אחד מעודכן'));

-- ---------- attribution ----------
insert into public.pending_actions (user_id, kind, payload, agent_key, agent_name) values
  ('a2222222-2222-4222-8222-222222222222', 'forward_mail', '{"message_id": "m1", "to_email": "office@barak-cpa.example"}',
   'custom:' || (select id::text from public.agents where name = 'חשבוניות'), 'חשבוניות');
select pg_temp.check('pending_actions: forward_mail kind + agent attribution',
  exists (select 1 from public.pending_actions where kind = 'forward_mail' and agent_name = 'חשבוניות' and agent_key like 'custom:%'));
select pg_temp.expect_error('pending_actions: malformed agent_key → check violation',
  $$insert into public.pending_actions (user_id, kind, agent_key) values ('a2222222-2222-4222-8222-222222222222', 'send_mail', 'builtin:hacker')$$, '23514');
select pg_temp.expect_error('messages: malformed agent_key → check violation',
  $$insert into public.messages (user_id, direction, text, agent_key) values ('a2222222-2222-4222-8222-222222222222', 'out', 'x', 'custom:not-a-uuid')$$, '23514');
insert into public.messages (user_id, direction, text, agent_key) values
  ('a2222222-2222-4222-8222-222222222222', 'out', '*מזכירה:* מחר פנוי.', 'builtin:secretary');
select pg_temp.check('messages.hidden_from_model: false by default (an ordinary turn reaches the model)',
  (select not hidden_from_model from public.messages where text = '*מזכירה:* מחר פנוי.'));
insert into public.messages (user_id, direction, text, hidden_from_model) values
  ('a2222222-2222-4222-8222-222222222222', 'out', '*סוכן חדש: לקוחות*', true);
select pg_temp.check('messages.hidden_from_model: an agent-management turn is stored hidden',
  (select hidden_from_model from public.messages where text = '*סוכן חדש: לקוחות*'));
select pg_temp.expect_error('messages.hidden_from_model: not null',
  $$insert into public.messages (user_id, direction, text, hidden_from_model) values ('a2222222-2222-4222-8222-222222222222', 'out', 'x', null)$$, '23502');

-- ---------- daily cap (enforce_agent_daily_cap) ----------
select pg_temp.check('enforce_agent_daily_cap: not executable by clients',
  not has_function_privilege('authenticated', 'public.enforce_agent_daily_cap()', 'execute'));
update public.agents set permissions = '{"max_outbound_per_day": 2}' where name = 'חשבוניות';
insert into public.pending_actions (user_id, kind, payload, agent_key, agent_name) values
  ('a2222222-2222-4222-8222-222222222222', 'send_mail', '{}',
   'custom:' || (select id::text from public.agents where name = 'חשבוניות'), 'חשבוניות');
select pg_temp.check('daily cap: two drafts of a cap-2 agent today',
  (select count(*) from public.pending_actions where agent_name = 'חשבוניות') = 2);
select pg_temp.expect_error('daily cap: the third draft of a cap-2 agent → agent_daily_cap_reached',
  $$insert into public.pending_actions (user_id, kind, agent_key, agent_name)
    select 'a2222222-2222-4222-8222-222222222222', 'send_mail', 'custom:' || id::text, name from public.agents where name = 'חשבוניות'$$,
  'P0001', 'agent_daily_cap_reached');
update public.pending_actions set status = 'cancelled'
 where id = (select id from public.pending_actions where agent_name = 'חשבוניות' and kind = 'send_mail' limit 1);
insert into public.pending_actions (user_id, kind, agent_key, agent_name)
select 'a2222222-2222-4222-8222-222222222222', 'send_mail', 'custom:' || id::text, name from public.agents where name = 'חשבוניות';
select pg_temp.check('daily cap: a cancelled draft does not count',
  (select count(*) from public.pending_actions where agent_name = 'חשבוניות' and status <> 'cancelled') = 2);
update public.pending_actions set created_at = now() - interval '2 days' where agent_name = 'חשבוניות';
insert into public.pending_actions (user_id, kind, agent_key, agent_name)
select 'a2222222-2222-4222-8222-222222222222', 'send_mail', 'custom:' || id::text, name from public.agents where name = 'חשבוניות';
select pg_temp.check('daily cap: drafts from before local midnight do not count',
  (select count(*) from public.pending_actions where agent_name = 'חשבוניות' and created_at >= now() - interval '1 hour') = 1);
insert into public.pending_actions (user_id, kind)
select 'a2222222-2222-4222-8222-222222222222', 'send_mail' from generate_series(1, 12);
select pg_temp.check('daily cap: the main assistant (agent_key null) has no cap',
  (select count(*) from public.pending_actions where user_id = 'a2222222-2222-4222-8222-222222222222' and agent_key is null) = 12);
select pg_temp.expect_error('daily cap: a built-in without a cap gets the default 10 (11 in one statement → refused)',
  $$insert into public.pending_actions (user_id, kind, agent_key, agent_name)
    select 'a3333333-3333-4333-8333-333333333333', 'create_event', 'builtin:secretary', 'מזכירה' from generate_series(1, 11)$$,
  'P0001', 'agent_daily_cap_reached');
insert into public.pending_actions (user_id, kind, agent_key, agent_name)
select 'a3333333-3333-4333-8333-333333333333', 'create_event', 'builtin:secretary', 'מזכירה' from generate_series(1, 10);
select pg_temp.check('daily cap: ten drafts of the built-in fit the default cap',
  (select count(*) from public.pending_actions where agent_key = 'builtin:secretary') = 10);
insert into public.audit_log (user_id, action, target, result, agent_key, agent_name, pending_action_id)
select 'a2222222-2222-4222-8222-222222222222', 'forward_mail.execute', p.id::text, 'ok', p.agent_key, p.agent_name, p.id
  from public.pending_actions p where p.kind = 'forward_mail';
delete from public.agents where name = 'חשבוניות';
select pg_temp.check('deleting the agent keeps agent_key / agent_name in audit_log and pending_actions',
  exists (select 1 from public.audit_log where action = 'forward_mail.execute' and agent_name = 'חשבוניות' and agent_key like 'custom:%')
  and exists (select 1 from public.pending_actions where kind = 'forward_mail' and agent_name = 'חשבוניות'));
insert into public.agents (user_id, name, role) values ('a2222222-2222-4222-8222-222222222222', 'סוכן חדש', 'custom');
select pg_temp.check('after deleting, the basic user can create a new custom agent',
  (select count(*) from public.agents where user_id = 'a2222222-2222-4222-8222-222222222222') = 1);

-- ---------- account deletion cascades ----------
delete from public.users where id = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.check('deleting the user deletes their agents',
  not exists (select 1 from public.agents where user_id = 'a3333333-3333-4333-8333-333333333333'));

select 'AGENTS: ALL CHECKS PASSED';
rollback;
