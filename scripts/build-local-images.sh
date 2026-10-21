#!/usr/bin/env bash
# Build the docker images of the checked-out APIs and MFEs from source, tag them `local`, and start
# the compose stack using those images.
#
# Usage: scripts/build-local-images.sh [options] [project...]
#
#   project       rmu-* folder names (e.g. rmu-api-tactical rmu-mfe-tactical). Default: every
#                 rmu-api-* and rmu-mfe-* checkout with a Dockerfile in the workspace.
#   --tag TAG     image tag (default: local)
#   --no-cache    build without the docker layer cache
#   --no-up       only build the images, do not start the stack
#
# The workspace is $RMU_WORKSPACE_DIR, or the parent folder of this repository. MFE images take
# the shared lib from <workspace>/rmu-react-shared-lib as a BuildKit named context, like
# `make docker-build` in each MFE. When starting the stack, RMU_<PROJECT>_VERSION is set to the
# tag for every built project, overriding .env; the other services use the versions in .env.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${RMU_WORKSPACE_DIR:-$(dirname "${ROOT_DIR}")}"
SHARED_LIB_DIR="${BASE_DIR}/rmu-react-shared-lib"

TAG=local
NO_CACHE=()
UP=1
PROJECTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift 2 ;;
    --no-cache) NO_CACHE=(--no-cache); shift ;;
    --no-up) UP=0; shift ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) PROJECTS+=("${1%/}"); shift ;;
  esac
done

if [[ ${#PROJECTS[@]} -eq 0 ]]; then
  for dir in "${BASE_DIR}"/rmu-api-* "${BASE_DIR}"/rmu-mfe-*; do
    [[ -f "${dir}/Dockerfile" ]] && PROJECTS+=("$(basename "${dir}")")
  done
fi

if [[ ${#PROJECTS[@]} -eq 0 ]]; then
  echo "No rmu-api-* or rmu-mfe-* checkouts with a Dockerfile in ${BASE_DIR}" >&2
  exit 1
fi

# rmu-api-attack-tables -> RMU_API_ATTACK_TABLES_VERSION (the names used in compose/*.yaml)
version_var() {
  local name="${1^^}"
  echo "${name//-/_}_VERSION"
}

build() {
  local project="$1" dir="${BASE_DIR}/$1" image="labcabrera/$1:${TAG}"
  if [[ ! -f "${dir}/Dockerfile" ]]; then
    echo "Missing ${dir}/Dockerfile" >&2
    return 1
  fi
  echo "==> ${image}"
  if [[ "${project}" == rmu-mfe-* && "${project}" != rmu-mfe-assets ]]; then
    if [[ ! -f "${SHARED_LIB_DIR}/package.json" ]]; then
      echo "Missing ${SHARED_LIB_DIR}, needed by ${project}" >&2
      return 1
    fi
    docker build "${NO_CACHE[@]}" --build-context shared-lib="${SHARED_LIB_DIR}" -t "${image}" "${dir}"
  else
    docker build "${NO_CACHE[@]}" -t "${image}" "${dir}"
  fi
}

BUILT=()
FAILED=()
for project in "${PROJECTS[@]}"; do
  if build "${project}"; then
    BUILT+=("${project}")
  else
    FAILED+=("${project}")
  fi
done

echo
echo "Built (${TAG}): ${BUILT[*]:-none}"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed: ${FAILED[*]}" >&2
  echo "Not starting the stack." >&2
  exit 1
fi

[[ ${UP} -eq 1 ]] || exit 0

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Missing ${ROOT_DIR}/.env (copy .env.example)" >&2
  exit 1
fi

for project in "${BUILT[@]}"; do
  export "$(version_var "${project}")=${TAG}"
done

cd "${ROOT_DIR}"
# --remove-orphans also drops containers of services no longer defined (e.g. rmu-api-attack).
docker compose up -d --remove-orphans
docker compose ps
