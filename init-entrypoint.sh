#!/usr/bin/env bash
# set -euo pipefail

# DB_PATH="/data/db"
# LOG_FILE="${DB_PATH}/mongod.log"
# PID_FILE="/tmp/mongod.pid"

# # if [ -d "$DB_PATH" ] && [ "$(ls -A "$DB_PATH")" ]; then
# #   echo "[db_init] Database already exists at $DB_PATH, skipping initialization."
# #   exit 0
# # fi

# echo "[db_init] No database found, initializing..."
# mkdir -p "$DB_PATH"
# chown -R mongodb:mongodb "$DB_PATH"

# touch "$LOG_FILE"
# chown mongodb:mongodb "$LOG_FILE"

# echo "[db_init] Starting temporary mongod..."
# su -s /bin/sh -c "mongod --dbpath '$DB_PATH' \
#   --bind_ip_all \
#   --logpath '$LOG_FILE' \
#   --pidfilepath '$PID_FILE' \
#   --fork" mongodb

# # Wait for mongod
# for i in {1..60}; do
#   if mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok" >/dev/null 2>&1; then
#     echo "[db_init] MongoDB is ready."
#     break
#   fi
#   sleep 1
# done


# # Run seeding
# python /app/setup_new_tbrowser_dataset.py \
#   -f /app/gp_data_copy/SL2.50.fa \
#   -g /app/gp_data_copy/ITAG2.4_gene_models.sorted.gff3.gz \
#   -V /app/gp_data_copy/vcf_location/ \
#   -c /app/tbconfig.json

# bash /app/add_example_dataset.sh || true

# # Shutdown temp mongod
# mongosh --quiet --eval "db.adminCommand({ shutdown: 1 })" || true
# sleep 2

# echo "[db_init] Database initialization complete."


set -eu

DB_PATH="/data/db"
LOG_FILE="${DB_PATH}/mongod.log"
PID_FILE="/tmp/mongod.pid"

# echo "[db_init] Ensuring $DB_PATH exists and is writable..."
# mkdir -p "$DB_PATH"
# official mongo image uses 'mongodb' user
# chown -R mongodb:mongodb "$DB_PATH"

# If DB already initialized, skip seeding
# if [ -f "${DB_PATH}/WiredTiger" ] || [ -d "${DB_PATH}/journal" ]; then
#   echo "[db_init] Existing MongoDB data detected at $DB_PATH. Skipping initialization."
#   exit 0
# fi

# echo "[db_init] No database found, initializing..."

# Clean any stale locks
# rm -f "${DB_PATH}/mongod.lock" "${DB_PATH}/WiredTiger.lock" || true

# Prepare log file with proper ownership
# : > "$LOG_FILE"
# chown mongodb:mongodb "$LOG_FILE"

# echo "[db_init] Starting temporary mongod (foreground, backgrounded)..."
# su -s /bin/sh -c "
#   mongod --dbpath '$DB_PATH' \
#          --bind_ip 127.0.0.1 \
#          --logpath '$LOG_FILE' \
#          --pidfilepath '$PID_FILE' \
#          --storageEngine wiredTiger \
#          --nounixsocket \
#          >> '$LOG_FILE' 2>&1 & echo \$! > '$PID_FILE'
# " mongodb

# Wait for readiness (max ~90s)
# echo "[db_init] Waiting for MongoDB to accept connections..."
# i=0
# ready=0
# while [ $i -lt 90 ]; do
#   if mongosh --quiet --host 127.0.0.1 --eval "db.runCommand({ ping: 1 }).ok" >/dev/null 2>&1; then
#     ready=1
#     break
#   fi
#   i=$((i+1))
#   sleep 1
# done
# if [ "$ready" -ne 1 ]; then
#   echo "[db_init] ERROR: mongod did not become ready. Last 80 log lines:"
#   tail -n 80 "$LOG_FILE" || true
#   mongosh --quiet --host 127.0.0.1 --eval "db.adminCommand({ shutdown: 1 })" >/dev/null 2>&1 || true
#   exit 1
# fi
# echo "[db_init] MongoDB is ready."

which tabix

python /app/setup_new_tbrowser_dataset.py \
  -f /app/gp_data_copy/SL2.50.fa \
  -g /app/gp_data_copy/ITAG2.4_gene_models.sorted.gff3.gz \
  -V /app/gp_data_copy/vcf_location/ \
  -c /app/tbconfig.json

# sh /app/add_example_dataset.sh || true
# --------------------------------

echo "[db_init] Shutting down temporary mongod..."
mongo --quiet --host 127.0.0.1 --eval "db.adminCommand({ shutdown: 1 })" || true
sleep 2

echo "[db_init] Database initialization complete."
