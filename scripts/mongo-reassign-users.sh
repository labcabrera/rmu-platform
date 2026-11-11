#!/usr/bin/env bash
# Reassign every user reference of the rmu-* databases to one Keycloak user (workspace spec 103, D4).
#
# Usage: TARGET_SUB=<keycloak user id> TARGET_NAME=<RMU nick> scripts/mongo-reassign-users.sh
#        DRY_RUN=1 to only count; KEEP_SUBS="<sub> <sub>" for users that keep their data.
#
# Back up first (make mongo-backup / make prod-backup): the old users are deleted from rmu-users.
# Credentials and container as scripts/mongo-migrate.sh (MONGO_CONTAINER, MONGO_USER, MONGO_PASSWORD, ENV_FILE).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"

env_value() {
  grep -E "^$1=" "${ENV_FILE:-${ROOT_DIR}/.env}" 2>/dev/null | tail -n1 | cut -d= -f2-
}

: "${TARGET_SUB:?Set TARGET_SUB to the Keycloak id of the user that receives the data}"
: "${TARGET_NAME:?Set TARGET_NAME to the RMU nick of that user}"
MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

dry_run=false
[ "${DRY_RUN:-}" = "1" ] && dry_run=true

# JSON-encode the parameters so no value can break out of the script.
json() { jq -cn --arg v "$1" '$v'; }
keep="$(printf '%s\n' ${KEEP_SUBS:-} | jq -R . | jq -cs 'map(select(length > 0))')"

if [ "${dry_run}" = false ] && [ "${YES:-}" != "1" ]; then
  read -r -p "Reassign every user of ${MONGO_CONTAINER} to ${TARGET_NAME} (${TARGET_SUB})? [y/N] " answer
  [ "${answer}" = "y" ] || { echo "Cancelled"; exit 1; }
fi

echo "Reassigning users on ${MONGO_CONTAINER}$([ "${dry_run}" = true ] && echo ' (dry run)')"
docker exec "${MONGO_CONTAINER}" mongosh \
  --username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin --quiet \
  --eval "const DRY_RUN = ${dry_run}; const TARGET_SUB = $(json "${TARGET_SUB}"); const TARGET_NAME = $(json "${TARGET_NAME}"); const KEEP_SUBS = ${keep}; (() => {
$(cat "${ROOT_DIR}/scripts/reassign-users.js")
})()"
