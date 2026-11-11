#!/usr/bin/env bash
# Import a catalog package from export.sh without touching user data (workspace spec 103, D10).
#
# Usage: CATALOG_OWNER_SUB=<admin keycloak id> scripts/catalog-sync/import.sh <package>   (make prod-catalog-import f=)
#        DRY_RUN=1 only reports; PRUNE=1 also deletes the system documents missing from the package; YES=1 skips the prompt.
#
# 1. Restores the package into rmu-catalog-staging and shows what would change (the migrations of both sides must match).
# 2. Asks, backs up Mongo (scripts/mongo-backup.sh) and merges (merge.js), recording it in rmu-platform.catalog-syncs.
# 3. Drops rmu-catalog-staging.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

package="${1:?Usage: scripts/catalog-sync/import.sh <catalog-...archive.gz>}"
test -f "${package}" || { echo "Missing ${package}" >&2; exit 1; }
: "${CATALOG_OWNER_SUB:?Set CATALOG_OWNER_SUB to the Keycloak id of the admin that owns the catalog}"
prune=false
[ "${PRUNE:-}" = "1" ] && prune=true

trap 'drop_db rmu-catalog-staging' EXIT
drop_db rmu-catalog-staging
echo "Restoring $(basename "${package}") into rmu-catalog-staging"
docker exec -i "${MONGO_CONTAINER}" mongorestore "${auth[@]}" --archive --gzip --quiet \
  --nsFrom 'rmu-catalog-export.*' --nsTo 'rmu-catalog-staging.*' < "${package}"

merge() {
  run_mongosh merge.js "DRY_RUN=$1" "PRUNE=${prune}" "CATALOG_OWNER_SUB=$(json "${CATALOG_OWNER_SUB}")" \
    "PACKAGE=$(json "$(basename "${package}")")"
}

merge true
[ "${DRY_RUN:-}" = "1" ] && exit 0

if [ "${YES:-}" != "1" ]; then
  read -r -p "Import it into ${MONGO_CONTAINER}$([ "${prune}" = true ] && echo ', deleting the orphans')? [y/N] " answer
  [ "${answer}" = "y" ] || { echo "Cancelled"; exit 1; }
fi
# The backup also holds rmu-catalog-staging; restoring it brings that database back, and the next import drops it.
"${ROOT_DIR}/scripts/mongo-backup.sh"
merge false
