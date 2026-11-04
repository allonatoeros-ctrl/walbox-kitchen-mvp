#!/usr/bin/env bash
# Ricrea un DB Postgres LOCALE, applica lo shim Supabase e tutte le migration in ordine.
# Uso: PGHOST=/tmp PGPORT=54329 tests/db/apply-migrations.sh [nome_db]
# Mai puntare a un database remoto: lo script rifiuta host diversi da socket locale/127.0.0.1/localhost.
set -euo pipefail
DB="${1:-walbox_fc_test}"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null
psql -qX -d postgres -c "CREATE DATABASE $DB" >/dev/null
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/tests/db/supabase-shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  # pg_net / pg_cron non esistono su Postgres nativo: lo shim li sostituisce con stub.
  sed -E 's/^\s*CREATE EXTENSION IF NOT EXISTS (pg_net|pg_cron)[^;]*;//I' "$f" \
    | psql -qX -v ON_ERROR_STOP=1 -d "$DB" --single-transaction -f - >/dev/null 2>"/tmp/fc_mig_err.txt" \
    || { echo "FAIL $(basename "$f")"; cat /tmp/fc_mig_err.txt; exit 1; }
done
echo "OK $DB: $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migration applicate"
