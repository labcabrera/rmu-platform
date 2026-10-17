#!/usr/bin/env bash
# Restore a gzip archive created by mongo-backup.sh into the local MongoDB.
#
# Usage: scripts/mongo-restore.sh [-y] <archive-file>
#
# Collections present in the archive are dropped before being restored (--drop); the
# admin database is skipped so the root user is kept. Asks for confirmation unless -y.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"

env_value() {
  grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2-
}

assume_yes=false
if [[ "${1:-}" == "-y" ]]; then
  assume_yes=true
  shift
fi

archive="${1:-}"
if [[ -z "${archive}" ]]; then
  echo "Usage: $0 [-y] <archive-file>" >&2
  exit 1
fi
if [[ ! -f "${archive}" ]]; then
  echo "Archive not found: ${archive}" >&2
  exit 1
fi

MONGO_USER="${MONGO_USER:-$(env_value MONGO_USER)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(env_value MONGO_PASSWORD)}"
: "${MONGO_USER:?MONGO_USER is not set (environment or .env)}"
: "${MONGO_PASSWORD:?MONGO_PASSWORD is not set (environment or .env)}"

if [[ "${assume_yes}" != true ]]; then
  read -r -p "Restore ${archive} into ${MONGO_CONTAINER}, dropping the collections it contains? [y/N] " answer
  [[ "${answer}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }
fi

docker exec -i "${MONGO_CONTAINER}" mongorestore \
  --username "${MONGO_USER}" --password "${MONGO_PASSWORD}" --authenticationDatabase admin \
  --archive --gzip --drop --nsExclude 'admin.*' < "${archive}"
