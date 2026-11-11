# Sourced by prod-backup.sh and prod-restore.sh (workspace spec 103, D12): settings and restic in a container.
#
# Settings: the environment first, then ENV_FILE (default .env). Containers can be overridden for tests:
# MONGO_CONTAINER, POSTGRES_CONTAINER, S3_CONTAINER and KEYCLOAK_CONTAINER (`none` skips stopping Keycloak).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
MONGO_CONTAINER="${MONGO_CONTAINER:-rmu-mongo}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-rmu-postgres}"
S3_CONTAINER="${S3_CONTAINER:-rmu-s3}"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-rmu-keycloak}"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.18.1}"

env_value() {
  grep -E "^$1=" "${ENV_FILE:-${ROOT_DIR}/.env}" 2>/dev/null | tail -n1 | cut -d= -f2-
}
setting() {
  local value="${!1:-$(env_value "$1")}"
  [ -n "${value}" ] || { echo "$1 is not set (environment or ${ENV_FILE:-.env})" >&2; exit 1; }
  printf '%s' "${value}"
}

POSTGRES_USER="$(setting POSTGRES_USER)"
POSTGRES_DB="$(setting POSTGRES_DB_KEYCLOAK)"

# The named volume behind /data of the S3 container (its Compose project prefix differs between hosts).
s3_volume() {
  docker inspect "${S3_CONTAINER}" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}'
}

# restic with the repository of RMU_BACKUP_*. Secrets go to the container as environment variables, never as
# arguments. A repository that is a local path (tests) is mounted at the same path.
run_restic() {
  local repository password
  repository="$(setting RMU_BACKUP_RESTIC_REPOSITORY)"
  password="$(setting RMU_BACKUP_RESTIC_PASSWORD)"
  local args=(--rm -i --hostname rmu -v rmu-restic-cache:/root/.cache/restic)
  case "${repository}" in
    /*) args+=(-v "${repository}:${repository}") ;;
    *)
      export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
      AWS_ACCESS_KEY_ID="$(setting RMU_BACKUP_S3_ACCESS_KEY_ID)"
      AWS_SECRET_ACCESS_KEY="$(setting RMU_BACKUP_S3_SECRET_ACCESS_KEY)"
      args+=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto)
      ;;
  esac
  RESTIC_REPOSITORY="${repository}" RESTIC_PASSWORD="${password}" \
    docker run "${args[@]}" -e RESTIC_REPOSITORY -e RESTIC_PASSWORD "${RESTIC_EXTRA_ARGS[@]}" "${RESTIC_IMAGE}" "$@"
}
RESTIC_EXTRA_ARGS=()
