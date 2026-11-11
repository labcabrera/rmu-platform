#!/usr/bin/env bash
# Restore a nightly backup of production (workspace spec 103, D12) from the restic repository (RMU_BACKUP_*).
#
# Usage: ENV_FILE=.env.production scripts/prod-restore.sh [snapshot]        (make prod-backup-restore [id=<snapshot>])
#        ONLY="mongo postgres s3" to restore some parts; YES=1 skips the prompt; DOWNLOAD_ONLY=1 stops after the download.
#        scripts/prod-restore.sh --list                                    lists the snapshots
#
# The snapshot (default `latest`) is downloaded into backups/restore-<date>/, then:
#   mongo     scripts/mongo-restore.sh (drops and restores the collections of the archive);
#   postgres  Keycloak stopped, pg_restore --clean of its database, Keycloak started;
#   s3        rmu-s3 stopped, its volume emptied and extracted again, rmu-s3 started.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

if [ "${1:-}" = "--list" ]; then
  run_restic snapshots --tag nightly
  exit 0
fi

snapshot="${1:-latest}"
parts="${ONLY:-}"; parts="${parts:-mongo postgres s3}"
target="${BACKUP_DIR}/restore-$(date +%F-%H%M%S)"
mkdir -p "${target}"

echo "Downloading snapshot ${snapshot} into ${target}"
RESTIC_EXTRA_ARGS=(-v "${target}:/restore")
run_restic restore "${snapshot}" --tag nightly --target /restore
RESTIC_EXTRA_ARGS=()
# restic runs as root: give the download to the user running the script.
docker run --rm -v "${target}:/restore" alpine:3.22 chown -R "$(id -u):$(id -g)" /restore
files="${target}/backup/rmu"
ls -l "${files}"
[ "${DOWNLOAD_ONLY:-}" = "1" ] && exit 0

if [ "${YES:-}" != "1" ]; then
  read -r -p "Restore ${parts} over the running data (${MONGO_CONTAINER}, ${POSTGRES_CONTAINER}, ${S3_CONTAINER})? [y/N] " answer
  [ "${answer}" = "y" ] || { echo "Cancelled"; exit 1; }
fi

for part in ${parts}; do
  case "${part}" in
    mongo)
      "${ROOT_DIR}/scripts/mongo-restore.sh" -y "${files}/mongo.archive.gz"
      ;;
    postgres)
      [ "${KEYCLOAK_CONTAINER}" = none ] || docker stop "${KEYCLOAK_CONTAINER}" >/dev/null
      echo "Restoring ${POSTGRES_DB} into ${POSTGRES_CONTAINER}"
      docker exec -i "${POSTGRES_CONTAINER}" pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --clean --if-exists --no-owner --exit-on-error < "${files}/postgres.dump"
      [ "${KEYCLOAK_CONTAINER}" = none ] || docker start "${KEYCLOAK_CONTAINER}" >/dev/null
      ;;
    s3)
      volume="$(s3_volume)"
      [ -n "${volume}" ] || { echo "No /data volume in ${S3_CONTAINER}" >&2; exit 1; }
      docker stop "${S3_CONTAINER}" >/dev/null
      echo "Restoring ${volume}"
      docker run --rm -i -v "${volume}:/data" alpine:3.22 \
        sh -c 'find /data -mindepth 1 -delete && tar -xzf - -C /data' < "${files}/s3-data.tar.gz"
      docker start "${S3_CONTAINER}" >/dev/null
      ;;
    *) echo "Unknown part ${part}" >&2; exit 1 ;;
  esac
done
echo "Restored ${parts} from ${snapshot}. The download stays in ${target}: delete it when done."
