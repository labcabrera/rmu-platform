#!/bin/bash

backup_date=$(date +%F)

mongodump --uri="mongodb://admin:admin@localhost:27017/?authSource=admin" --archive="dump.archive-${backup_date}" --gzip
