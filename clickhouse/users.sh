#!/bin/bash
# Runs once, when the ClickHouse data directory is first created (see
# docker-entrypoint-initdb.d). Creates the schema and a read-only user for the
# backend; the pipeline writes as the admin user configured in compose.
set -euo pipefail

admin=(clickhouse client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery)

"${admin[@]}" < /schema/schema.sql

"${admin[@]}" <<SQL
CREATE USER IF NOT EXISTS ${CLICKHOUSE_READER_USER}
  IDENTIFIED WITH sha256_password BY '${CLICKHOUSE_READER_PASSWORD}'
  SETTINGS readonly = 1, max_execution_time = 30;
GRANT SELECT ON tersect.* TO ${CLICKHOUSE_READER_USER};
SQL
