#!/usr/bin/env bash
# Run, in file name order, the migrations of scripts/migrations/ that rmu-platform.migrations does not record yet.
#
# Usage: scripts/mongo-migrate-pending.sh             run every pending migration (stops at the first failure)
#        DRY_RUN=1 scripts/mongo-migrate-pending.sh   only list the pending migrations
#        scripts/mongo-migrate-pending.sh --baseline [file...]
#                                                     record migrations as applied without running them (all of
#                                                     scripts/migrations/ by default), for a database that already
#                                                     had them applied by hand
#
# Take a backup first (make mongo-backup). Some migrations need a step around them (a restart, a data import or
# recalculate-characters.sh): see docs/operations/migrations.adoc.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/scripts/migrations"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"

env_value() {
  grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2-
}

MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

mongo_eval() {
  docker exec "${MONGO_CONTAINER}" mongosh \
    --username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin --quiet --eval "$1"
}

if [ "${1:-}" = "--baseline" ]; then
  shift
  files=("$@")
  if [ ${#files[@]} -eq 0 ]; then
    for f in "${MIGRATIONS_DIR}"/*.js; do files+=("$(basename "${f}")"); done
  fi
  for name in "${files[@]}"; do
    name="$(basename "${name}")"
    test -f "${MIGRATIONS_DIR}/${name}" || { echo "Missing ${MIGRATIONS_DIR}/${name}" >&2; exit 1; }
    mongo_eval "db.getSiblingDB('rmu-platform').migrations.updateOne({ _id: '${name}' }, { \$setOnInsert: { appliedAt: new Date(), baseline: true } }, { upsert: true }).upsertedCount" \
      | grep -q '^1$' && echo "recorded ${name} (baseline)" || echo "already recorded ${name}"
  done
  exit 0
fi

applied="$(mongo_eval "db.getSiblingDB('rmu-platform').migrations.find({}, { _id: 1 }).toArray().map(m => m._id).join('\n')")"

pending=()
for f in "${MIGRATIONS_DIR}"/*.js; do
  name="$(basename "${f}")"
  grep -qxF "${name}" <<< "${applied}" || pending+=("${name}")
done

if [ ${#pending[@]} -eq 0 ]; then
  echo "No pending migrations"
  exit 0
fi

echo "Pending migrations (${#pending[@]}):"
printf '  %s\n' "${pending[@]}"
[ "${DRY_RUN:-}" = "1" ] && exit 0

for name in "${pending[@]}"; do
  "${ROOT_DIR}/scripts/mongo-migrate.sh" "${MIGRATIONS_DIR}/${name}"
done
