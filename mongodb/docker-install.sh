#!/bin/bash

MONGO_VERSION=8.0
ADMIN_USER=admin
ADMIN_PASS=admin

docker run -d \
  --name mongo-local \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=${ADMIN_USER} \
  -e MONGO_INITDB_ROOT_PASSWORD=${ADMIN_PASS} \
  mongo:${MONGO_VERSION}
