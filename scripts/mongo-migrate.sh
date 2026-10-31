#!/usr/bin/env bash
# Run a mongosh migration script (scripts/migrations/*.js) against the local MongoDB.
#
# Usage: scripts/mongo-migrate.sh <script.js>      DRY_RUN=1 to only report what would change
#
# mongosh runs inside the rmu-mongo container, so no local Mongo tools are needed.
# Credentials come from MONGO_USER / MONGO_PASSWORD (environment first, then .env).
#
# A script of scripts/migrations/ that runs without DRY_RUN and without errors is recorded in
# rmu-platform.migrations ({_id: <file name>, appliedAt}), which scripts/mongo-migrate-pending.sh reads.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"

env_value() {
  grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2-
}

script="${1:?Usage: scripts/mongo-migrate.sh <script.js>}"
test -f "${script}" || { echo "Missing ${script}" >&2; exit 1; }

MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

dry_run=false
[ "${DRY_RUN:-}" = "1" ] && dry_run=true

# Only the scripts of scripts/migrations/ are recorded; any other script just runs
record=""
if [ "${dry_run}" = false ] && [ "$(cd "$(dirname "${script}")" && pwd)" = "${ROOT_DIR}/scripts/migrations" ]; then
  name="$(basename "${script}")"
  record="; db.getSiblingDB('rmu-platform').migrations.updateOne({ _id: '${name}' }, { \$set: { appliedAt: new Date() } }, { upsert: true }); print('recorded ${name}');"
fi

echo "Running ${script} on ${MONGO_CONTAINER}$([ "${dry_run}" = true ] && echo ' (dry run)')"
docker exec "${MONGO_CONTAINER}" mongosh \
  --username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin --quiet \
  --eval "const DRY_RUN = ${dry_run}; (() => {
$(cat "${script}")
})()${record}"
