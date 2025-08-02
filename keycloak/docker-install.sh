#!/bin/bash

KEYCLOAK_VERSION=26.3
ADMIN_USER=admin
ADMIN_PASS=admin
REALM=rmu-local
CLIENT_ID=rmu-client
REDIRECT_URI=http://localhost:8080/*
WEB_ORIGIN=http://localhost:8080

# docker run -d --name rmu-keycloak --network rmu-network -p 8090:8080 \
#   -e KEYCLOAK_ADMIN=admin \
#   -e KEYCLOAK_ADMIN_PASSWORD=admin \
#   quay.io/keycloak/keycloak:$KEYCLOAK_VERSION \
#   start-dev

# TODO wait for Keycloak to be ready before running the next commands

# --- 2) Autenticarse en kcadm (CLI dentro del contenedor) ---
# docker exec rmu-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
#   --server http://localhost:8080 \
#   --realm master \
#   --user "$ADMIN_USER" \
#   --password "$ADMIN_PASS"

# # --- 3) Crear el realm ---
# docker exec rmu-keycloak /opt/keycloak/bin/kcadm.sh create realms \
#   -s realm="$REALM" \
#   -s enabled=true

# # --- 4) Crear un cliente (público) ---
# docker exec rmu-keycloak /opt/keycloak/bin/kcadm.sh create clients -r "$REALM" \
#   -s clientId="$CLIENT_ID" \
#   -s protocol=openid-connect \
#   -s publicClient=true \
#   -s 'redirectUris=["'"$REDIRECT_URI"'"]' \
#   -s 'webOrigins=["'"$WEB_ORIGIN"'"]'