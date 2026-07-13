#!/usr/bin/env bash
# Creates the `linkedout_test` database (if absent) and applies all migrations to it.
# The integration suite boots the real API against this database and truncates it
# between tests, so it must never point at the dev database.
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-linkedout_test}"
DB_USER="${TEST_DB_USER:-linkedout}"
CONTAINER="${TEST_DB_CONTAINER:-linkedout-postgres}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://linkedout:linkedout@localhost:5432/${DB_NAME}?schema=public}"

# Only a plain SQL identifier may be interpolated into the psql commands below.
if ! [[ "${DB_NAME}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "TEST_DB_NAME '${DB_NAME}' is not a valid SQL identifier; refusing to interpolate it." >&2
  exit 1
fi

# TEST-01: bind the CREATE step (docker exec against DB_NAME) to the bootstrap/verify target
# (TEST_DATABASE_URL). The URL's database name MUST equal DB_NAME, else we could create one DB
# and mark a different same-cluster DB.
URL_DB_NAME="$(TEST_DATABASE_URL="${TEST_DATABASE_URL}" node -e "process.stdout.write((new URL(process.env.TEST_DATABASE_URL).pathname||'').replace(/^\/+/,''))")"
if [ "${URL_DB_NAME}" != "${DB_NAME}" ]; then
  echo "TEST_DATABASE_URL database '${URL_DB_NAME}' != TEST_DB_NAME '${DB_NAME}'." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "Postgres container '${CONTAINER}' is not running. Start it with: pnpm db:up" >&2
  exit 1
fi

CREATED=0
if ! docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  echo "Creating database ${DB_NAME}…"
  docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";"
  CREATED=1
fi

# The system_identifier of the cluster we just created the DB on, so bootstrap can prove it
# connected to the SAME cluster (not a same-named DB on a different localhost port).
CLUSTER_ID="$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tAc \
  "SELECT system_identifier FROM pg_control_system()" | tr -d '[:space:]')"

# TEST-01: only BOOTSTRAP (plant the marker) on a DB we just created, and only if it targets
# the exact name + cluster we created. An existing DB is NOT re-claimed here — the migrate
# wrapper below verifies its marker and fails closed if it is absent (recreate explicitly).
if [ "${CREATED}" = "1" ]; then
  TEST_DATABASE_URL="${TEST_DATABASE_URL}" TEST_DB_NAME="${DB_NAME}" TEST_DB_EXPECTED_CLUSTER="${CLUSTER_ID}" \
    node "$(dirname "$0")/bootstrap-test-db.cjs"
else
  echo "Database ${DB_NAME} already exists — skipping bootstrap; the migrate wrapper will verify its marker."
fi

# Verify the marker + migrate through the wrapper (forces one canonical datasource URL).
TEST_DATABASE_URL="${TEST_DATABASE_URL}" TEST_DB_NAME="${DB_NAME}" \
  node "$(dirname "$0")/migrate-test-db.cjs"
