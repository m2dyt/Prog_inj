#!/usr/bin/env bash
set -Eeuo pipefail
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DB_PASSWORD
\getenv admin_password ADMIN_DB_PASSWORD
\i /opt/supermarket/init.sql
SQL
