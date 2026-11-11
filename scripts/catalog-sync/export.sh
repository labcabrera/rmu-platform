#!/usr/bin/env bash
# Export the catalog of the local Mongo into backups/catalog-<date>-<hash>.archive.gz (workspace spec 103, D10).
#
# Usage: scripts/catalog-sync/export.sh            (make catalog-export)
#
# What is exported is decided by scripts/catalog-sync/collections.json. The package holds book data: it stays
# out of git (backups/ is gitignored) and is copied to the server with scp, then imported with import.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
mkdir -p "${BACKUP_DIR}"
commit="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
tmp="${BACKUP_DIR}/catalog-export.tmp"
trap 'rm -f "${tmp}"; drop_db rmu-catalog-export' EXIT

echo "Exporting the catalog of ${MONGO_CONTAINER}"
run_mongosh export.js "PLATFORM_COMMIT=$(json "${commit}")"
docker exec "${MONGO_CONTAINER}" mongodump "${auth[@]}" --db rmu-catalog-export --archive --gzip --quiet > "${tmp}"

hash="$(sha256sum "${tmp}" | cut -c1-8)"
output="${BACKUP_DIR}/catalog-$(date +%F-%H%M%S)-${hash}.archive.gz"
mv "${tmp}" "${output}"
echo "Package: ${output} ($(du -h "${output}" | cut -f1))"
