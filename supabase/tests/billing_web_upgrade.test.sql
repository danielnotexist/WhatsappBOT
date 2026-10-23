-- =============================================================================
-- billing_web_upgrade.test.sql — 0012: an upgrade approved on the pay page (no phone, already claimed, id = nonce)
-- טרנזקציה אחת + ROLLBACK. הצלחה = "BILLING WEB: ALL CHECKS PASSED".
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
  ('81111111-1111-4111-8111-111111111111', 'web-a@example.com', 'Asia/Jerusalem');
insert into public.wa_identities (user_id, phone_e164) values
  ('81111111-1111-4111-8111-111111111111', '+972500000081');
insert into public.subscriptions (user_id, plan, status, next_charge_at) values
  ('81111111-1111-4111-8111-111111111111', 'basic', 'active', now() + interval '20 days');

-- ---------- the pay page's approval: already claimed, approved_msg_id = 'web:' || id, no phone ----------
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status, approved_msg_id, approved_at) values
  ('b1111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 129.03, 'processing',
   'web:b1111111-1111-4111-8111-111111111111', now());
select pg_temp.check('web upgrade: inserted as processing without a phone',
  (select status::text from public.billing_approvals where id = 'b1111111-1111-4111-8111-111111111111') = 'processing');

do $$
begin
  -- the same form again (the same nonce = the same id) → no second approval
  begin
    insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status, approved_msg_id, approved_at) values
      ('b1111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 129.03, 'processing',
       'web:b1111111-1111-4111-8111-111111111111', now());
    raise exception 'FAILED: a replayed web approval was accepted';
  exception when unique_violation then
    raise notice 'ok - web upgrade: a replayed form is rejected';
  end;
  -- another form while the first charge is open → the one-open-charge index
  begin
    insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status, approved_msg_id, approved_at) values
      ('b2222222-2222-4222-8222-222222222222', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 129.03, 'processing',
       'web:b2222222-2222-4222-8222-222222222222', now());
    raise exception 'FAILED: a second open charge was accepted';
  exception when unique_violation then
    raise notice 'ok - web upgrade: one open charge per user';
  end;
  -- only an upgrade may skip the phone
  begin
    insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status, approved_msg_id) values
      ('b3333333-3333-4333-8333-333333333333', '81111111-1111-4111-8111-111111111111', 'retry', 'basic', 99, 'failed',
       'web:b3333333-3333-4333-8333-333333333333');
    raise exception 'FAILED: a web retry was accepted';
  exception when check_violation then
    raise notice 'ok - web approvals: upgrade only';
  end;
  -- never a pending (open) offer without a phone
  begin
    insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, approved_msg_id) values
      ('b4444444-4444-4444-8444-444444444444', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 10,
       'web:b4444444-4444-4444-8444-444444444444');
    raise exception 'FAILED: a pending web approval was accepted';
  exception when check_violation then
    raise notice 'ok - web approvals: never pending';
  end;
  -- the press id must be the row's own nonce
  begin
    insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, status, approved_msg_id) values
      ('b5555555-5555-4555-8555-555555555555', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 10, 'failed',
       'web:b1111111-1111-4111-8111-111111111111');
    raise exception 'FAILED: a web approval with another nonce was accepted';
  exception when check_violation then
    raise notice 'ok - web approvals: approved_msg_id = web:<id>';
  end;
  -- a WhatsApp-style offer without a phone is still rejected
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils)
    values ('81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 10);
    raise exception 'FAILED: an offer without a phone was accepted';
  exception when check_violation then
    raise notice 'ok - offers still carry the linked number';
  end;
end;
$$;

-- a web approval can never be claimed from WhatsApp (it has no number)
select pg_temp.check('claim: a web approval is not claimable by a press',
  (select count(*) from public.claim_billing_approval('b1111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', '+972500000081', 'wamid.w1')) = 0);

-- the open web charge also blocks a WhatsApp press and the monthly lock
insert into public.billing_approvals (id, user_id, kind, plan, amount_ils, phone_e164) values
  ('b6666666-6666-4666-8666-666666666666', '81111111-1111-4111-8111-111111111111', 'upgrade', 'pro', 129.03, '+972500000081');
select pg_temp.check('claim: an open web charge blocks the WhatsApp press',
  (select count(*) from public.claim_billing_approval('b6666666-6666-4666-8666-666666666666', '81111111-1111-4111-8111-111111111111', '+972500000081', 'wamid.w2')) = 0);
do $$
begin
  begin
    insert into public.billing_approvals (user_id, kind, plan, amount_ils, status)
    values ('81111111-1111-4111-8111-111111111111', 'renewal', 'basic', 99, 'processing');
    raise exception 'FAILED: a renewal lock was taken while a web charge is open';
  exception when unique_violation then
    raise notice 'ok - renewal lock: blocked by an open web charge';
  end;
end;
$$;

-- settled → the next charge can start; one successful payment per approval still holds
update public.billing_approvals set status = 'succeeded', hyp_trans_id = 'W-1', ccode = '0' where id = 'b1111111-1111-4111-8111-111111111111';
insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, approval_id) values
  ('81111111-1111-4111-8111-111111111111', 'W-1', 129.03, '0', 'b1111111-1111-4111-8111-111111111111');
do $$
begin
  begin
    insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, approval_id)
    values ('81111111-1111-4111-8111-111111111111', 'W-2', 129.03, '0', 'b1111111-1111-4111-8111-111111111111');
    raise exception 'FAILED: a second successful payment for one web approval was accepted';
  exception when unique_violation then
    raise notice 'ok - payments: one successful payment per web approval';
  end;
end;
$$;
select pg_temp.check('claim: after the web charge settled, a press can be claimed',
  (select count(*) from public.claim_billing_approval('b6666666-6666-4666-8666-666666666666', '81111111-1111-4111-8111-111111111111', '+972500000081', 'wamid.w3')) = 1);

select 'BILLING WEB: ALL CHECKS PASSED';

rollback;
