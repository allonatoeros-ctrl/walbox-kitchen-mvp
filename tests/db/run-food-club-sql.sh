#!/usr/bin/env bash
# Esegue i test SQL Food Club su un DB locale già migrato. Ogni file gira in una transazione e fa ROLLBACK.
set -euo pipefail
DB="${1:-walbox_fc_test}"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
DIR="$(cd "$(dirname "$0")" && pwd)/food-club"
psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/00_helpers.sql" >/dev/null
fail=0
for f in "$DIR"/[1-9]*.sql; do
  if out=$( { echo 'BEGIN;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d "$DB" 2>&1 ); then
    echo "$out" | grep -oE 'PASS [^"]*' | sed 's/^/  /'
    echo "OK   $(basename "$f")"
  else
    echo "$out" | grep -E 'PASS|ERROR|CONTEXT' | head -20 | sed 's/^/  /'
    echo "FAIL $(basename "$f")"; fail=1
  fi
done
exit $fail
