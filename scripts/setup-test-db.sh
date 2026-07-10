#!/usr/bin/env bash
# Creates the `linkedout_test` database (if absent) and applies all migrations to it.
# The integration suite boots the real API against this database and truncates it
# between tests, so it must never point at the dev database.
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-linkedout_test}"
DB_USER="${TEST_DB_USER:-linkedout}"
CONTAINER="${TEST_DB_CONTAINER:-linkedout-postgres}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://linkedout:linkedout@localhost:5432/${DB_NAME}?schema=public}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "Postgres container '${CONTAINER}' is not running. Start it with: pnpm db:up" >&2
  exit 1
fi

if ! docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  echo "Creating database ${DB_NAME}…"
  docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};"
fi

DATABASE_URL="${TEST_DATABASE_URL}" DIRECT_URL="${TEST_DATABASE_URL}" \
  pnpm --filter @linkedout/db exec prisma migrate deploy
