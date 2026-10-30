-- =============================================================================
-- privacy_retention.test.sql — מיגרציה 0025: רשומות חיוב אחרי מחיקה, פניות, ניקויים, profile_merge
-- טרנזקציה אחת + ROLLBACK. הצלחה = "PRIVACY RETENTION: ALL CHECKS PASSED".
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

insert into public.users (id, email, name) values
  ('a0250000-0000-4000-8000-000000000001', 'payer@example.com', 'דנה לוי'),
  ('a0250000-0000-4000-8000-000000000002', 'basic@example.com', null),
  ('a0250000-0000-4000-8000-000000000003', 'pro@example.com', null);
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('a0250000-0000-4000-8000-000000000003', 'pro', 'active', now() + interval '20 days');

-- ---- account deletion: payments stay (7 years), tickets go ----
insert into public.payments (id, user_id, hyp_trans_id, amount_ils, ccode) values
  ('b0250000-0000-4000-8000-000000000001', 'a0250000-0000-4000-8000-000000000001', 'T-0025-1', 99, '0');
insert into public.support_tickets (id, user_id, name, email, body) values
  ('c0250000-0000-4000-8000-000000000001', 'a0250000-0000-4000-8000-000000000001', 'דנה', 'payer@example.com', 'שאלה על חיוב');
delete from public.users where id = 'a0250000-0000-4000-8000-000000000001';
select pg_temp.check('a deleted account keeps its payment, without the link, with the payer''s email and name',
  (select user_id is null and payer_email = 'payer@example.com' and payer_name = 'דנה לוי' and amount_ils = 99
     from public.payments where id = 'b0250000-0000-4000-8000-000000000001'));
select pg_temp.check('a deleted account''s support ticket is deleted with it',
  not exists (select 1 from public.support_tickets where id = 'c0250000-0000-4000-8000-000000000001'));

-- ---- purge_support_tickets: closed and old only ----
insert into public.support_tickets (id, name, email, body, status, created_at) values
  ('c0250000-0000-4000-8000-000000000002', 'א', 'a@example.com', 'ישנה וסגורה', 'closed', now() - interval '200 days'),
  ('c0250000-0000-4000-8000-000000000003', 'ב', 'b@example.com', 'ישנה ופתוחה', 'open',   now() - interval '200 days'),
  ('c0250000-0000-4000-8000-000000000004', 'ג', 'c@example.com', 'חדשה וסגורה', 'closed', now() - interval '10 days');
select pg_temp.check('purge_support_tickets deletes one ticket (closed, older than 180 days)', public.purge_support_tickets() = 1);
select pg_temp.check('the open old ticket and the new closed one stay',
  (select count(*) = 2 from public.support_tickets where id in ('c0250000-0000-4000-8000-000000000003', 'c0250000-0000-4000-8000-000000000004')));

-- ---- purge_finished_work: finished pending actions and jobs after 30 days ----
insert into public.pending_actions (id, user_id, kind, payload, status, expires_at, created_at, updated_at) values
  ('d0250000-0000-4000-8000-000000000001', 'a0250000-0000-4000-8000-000000000002', 'send_mail', '{"body": "גוף מלא"}', 'executed', now() - interval '40 days' + interval '10 minutes', now() - interval '40 days', now() - interval '40 days'),
  ('d0250000-0000-4000-8000-000000000002', 'a0250000-0000-4000-8000-000000000002', 'send_mail', '{"body": "גוף מלא"}', 'executed', now() - interval '5 days' + interval '10 minutes', now() - interval '5 days', now() - interval '5 days'),
  ('d0250000-0000-4000-8000-000000000003', 'a0250000-0000-4000-8000-000000000002', 'send_mail', '{"body": "ממתין"}', 'pending', now() + interval '10 minutes', now() - interval '40 days', now() - interval '40 days');
insert into public.jobs (id, user_id, kind, status, updated_at) values
  ('e0250000-0000-4000-8000-000000000001', 'a0250000-0000-4000-8000-000000000002', 'reminder', 'done',   now() - interval '40 days'),
  ('e0250000-0000-4000-8000-000000000002', 'a0250000-0000-4000-8000-000000000002', 'reminder', 'queued', now() - interval '40 days'),
  ('e0250000-0000-4000-8000-000000000003', 'a0250000-0000-4000-8000-000000000002', 'reminder', 'failed', now() - interval '5 days');
select pg_temp.check('purge_finished_work: one old executed draft and one old done job',
  (select pending_actions_deleted = 1 and jobs_deleted = 1 from public.purge_finished_work()));
select pg_temp.check('a pending draft, a recent one, a queued job and a recent failed job stay',
  (select count(*) = 2 from public.pending_actions where id in ('d0250000-0000-4000-8000-000000000002', 'd0250000-0000-4000-8000-000000000003'))
  and (select count(*) = 2 from public.jobs where id in ('e0250000-0000-4000-8000-000000000002', 'e0250000-0000-4000-8000-000000000003')));

-- ---- purge_old_content: by plan, like purge_old_messages ----
insert into public.reminders (id, user_id, text, due_at, status, updated_at) values
  ('f0250000-0000-4000-8000-000000000001', 'a0250000-0000-4000-8000-000000000002', 'נשלחה מזמן', now() - interval '100 days', 'sent',      now() - interval '100 days'),
  ('f0250000-0000-4000-8000-000000000002', 'a0250000-0000-4000-8000-000000000002', 'מתוזמנת',   now() + interval '1 day',    'scheduled', now() - interval '100 days'),
  ('f0250000-0000-4000-8000-000000000003', 'a0250000-0000-4000-8000-000000000003', 'פרו, נשלחה', now() - interval '100 days', 'sent',      now() - interval '100 days');
insert into public.conversation_state (user_id, summary, facts, updated_at) values
  ('a0250000-0000-4000-8000-000000000002', 'סיכום ישן', '[{"text": "הרו״ח שלי הוא כהן"}]', now() - interval '100 days'),
  ('a0250000-0000-4000-8000-000000000003', 'סיכום של פרו', '[]', now() - interval '100 days');
select pg_temp.check('purge_old_content(90, trial/basic): one reminder, one memory',
  (select reminders_deleted = 1 and memories_cleared = 1 from public.purge_old_content(90, array['trial', 'basic']::public.plan_kind[])));
select pg_temp.check('the basic user''s memory is empty; the scheduled reminder stays',
  (select summary is null and facts = '[]'::jsonb from public.conversation_state where user_id = 'a0250000-0000-4000-8000-000000000002')
  and exists (select 1 from public.reminders where id = 'f0250000-0000-4000-8000-000000000002'));
select pg_temp.check('the pro user (365 days) is untouched by the 90-day run',
  exists (select 1 from public.reminders where id = 'f0250000-0000-4000-8000-000000000003')
  and (select summary = 'סיכום של פרו' from public.conversation_state where user_id = 'a0250000-0000-4000-8000-000000000003'));
select pg_temp.check('a second run finds nothing more',
  (select reminders_deleted = 0 and memories_cleared = 0 from public.purge_old_content(90, array['trial', 'basic']::public.plan_kind[])));

-- ---- profile_merge: atomic, shallow, deep for named keys ----
update public.users set profile = '{"a": 1, "login_token": {"nonce_hash": "x"}, "oauth_pending": {"google": {"state": "g"}, "microsoft": null}}'
 where id = 'a0250000-0000-4000-8000-000000000002';
select pg_temp.check('profile_merge adds and replaces top-level keys, keeps the rest, returns the row',
  (select profile = '{"a": 2, "b": null, "login_token": {"nonce_hash": "x"}, "oauth_pending": {"google": {"state": "g"}, "microsoft": null}}'::jsonb
     from public.profile_merge('a0250000-0000-4000-8000-000000000002', '{"a": 2, "b": null}')));
select pg_temp.check('a deep key merges one level: Microsoft''s state does not drop Google''s',
  (select profile -> 'oauth_pending' = '{"google": {"state": "g"}, "microsoft": {"state": "m"}}'::jsonb
     from public.profile_merge('a0250000-0000-4000-8000-000000000002', '{"oauth_pending": {"microsoft": {"state": "m"}}}', array['oauth_pending'])));
select pg_temp.check('without p_deep the object is replaced',
  (select profile -> 'oauth_pending' = '{"google": null}'::jsonb
     from public.profile_merge('a0250000-0000-4000-8000-000000000002', '{"oauth_pending": {"google": null}}')));
select pg_temp.expect_state('an unknown user', 'P0002',
  $q$select public.profile_merge('a0250000-0000-4000-8000-0000000000ff', '{"a": 1}')$q$);
select pg_temp.expect_state('a patch that is not an object', '22023',
  $q$select public.profile_merge('a0250000-0000-4000-8000-000000000002', '[1]')$q$);
select pg_temp.check('service_role only',
  not has_function_privilege('anon', 'public.profile_merge(uuid, jsonb, text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_finished_work(interval)', 'execute')
  and has_function_privilege('service_role', 'public.purge_old_content(integer, public.plan_kind[])', 'execute'));

select 'PRIVACY RETENTION: ALL CHECKS PASSED';

rollback;
