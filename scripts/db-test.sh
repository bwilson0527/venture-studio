#!/usr/bin/env bash
# Apply every migration to a throwaway database and run the SQL tests.
# Needs psql and a Postgres superuser URL, for example:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a Postgres superuser connection}"
cd "$(dirname "$0")/.."

db="studio_test_$$"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "create database $db"
trap 'psql "$DATABASE_URL" -q -c "drop database if exists $db with (force)" >/dev/null' EXIT

url="${DATABASE_URL%/*}/$db"
run() { psql "$url" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$1"; }

run supabase/tests/00_supabase_stand_ins.sql
for file in supabase/migrations/*.sql; do
  echo "migrate  $file"
  run "$file"
done
for file in supabase/tests/[1-9]*.sql; do
  echo "test     $file"
  run "$file"
done
echo "Database tests passed."
