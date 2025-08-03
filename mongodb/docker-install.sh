#!/bin/bash

MONGO_VERSION=8.0
ADMIN_USER=admin
ADMIN_PASS=admin
NAME="rmu-mongo"

docker stop ${NAME} 2>/dev/null || true
docker rm ${NAME} 2>/dev/null || true

docker run -d \
  --name ${NAME} \
  --network rmu-network \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=${ADMIN_USER} \
  -e MONGO_INITDB_ROOT_PASSWORD=${ADMIN_PASS} \
  mongo:${MONGO_VERSION}
