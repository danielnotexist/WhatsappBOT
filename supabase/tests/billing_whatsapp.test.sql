-- =============================================================================
-- billing_whatsapp.test.sql — 0007: billing_approvals / claim_billing_approval() / raise_plan_limit() / lower_plan_limit()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "BILLING WA: ALL CHECKS PASSED".
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

insert into public.users (id, email, timezone) values
  ('71111111-1111-4111-8111-111111111111', 'bill-a@example.com', 'Asia/Jerusalem'),
  ('72222222-2222-4222-8222-222222222222', 'bill-b@example.com', 'Asia/Jerusalem');

insert into public.wa_identities (user_id, phone_e164) values
  ('71111111-1111-4111-8111-111111111111', '+972500000071'),
  ('72222222-2222-4222-8222-222222222222', '+972500000072');

insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('71111111-1111-4111-8111-111111111111', 'basic', 'active', now() + interval '20 days');

-- ---------- the 10-minute rule lives in the schema ----------
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, phone_e164) values
  ('a1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 129.03, '+972500000071');
select pg_temp.check('approval: default expiry is exactly 10 minutes',
  (select expires_at - created_at from public.billing_approvals where id = 'a1111111-1111-4111-8111-111111111111') = interval '10 minutes');

do $$
begin
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, phone_e164, expires_at)
    values ('71111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 10, '+972500000071', now() + interval '11 minutes');
    raise exception 'FAILED: an 11-minute approval was accepted';
  exception when check_violation then
    raise notice 'ok - approval: longer than 10 minutes rejected';
  end;
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, phone_e164)
    values ('71111111-1111-4111-8111-111111111111', 'retry', 'basic', 0, '+972500000071');
    raise exception 'FAILED: a charge approval without an amount was accepted';
  exception when check_violation then
    raise notice 'ok - approval: charge kinds need a positive amount';
  end;
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, phone_e164)
    values ('71111111-1111-4111-8111-111111111111', 'cancel', 'trial', 0, '+972500000071');
    raise exception 'FAILED: a trial-plan approval was accepted';
  exception when check_violation then
    raise notice 'ok - approval: plan must be basic/pro';
  end;
end;
$$;

-- ---------- claim: owner + number + pending + not expired, exactly once ----------
select pg_temp.check('claim: wrong number → nothing',
  (select count(*) from public.claim_billing_approval('a1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', '+972500000072', 'wamid.x0')) = 0);
-- the number the offer went to is no longer the account's active linked number → nothing
update public.wa_identities set status = 'unlinked' where phone_e164 = '+972500000071';
select pg_temp.check('claim: unlinked number → nothing',
  (select count(*) from public.claim_billing_approval('a1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x0')) = 0
  and (select status::text from public.billing_approvals where id = 'a1111111-1111-4111-8111-111111111111') = 'pending');
update public.wa_identities set status = 'active' where phone_e164 = '+972500000071';
select pg_temp.check('claim: another user → nothing',
  (select count(*) from public.claim_billing_approval('a1111111-1111-4111-8111-111111111111', '72222222-2222-4222-8222-222222222222', '+972500000071', 'wamid.x0')) = 0);
select pg_temp.check('claim: owner from the linked number → processing',
  (select status::text from public.claim_billing_approval('a1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x1')) = 'processing');
select pg_temp.check('claim: records the approving wamid',
  (select approved_msg_id from public.billing_approvals where id = 'a1111111-1111-4111-8111-111111111111') = 'wamid.x1'
  and (select approved_at is not null from public.billing_approvals where id = 'a1111111-1111-4111-8111-111111111111'));
select pg_temp.check('claim: second press (another wamid) → nothing',
  (select count(*) from public.claim_billing_approval('a1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x2')) = 0);

-- a second charge offer for the same user cannot be claimed while the first is processing
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, phone_e164) values
  ('a2222222-2222-4222-8222-222222222222', '71111111-1111-4111-8111-111111111111', 'retry', 'basic', 99, '+972500000071');
select pg_temp.check('claim: one open charge per user (processing blocks another)',
  (select count(*) from public.claim_billing_approval('a2222222-2222-4222-8222-222222222222', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x3')) = 0
  and (select status::text from public.billing_approvals where id = 'a2222222-2222-4222-8222-222222222222') = 'pending');

-- an "unknown" outcome keeps blocking until someone reconciles it
update public.billing_approvals set status = 'unknown' where id = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.check('claim: unknown blocks new charges',
  (select count(*) from public.claim_billing_approval('a2222222-2222-4222-8222-222222222222', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x3')) = 0);
update public.billing_approvals set status = 'succeeded' where id = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.check('claim: after reconciliation the next offer can be claimed',
  (select count(*) from public.claim_billing_approval('a2222222-2222-4222-8222-222222222222', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x3')) = 1);

-- non-charge approvals (cancel) are not blocked by an open charge
insert into public.billing_approvals (id, user_id, kind, plan, phone_e164) values
  ('a3333333-3333-4333-8333-333333333333', '71111111-1111-4111-8111-111111111111', 'cancel', 'basic', '+972500000071');
select pg_temp.check('claim: one wamid approves at most one offer',
  (select count(*) from public.claim_billing_approval('a3333333-3333-4333-8333-333333333333', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x3')) = 0);
select pg_temp.check('claim: cancel claimable while a charge is processing',
  (select count(*) from public.claim_billing_approval('a3333333-3333-4333-8333-333333333333', '71111111-1111-4111-8111-111111111111', '+972500000071', 'wamid.x4')) = 1);

-- the automatic monthly charge takes the same per-user lock (kind renewal, no phone, inserted as processing)
do $$
begin
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, status)
    values ('71111111-1111-4111-8111-111111111111', 'renewal', 'basic', 99, 'processing');
    raise exception 'FAILED: a renewal lock was taken while a charge is processing';
  exception when unique_violation then
    raise notice 'ok - renewal lock: blocked by an open one-tap charge';
  end;
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils)
    values ('71111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 10);
    raise exception 'FAILED: a user offer without a phone was accepted';
  exception when check_violation then
    raise notice 'ok - offers always carry the linked number';
  end;
end;
$$;
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status) values
  ('a5555555-5555-4555-8555-555555555555', '72222222-2222-4222-8222-222222222222', 'renewal', 'basic', 99, 'processing');
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, phone_e164) values
  ('a6666666-6666-4666-8666-666666666666', '72222222-2222-4222-8222-222222222222', 'retry', 'basic', 99, '+972500000072');
select pg_temp.check('claim: a running monthly charge blocks the one-tap retry',
  (select count(*) from public.claim_billing_approval('a6666666-6666-4666-8666-666666666666', '72222222-2222-4222-8222-222222222222', '+972500000072', 'wamid.y0')) = 0);
update public.billing_approvals set status = 'failed' where id = 'a5555555-5555-4555-8555-555555555555';

-- expired offers cannot be claimed
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, phone_e164, created_at, expires_at) values
  ('a4444444-4444-4444-8444-444444444444', '72222222-2222-4222-8222-222222222222', 'renew', 'basic', 99, '+972500000072',
   now() - interval '20 minutes', now() - interval '10 minutes');
select pg_temp.check('claim: expired → nothing',
  (select count(*) from public.claim_billing_approval('a4444444-4444-4444-8444-444444444444', '72222222-2222-4222-8222-222222222222', '+972500000072', 'wamid.y1')) = 0);

-- ---------- payments: at most one successful payment per approval ----------
insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, approval_id) values
  ('71111111-1111-4111-8111-111111111111', 'T-fail-1', 99, '4', 'a2222222-2222-4222-8222-222222222222'),
  ('71111111-1111-4111-8111-111111111111', 'T-ok-1',   99, '0', 'a2222222-2222-4222-8222-222222222222');
do $$
begin
  begin
    insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, approval_id)
    values ('71111111-1111-4111-8111-111111111111', 'T-ok-2', 99, '0', 'a2222222-2222-4222-8222-222222222222');
    raise exception 'FAILED: a second successful payment for one approval was accepted';
  exception when unique_violation then
    raise notice 'ok - payments: one successful payment per approval';
  end;
end;
$$;

-- ---------- subscriptions.scheduled_plan ----------
update public.subscriptions set scheduled_plan = 'basic' where user_id = '71111111-1111-4111-8111-111111111111';
do $$
begin
  begin
    update public.subscriptions set scheduled_plan = 'trial' where user_id = '71111111-1111-4111-8111-111111111111';
    raise exception 'FAILED: scheduled_plan trial accepted';
  exception when check_violation then
    raise notice 'ok - subscriptions: scheduled_plan must be basic/pro';
  end;
end;
$$;

-- ---------- raise_plan_limit ----------
insert into public.usage (user_id, period_start, counted_messages, free_remaining, plan_limit) values
  ('71111111-1111-4111-8111-111111111111', date_trunc('month', now() at time zone 'Asia/Jerusalem')::date, 750, 0, 750);
select pg_temp.check('raise_plan_limit: 750 used of 750 → 2,250 left',
  public.raise_plan_limit('71111111-1111-4111-8111-111111111111', 3000) = 2250);
-- (a separate statement: the function's update is not visible to the snapshot of the statement that called it)
select pg_temp.check('raise_plan_limit: plan_limit is 3,000',
  (select plan_limit from public.usage where user_id = '71111111-1111-4111-8111-111111111111') = 3000);
select pg_temp.check('raise_plan_limit: idempotent (already 3,000) → null',
  public.raise_plan_limit('71111111-1111-4111-8111-111111111111', 3000) is null);
select pg_temp.check('raise_plan_limit: no row this month → null',
  public.raise_plan_limit('72222222-2222-4222-8222-222222222222', 3000) is null);
select pg_temp.check('count_trial_message counts against the raised limit',
  public.count_trial_message('71111111-1111-4111-8111-111111111111') = 2249);

-- ---------- lower_plan_limit (pro → basic at the monthly charge) ----------
-- 751 counted of 3,000 → 2,249 left; back to 750 → nothing left (never below 0)
select pg_temp.check('lower_plan_limit: 751 used, 3,000 → 750 → 0 left',
  public.lower_plan_limit('71111111-1111-4111-8111-111111111111', 750) = 0);
select pg_temp.check('lower_plan_limit: plan_limit is 750',
  (select plan_limit from public.usage where user_id = '71111111-1111-4111-8111-111111111111') = 750);
select pg_temp.check('lower_plan_limit: idempotent (already 750) → null',
  public.lower_plan_limit('71111111-1111-4111-8111-111111111111', 750) is null);
insert into public.usage (user_id, period_start, counted_messages, free_remaining, plan_limit) values
  ('72222222-2222-4222-8222-222222222222', date_trunc('month', now() at time zone 'Asia/Jerusalem')::date, 100, 2900, 3000);
select pg_temp.check('lower_plan_limit: 100 used of 3,000 → 650 left of 750',
  public.lower_plan_limit('72222222-2222-4222-8222-222222222222', 750) = 650);

-- ---------- keep_pro: a confirmation offer without an amount, not a charge ----------
insert into public.billing_approvals (id, user_id, kind, plan, phone_e164) values
  ('a7777777-7777-4777-8777-777777777777', '72222222-2222-4222-8222-222222222222', 'keep_pro', 'pro', '+972500000072');
select pg_temp.check('keep_pro: claimable (no amount, not blocked by the charge lock)',
  (select status::text from public.claim_billing_approval('a7777777-7777-4777-8777-777777777777', '72222222-2222-4222-8222-222222222222', '+972500000072', 'wamid.z1')) = 'processing');

-- ---------- privileges ----------
select pg_temp.check('billing_approvals: RLS on',
  (select relrowsecurity from pg_class where oid = 'public.billing_approvals'::regclass));
select pg_temp.check('billing_approvals: no access for authenticated / anon',
  not has_table_privilege('authenticated', 'public.billing_approvals', 'select')
  and not has_table_privilege('anon', 'public.billing_approvals', 'select'));
select pg_temp.check('claim_billing_approval / raise_plan_limit / lower_plan_limit: service_role only',
  not has_function_privilege('authenticated', 'public.claim_billing_approval(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.raise_plan_limit(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.lower_plan_limit(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.lower_plan_limit(uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.claim_billing_approval(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.lower_plan_limit(uuid, integer)', 'execute'));

select 'BILLING WA: ALL CHECKS PASSED';
rollback;
