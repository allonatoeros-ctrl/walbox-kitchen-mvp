#!/usr/bin/env bash
# Test di comportamento SQL sui pagamenti Kitchen (ordini SENZA buono) su un DB Postgres LOCALE già migrato
# (tests/db/apply-migrations.sh). Ogni scenario p*.sql (P1-P6 e P8) gira in BEGIN ... ROLLBACK in una sessione psql propria,
# così un [DIFETTO] che fallisce non nasconde gli altri. Poi, se KP_SKIP_CONCURRENCY non è 1, lancia p7 su un DB
# clonato (template) perché la concorrenza deve committare, e infine p8b (concorrenza chiusure K6, clone <db>_p8b).
# Uso: PGHOST=/percorso/socket PGPORT=54329 tests/db/kitchen-payments/run-kitchen-payments-sql.sh [nome_db]
# Mai remoto: rifiuta PGHOST diverso da socket locale/127.0.0.1/localhost, PGHOSTADDR/PGSERVICE impostati
# e un nome DB che non sia un identificatore semplice (psql -d accetta anche URL/conninfo verso altri host).
set -uo pipefail
DB="${1:-walbox_kp_test}"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
[ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}" ] || { echo "rifiuto: PGHOSTADDR/PGSERVICE impostati" >&2; exit 2; }
case "$DB" in ''|*[!A-Za-z0-9_]*) echo "rifiuto: nome DB non semplice ($DB)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
HERE="$(cd "$(dirname "$0")" && pwd)"
PGOPTIONS="-c client_min_messages=warning" psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/00_fc_test_base.sql" >/dev/null || exit 1
PGOPTIONS="-c client_min_messages=warning" psql -qX -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/00_kp_helpers.sql" >/dev/null || exit 1
pass=0; fail=0; difetti=0
for f in "$HERE"/p[1-6]*.sql "$HERE"/p8*.sql; do
  name="$(basename "$f")"
  out=$( { echo 'BEGIN;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d "$DB" 2>&1 ); rc=$?
  echo "$out" | grep -oE '(EVID|PASS) .*' | sed 's/^/  /'
  if [ $rc -eq 0 ]; then
    echo "OK   $name"; pass=$((pass+1))
  else
    echo "$out" | grep -E 'ERROR' | head -3 | sed 's/^/  /'
    if echo "$out" | grep -q '\[DIFETTO\]'; then echo "FAIL $name  [DIFETTO confermato]"; difetti=$((difetti+1));
    else echo "FAIL $name"; fi
    fail=$((fail+1))
  fi
done
echo "Scenari P1-P6 + P8: $pass OK, $fail FAIL (di cui $difetti [DIFETTO])"
if [ "${KP_SKIP_CONCURRENCY:-0}" != "1" ]; then
  "$HERE/p7_concorrenza.sh" "$DB"; rc7=$?
  [ $rc7 -ne 0 ] && fail=$((fail+1))
  bash "$HERE/p8b_k6_concorrenza.sh" "$DB" "${KP_P8B_N:-12}" "${KP_P8B_REP:-10}"; rc8b=$?
  [ $rc8b -ne 0 ] && fail=$((fail+1))
fi
[ $fail -eq 0 ]
