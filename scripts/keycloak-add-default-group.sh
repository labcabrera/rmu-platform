#!/usr/bin/env bash
# Add the rmu-user group to the users that already exist in the local rmu realm (workspace spec 021, decision 4).
# New users get it as a Keycloak default group; this covers the ones created before.
#
# Usage: scripts/keycloak-add-default-group.sh [username-to-skip ...]      DRY_RUN=1 to only list the users
#
# kcadm runs inside the rmu-keycloak container. The master admin credentials come from KC_BOOTSTRAP_ADMIN_USERNAME and
# KC_BOOTSTRAP_ADMIN_PASSWORD (environment first, then .env, the same values compose gives Keycloak). Pass the guest
# username to skip it: it is meant to stay read only, without groups.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KC_CONTAINER="${KC_CONTAINER:-rmu-keycloak}"
REALM="${REALM:-rmu}"
GROUP="${GROUP:-rmu-user}"

env_value() {
  grep -E "^$1=" "${ROOT_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2-
}

ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-$(env_value KC_BOOTSTRAP_ADMIN_USERNAME)}"
ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:-$(env_value KC_BOOTSTRAP_ADMIN_PASSWORD)}"
test -n "${ADMIN_USER}" -a -n "${ADMIN_PASSWORD}" || { echo "Set KC_BOOTSTRAP_ADMIN_USERNAME and KC_BOOTSTRAP_ADMIN_PASSWORD" >&2; exit 1; }

kcadm() {
  docker exec "${KC_CONTAINER}" /opt/keycloak/bin/kcadm.sh "$@"
}

# The password goes through the container environment, not the command line.
docker exec -e KC_PW="${ADMIN_PASSWORD}" "${KC_CONTAINER}" sh -c \
  '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/sso --realm master --user "$0" --password "$KC_PW" >/dev/null' \
  "${ADMIN_USER}"

group_id="$(kcadm get groups -r "${REALM}" -q search="${GROUP}" --fields id,name --format csv --noquotes | awk -F, -v g="${GROUP}" '$2 == g { print $1 }')"
test -n "${group_id}" || { echo "Group ${GROUP} not found: run make keycloak-init first" >&2; exit 1; }

skip=" $* "
added=0
while IFS=, read -r user_id username; do
  [[ -z "${user_id}" ]] && continue
  [[ "${skip}" == *" ${username} "* ]] && { echo "skip ${username}"; continue; }
  groups="$(kcadm get "users/${user_id}/groups" -r "${REALM}" --fields name --format csv --noquotes)"
  if grep -qx "${GROUP}" <<<"${groups}"; then continue; fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "would add ${username}"
  else
    kcadm update "users/${user_id}/groups/${group_id}" -r "${REALM}" -s realm="${REALM}" -s userId="${user_id}" -s groupId="${group_id}" -n
    echo "added ${username}"
  fi
  added=$((added + 1))
done < <(kcadm get users -r "${REALM}" --fields id,username --format csv --noquotes --limit 1000)

echo "${added} user(s) $([[ "${DRY_RUN:-0}" == "1" ]] && echo "to update" || echo "updated")"
