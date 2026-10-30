#!/usr/bin/env bash
# =============================================================================
# run-local.sh — applies the migrations + seed to a FRESH local Postgres database
# and runs every *.test.sql in supabase/tests. No Supabase CLI / Docker needed.
#
# Usage:
#   supabase/tests/run-local.sh                 # uses `sudo -u postgres psql` (peer auth) or PSQL env
#   PSQL="psql postgresql://postgres:postgres@127.0.0.1:5432" supabase/tests/run-local.sh
#   DB_NAME=whatsappbot_test supabase/tests/run-local.sh
#
# Success = last line "SUPABASE LOCAL: ALL TESTS PASSED". Any failure stops with a non-zero exit.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPA="$ROOT/supabase"
DB_NAME="${DB_NAME:-whatsappbot_test}"

if [[ -n "${PSQL:-}" ]]; then
  PSQL_CMD=($PSQL)
elif command -v psql >/dev/null 2>&1 && psql -U postgres -c 'select 1' >/dev/null 2>&1; then
  PSQL_CMD=(psql -U postgres)
elif command -v sudo >/dev/null 2>&1 && sudo -n -u postgres psql -c 'select 1' >/dev/null 2>&1; then
  PSQL_CMD=(sudo -n -u postgres psql)
else
  echo "לא נמצא Postgres מקומי נגיש. התקן PostgreSQL 15+ או הגדר PSQL=\"psql <connection-url>\"." >&2
  exit 2
fi

run() { "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -X -q "$@"; }

echo "▶ fresh database: $DB_NAME"
run -d postgres -c "drop database if exists \"$DB_NAME\""
run -d postgres -c "create database \"$DB_NAME\""

echo "▶ supabase stub (roles anon/authenticated/service_role, auth.uid())"
run -d "$DB_NAME" -f "$SUPA/tests/local_supabase_stub.sql"

for m in "$SUPA"/migrations/*.sql; do
  echo "▶ migration $(basename "$m")"
  run -d "$DB_NAME" -f "$m"
done

echo "▶ seed.sql"
run -d "$DB_NAME" -f "$SUPA/seed.sql"

for t in "$SUPA"/tests/*.test.sql; do
  echo "▶ test $(basename "$t")"
  out="$("${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -X -d "$DB_NAME" -f "$t" 2>&1)" || { echo "$out" | tail -40; echo "✖ $(basename "$t") FAILED"; exit 1; }
  echo "$out" | grep -E "ALL CHECKS PASSED|FAILED" || true
done

# -----------------------------------------------------------------------------
# Two sessions at once (the *.test.sql files run in one transaction and cannot show this): the user-row lock in
# enforce_agent_rules and enforce_agent_daily_cap must make the second writer wait and then fail.
#   session A: begin → insert → hold the transaction 2 s → commit
#   session B: starts 0.7 s later → the same insert → must wait for A and raise
# -----------------------------------------------------------------------------
race() { # race <label> <setup-sql> <insert-sql> <expected-error> <count-sql> <expected-count>
  local label="$1" setup="$2" insert="$3" expected="$4" count_sql="$5" want="$6" out_b count
  run -d "$DB_NAME" -c "$setup"
  "${PSQL_CMD[@]}" -X -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; $insert; select pg_sleep(2); commit;" >/dev/null &
  local pid_a=$!
  sleep 0.7
  out_b="$("${PSQL_CMD[@]}" -X -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "$insert" 2>&1)" && { wait "$pid_a"; echo "✖ race: $label — the second insert succeeded"; exit 1; }
  wait "$pid_a" || { echo "✖ race: $label — the first insert failed"; exit 1; }
  echo "$out_b" | grep -q "$expected" || { echo "$out_b"; echo "✖ race: $label — expected $expected"; exit 1; }
  count="$("${PSQL_CMD[@]}" -X -q -t -A -d "$DB_NAME" -c "$count_sql")"
  [[ "$count" == "$want" ]] || { echo "✖ race: $label — expected $want rows, got $count"; exit 1; }
  echo "ok - race: $label"
}

echo "▶ concurrency (two sessions)"
race "two parallel custom agents for a basic user → one row, the other agent_limit_reached" \
  "insert into public.users (id, email) values ('c1111111-1111-4111-8111-111111111111', 'race-basic@example.com');
   insert into public.subscriptions (user_id, plan, status, next_charge_at) values ('c1111111-1111-4111-8111-111111111111', 'basic', 'active', now() + interval '20 days');" \
  "insert into public.agents (user_id, name, role) values ('c1111111-1111-4111-8111-111111111111', 'מרוץ ' || substr(md5(random()::text), 1, 6), 'custom')" \
  "agent_limit_reached" \
  "select count(*) from public.agents where user_id = 'c1111111-1111-4111-8111-111111111111'" \
  "1"
race "two parallel drafts of a cap-1 agent → one row, the other agent_daily_cap_reached" \
  "update public.agents set permissions = '{\"max_outbound_per_day\": 1}' where user_id = 'c1111111-1111-4111-8111-111111111111';" \
  "insert into public.pending_actions (user_id, kind, agent_key, agent_name) select user_id, 'send_mail', 'custom:' || id::text, name from public.agents where user_id = 'c1111111-1111-4111-8111-111111111111'" \
  "agent_daily_cap_reached" \
  "select count(*) from public.pending_actions where user_id = 'c1111111-1111-4111-8111-111111111111'" \
  "1"

# ai_spend_reserve (0010): two calls reserve at once, room for one → the second waits for the first, then is refused
reserve_a="$(mktemp)"
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; select public.ai_spend_reserve('2030-01-01', 0.6, 1); select pg_sleep(2); commit;" >"$reserve_a" 2>&1 &
pid_reserve=$!
sleep 0.7
out_reserve="$("${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "select public.ai_spend_reserve('2030-01-01', 0.6, 1)")"
wait "$pid_reserve" || { cat "$reserve_a"; echo "✖ race: ai_spend_reserve — the first reservation failed"; exit 1; }
grep -qx "0.600000" "$reserve_a" || { cat "$reserve_a"; echo "✖ race: ai_spend_reserve — the first reservation was not 0.6"; exit 1; }
rm -f "$reserve_a"
[[ "$out_reserve" == "-1" ]] || { echo "$out_reserve"; echo "✖ race: ai_spend_reserve — the second reservation passed ($out_reserve)"; exit 1; }
total_reserve="$("${PSQL_CMD[@]}" -X -q -t -A -d "$DB_NAME" -c "select cost_usd from public.ai_spend where day = '2030-01-01'")"
[[ "$total_reserve" == "0.600000" ]] || { echo "✖ race: ai_spend_reserve — expected 0.600000, got $total_reserve"; exit 1; }
echo "ok - race: two parallel reservations with room for one → one passes, the other -1"

# referral_reward (0018): two redirects of the friend's first payment at once → one reward (the referral row lock),
# the second waits for the first, then sees it rewarded; each next charge moved exactly 30 days, not 60
run -d "$DB_NAME" -c "
  insert into public.users (id, email) values ('c2222222-2222-4222-8222-222222222201', 'race-ref-a@example.com'), ('c2222222-2222-4222-8222-222222222202', 'race-ref-b@example.com');
  insert into public.subscriptions (user_id, plan, status, next_charge_at) values
    ('c2222222-2222-4222-8222-222222222201', 'basic', 'active', '2031-01-10 08:00:00+00'),
    ('c2222222-2222-4222-8222-222222222202', 'basic', 'active', '2031-01-20 08:00:00+00');
  insert into public.referral_codes (user_id, code) values ('c2222222-2222-4222-8222-222222222201', 'RACEABC');
  insert into public.referrals (referrer_id, referred_user_id, code) values ('c2222222-2222-4222-8222-222222222201', 'c2222222-2222-4222-8222-222222222202', 'RACEABC');"
reward_a="$(mktemp)"
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; select public.referral_reward('c2222222-2222-4222-8222-222222222202', null, 30, 12) ->> 'result'; select pg_sleep(2); commit;" >"$reward_a" 2>&1 &
pid_reward=$!
sleep 0.7
out_reward="$("${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "select public.referral_reward('c2222222-2222-4222-8222-222222222202', null, 30, 12) ->> 'result'")"
wait "$pid_reward" || { cat "$reward_a"; echo "✖ race: referral_reward — the first call failed"; exit 1; }
grep -qx "rewarded" "$reward_a" || { cat "$reward_a"; echo "✖ race: referral_reward — the first call did not reward"; exit 1; }
rm -f "$reward_a"
[[ "$out_reward" == "none" ]] || { echo "$out_reward"; echo "✖ race: referral_reward — the second call rewarded again ($out_reward)"; exit 1; }
pushed="$("${PSQL_CMD[@]}" -X -q -t -A -d "$DB_NAME" -c "select string_agg(to_char(next_charge_at at time zone 'UTC', 'YYYY-MM-DD'), ',' order by user_id) from public.subscriptions where user_id in ('c2222222-2222-4222-8222-222222222201', 'c2222222-2222-4222-8222-222222222202')")"
[[ "$pushed" == "2031-02-09,2031-02-19" ]] || { echo "✖ race: referral_reward — expected 2031-02-09,2031-02-19, got $pushed"; exit 1; }
echo "ok - race: two parallel rewards of one friend → one reward, 30 days each"

# otp_check (0020): two wrong guesses at once → both counted (the row lock), not one
run -d "$DB_NAME" -c "
  delete from public.auth_otps where email = 'race-otp@example.com';
  select public.otp_issue('race-otp@example.com', 'race-otp@example.com', 'ip', 'chal', 'right', now() + interval '10 minutes', 60, 5, 10, null);"
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; select public.otp_check('race-otp@example.com', 'chal', 'wrong', 5); select pg_sleep(2); commit;" >/dev/null 2>&1 &
pid_otp=$!
sleep 0.7
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "select public.otp_check('race-otp@example.com', 'chal', 'wrong', 5)" >/dev/null
wait "$pid_otp" || { echo "✖ race: otp_check — the first guess failed"; exit 1; }
otp_attempts="$("${PSQL_CMD[@]}" -X -q -t -A -d "$DB_NAME" -c "select attempts from public.auth_otps where email = 'race-otp@example.com'")"
[[ "$otp_attempts" == "2" ]] || { echo "✖ race: otp_check — expected 2 attempts, got $otp_attempts"; exit 1; }
echo "ok - race: two parallel wrong guesses → 2 attempts"

# otp_issue (0020): two sends at once for one mailbox → one code, the other cooldown (the advisory lock)
issue_a="$(mktemp)"
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; select public.otp_issue('race-send@example.com', 'race-send@example.com', 'ip', 'c1', 'h1', now() + interval '10 minutes', 60, 5, 10, null) ->> 'status'; select pg_sleep(2); commit;" >"$issue_a" 2>&1 &
pid_issue=$!
sleep 0.7
out_issue="$("${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "select public.otp_issue('race-send@example.com', 'race-send@example.com', 'ip', 'c2', 'h2', now() + interval '10 minutes', 60, 5, 10, null) ->> 'status'")"
wait "$pid_issue" || { cat "$issue_a"; echo "✖ race: otp_issue — the first send failed"; exit 1; }
grep -qx "ok" "$issue_a" || { cat "$issue_a"; echo "✖ race: otp_issue — the first send was not ok"; exit 1; }
rm -f "$issue_a"
[[ "$out_issue" == "cooldown" ]] || { echo "✖ race: otp_issue — the second send got $out_issue"; exit 1; }
echo "ok - race: two parallel sends → one code, the other cooldown"

# link_token_consume (0020): one token from two phones at once → one phone linked
run -d "$DB_NAME" -c "
  insert into public.users (id, email) values ('c3333333-3333-4333-8333-333333333301', 'race-link@example.com');
  insert into public.link_tokens (user_id, token_hash, expires_at) values ('c3333333-3333-4333-8333-333333333301', repeat('L', 43), now() + interval '15 minutes');"
link_a="$(mktemp)"
"${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "begin; select public.link_token_consume(repeat('L', 43), '+972507770001', null, null) ->> 'result'; select pg_sleep(2); commit;" >"$link_a" 2>&1 &
pid_link=$!
sleep 0.7
out_link="$("${PSQL_CMD[@]}" -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "select public.link_token_consume(repeat('L', 43), '+972507770002', null, null) ->> 'result'")"
wait "$pid_link" || { cat "$link_a"; echo "✖ race: link_token_consume — the first call failed"; exit 1; }
grep -qx "linked" "$link_a" || { cat "$link_a"; echo "✖ race: link_token_consume — the first call did not link"; exit 1; }
rm -f "$link_a"
[[ "$out_link" == "expired" ]] || { echo "✖ race: link_token_consume — the second phone got $out_link"; exit 1; }
linked="$("${PSQL_CMD[@]}" -X -q -t -A -d "$DB_NAME" -c "select count(*) from public.wa_identities where user_id = 'c3333333-3333-4333-8333-333333333301' and status <> 'unlinked'")"
[[ "$linked" == "1" ]] || { echo "✖ race: link_token_consume — $linked phones linked"; exit 1; }
echo "ok - race: one link token from two phones at once → one phone"

echo "SUPABASE LOCAL: ALL TESTS PASSED"
