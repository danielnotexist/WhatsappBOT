-- =============================================================================
-- rls_isolation.test.sql — בדיקת בידוד RLS (PLAN §2.3: "לקוח א' ≠ לקוח ב'", §12.5)
--
-- איך זה עובד:
--   * הכול בטרנזקציה אחת שמסתיימת ב-ROLLBACK — לא משאיר כלום ב-DB.
--   * הבדיקה יוצרת משתמשים A ו-B משלה (לא תלויה ב-seed.sql).
--   * SET LOCAL ROLE authenticated + request.jwt.claims = {"sub": <A>} מדמה JWT של לקוח A.
--   * כל assertion = pg_temp.check(label, boolean) → RAISE EXCEPTION בכישלון (psql עוצר: ON_ERROR_STOP).
--   * expect_denied(sql) מוודא שפעולה נכשלת ב-insufficient_privilege (42501).
--
-- הרצה (Supabase local):
--   supabase start && supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.test.sql
-- הרצה (Postgres רגיל): ראה README.
-- הצלחה = השורה האחרונה "RLS ISOLATION: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

-- -----------------------------------------------------------------------------
-- עוזרים (pg_temp נמחק עם הסשן)
-- -----------------------------------------------------------------------------
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

-- מריץ SQL ומצפה ל-42501 (insufficient_privilege). כל תוצאה אחרת = כישלון.
create function pg_temp.expect_denied(p_label text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then
      raise notice 'ok - % (denied 42501)', p_label;
      return;
    when others then
      raise exception 'FAILED: % — expected 42501, got % (%)', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — expected 42501 but the statement succeeded', p_label;
end;
$$;

-- מריץ DML ומחזיר כמה שורות הושפעו (0 = ה-RLS סינן, בלי שגיאה).
create function pg_temp.affected(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_n bigint;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures (כבעלים/service: עוקף RLS)
-- -----------------------------------------------------------------------------
insert into public.users (id, email, name, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'rls-a@example.com', 'A', now() - interval '1 day'),
  ('22222222-2222-4222-8222-222222222222', 'rls-b@example.com', 'B', now() - interval '1 day');

insert into public.wa_identities (user_id, phone_e164) values
  ('11111111-1111-4111-8111-111111111111', '+972509000001'),
  ('22222222-2222-4222-8222-222222222222', '+972509000002');

insert into public.connections (user_id, provider, account_email, enc_access, enc_refresh) values
  ('11111111-1111-4111-8111-111111111111', 'microsoft', 'a@corp.example', 'enc:A', 'enc:A'),
  ('22222222-2222-4222-8222-222222222222', 'google',    'b@corp.example', 'enc:B', 'enc:B');

insert into public.messages (user_id, wa_message_id, direction, type, text) values
  ('11111111-1111-4111-8111-111111111111', 'wamid.rls.A.1', 'in',  'text', 'שלום מ-A'),
  ('11111111-1111-4111-8111-111111111111', 'wamid.rls.A.2', 'out', 'text', 'תשובה ל-A'),
  ('22222222-2222-4222-8222-222222222222', 'wamid.rls.B.1', 'in',  'text', 'שלום מ-B');

insert into public.conversation_state (user_id, summary) values
  ('11111111-1111-4111-8111-111111111111', 'סיכום A'),
  ('22222222-2222-4222-8222-222222222222', 'סיכום B');

insert into public.pending_actions (user_id, kind, payload) values
  ('11111111-1111-4111-8111-111111111111', 'send_mail', '{"to": "x@a.example"}'),
  ('22222222-2222-4222-8222-222222222222', 'create_event', '{"title": "B"}');

insert into public.jobs (user_id, kind, run_at) values
  ('11111111-1111-4111-8111-111111111111', 'morning_summary', now() + interval '1 hour'),
  ('22222222-2222-4222-8222-222222222222', 'morning_summary', now() + interval '1 hour');

insert into public.reminders (user_id, text, due_at) values
  ('11111111-1111-4111-8111-111111111111', 'תזכורת A', now() + interval '1 hour'),
  ('22222222-2222-4222-8222-222222222222', 'תזכורת B', now() + interval '1 hour');

insert into public.usage (user_id, period_start, counted_messages, free_remaining, plan_limit) values
  ('11111111-1111-4111-8111-111111111111', current_date, 1, 9, 10),
  ('22222222-2222-4222-8222-222222222222', current_date, 1, 9, 10);

insert into public.subscriptions (user_id, plan, status, hyp_token_enc, hyp_tokef) values
  ('11111111-1111-4111-8111-111111111111', 'trial', 'trial', null, null),
  ('22222222-2222-4222-8222-222222222222', 'basic', 'active', 'enc:hyp:B', '1230');

insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, raw) values
  ('22222222-2222-4222-8222-222222222222', 'rls-trans-B', 99, '0', '{"secret": "raw"}');

insert into public.audit_log (user_id, action, target) values
  ('11111111-1111-4111-8111-111111111111', 'send_mail', 'x@a.example'),
  ('22222222-2222-4222-8222-222222222222', 'send_mail', 'y@b.example');

insert into public.agents (user_id, name, role) values
  ('22222222-2222-4222-8222-222222222222', 'סוכן B', 'secretary');

insert into public.link_tokens (user_id, token, expires_at) values
  ('11111111-1111-4111-8111-111111111111', 'RLSA-0001', now() + interval '15 minutes');

insert into public.auth_otps (email, code_hash, expires_at) values
  ('rls-a@example.com', 'hash', now() + interval '10 minutes');

insert into public.wa_templates (name, language, body) values ('rls_test_tpl', 'he', 'x');

-- =============================================================================
-- 1. לקוח A (authenticated, sub = A)
-- =============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select pg_temp.check('A: auth.uid() resolves to A',
  (select auth.uid()) = '11111111-1111-4111-8111-111111111111');

-- users
select pg_temp.check('A: users — sees exactly own row',
  (select count(*) from public.users) = 1
  and (select id from public.users) = '11111111-1111-4111-8111-111111111111');
select pg_temp.check('A: users — 0 rows of B even when filtering by id',
  (select count(*) from public.users where id = '22222222-2222-4222-8222-222222222222') = 0);

-- messages
select pg_temp.check('A: messages — sees own 2 rows only',
  (select count(*) from public.messages) = 2
  and (select count(*) from public.messages where user_id <> '11111111-1111-4111-8111-111111111111') = 0);
select pg_temp.check('A: messages — 0 rows of B',
  (select count(*) from public.messages where user_id = '22222222-2222-4222-8222-222222222222') = 0);
select pg_temp.check('A: messages — B wamid not visible',
  (select count(*) from public.messages where wa_message_id = 'wamid.rls.B.1') = 0);

-- connections (עמודות בטוחות בלבד)
select pg_temp.check('A: connections — own 1 row, 0 of B',
  (select count(*) from public.connections) = 1
  and (select count(*) from public.connections where user_id = '22222222-2222-4222-8222-222222222222') = 0);
select pg_temp.expect_denied('A: connections — enc_access column hidden',
  'select enc_access from public.connections');
select pg_temp.expect_denied('A: connections — enc_refresh column hidden',
  'select enc_refresh from public.connections');
select pg_temp.expect_denied('A: connections — select * is denied (must list columns)',
  'select * from public.connections');

-- pending_actions
select pg_temp.check('A: pending_actions — own 1 row, 0 of B',
  (select count(*) from public.pending_actions) = 1
  and (select count(*) from public.pending_actions where user_id = '22222222-2222-4222-8222-222222222222') = 0);

-- conversation_state / jobs / reminders / usage / audit_log
select pg_temp.check('A: conversation_state — only own',
  (select count(*) from public.conversation_state) = 1
  and (select user_id from public.conversation_state) = '11111111-1111-4111-8111-111111111111');
select pg_temp.check('A: jobs — only own',
  (select count(*) from public.jobs) = 1
  and (select count(*) from public.jobs where user_id = '22222222-2222-4222-8222-222222222222') = 0);
select pg_temp.check('A: reminders — only own',
  (select count(*) from public.reminders) = 1);
select pg_temp.check('A: usage — only own',
  (select count(*) from public.usage) = 1
  and (select user_id from public.usage) = '11111111-1111-4111-8111-111111111111');
select pg_temp.check('A: audit_log — only own',
  (select count(*) from public.audit_log) = 1
  and (select user_id from public.audit_log) = '11111111-1111-4111-8111-111111111111');

-- subscriptions / payments (עמודות רגישות מוסתרות)
select pg_temp.check('A: subscriptions — only own (safe columns)',
  (select count(*) from public.subscriptions) = 1
  and (select plan from public.subscriptions) = 'trial');
select pg_temp.expect_denied('A: subscriptions — hyp_token_enc hidden',
  'select hyp_token_enc from public.subscriptions');
select pg_temp.expect_denied('A: subscriptions — hyp_tokef hidden',
  'select hyp_tokef from public.subscriptions');
select pg_temp.check('A: payments — 0 rows (payment belongs to B)',
  (select count(*) from public.payments) = 0);
select pg_temp.expect_denied('A: payments — raw column hidden',
  'select raw from public.payments');

-- agents
select pg_temp.check('A: agents — 0 rows (agent belongs to B)',
  (select count(*) from public.agents) = 0);

-- טבלאות שרת-בלבד: אין גישה בכלל
select pg_temp.expect_denied('A: auth_otps denied',           'select 1 from public.auth_otps');
select pg_temp.expect_denied('A: link_tokens denied',         'select 1 from public.link_tokens');
select pg_temp.expect_denied('A: graph_subscriptions denied', 'select 1 from public.graph_subscriptions');
select pg_temp.expect_denied('A: wa_link_attempts denied',    'select 1 from public.wa_link_attempts');
select pg_temp.expect_denied('A: wa_templates denied',        'select 1 from public.wa_templates');

-- כתיבה לטבלאות שרת-בלבד: חסום
select pg_temp.expect_denied('A: insert into messages denied',
  $$insert into public.messages (user_id, wa_message_id, direction, text) values ('11111111-1111-4111-8111-111111111111', 'wamid.hack', 'in', 'x')$$);
select pg_temp.expect_denied('A: delete from messages denied',
  'delete from public.messages');
select pg_temp.expect_denied('A: update messages denied',
  $$update public.messages set text = 'x'$$);
select pg_temp.expect_denied('A: insert into audit_log denied',
  $$insert into public.audit_log (user_id, action) values ('11111111-1111-4111-8111-111111111111', 'x')$$);
select pg_temp.expect_denied('A: insert into payments denied',
  $$insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode) values ('11111111-1111-4111-8111-111111111111', 't', 1, '0')$$);
select pg_temp.expect_denied('A: update subscriptions denied',
  $$update public.subscriptions set plan = 'pro'$$);
select pg_temp.expect_denied('A: update usage denied',
  $$update public.usage set free_remaining = 999$$);
select pg_temp.expect_denied('A: insert into jobs denied',
  $$insert into public.jobs (user_id, kind) values ('11111111-1111-4111-8111-111111111111', 'charge')$$);
select pg_temp.expect_denied('A: insert into link_tokens denied',
  $$insert into public.link_tokens (user_id, token, expires_at) values ('11111111-1111-4111-8111-111111111111', 'HACK-0001', now())$$);
select pg_temp.expect_denied('A: insert into pending_actions denied',
  $$insert into public.pending_actions (user_id, kind) values ('11111111-1111-4111-8111-111111111111', 'send_mail')$$);
select pg_temp.expect_denied('A: update pending_actions (self-approve) denied',
  $$update public.pending_actions set status = 'approved'$$);
select pg_temp.expect_denied('A: update connections denied',
  $$update public.connections set status = 'revoked'$$);
select pg_temp.expect_denied('A: delete users denied',
  'delete from public.users');

-- users: עדכון פרופיל מותר, email לא, שורה של B לא
select pg_temp.check('A: update own profile columns works',
  pg_temp.affected($$update public.users set name = 'A2', business_name = 'עסק A' where id = '11111111-1111-4111-8111-111111111111'$$) = 1);
select pg_temp.check('A: update of B row affects 0 rows (RLS filter, not error)',
  pg_temp.affected($$update public.users set name = 'HACK' where id = '22222222-2222-4222-8222-222222222222'$$) = 0);
select pg_temp.expect_denied('A: update email column denied',
  $$update public.users set email = 'hack@example.com'$$);
select pg_temp.expect_denied('A: update deleted_at column denied',
  $$update public.users set deleted_at = now()$$);

-- reminders: ביטול מותר, כל status אחר לא
select pg_temp.check('A: cancel own reminder works',
  pg_temp.affected($$update public.reminders set status = 'cancelled'$$) = 1);
select pg_temp.expect_denied('A: set reminder status=sent violates WITH CHECK',
  $$update public.reminders set status = 'sent'$$);
select pg_temp.expect_denied('A: update reminder text column denied',
  $$update public.reminders set text = 'x'$$);

-- agents: CRUD על שלי בלבד
select pg_temp.check('A: insert own agent works',
  pg_temp.affected($$insert into public.agents (user_id, name) values ('11111111-1111-4111-8111-111111111111', 'סוכן A')$$) = 1);
select pg_temp.expect_denied('A: insert agent for B violates WITH CHECK',
  $$insert into public.agents (user_id, name) values ('22222222-2222-4222-8222-222222222222', 'חדירה')$$);
select pg_temp.check('A: delete of B agent affects 0 rows',
  pg_temp.affected($$delete from public.agents where user_id = '22222222-2222-4222-8222-222222222222'$$) = 0);

-- =============================================================================
-- 2. לקוח B (אותו role, sub = B): לא רואה כלום של A
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select pg_temp.check('B: messages — 0 rows of A, own 1',
  (select count(*) from public.messages where user_id = '11111111-1111-4111-8111-111111111111') = 0
  and (select count(*) from public.messages) = 1);
select pg_temp.check('B: connections — 0 rows of A',
  (select count(*) from public.connections where user_id = '11111111-1111-4111-8111-111111111111') = 0
  and (select count(*) from public.connections) = 1);
select pg_temp.check('B: pending_actions — 0 rows of A',
  (select count(*) from public.pending_actions where user_id = '11111111-1111-4111-8111-111111111111') = 0
  and (select count(*) from public.pending_actions) = 1);
select pg_temp.check('B: users — does not see A (even by id)',
  (select count(*) from public.users where id = '11111111-1111-4111-8111-111111111111') = 0);
select pg_temp.check('B: conversation_state — not A',
  (select count(*) from public.conversation_state where user_id = '11111111-1111-4111-8111-111111111111') = 0);
select pg_temp.check('B: agents — sees own + not A''s new agent',
  (select count(*) from public.agents) = 1
  and (select user_id from public.agents) = '22222222-2222-4222-8222-222222222222');
select pg_temp.check('B: payments — own 1 (safe columns)',
  (select count(*) from public.payments) = 1
  and (select amount_ils from public.payments) = 99);
select pg_temp.check('B: A''s profile update did not leak (B still named B)',
  (select name from public.users) = 'B');

-- =============================================================================
-- 3. authenticated בלי sub (JWT פגום/ריק) → 0 שורות, לא שגיאה
-- =============================================================================
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.check('no-sub: users 0 rows',           (select count(*) from public.users) = 0);
select pg_temp.check('no-sub: messages 0 rows',        (select count(*) from public.messages) = 0);
select pg_temp.check('no-sub: pending_actions 0 rows', (select count(*) from public.pending_actions) = 0);

-- =============================================================================
-- 4. anon — אפס גישה לכל טבלה, גם עם claims "מזויפים" של A
-- =============================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"anon"}', true);

select pg_temp.expect_denied('anon: users denied',              'select 1 from public.users');
select pg_temp.expect_denied('anon: messages denied',           'select 1 from public.messages');
select pg_temp.expect_denied('anon: connections denied',        'select id from public.connections');
select pg_temp.expect_denied('anon: pending_actions denied',    'select 1 from public.pending_actions');
select pg_temp.expect_denied('anon: wa_identities denied',      'select 1 from public.wa_identities');
select pg_temp.expect_denied('anon: subscriptions denied',      'select id from public.subscriptions');
select pg_temp.expect_denied('anon: payments denied',           'select id from public.payments');
select pg_temp.expect_denied('anon: usage denied',              'select 1 from public.usage');
select pg_temp.expect_denied('anon: audit_log denied',          'select 1 from public.audit_log');
select pg_temp.expect_denied('anon: jobs denied',               'select 1 from public.jobs');
select pg_temp.expect_denied('anon: reminders denied',          'select 1 from public.reminders');
select pg_temp.expect_denied('anon: agents denied',             'select 1 from public.agents');
select pg_temp.expect_denied('anon: conversation_state denied', 'select 1 from public.conversation_state');
select pg_temp.expect_denied('anon: auth_otps denied',          'select 1 from public.auth_otps');
select pg_temp.expect_denied('anon: link_tokens denied',        'select 1 from public.link_tokens');
select pg_temp.expect_denied('anon: wa_templates denied',       'select 1 from public.wa_templates');
select pg_temp.expect_denied('anon: insert users denied',
  $$insert into public.users (email) values ('anon@example.com')$$);
select pg_temp.expect_denied('anon: count_trial_message denied',
  $$select public.count_trial_message('11111111-1111-4111-8111-111111111111')$$);
select pg_temp.expect_denied('anon: claim_due_jobs denied',
  'select public.claim_due_jobs(1)');

-- authenticated גם לא מריץ פונקציות שרת
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select pg_temp.expect_denied('authenticated: count_trial_message denied',
  $$select public.count_trial_message('11111111-1111-4111-8111-111111111111')$$);
select pg_temp.expect_denied('authenticated: claim_due_jobs denied',     'select public.claim_due_jobs(1)');
select pg_temp.expect_denied('authenticated: purge_old_messages denied', 'select public.purge_old_messages(1)');
select pg_temp.expect_denied('authenticated: dispatch_due_jobs denied',  'select public.dispatch_due_jobs(1)');

-- =============================================================================
-- 5. RLS דלוק על כל טבלה ב-public (בדיקת שלמות — אם מישהו יוסיף טבלה וישכח)
-- =============================================================================
reset role;
select pg_temp.check('every table in public has RLS enabled',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));
select pg_temp.check('anon has no table privileges in public',
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'));
select pg_temp.check('authenticated has no INSERT/DELETE on server-managed tables',
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and privilege_type in ('INSERT', 'DELETE')
      and table_name in ('messages', 'audit_log', 'payments', 'subscriptions', 'usage', 'jobs',
                         'link_tokens', 'auth_otps', 'connections', 'pending_actions', 'wa_identities',
                         'graph_subscriptions', 'wa_templates', 'wa_link_attempts', 'conversation_state', 'users')));

rollback;

\pset tuples_only off
\echo RLS ISOLATION: ALL CHECKS PASSED
