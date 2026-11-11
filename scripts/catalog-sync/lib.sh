# Sourced by export.sh and import.sh (workspace spec 103, D10).
# Credentials and container as the other Mongo scripts: MONGO_CONTAINER, MONGO_USER, MONGO_PASSWORD, ENV_FILE.

SYNC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SYNC_DIR}/../.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"

env_value() {
  grep -E "^$1=" "${ENV_FILE:-${ROOT_DIR}/.env}" 2>/dev/null | tail -n1 | cut -d= -f2-
}

MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

auth=(--username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin)

# Runs common.js plus the given script, after the constants passed as NAME=<JSON value> arguments.
run_mongosh() {
  local script="$1"; shift
  local preamble="const COLLECTIONS = $(jq -c . "${SYNC_DIR}/collections.json");"
  for constant in "$@"; do preamble+=" const ${constant%%=*} = ${constant#*=};"; done
  docker exec "${MONGO_CONTAINER}" mongosh "${auth[@]}" --quiet --eval "${preamble} (() => {
$(cat "${SYNC_DIR}/common.js")
$(cat "${SYNC_DIR}/${script}")
})()"
}

drop_db() {
  docker exec "${MONGO_CONTAINER}" mongosh "${auth[@]}" --quiet --eval "db.getSiblingDB('$1').dropDatabase()" >/dev/null
}

json() { jq -cn --arg v "$1" '$v'; }
