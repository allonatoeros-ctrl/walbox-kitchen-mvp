#!/usr/bin/env bash
# P8b K6 (2026-11-08): chiusure concorrenti della STESSA segnalazione con sessioni psql REALI e separate,
# ruolo reale `authenticated` (SET ROLE) e due manager diversi, su un clone del DB gia' migrato.
# Per ogni ripetizione: una segnalazione nuova (pagato dopo annullo, scritta dalla RPC di sistema), poi N sessioni
# parallele (meta' manager A, meta' manager B, esiti misti) che chiamano kitchen_reconciliation_resolve e tengono
# la transazione aperta 0.5s dopo la chiamata. Atteso: esattamente 1 chiusura, nessun deadlock, nessun errore
# diverso da already_resolved; chi ha lo stesso autore+esito della chiusura vincente riceve la stessa riga.
# Uso: PGHOST=/socket PGPORT=54329 bash tests/db/kitchen-payments/p8b_k6_concorrenza.sh [db_migrato] [N] [ripetizioni]
# Il clone <db>_p8b viene ricreato a ogni run e lasciato li' (nessun DROP a fine run).
set -uo pipefail
DB="${1:-walbox_kp_test}"; N="${2:-12}"; REP="${3:-10}"; CDB="${DB}_p8b"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
[ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}" ] || { echo "rifiuto: PGHOSTADDR/PGSERVICE impostati" >&2; exit 2; }
case "$DB" in ''|*[!A-Za-z0-9_]*) echo "rifiuto: nome DB non semplice ($DB)" >&2; exit 2;; esac
case "$N$REP" in *[!0-9]*) echo "rifiuto: N e ripetizioni devono essere numeri" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P8b concorrenza chiusure K6 (DB clone $CDB, N=$N sessioni, $REP ripetizioni, output in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
PGOPTIONS="-c client_min_messages=warning" q -f "$HERE/00_fc_test_base.sql" >/dev/null || exit 1
PGOPTIONS="-c client_min_messages=warning" q -f "$HERE/00_kp_helpers.sql" >/dev/null || exit 1

IFS='|' read -r MA MB S < <(q <<'SQL'
SELECT fc_test.new_staff() AS ma \gset
SELECT fc_test.new_staff() AS mb \gset
SELECT fc_test.new_staff() AS s \gset
UPDATE public.kitchen_staff_members SET role = 'manager' WHERE user_id IN (:'ma', :'mb');
SELECT :'ma', :'mb', :'s';
SQL
)
[ -n "${S:-}" ] || { echo "FAIL setup"; exit 1; }

new_item() { q -v s="$S" <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT status AS c1 FROM fc_test.cancel(:'oid', :'s') \gset
SELECT status AS c2 FROM kp_test.confirm(:'a') \gset
SELECT id FROM public.kitchen_action_log WHERE order_id = :'oid' AND action = 'payment_confirmed_after_cancel';
SQL
}

fail=0; tot_dead=0; tot_bad=0
for rep in $(seq 1 "$REP"); do
  LOG=$(new_item | tail -1)
  [ -n "$LOG" ] || { echo "  FAIL rep $rep: segnalazione non creata"; fail=1; continue; }
  for i in $(seq 1 "$N"); do
    if [ $((i % 2)) -eq 0 ]; then U="$MA"; else U="$MB"; fi
    if [ $((i % 3)) -eq 0 ]; then OC="verified_not_charged"; else OC="seen"; fi
    ( q >"$OUT/r${rep}_s${i}.out" 2>&1 <<SQL
SET ROLE authenticated;
SELECT fc_test.as_user('$U');
SELECT pg_sleep(0.3);
BEGIN;
SELECT 'RES', current_user, (r).id, (r).resolved_by = '$U', (r).outcome FROM (SELECT public.kitchen_reconciliation_resolve('$LOG', '$OC', 'concorrenza $i', NULL) AS r) x;
SELECT pg_sleep(0.5);
COMMIT;
SQL
    echo "rc=$?" >>"$OUT/r${rep}_s${i}.out" ) &
  done
  wait
  ROWS=$(q -c "SELECT count(*) FROM public.kitchen_reconciliation_resolutions WHERE source_log_id = '$LOG'")
  read -r WID WBY WOC < <(q -F' ' -c "SELECT id, resolved_by, outcome FROM public.kitchen_reconciliation_resolutions WHERE source_log_id = '$LOG'")
  OK=$(grep -l '^RES|authenticated|' "$OUT"/r${rep}_s*.out | wc -l | tr -d ' ')
  SAME=$(grep -h '^RES|authenticated|' "$OUT"/r${rep}_s*.out | cut -d'|' -f3 | sort -u | tr '\n' ' ')
  AR=$(grep -l 'already_resolved' "$OUT"/r${rep}_s*.out | wc -l | tr -d ' ')
  DEAD=$(grep -il 'deadlock' "$OUT"/r${rep}_s*.out | wc -l | tr -d ' ')
  BAD=$(grep -h 'ERROR\|ERRORE' "$OUT"/r${rep}_s*.out | grep -v 'already_resolved' | wc -l | tr -d ' ')
  # chi ha stesso autore+esito del vincitore riceve la riga; gli altri already_resolved
  EXP_OK=0
  for i in $(seq 1 "$N"); do
    if [ $((i % 2)) -eq 0 ]; then U="$MA"; else U="$MB"; fi
    if [ $((i % 3)) -eq 0 ]; then OC="verified_not_charged"; else OC="seen"; fi
    [ "$U" = "$WBY" ] && [ "$OC" = "$WOC" ] && EXP_OK=$((EXP_OK+1))
  done
  tot_dead=$((tot_dead+DEAD)); tot_bad=$((tot_bad+BAD))
  echo "  EVID rep $rep: righe=$ROWS ok=$OK (attese $EXP_OK, id distinti: ${SAME}) already_resolved=$AR deadlock=$DEAD altri_errori=$BAD"
  if [ "$ROWS" = 1 ] && [ "$DEAD" = 0 ] && [ "$BAD" = 0 ] && [ "$OK" = "$EXP_OK" ] && [ $((OK + AR)) = "$N" ] && [ "$SAME" = "$WID " ]; then :; else fail=1; fi
done
if [ $fail -eq 0 ]; then
  echo "  PASS P8b $REP ripetizioni x $N sessioni (2 manager): 1 chiusura per segnalazione, 0 deadlock, 0 errori inattesi"
  echo "P8b: OK"
else
  echo "  FAIL P8b (deadlock totali=$tot_dead, altri errori=$tot_bad)"; echo "P8b: FAIL"
fi
exit $fail
