#!/usr/bin/env bash
# Checks that the production stack publishes only the gateway (80, 443, 443/udp) on every interface and
# Keycloak on the loopback (workspace spec 103, D1). Docker bypasses ufw for published ports, so any other
# port would be open to the Internet.
#
# Usage: scripts/check-production-ports.sh [env file]   (default .env.production, else .env.production.example)
set -euo pipefail
cd "$(dirname "$0")/.."

env_file="${1:-.env.production}"
[ -f "$env_file" ] || env_file=.env.production.example

# The example has placeholders: give the required values something to interpolate.
config=$(RMU_ACME_EMAIL="${RMU_ACME_EMAIL:-check@example.com}" \
  docker compose --env-file "$env_file" -f compose.yaml -f compose/production.yaml config --format json)

failures=$(jq -r '
  .services | to_entries[] | .key as $service | (.value.ports // [])[] |
  select(
    ($service == "rmu-gateway" and ((.host_ip // "") == "" or .host_ip == "0.0.0.0") and
      ((.published | tostring) == "80" or (.published | tostring) == "443")) | not
  ) |
  select(($service == "rmu-keycloak" and .host_ip == "127.0.0.1") | not) |
  "\($service): \(.host_ip // "0.0.0.0"):\(.published) -> \(.target)/\(.protocol // "tcp")"
' <<<"$config")

echo "Services: $(jq -r '.services | keys | join(" ")' <<<"$config")"
echo "Published ports:"
jq -r '.services | to_entries[] | .key as $s | (.value.ports // [])[] | "  \($s): \(.host_ip // "0.0.0.0"):\(.published) -> \(.target)/\(.protocol // "tcp")"' <<<"$config"

if [ -n "$failures" ]; then
  echo "Not allowed in production:" >&2
  echo "$failures" | sed 's/^/  /' >&2
  exit 1
fi
echo "OK: only the gateway is public, Keycloak only on the loopback."
