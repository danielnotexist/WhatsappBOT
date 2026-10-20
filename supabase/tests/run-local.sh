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

echo "SUPABASE LOCAL: ALL TESTS PASSED"
