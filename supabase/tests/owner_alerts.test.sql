-- =============================================================================
-- owner_alerts.test.sql — מיגרציה 0016: owner_alerts / owner_alert_claim() / owner_alerts_take_queued() /
-- schedule_owner_alerts() / purge_owner_alerts() / job_kind 'owner_alerts'
-- טרנזקציה אחת + ROLLBACK. הצלחה = "OWNER ALERTS: ALL CHECKS PASSED".
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

-- ---------- claim: once per dedupe key ----------
-- (each check reads the table in its own statement: a statement does not see what its own function call inserted)
select pg_temp.check('a new signup is claimed',
  public.owner_alert_claim('signup', 'signup:u1', 'נרשם חדש', '{"email": "a@example.com"}', false) ->> 'result' = 'claimed');
select pg_temp.check('… stored as sending, with the subject and the payload',
  (select status = 'sending' and subject = 'נרשם חדש' and payload ->> 'email' = 'a@example.com' and channel is null from public.owner_alerts where dedupe_key = 'signup:u1'));
select pg_temp.check('the same event again → duplicate',
  public.owner_alert_claim('signup', 'signup:u1', 'נרשם חדש', '{}', false) ->> 'result' = 'duplicate');
select pg_temp.check('… still one row', (select count(*) from public.owner_alerts where dedupe_key = 'signup:u1') = 1);
select pg_temp.check('quiet hours → queued',
  public.owner_alert_claim('ticket', 'ticket:t1', 'פנייה חדשה', '{}', true) ->> 'result' = 'queued');
select pg_temp.check('… stored as queued', (select status from public.owner_alerts where dedupe_key = 'ticket:t1') = 'queued');
create temp table claim_ids as select (public.owner_alert_claim('signup', 'signup:u2', 'נרשם חדש', '{}', false) ->> 'id')::uuid as id;
select pg_temp.check('the claim returns the row id', (select id from claim_ids) = (select id from public.owner_alerts where dedupe_key = 'signup:u2'));

-- ---------- the per-type rate limit ----------
select pg_temp.check('error_spike: the first in the hour is claimed',
  public.owner_alert_claim('error_spike', 'error_spike:2026-10-24T10', 'קפיצה בתקלות', '{}', false, 1, interval '1 hour') ->> 'result' = 'claimed');
select pg_temp.check('error_spike: a second one within the hour → limited',
  public.owner_alert_claim('error_spike', 'error_spike:2026-10-24T11', 'קפיצה בתקלות', '{}', false, 1, interval '1 hour') ->> 'result' = 'limited');
select pg_temp.check('… recorded as limited', (select status from public.owner_alerts where dedupe_key = 'error_spike:2026-10-24T11') = 'limited');
select pg_temp.check('a limited row does not count toward the limit of another type',
  public.owner_alert_claim('payment_failed', 'payment_failed:x', 'תשלום נכשל', '{}', false, 1, interval '1 hour') ->> 'result' = 'claimed');
select pg_temp.check('no limit given → never limited',
  public.owner_alert_claim('signup', 'signup:u3', 'נרשם חדש', '{}', false, null, null) ->> 'result' = 'claimed');
update public.owner_alerts set created_at = now() - interval '2 hours' where type = 'error_spike';
select pg_temp.check('error_spike: after the window passed → claimed again',
  public.owner_alert_claim('error_spike', 'error_spike:2026-10-24T13', 'קפיצה בתקלות', '{}', false, 1, interval '1 hour') ->> 'result' = 'claimed');

-- ---------- take the queue for the morning digest ----------
select pg_temp.check('another queued row',
  public.owner_alert_claim('signup', 'signup:u4', 'נרשם חדש', '{}', true) ->> 'result' = 'queued');
select pg_temp.check('take_queued: both queued rows, as sending on the digest channel',
  (select count(*) from public.owner_alerts_take_queued(100) t where t.status = 'sending' and t.channel = 'digest') = 2);
select pg_temp.check('take_queued: nothing left to take', (select count(*) from public.owner_alerts_take_queued(100)) = 0);
select pg_temp.check('take_queued: no queued row remains', not exists (select 1 from public.owner_alerts where status = 'queued'));

-- ---------- the table's rules ----------
select pg_temp.expect_state('unknown type rejected', '23514',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject) values ('spam', 'k1', 'sent', 's')$sql$);
select pg_temp.expect_state('unknown status rejected', '23514',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject) values ('signup', 'k2', 'lost', 's')$sql$);
select pg_temp.expect_state('unknown channel rejected', '23514',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject, channel) values ('signup', 'k3', 'sent', 's', 'pigeon')$sql$);
select pg_temp.expect_state('one row per dedupe key', '23505',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject) values ('signup', 'signup:u1', 'sent', 's')$sql$);
select pg_temp.expect_state('payload must be an object', '23514',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject, payload) values ('signup', 'k4', 'sent', 's', '[]')$sql$);
select pg_temp.expect_state('an empty subject rejected', '23514',
  $sql$insert into public.owner_alerts (type, dedupe_key, status, subject) values ('signup', 'k5', 'sent', '')$sql$);

-- ---------- the system job of the quarter-hour ----------
select pg_temp.check('job_kind has owner_alerts', 'owner_alerts' = any (enum_range(null::public.job_kind)::text[]));
select pg_temp.check('schedule_owner_alerts: one system job for this quarter-hour', public.schedule_owner_alerts() = 1);
select pg_temp.check('schedule_owner_alerts: no user, due now, the key the code uses',
  (select user_id is null
          and run_at <= now()
          and run_at > now() - interval '15 minutes'
          and dedupe_key = 'owner_alerts:' || to_char(run_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')
          and extract(minute from run_at at time zone 'UTC')::int % 15 = 0
     from public.jobs where kind = 'owner_alerts'));
select pg_temp.check('schedule_owner_alerts: idempotent', public.schedule_owner_alerts() = 0);

-- ---------- purge ----------
update public.owner_alerts set created_at = now() - interval '91 days' where dedupe_key = 'signup:u1';
select pg_temp.check('purge_owner_alerts removes rows older than 90 days', public.purge_owner_alerts() = 1);
select pg_temp.check('… the old row is gone', not exists (select 1 from public.owner_alerts where dedupe_key = 'signup:u1'));

-- ---------- privileges ----------
select pg_temp.check('RLS on, anon / authenticated have no table privileges',
  (select relrowsecurity from pg_class where oid = 'public.owner_alerts'::regclass)
  and not has_table_privilege('anon', 'public.owner_alerts', 'select')
  and not has_table_privilege('authenticated', 'public.owner_alerts', 'select')
  and not has_table_privilege('authenticated', 'public.owner_alerts', 'insert'));
select pg_temp.check('the functions are service_role only',
  not has_function_privilege('authenticated', 'public.owner_alert_claim(text, text, text, jsonb, boolean, integer, interval)', 'execute')
  and not has_function_privilege('anon', 'public.owner_alerts_take_queued(integer)', 'execute')
  and not has_function_privilege('anon', 'public.schedule_owner_alerts()', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_owner_alerts(interval)', 'execute')
  and has_function_privilege('service_role', 'public.owner_alert_claim(text, text, text, jsonb, boolean, integer, interval)', 'execute')
  and has_function_privilege('service_role', 'public.owner_alerts_take_queued(integer)', 'execute'));

select 'OWNER ALERTS: ALL CHECKS PASSED';
rollback;
