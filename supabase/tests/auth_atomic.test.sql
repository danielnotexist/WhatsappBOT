-- =============================================================================
-- auth_atomic.test.sql — 0020: otp_issue / otp_check, link_tokens.token_hash, wa_identity_link, link_token_consume,
-- wa_trial_phones, wa_link_attempt, login_token_consume, and that only service_role runs them.
-- טרנזקציה אחת + ROLLBACK. הצלחה = "AUTH ATOMIC: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

delete from public.users;
delete from public.auth_otps;
delete from public.wa_link_attempts;
delete from public.wa_trial_phones;

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

create function pg_temp.issue(p_email text, p_requester text, p_challenge text, p_hash text)
returns jsonb
language sql
as $$
  select public.otp_issue(p_email, p_email, p_requester, p_challenge, p_hash, now() + interval '10 minutes', 60, 5, 10, 1000);
$$;

-- ---------- otp_issue: cooldown per requester, caps, supersede ----------
select pg_temp.check('otp_issue: first send ok',
  pg_temp.issue('otp-a@example.com', 'ip1', 'ch1', 'h1') ->> 'status' = 'ok');
select pg_temp.check('otp_issue: same requester within 60 s → cooldown with retry_after',
  (select r ->> 'status' = 'cooldown' and (r ->> 'retry_after')::int between 1 and 60 from pg_temp.issue('otp-a@example.com', 'ip1', 'ch2', 'h2') r));
select pg_temp.check('otp_issue: another requester is not held by that cooldown',
  pg_temp.issue('otp-a@example.com', 'ip2', 'chB', 'hB') ->> 'status' = 'ok');
select pg_temp.check('otp_issue: the other requester did not kill the first code',
  (select count(*) from public.auth_otps where email = 'otp-a@example.com' and used_at is null) = 2);

-- a burned code still counts for the cooldown (rows of any status)
update public.auth_otps set used_at = now(), attempts = 5 where email = 'otp-a@example.com' and requester = 'ip1';
select pg_temp.check('otp_issue: a code burned by guesses does not lift the cooldown',
  pg_temp.issue('otp-a@example.com', 'ip1', 'ch3', 'h3') ->> 'status' = 'cooldown');

-- the same requester after the cooldown supersedes only its own code
update public.auth_otps set created_at = now() - interval '2 minutes' where email = 'otp-a@example.com';
select pg_temp.check('otp_issue: after the cooldown the same requester gets a new code',
  pg_temp.issue('otp-a@example.com', 'ip2', 'chC', 'hC') ->> 'status' = 'ok');
select pg_temp.check('otp_issue: the new code superseded that requester''s earlier one only',
  (select count(*) from public.auth_otps where email = 'otp-a@example.com' and requester = 'ip2' and used_at is null) = 1
  and (select challenge_hash from public.auth_otps where email = 'otp-a@example.com' and requester = 'ip2' and used_at is null) = 'chC');

-- a code spent by a clean sign-in (no wrong guesses) does not hold the next send back
select pg_temp.issue('otp-c@example.com', 'ip7', 'chS', 'hS');
update public.auth_otps set used_at = now() where email = 'otp-c@example.com';
select pg_temp.check('otp_issue: a code spent by a clean sign-in lifts the cooldown',
  pg_temp.issue('otp-c@example.com', 'ip7', 'chS2', 'hS2') ->> 'status' = 'ok');

-- one requester across every address (p_max_per_requester_all)
insert into public.auth_otps (email, mailbox, requester, code_hash, expires_at, created_at)
select 'many' || g || '@example.com', 'many' || g || '@example.com', 'ip-many', 'x', now(), now() - interval '5 minutes'
  from generate_series(1, 3) g;
select pg_temp.check('otp_issue: a requester over its cap across addresses → too_many',
  public.otp_issue('many-new@example.com', 'many-new@example.com', 'ip-many', 'c', 'h', now() + interval '10 minutes', 60, 5, 10, null, 3) ->> 'status' = 'too_many');
select pg_temp.check('otp_issue: another requester is not held by that cap',
  public.otp_issue('many-new@example.com', 'many-new@example.com', 'ip-other', 'c', 'h', now() + interval '10 minutes', 60, 5, 10, null, 3) ->> 'status' = 'ok');

-- per-requester cap (5 / hour)
insert into public.auth_otps (email, mailbox, requester, code_hash, expires_at, created_at)
select 'otp-b@example.com', 'otp-b@example.com', 'ip9', 'x', now(), now() - interval '10 minutes' from generate_series(1, 5);
select pg_temp.check('otp_issue: 5 codes this hour for one requester → too_many',
  pg_temp.issue('otp-b@example.com', 'ip9', 'c', 'h') ->> 'status' = 'too_many');
select pg_temp.check('otp_issue: another requester still gets one',
  pg_temp.issue('otp-b@example.com', 'ip8', 'c', 'h') ->> 'status' = 'ok');
-- per-mailbox backstop (10 / hour)
insert into public.auth_otps (email, mailbox, requester, code_hash, expires_at, created_at)
select 'otp-b@example.com', 'otp-b@example.com', 'ipx' || g, 'x', now(), now() - interval '10 minutes' from generate_series(1, 4) g;
select pg_temp.check('otp_issue: 10 codes this hour for the mailbox → too_many for everyone',
  pg_temp.issue('otp-b@example.com', 'ip7', 'c', 'h') ->> 'status' = 'too_many');
select pg_temp.check('otp_issue: the cap counts the canonical mailbox, not the address',
  public.otp_issue('otp-b+tag@example.com', 'otp-b@example.com', 'ip6', 'c', 'h', now() + interval '10 minutes', 60, 5, 10, 1000) ->> 'status' = 'too_many');
-- global ceiling
select pg_temp.check('otp_issue: the global hourly ceiling → busy',
  public.otp_issue('otp-c@example.com', 'otp-c@example.com', 'ip1', 'c', 'h', now() + interval '10 minutes', 60, 5, 10, 3) ->> 'status' = 'busy');

-- ---------- otp_check ----------
delete from public.auth_otps;
select pg_temp.issue('chk@example.com', 'ip1', 'chal', 'right');
select pg_temp.check('otp_check: without the challenge → no_code, no attempt spent',
  public.otp_check('chk@example.com', 'other', 'wrong', 5) ->> 'status' = 'no_code'
  and (select attempts from public.auth_otps where email = 'chk@example.com') = 0);
select pg_temp.check('otp_check: wrong → invalid, 4 left',
  (select r ->> 'status' = 'invalid' and (r ->> 'attempts_left')::int = 4 from public.otp_check('chk@example.com', 'chal', 'wrong', 5) r));
select public.otp_check('chk@example.com', 'chal', 'wrong', 5);
select public.otp_check('chk@example.com', 'chal', 'wrong', 5);
select public.otp_check('chk@example.com', 'chal', 'wrong', 5);
select pg_temp.check('otp_check: the 5th wrong → too_many_attempts and the code is gone',
  public.otp_check('chk@example.com', 'chal', 'wrong', 5) ->> 'status' = 'too_many_attempts');
select pg_temp.check('otp_check: 5 attempts counted, the code is used',
  (select attempts = 5 and used_at is not null from public.auth_otps where email = 'chk@example.com'));
select pg_temp.check('otp_check: even the right code after that → no_code',
  public.otp_check('chk@example.com', 'chal', 'right', 5) ->> 'status' = 'no_code');

update public.auth_otps set created_at = now() - interval '2 minutes';
select pg_temp.issue('chk@example.com', 'ip1', 'chal2', 'right2');
select pg_temp.check('otp_check: right → ok and used',
  public.otp_check('chk@example.com', 'chal2', 'right2', 5) ->> 'status' = 'ok');
select pg_temp.check('otp_check: the right code is used',
  (select used_at is not null from public.auth_otps where email = 'chk@example.com' and challenge_hash = 'chal2'));
select pg_temp.check('otp_check: the same code twice → no_code',
  public.otp_check('chk@example.com', 'chal2', 'right2', 5) ->> 'status' = 'no_code');

insert into public.auth_otps (email, mailbox, requester, challenge_hash, code_hash, expires_at)
values ('exp@example.com', 'exp@example.com', 'ip1', 'c', 'h', now() - interval '1 second');
select pg_temp.check('otp_check: expired → expired and used',
  public.otp_check('exp@example.com', 'c', 'h', 5) ->> 'status' = 'expired');
select pg_temp.check('otp_check: the expired code is used',
  (select used_at is not null from public.auth_otps where email = 'exp@example.com'));

-- the admin code: challenge null
insert into public.auth_otps (email, mailbox, requester, code_hash, expires_at) values ('admin:owner@example.com', 'admin:owner@example.com', 'admin', 'adm', now() + interval '10 minutes');
select pg_temp.check('otp_check: a null challenge matches only null-challenge rows',
  public.otp_check('admin:owner@example.com', 'x', 'adm', 5) ->> 'status' = 'no_code');
select pg_temp.check('otp_check: the admin row with a null challenge',
  public.otp_check('admin:owner@example.com', null, 'adm', 5) ->> 'status' = 'ok');

-- ---------- link_tokens.token_hash ----------
insert into public.users (id, email, timezone, created_at) values
  ('a0200000-0000-4000-8000-000000000001', 'link-a@example.com', 'Asia/Jerusalem', now() - interval '3 days'),
  ('a0200000-0000-4000-8000-000000000002', 'link-b@example.com', 'Asia/Jerusalem', now() - interval '1 day');
select pg_temp.check('link_tokens: the clear token column is gone',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'link_tokens' and column_name = 'token'));
do $$
begin
  begin
    insert into public.link_tokens (user_id, token_hash, expires_at) values ('a0200000-0000-4000-8000-000000000001', 'ABCD-2345', now());
    raise exception 'FAILED: a clear token was accepted as token_hash';
  exception when check_violation then
    raise notice 'ok - link_tokens: token_hash must be a 43-char HMAC';
  end;
end;
$$;

insert into public.link_tokens (user_id, token_hash, expires_at) values
  ('a0200000-0000-4000-8000-000000000001', repeat('a', 43), now() + interval '15 minutes'),
  ('a0200000-0000-4000-8000-000000000001', repeat('b', 43), now() + interval '15 minutes'),
  ('a0200000-0000-4000-8000-000000000002', repeat('c', 43), now() - interval '1 minute'),
  ('a0200000-0000-4000-8000-000000000002', repeat('e', 43), now() + interval '15 minutes');

-- ---------- link_token_consume ----------
select pg_temp.check('link_token_consume: unknown → invalid',
  public.link_token_consume(repeat('z', 43), '+972501230001', null, repeat('p', 43)) ->> 'result' = 'invalid');
select pg_temp.check('link_token_consume: expired → expired',
  public.link_token_consume(repeat('c', 43), '+972501230001', null, repeat('p', 43)) ->> 'result' = 'expired');
select pg_temp.check('link_token_consume: valid → linked',
  public.link_token_consume(repeat('a', 43), '+972501230001', 'Dana', repeat('p', 43)) ->> 'result' = 'linked');
select pg_temp.check('link_token_consume: the phone is active on the account',
  (select user_id = 'a0200000-0000-4000-8000-000000000001' and status = 'active' from public.wa_identities where phone_e164 = '+972501230001'));
select pg_temp.check('link_token_consume: the same token again → expired (single use)',
  public.link_token_consume(repeat('a', 43), '+972501230002', null, repeat('q', 43)) ->> 'result' = 'expired');
select pg_temp.check('link_token_consume: the account''s second token from another phone → second_phone',
  (select r ->> 'result' = 'second_phone' and r ->> 'other_phone' = '+972501230001'
     from public.link_token_consume(repeat('b', 43), '+972501230002', null, repeat('q', 43)) r));
select pg_temp.check('link_token_consume: the refused token stays unused',
  (select used_at is null from public.link_tokens where token_hash = repeat('b', 43)));
select pg_temp.check('link_token_consume: a phone active on another account is never taken over',
  public.link_token_consume(repeat('e', 43), '+972501230001', null, repeat('p', 43)) ->> 'result' = 'phone_taken');
select pg_temp.check('link_token_consume: the phone stays with its account',
  (select user_id = 'a0200000-0000-4000-8000-000000000001' from public.wa_identities where phone_e164 = '+972501230001'));

-- one trial per phone: A unlinks, B links the same phone → B's trial is used up
select pg_temp.check('wa_trial_phones: the first trial link records the phone',
  (select user_id = 'a0200000-0000-4000-8000-000000000001' from public.wa_trial_phones where phone_hash = repeat('p', 43)));
update public.wa_identities set status = 'unlinked' where phone_e164 = '+972501230001';
select pg_temp.check('link_token_consume: an unlinked phone moves to the new account, its trial already used',
  (select r ->> 'result' = 'linked' and (r ->> 'trial_reused')::boolean
     from public.link_token_consume(repeat('e', 43), '+972501230001', null, repeat('p', 43)) r));
select pg_temp.check('link_token_consume: the phone moved, the trial is spent',
  (select user_id = 'a0200000-0000-4000-8000-000000000002' from public.wa_identities where phone_e164 = '+972501230001')
  and (select free_remaining = 0 from public.usage where user_id = 'a0200000-0000-4000-8000-000000000002'));
select pg_temp.check('count_trial_message: no second trial on that phone',
  public.count_trial_message('a0200000-0000-4000-8000-000000000002') = -1);

-- ---------- wa_identity_link ----------
do $$
begin
  begin
    perform public.wa_identity_link('a0200000-0000-4000-8000-000000000001', '+972501230001', null);
    raise exception 'FAILED: wa_identity_link overwrote an active phone';
  exception when unique_violation then
    raise notice 'ok - wa_identity_link: an active phone is never reassigned';
  end;
end;
$$;

-- ---------- wa_link_attempt ----------
select pg_temp.check('wa_link_attempt: a plain message → the pointer, no strike',
  (select r ->> 'reply' = 'true' and (r ->> 'attempts')::int = 0 from public.wa_link_attempt('+972509990001', false, 'm1', 3, 86400, 3600) r));
select pg_temp.check('wa_link_attempt: another plain message within the hour → no reply, still no strike',
  (select r ->> 'reply' = 'false' and r ->> 'blocked' = 'false' from public.wa_link_attempt('+972509990001', false, 'm2', 3, 86400, 3600) r));
select public.wa_link_attempt('+972509990001', true, 'm3', 3, 86400, 3600);
select pg_temp.check('wa_link_attempt: the same wamid again is not counted',
  (select (r ->> 'attempts')::int = 1 from public.wa_link_attempt('+972509990001', true, 'm3', 3, 86400, 3600) r));
select public.wa_link_attempt('+972509990001', true, 'm4', 3, 86400, 3600);
select pg_temp.check('wa_link_attempt: the 3rd bad token → blocked, no reply',
  (select r ->> 'blocked' = 'true' and r ->> 'reply' = 'false' from public.wa_link_attempt('+972509990001', true, 'm5', 3, 86400, 3600) r));
update public.wa_link_attempts set blocked_until = now() - interval '1 second' where phone_e164 = '+972509990001';
select pg_temp.check('wa_link_attempt: after the block ran out the counter starts over',
  (select r ->> 'blocked' = 'false' and (r ->> 'attempts')::int = 1 and r ->> 'reply' = 'true'
     from public.wa_link_attempt('+972509990001', true, 'm6', 3, 86400, 3600) r));

-- ---------- login_token_consume ----------
update public.users set profile = jsonb_build_object('login_token', jsonb_build_object('nonce_hash', 'nh1', 'exp', 1), 'keep', 1)
 where id = 'a0200000-0000-4000-8000-000000000001';
select pg_temp.check('login_token_consume: a wrong hash → false, nothing removed',
  public.login_token_consume('a0200000-0000-4000-8000-000000000001', 'nope') = false);
select pg_temp.check('login_token_consume: still stored after a wrong hash',
  (select profile ? 'login_token' from public.users where id = 'a0200000-0000-4000-8000-000000000001'));
select pg_temp.check('login_token_consume: the right hash → true once, other keys kept',
  public.login_token_consume('a0200000-0000-4000-8000-000000000001', 'nh1') = true);
select pg_temp.check('login_token_consume: the second use → false',
  public.login_token_consume('a0200000-0000-4000-8000-000000000001', 'nh1') = false);
select pg_temp.check('login_token_consume: the key is removed, other keys kept',
  (select not (profile ? 'login_token') and profile ->> 'keep' = '1' from public.users where id = 'a0200000-0000-4000-8000-000000000001'));

-- ---------- privileges: service_role only ----------
set local role authenticated;
do $$
begin
  begin
    perform public.otp_check('chk@example.com', 'chal', 'x', 5);
    raise exception 'FAILED: authenticated ran otp_check';
  exception when insufficient_privilege then
    raise notice 'ok - otp_check: service_role only';
  end;
  begin
    perform public.link_token_consume(repeat('a', 43), '+972501230009', null, null);
    raise exception 'FAILED: authenticated ran link_token_consume';
  exception when insufficient_privilege then
    raise notice 'ok - link_token_consume: service_role only';
  end;
  begin
    perform 1 from public.wa_trial_phones;
    raise exception 'FAILED: authenticated read wa_trial_phones';
  exception when insufficient_privilege then
    raise notice 'ok - wa_trial_phones: no access for authenticated';
  end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.otp_issue('x@example.com', 'x@example.com', 'r', 'c', 'h', now(), 60, 5, 10, null);
    raise exception 'FAILED: anon ran otp_issue';
  exception when insufficient_privilege then
    raise notice 'ok - otp_issue: service_role only';
  end;
  begin
    perform public.login_token_consume('a0200000-0000-4000-8000-000000000001', 'x');
    raise exception 'FAILED: anon ran login_token_consume';
  exception when insufficient_privilege then
    raise notice 'ok - login_token_consume: service_role only';
  end;
end;
$$;
reset role;

select 'AUTH ATOMIC: ALL CHECKS PASSED';

rollback;
