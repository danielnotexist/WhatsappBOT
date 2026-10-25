-- =============================================================================
-- annual_referrals.test.sql — 0018: the annual cycle columns, referral_codes / referrals, referral_reward() once,
-- the push vs the pending credit, the yearly cap, referral_apply_credit(), RLS, the new event / alert types and
-- admin_user_overview's new columns.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "ANNUAL REFERRALS: ALL CHECKS PASSED".
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

-- A brings B; C is on the trial; D is the 13th friend of the cap test; E has a charge in flight
insert into public.users (id, email, timezone) values
  ('a1111111-1111-4111-8111-111111111111', 'ref-a@example.com', 'Asia/Jerusalem'),
  ('b2222222-2222-4222-8222-222222222222', 'ref-b@example.com', 'Asia/Jerusalem'),
  ('c3333333-3333-4333-8333-333333333333', 'ref-c@example.com', 'Asia/Jerusalem'),
  ('d4444444-4444-4444-8444-444444444444', 'ref-d@example.com', 'Asia/Jerusalem'),
  ('e5555555-5555-4555-8555-555555555555', 'ref-e@example.com', 'Asia/Jerusalem');

-- ---------- subscriptions: the cycle ----------
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('a1111111-1111-4111-8111-111111111111', 'basic', 'active', now() + interval '20 days');
select pg_temp.check('subscriptions.billing_cycle defaults to monthly, no scheduled cycle',
  (select billing_cycle = 'monthly' and scheduled_cycle is null from public.subscriptions where user_id = 'a1111111-1111-4111-8111-111111111111'));
insert into public.subscriptions (user_id, plan, status, next_charge_at, billing_cycle) values
  ('b2222222-2222-4222-8222-222222222222', 'pro', 'active', now() + interval '1 year', 'annual');
select pg_temp.check('an annual subscription is stored',
  (select billing_cycle from public.subscriptions where user_id = 'b2222222-2222-4222-8222-222222222222') = 'annual');
update public.subscriptions set scheduled_cycle = 'monthly' where user_id = 'b2222222-2222-4222-8222-222222222222';
select pg_temp.check('annual → monthly can be scheduled',
  (select scheduled_cycle from public.subscriptions where user_id = 'b2222222-2222-4222-8222-222222222222') = 'monthly');
update public.subscriptions set scheduled_cycle = null where user_id = 'b2222222-2222-4222-8222-222222222222';

do $$
begin
  begin
    update public.subscriptions set billing_cycle = 'yearly' where user_id = 'a1111111-1111-4111-8111-111111111111';
    raise exception 'FAILED: an unknown billing cycle was accepted';
  exception when check_violation then
    raise notice 'ok - subscriptions: only monthly / annual';
  end;
  begin
    update public.subscriptions set scheduled_cycle = 'weekly' where user_id = 'a1111111-1111-4111-8111-111111111111';
    raise exception 'FAILED: an unknown scheduled cycle was accepted';
  exception when check_violation then
    raise notice 'ok - subscriptions: scheduled_cycle only monthly / annual';
  end;
  begin
    insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, billing_cycle) values
      ('a1111111-1111-4111-8111-111111111111', 'X-bad', 99, '0', 'quarterly');
    raise exception 'FAILED: a payment with an unknown cycle was accepted';
  exception when check_violation then
    raise notice 'ok - payments: only monthly / annual';
  end;
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, status, billing_cycle) values
      ('a1111111-1111-4111-8111-111111111111', 'renewal', 'basic', 99, 'failed', 'biweekly');
    raise exception 'FAILED: an approval with an unknown cycle was accepted';
  exception when check_violation then
    raise notice 'ok - billing_approvals: only monthly / annual';
  end;
end;
$$;

insert into public.payments (id, user_id, hyp_trans_id, amount_ils, ccode, billing_cycle) values
  ('f0000000-0000-4000-8000-000000000001', 'b2222222-2222-4222-8222-222222222222', 'T-annual-1', 2990, '0', 'annual');
select pg_temp.check('a payment records its cycle; the default is monthly',
  (select billing_cycle from public.payments where hyp_trans_id = 'T-annual-1') = 'annual'
  and (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'billing_cycle') like '''monthly''%');
insert into public.billing_approvals (user_id, kind, plan, amount_ils, status, billing_cycle) values
  ('a1111111-1111-4111-8111-111111111111', 'renewal', 'basic', 990, 'succeeded', 'annual');
select pg_temp.check('an approval records its cycle',
  exists (select 1 from public.billing_approvals where user_id = 'a1111111-1111-4111-8111-111111111111' and billing_cycle = 'annual'));

-- ---------- referral_codes ----------
insert into public.referral_codes (user_id, code) values ('a1111111-1111-4111-8111-111111111111', 'BKPRZWK');
do $$
begin
  begin
    insert into public.referral_codes (user_id, code) values ('a1111111-1111-4111-8111-111111111111', 'CCCCCCC');
    raise exception 'FAILED: a second code for a user was accepted';
  exception when unique_violation then
    raise notice 'ok - referral_codes: one per user';
  end;
  begin
    insert into public.referral_codes (user_id, code) values ('b2222222-2222-4222-8222-222222222222', 'BKPRZWK');
    raise exception 'FAILED: a duplicate code was accepted';
  exception when unique_violation then
    raise notice 'ok - referral_codes: unique';
  end;
  begin
    insert into public.referral_codes (user_id, code) values ('b2222222-2222-4222-8222-222222222222', 'BKPRZW0');
    raise exception 'FAILED: a code with 0 was accepted';
  exception when check_violation then
    raise notice 'ok - referral_codes: no look-alike characters';
  end;
  begin
    insert into public.referral_codes (user_id, code) values ('b2222222-2222-4222-8222-222222222222', 'bkprzwq');
    raise exception 'FAILED: a lower-case code was accepted';
  exception when check_violation then
    raise notice 'ok - referral_codes: upper-case only';
  end;
end;
$$;

-- ---------- referrals ----------
insert into public.referrals (referrer_id, referred_user_id, code) values
  ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'BKPRZWK');
select pg_temp.check('a referral starts pending, without a reward',
  (select status = 'pending' and referrer_reward is null and rewarded_at is null from public.referrals where referred_user_id = 'b2222222-2222-4222-8222-222222222222'));
do $$
begin
  begin
    insert into public.referrals (referrer_id, referred_user_id, code) values
      ('c3333333-3333-4333-8333-333333333333', 'b2222222-2222-4222-8222-222222222222', 'BKPRZWK');
    raise exception 'FAILED: a user was referred twice';
  exception when unique_violation then
    raise notice 'ok - referrals: a user is referred once';
  end;
  begin
    insert into public.referrals (referrer_id, referred_user_id, code) values
      ('c3333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 'BKPRZWK');
    raise exception 'FAILED: a self-referral was accepted';
  exception when check_violation then
    raise notice 'ok - referrals: never oneself';
  end;
  begin
    insert into public.referrals (referrer_id, referred_user_id, code, status) values
      ('a1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'BKPRZWK', 'rewarded');
    raise exception 'FAILED: a rewarded referral without its reward was accepted';
  exception when check_violation then
    raise notice 'ok - referrals: rewarded only with the reward and its time';
  end;
  begin
    insert into public.referrals (referrer_id, referred_user_id, code, status) values
      ('a1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'BKPRZWK', 'paid');
    raise exception 'FAILED: an unknown status was accepted';
  exception when check_violation then
    raise notice 'ok - referrals: pending / rewarded / rejected only';
  end;
end;
$$;

-- ---------- referral_reward: both pushed 30 days, exactly once ----------
create temp table t_before as
  select user_id, next_charge_at from public.subscriptions where user_id in ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
select pg_temp.check('reward: rewarded, both applied',
  (select r ->> 'result' = 'rewarded'
          and r -> 'referral' ->> 'referrer_reward' = 'applied'
          and r -> 'referral' ->> 'referred_reward' = 'applied'
          and r -> 'referral' ->> 'payment_id' = 'f0000000-0000-4000-8000-000000000001'
          and r ->> 'referrer_next' is not null and r ->> 'referred_next' is not null
     from (select public.referral_reward('b2222222-2222-4222-8222-222222222222', 'f0000000-0000-4000-8000-000000000001', 30, 12) as r) x));
select pg_temp.check('reward: the referrer''s next charge moved 30 days',
  (select s.next_charge_at - b.next_charge_at = interval '30 days' from public.subscriptions s join t_before b using (user_id) where s.user_id = 'a1111111-1111-4111-8111-111111111111'));
select pg_temp.check('reward: the friend''s (annual) next charge moved 30 days',
  (select s.next_charge_at - b.next_charge_at = interval '30 days' from public.subscriptions s join t_before b using (user_id) where s.user_id = 'b2222222-2222-4222-8222-222222222222'));
select pg_temp.check('reward: a second call is a no-op',
  (select public.referral_reward('b2222222-2222-4222-8222-222222222222', null, 30, 12) ->> 'result') = 'none');
select pg_temp.check('reward: still 30 days, not 60',
  (select s.next_charge_at - b.next_charge_at = interval '30 days' from public.subscriptions s join t_before b using (user_id) where s.user_id = 'a1111111-1111-4111-8111-111111111111'));
select pg_temp.check('reward: a user without a referral → none',
  (select public.referral_reward('c3333333-3333-4333-8333-333333333333', null, 30, 12) ->> 'result') = 'none');

-- ---------- a referrer on the trial (C): the month waits as a pending credit ----------
insert into public.referral_codes (user_id, code) values ('c3333333-3333-4333-8333-333333333333', 'CCCCCCC');
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('d4444444-4444-4444-8444-444444444444', 'basic', 'active', now() + interval '30 days');
insert into public.referrals (referrer_id, referred_user_id, code) values
  ('c3333333-3333-4333-8333-333333333333', 'd4444444-4444-4444-8444-444444444444', 'CCCCCCC');
select pg_temp.check('reward: no paid subscription → the referrer''s month is pending',
  (select r -> 'referral' ->> 'referrer_reward' = 'pending' and r ->> 'referrer_next' is null and r -> 'referral' ->> 'referred_reward' = 'applied'
     from (select public.referral_reward('d4444444-4444-4444-8444-444444444444', null, 30, 12) as r) x));
select pg_temp.check('apply_credit: nothing while there is no paid subscription',
  (select public.referral_apply_credit('c3333333-3333-4333-8333-333333333333', 30) ->> 'applied')::integer = 0);
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('c3333333-3333-4333-8333-333333333333', 'basic', 'active', now() + interval '1 month');
select pg_temp.check('apply_credit: the first payment takes the pending month',
  (select (r ->> 'applied')::integer = 1 and (r ->> 'next_charge_at')::timestamptz = now() + interval '1 month' + interval '30 days'
     from (select public.referral_apply_credit('c3333333-3333-4333-8333-333333333333', 30) as r) x));
select pg_temp.check('apply_credit: applied once',
  (select public.referral_apply_credit('c3333333-3333-4333-8333-333333333333', 30) ->> 'applied')::integer = 0
  and (select referrer_reward from public.referrals where referred_user_id = 'd4444444-4444-4444-8444-444444444444') = 'applied');

-- ---------- a charge in flight (E): no push, the month waits ----------
delete from public.referrals where referred_user_id = 'd4444444-4444-4444-8444-444444444444';
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('e5555555-5555-4555-8555-555555555555', 'basic', 'active', now() + interval '1 day');
insert into public.billing_approvals (user_id, kind, plan, amount_ils, status) values
  ('e5555555-5555-4555-8555-555555555555', 'renewal', 'basic', 99, 'processing');
insert into public.referral_codes (user_id, code) values ('e5555555-5555-4555-8555-555555555555', 'EEEEEEE');
insert into public.referrals (referrer_id, referred_user_id, code) values
  ('e5555555-5555-4555-8555-555555555555', 'd4444444-4444-4444-8444-444444444444', 'EEEEEEE');
select pg_temp.check('reward: an open charge of the referrer → pending, next_charge_at untouched',
  (select public.referral_reward('d4444444-4444-4444-8444-444444444444', null, 30, 12) -> 'referral' ->> 'referrer_reward') = 'pending'
  and (select next_charge_at from public.subscriptions where user_id = 'e5555555-5555-4555-8555-555555555555') = now() + interval '1 day');
select pg_temp.check('apply_credit: still waiting while the charge is open',
  (select public.referral_apply_credit('e5555555-5555-4555-8555-555555555555', 30) ->> 'applied')::integer = 0);
update public.billing_approvals set status = 'succeeded' where user_id = 'e5555555-5555-4555-8555-555555555555';
select pg_temp.check('apply_credit: after the charge settles',
  (select public.referral_apply_credit('e5555555-5555-4555-8555-555555555555', 30) ->> 'applied')::integer = 1);
-- a subscription with a failed renewal does not take a push either
update public.subscriptions set charge_failures = 1 where user_id = 'e5555555-5555-4555-8555-555555555555';
select pg_temp.check('referral_push: never onto an overdue subscription',
  public.referral_push('e5555555-5555-4555-8555-555555555555', 30) = false);

-- ---------- the cap: 12 rewarded months for a referrer in 365 days ----------
do $$
declare
  i integer;
  v_id uuid;
begin
  for i in 1..13 loop
    v_id := gen_random_uuid();
    insert into public.users (id, email, timezone) values (v_id, format('cap-%s@example.com', i), 'Asia/Jerusalem');
    insert into public.referrals (referrer_id, referred_user_id, code, status, rewarded_at, referrer_reward, referred_reward) values
      ('a1111111-1111-4111-8111-111111111111', v_id, 'BKPRZWK', 'rewarded',
       case when i = 13 then now() - interval '400 days' else now() - make_interval(days => i * 20) end,
       case when i = 12 then 'capped' else 'applied' end, 'applied');
  end loop;
end;
$$;
-- 1 (B) + 11 inside the window count (the capped one and the 400-day-old one do not) = 12 → the next one is capped
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('d4444444-4444-4444-8444-444444444444', 'basic', 'active', now() + interval '30 days')
  on conflict (user_id) do update set next_charge_at = excluded.next_charge_at, charge_failures = 0, status = 'active';
delete from public.referrals where referred_user_id = 'd4444444-4444-4444-8444-444444444444';
insert into public.referrals (referrer_id, referred_user_id, code) values
  ('a1111111-1111-4111-8111-111111111111', 'd4444444-4444-4444-8444-444444444444', 'BKPRZWK');
create temp table t_cap as select next_charge_at from public.subscriptions where user_id = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.check('cap: past 12 the referrer is capped, the friend still gets the month',
  (select r -> 'referral' ->> 'referrer_reward' = 'capped' and r -> 'referral' ->> 'referred_reward' = 'applied' and r ->> 'referrer_next' is null
     from (select public.referral_reward('d4444444-4444-4444-8444-444444444444', null, 30, 12) as r) x));
select pg_temp.check('cap: the referrer''s next charge is unchanged',
  (select next_charge_at from public.subscriptions where user_id = 'a1111111-1111-4111-8111-111111111111') = (select next_charge_at from t_cap));
select pg_temp.check('cap: with a higher cap it would have been applied (the count is 12)',
  (select count(*) from public.referrals r
    where r.referrer_id = 'a1111111-1111-4111-8111-111111111111' and r.status = 'rewarded'
      and r.referrer_reward in ('applied', 'pending') and r.rewarded_at > now() - interval '365 days') = 12);

-- ---------- deleting a user ----------
delete from public.users where id = 'c3333333-3333-4333-8333-333333333333';
select pg_temp.check('a deleted user: their code and their referrals are gone',
  not exists (select 1 from public.referral_codes where user_id = 'c3333333-3333-4333-8333-333333333333')
  and not exists (select 1 from public.referrals where referrer_id = 'c3333333-3333-4333-8333-333333333333' or referred_user_id = 'c3333333-3333-4333-8333-333333333333'));
delete from public.payments where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check('a deleted payment leaves the reward (payment_id → null)',
  (select status = 'rewarded' and payment_id is null from public.referrals where referred_user_id = 'b2222222-2222-4222-8222-222222222222'));

-- ---------- the event and alert types ----------
insert into public.page_events (day, visitor, path, event) values (current_date, repeat('a', 64), '/r', 'referral_visit');
select pg_temp.check('page_events: referral_visit is an event', exists (select 1 from public.page_events where event = 'referral_visit'));
insert into public.owner_alerts (type, dedupe_key, status, subject) values ('referral', 'referral:test', 'queued', 'הפניה');
select pg_temp.check('owner_alerts: referral is a type', exists (select 1 from public.owner_alerts where type = 'referral'));
do $$
begin
  begin
    insert into public.page_events (day, visitor, path, event) values (current_date, repeat('a', 64), '/', 'referral_paid');
    raise exception 'FAILED: an unknown event was accepted';
  exception when check_violation then
    raise notice 'ok - page_events: still a closed list';
  end;
end;
$$;

-- ---------- admin_user_overview: billing_cycle, referred ----------
select pg_temp.check('admin_user_overview: the cycle and "came through a referral"',
  (select billing_cycle = 'annual' and referred from public.admin_user_overview() where id = 'b2222222-2222-4222-8222-222222222222')
  and (select billing_cycle = 'monthly' and not referred from public.admin_user_overview() where id = 'a1111111-1111-4111-8111-111111111111'));

-- ---------- RLS / grants: the server only ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
do $$
begin
  begin
    perform 1 from public.referrals;
    raise exception 'FAILED: authenticated read referrals';
  exception when insufficient_privilege then
    raise notice 'ok - referrals: no access for authenticated';
  end;
  begin
    perform 1 from public.referral_codes;
    raise exception 'FAILED: authenticated read referral_codes';
  exception when insufficient_privilege then
    raise notice 'ok - referral_codes: no access for authenticated';
  end;
  begin
    perform public.referral_reward('b2222222-2222-4222-8222-222222222222', null, 30, 12);
    raise exception 'FAILED: authenticated ran referral_reward';
  exception when insufficient_privilege then
    raise notice 'ok - referral_reward: service_role only';
  end;
  begin
    perform public.referral_apply_credit('b2222222-2222-4222-8222-222222222222', 3000);
    raise exception 'FAILED: authenticated ran referral_apply_credit';
  exception when insufficient_privilege then
    raise notice 'ok - referral_apply_credit: service_role only';
  end;
  begin
    perform public.referral_push('b2222222-2222-4222-8222-222222222222', 3000);
    raise exception 'FAILED: authenticated ran referral_push';
  exception when insufficient_privilege then
    raise notice 'ok - referral_push: service_role only';
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.referrals;
    raise exception 'FAILED: anon read referrals';
  exception when insufficient_privilege then
    raise notice 'ok - referrals: no access for anon';
  end;
end;
$$;
reset role;

select 'ANNUAL REFERRALS: ALL CHECKS PASSED';

rollback;
