#!/usr/bin/env bash
# Recalculate the characters queued in rmu-platform.pending-recalculations (migrations 078 and 079, workspace spec 077)
# with POST /v1/characters/:id/recalculate of rmu-api-strategic, which only an admin may call. A character that is
# recalculated, or no longer exists (404), leaves the queue; any other answer stops the script, leaving the rest queued.
#
# Usage: RMU_TOKEN=<admin access token> scripts/recalculate-characters.sh
#        DRY_RUN=1 scripts/recalculate-characters.sh    only list the queue
# RMU_API_STRATEGIC_URI defaults to the gateway (http://localhost/api/strategic/v1). The token is the access token of a
# user of the rmu-admin group (for example, copied from the browser session); it lasts 15 minutes, so a long queue may
# need a new one: run the script again, it resumes where it stopped.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"
API="${RMU_API_STRATEGIC_URI:-http://localhost/api/strategic/v1}"

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

ids="$(mongo_eval "db.getSiblingDB('rmu-platform').getCollection('pending-recalculations').find({}, { _id: 1 }).toArray().map(c => c._id).join('\n')")"
if [ -z "${ids}" ]; then
  echo "No characters to recalculate"
  exit 0
fi
echo "${ids}" | grep -c . | xargs echo "queued characters:"
if [ "${DRY_RUN:-}" = "1" ]; then
  echo "${ids}"
  exit 0
fi
: "${RMU_TOKEN:?RMU_TOKEN is not set: the access token of an admin}"

done_count=0
while read -r id; do
  [ -n "${id}" ] || continue
  status="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer ${RMU_TOKEN}" "${API}/characters/${id}/recalculate")"
  case "${status}" in
    200|404)
      mongo_eval "db.getSiblingDB('rmu-platform').getCollection('pending-recalculations').deleteOne({ _id: '${id}' })" > /dev/null
      echo "${status} ${id}"
      done_count=$((done_count + 1))
      ;;
    *)
      echo "Character ${id} answered ${status}: stopping (${done_count} done, the rest stay queued)" >&2
      exit 1
      ;;
  esac
done <<< "${ids}"
echo "${done_count} characters recalculated"
