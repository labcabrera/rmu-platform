#!/usr/bin/env bash
# Nightly backup of production (workspace spec 103, D12): Mongo, the Keycloak Postgres and the S3 volume of the
# images users upload, encrypted by restic into Cloudflare R2 (RMU_BACKUP_*), kept 7 daily, 4 weekly, 6 monthly.
#
# Usage: ENV_FILE=.env.production scripts/prod-backup.sh          (make prod-backup-nightly; cron, see production.adoc)
#        scripts/prod-backup.sh --init                            creates the restic repository once
#
# Writes backups/metrics/rmu_backup.prom, read by the monitoring agent: the alert "backup older than 26 h" fires
# when a night fails or does not run.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

if [ "${1:-}" = "--init" ]; then
  run_restic init
  exit 0
fi

work="${BACKUP_DIR}/nightly"
metrics_dir="${BACKUP_DIR}/metrics"
mkdir -p "${work}" "${metrics_dir}"
started="$(date +%s)"

write_metrics() {
  local status="$1" tmp="${metrics_dir}/.rmu_backup.prom"
  local last_success
  last_success="$(grep -s '^rmu_backup_last_success_timestamp_seconds ' "${metrics_dir}/rmu_backup.prom" | cut -d' ' -f2 || true)"
  [ "${status}" = 1 ] && last_success="$(date +%s)"
  {
    echo "# HELP rmu_backup_last_run_timestamp_seconds End of the last nightly backup, failed or not."
    echo "# TYPE rmu_backup_last_run_timestamp_seconds gauge"
    echo "rmu_backup_last_run_timestamp_seconds $(date +%s)"
    echo "# HELP rmu_backup_last_success_timestamp_seconds End of the last nightly backup that succeeded."
    echo "# TYPE rmu_backup_last_success_timestamp_seconds gauge"
    echo "rmu_backup_last_success_timestamp_seconds ${last_success:-0}"
    echo "# HELP rmu_backup_last_status 1 if the last nightly backup succeeded, 0 otherwise."
    echo "# TYPE rmu_backup_last_status gauge"
    echo "rmu_backup_last_status ${status}"
    echo "# HELP rmu_backup_size_bytes Size of the dumps of the last run."
    echo "# TYPE rmu_backup_size_bytes gauge"
    echo "rmu_backup_size_bytes $(du -sb "${work}" | cut -f1)"
    echo "# HELP rmu_backup_duration_seconds Duration of the last run."
    echo "# TYPE rmu_backup_duration_seconds gauge"
    echo "rmu_backup_duration_seconds $(($(date +%s) - started))"
  } > "${tmp}"
  mv "${tmp}" "${metrics_dir}/rmu_backup.prom"
}
trap 'write_metrics 0; [ "$(docker inspect -f "{{.State.Paused}}" "${S3_CONTAINER}" 2>/dev/null)" = true ] && docker unpause "${S3_CONTAINER}" >/dev/null; echo "Backup FAILED" >&2' ERR

echo "== $(date -Is) dumps into ${work}"
"${ROOT_DIR}/scripts/mongo-backup.sh" "${work}/mongo.archive.gz"

echo "Dumping ${POSTGRES_CONTAINER} (${POSTGRES_DB})"
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${work}/postgres.dump"

volume="$(s3_volume)"
[ -n "${volume}" ] || { echo "No /data volume in ${S3_CONTAINER}" >&2; false; }
echo "Archiving ${volume} (${S3_CONTAINER} paused meanwhile)"
docker pause "${S3_CONTAINER}" >/dev/null
docker run --rm -v "${volume}:/data:ro" alpine:3.22 tar -czf - -C /data . > "${work}/s3-data.tar.gz"
docker unpause "${S3_CONTAINER}" >/dev/null

echo "== restic backup"
RESTIC_EXTRA_ARGS=(-v "${work}:/backup/rmu:ro")
run_restic backup /backup/rmu --tag nightly --host rmu
run_restic forget --tag nightly --host rmu --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
RESTIC_EXTRA_ARGS=()

write_metrics 1
echo "== $(date -Is) done in $(($(date +%s) - started)) s"
