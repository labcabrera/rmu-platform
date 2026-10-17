#!/usr/bin/env bash
# Dump every database of the local MongoDB into a gzip archive under backups/.
#
# Usage: scripts/mongo-backup.sh [output-file]
#
# mongodump runs inside the rmu-mongo container, so no local Mongo tools are needed.
# Credentials come from MONGO_USER / MONGO_PASSWORD (environment first, then .env).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

env_value() {
  grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2-
}

MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

output="${1:-${BACKUP_DIR}/mongo-$(date +%F-%H%M%S).archive.gz}"
mkdir -p "$(dirname "${output}")"

echo "Dumping ${MONGO_CONTAINER} into ${output}"
trap 'rm -f "${output}"' ERR
docker exec "${MONGO_CONTAINER}" mongodump \
  --username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin \
  --archive --gzip --quiet > "${output}"
echo "Done ($(du -h "${output}" | cut -f1))"
