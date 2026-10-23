-- =============================================================================
-- proactive_alerts.test.sql — מיגרציה 0013: proactive_alerts / proactive_alert_claim() / schedule_proactive_scans() /
-- purge_proactive_alerts() / job_kind 'proactive_scan'
-- טרנזקציה אחת + ROLLBACK. הצלחה = "PROACTIVE ALERTS: ALL CHECKS PASSED".
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

insert into public.users (id, email, timezone, profile) values
  ('d1111111-1111-4111-8111-111111111111', 'pro-alerts@example.com',   'Asia/Jerusalem', '{}'),
  ('d2222222-2222-4222-8222-222222222222', 'basic-alerts@example.com', 'Asia/Jerusalem', '{}'),
  ('d3333333-3333-4333-8333-333333333333', 'pro-off@example.com',      'Asia/Jerusalem', '{"alerts_disabled": true}'),
  ('d4444444-4444-4444-8444-444444444444', 'pro-nophone@example.com',  'Asia/Jerusalem', '{}');
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('d1111111-1111-4111-8111-111111111111', 'pro',   'active', now() + interval '20 days'),
  ('d2222222-2222-4222-8222-222222222222', 'basic', 'active', now() + interval '20 days'),
  ('d3333333-3333-4333-8333-333333333333', 'pro',   'active', now() + interval '20 days'),
  ('d4444444-4444-4444-8444-444444444444', 'pro',   'active', now() + interval '20 days');
insert into public.wa_identities (user_id, phone_e164) values
  ('d1111111-1111-4111-8111-111111111111', '+972500000911'),
  ('d2222222-2222-4222-8222-222222222222', '+972500000912'),
  ('d3333333-3333-4333-8333-333333333333', '+972500000913');
insert into public.connections (user_id, provider, account_email) values
  ('d1111111-1111-4111-8111-111111111111', 'microsoft', 'pro@levi-law.co.il'),
  ('d2222222-2222-4222-8222-222222222222', 'google',    'basic@gmail.com'),
  ('d3333333-3333-4333-8333-333333333333', 'microsoft', 'off@levi-law.co.il'),
  ('d4444444-4444-4444-8444-444444444444', 'microsoft', 'nophone@levi-law.co.il');

-- ---------- the job kind ----------
select pg_temp.check('job_kind has proactive_scan',
  'proactive_scan' = any (enum_range(null::public.job_kind)::text[]));

-- ---------- proactive_alert_claim: the daily cap of 2, duplicates, deferred ----------
select pg_temp.check('first urgent alert of the day is claimed (sent)',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m1', 'urgent_mail', '2026-10-21', '{"subject": "דחוף"}', 2, true) ->> 'result' = 'claimed');
select pg_temp.check('the same item again is a duplicate (no row)',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m1', 'urgent_mail', '2026-10-21', '{}', 2, true) ->> 'result' = 'duplicate');
select pg_temp.check('… and adds no row',
  (select count(*) from public.proactive_alerts where item_key = 'mail:microsoft:m1') = 1);
select pg_temp.check('an urgent item is never alerted again, also on another day',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m1', 'urgent_mail', '2026-10-22', '{}', 2, true) ->> 'result' = 'duplicate');
select pg_temp.check('second alert of the day is claimed',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'conflict:a|b', 'conflict', '2026-10-21', '{}', 2, true) ->> 'result' = 'claimed');
select pg_temp.check('third alert of the day hits the cap and is recorded as deferred',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m3', 'urgent_mail', '2026-10-21', '{}', 2, true) ->> 'result' = 'cap');
select pg_temp.check('… and is recorded as deferred (it goes to the next morning summary)',
  (select status from public.proactive_alerts where item_key = 'mail:microsoft:m3') = 'deferred');
select pg_temp.check('exactly 2 sent that day',
  (select count(*) from public.proactive_alerts where user_id = 'd1111111-1111-4111-8111-111111111111' and channel = 'urgent' and local_day = '2026-10-21' and status = 'sent') = 2);
select pg_temp.check('the next day starts again',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m4', 'urgent_mail', '2026-10-22', '{}', 2, true) ->> 'result' = 'claimed');
select pg_temp.check('window closed (deliver false) → deferred',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m5', 'urgent_mail', '2026-10-22', '{}', 2, false) ->> 'result' = 'deferred');
select pg_temp.check('… and not counted toward the cap',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m6', 'urgent_mail', '2026-10-22', '{}', 2, true) ->> 'result' = 'claimed');
create temp table claim_out as
  select public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'mail:microsoft:m7', 'urgent_mail', '2026-10-23', '{}', 2, true) as r;
select pg_temp.check('the claim returns the new row id',
  (select (r ->> 'id')::uuid from claim_out) = (select id from public.proactive_alerts where item_key = 'mail:microsoft:m7'));

-- an item listed in today's morning summary is not alerted the same day
insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day) values
  ('d1111111-1111-4111-8111-111111111111', 'conflict:c|d', 'conflict', 'summary', 'listed', '2026-10-24');
select pg_temp.check('listed in today''s summary → duplicate',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'conflict:c|d', 'conflict', '2026-10-24', '{}', 2, true) ->> 'result' = 'duplicate');
select pg_temp.check('listed in yesterday''s summary → may be alerted',
  public.proactive_alert_claim('d1111111-1111-4111-8111-111111111111', 'conflict:c|d', 'conflict', '2026-10-25', '{}', 2, true) ->> 'result' = 'claimed');

select pg_temp.expect_state('unknown user is an error', 'P0002',
  $sql$select public.proactive_alert_claim('d9999999-9999-4999-8999-999999999999', 'x', 'conflict', '2026-10-21', '{}', 2, true)$sql$);

-- ---------- the table's rules ----------
select pg_temp.expect_state('a summary row is always listed', '23514',
  $sql$insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day) values ('d1111111-1111-4111-8111-111111111111', 'k', 'conflict', 'summary', 'sent', '2026-10-21')$sql$);
select pg_temp.expect_state('an urgent row is never listed', '23514',
  $sql$insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day) values ('d1111111-1111-4111-8111-111111111111', 'k', 'conflict', 'urgent', 'listed', '2026-10-21')$sql$);
select pg_temp.expect_state('unknown kind rejected', '23514',
  $sql$insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day) values ('d1111111-1111-4111-8111-111111111111', 'k', 'spam', 'urgent', 'sent', '2026-10-21')$sql$);
select pg_temp.expect_state('one summary row per item per day', '23505',
  $sql$insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day) values ('d1111111-1111-4111-8111-111111111111', 'conflict:c|d', 'conflict', 'summary', 'listed', '2026-10-24')$sql$);
select pg_temp.expect_state('payload must be an object', '23514',
  $sql$insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day, payload) values ('d1111111-1111-4111-8111-111111111111', 'k2', 'conflict', 'urgent', 'sent', '2026-10-21', '[]')$sql$);

-- ---------- schedule_proactive_scans: pro + phone + connection + alerts on, 08:00–19:59 local ----------
do $$
declare
  v_local_hour integer := extract(hour from ((date_trunc('hour', now()) + interval '1 hour') at time zone 'Asia/Jerusalem'));
  v_n integer := public.schedule_proactive_scans();
begin
  if v_local_hour between 8 and 19 then
    perform pg_temp.check('schedule_proactive_scans: one job, for the pro user only', v_n = 1
      and (select user_id from public.jobs where kind = 'proactive_scan') = 'd1111111-1111-4111-8111-111111111111');
    perform pg_temp.check('schedule_proactive_scans: next round hour, dedupe key matches the worker',
      (select run_at = date_trunc('hour', now()) + interval '1 hour'
              and dedupe_key = 'proactive_scan:d1111111-1111-4111-8111-111111111111:' || (payload ->> 'slot')
         from public.jobs where kind = 'proactive_scan'));
    perform pg_temp.check('schedule_proactive_scans: idempotent', public.schedule_proactive_scans() = 0);
  else
    perform pg_temp.check('schedule_proactive_scans: nothing outside 08:00–19:59', v_n = 0);
  end if;
end;
$$;

-- ---------- purge ----------
update public.proactive_alerts set created_at = now() - interval '31 days' where item_key = 'mail:microsoft:m1';
select pg_temp.check('purge_proactive_alerts removes rows older than 30 days', public.purge_proactive_alerts() = 1);
select pg_temp.check('… the old row is gone', not exists (select 1 from public.proactive_alerts where item_key = 'mail:microsoft:m1'));

-- ---------- privileges ----------
select pg_temp.check('anon / authenticated have no table privileges',
  not has_table_privilege('anon', 'public.proactive_alerts', 'select')
  and not has_table_privilege('authenticated', 'public.proactive_alerts', 'select')
  and not has_table_privilege('authenticated', 'public.proactive_alerts', 'insert'));
select pg_temp.check('the functions are service_role only',
  not has_function_privilege('authenticated', 'public.proactive_alert_claim(uuid, text, text, date, jsonb, integer, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.schedule_proactive_scans()', 'execute')
  and has_function_privilege('service_role', 'public.proactive_alert_claim(uuid, text, text, date, jsonb, integer, boolean)', 'execute'));

-- deleting the user removes the rows
delete from public.users where id = 'd1111111-1111-4111-8111-111111111111';
select pg_temp.check('on delete cascade', not exists (select 1 from public.proactive_alerts where user_id = 'd1111111-1111-4111-8111-111111111111'));

select 'PROACTIVE ALERTS: ALL CHECKS PASSED';
rollback;
