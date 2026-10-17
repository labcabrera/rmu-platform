#!/usr/bin/env bash
# Start the micro-frontends from source (npm run start:live), one gnome-terminal tab each,
# plus the static assets server of rmu-mfe-assets.
#
# Usage: scripts/start-mfes-dev.sh [base-dir]
#
# base-dir is the folder holding the rmu-mfe-* checkouts. It defaults to $RMU_WORKSPACE_DIR,
# or to the parent folder of this repository. Missing checkouts are skipped.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${1:-${RMU_WORKSPACE_DIR:-$(dirname "${ROOT_DIR}")}}"

MFES=(rmu-mfe-shell rmu-mfe-core rmu-mfe-strategic rmu-mfe-tactical rmu-mfe-items rmu-mfe-npcs rmu-mfe-spells)

if ! command -v gnome-terminal >/dev/null 2>&1; then
  echo "gnome-terminal not found. Start each MFE by hand:" >&2
  for mfe in "${MFES[@]}"; do
    echo "  (cd ${BASE_DIR}/${mfe} && npm run start:live)" >&2
  done
  echo "  (cd ${BASE_DIR}/rmu-mfe-assets && python3 local-start.py)" >&2
  exit 1
fi

run_tab() {
  local dir="$1" cmd="$2"
  if [[ ! -d "${dir}" ]]; then
    echo "Skipping ${dir}: not checked out" >&2
    return
  fi
  echo "Starting $(basename "${dir}"): ${cmd}"
  gnome-terminal --tab --title="$(basename "${dir}")" -- bash -c "cd '${dir}' && ${cmd}; exec bash"
}

for mfe in "${MFES[@]}"; do
  run_tab "${BASE_DIR}/${mfe}" "npm run start:live"
done
run_tab "${BASE_DIR}/rmu-mfe-assets" "python3 local-start.py"
