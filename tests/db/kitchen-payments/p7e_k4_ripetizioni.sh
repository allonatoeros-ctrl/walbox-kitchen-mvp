#!/usr/bin/env bash
# P7e Ripetizioni K4 (Passo 3, 2026-11-08): 7c1 e P7b3 ripetuti N volte con sessioni psql REALI e separate,
# stessa meccanica S0/S1/S2 di p7_concorrenza.sh e p7c_k2_concorrenza.sh (S0 tiene l'ordine 3 s, S2 banco a 0,5 s,
# S1 confirm a 1 s). Ordine NUOVO a ogni ripetizione, su un clone <db>_p7e ricreato a ogni run (lasciato li').
# SENZA retry: l'esito di ogni ripetizione si giudica solo sulle sessioni concorrenti (nessun webhook ripetuto,
# nessun secondo INCASSA come fa p7c a :50-51). Una ripetizione e' "fuori atteso" se ha deadlock, un ERROR diverso
# dall'errore di dominio online_order_paid_status_conflict (7b3), piu' di 1 charge, o (7c1) non chiude con banco + lost_race.
#   7c1 ordine al banco, attempt staff_closed_for_counter -> atteso dopo K4: 1 charge banco + lost_race double_charge
#   7b3 ordine online abbandonato (attempt failed/abandoned_timeout)  -> atteso dopo K4: mai 2 charge, nessun errore
# KP_SNAP=1 (default): alla 1a ripetizione di ogni scenario una sessione S3 fotografa pg_stat_activity/pg_locks
# a 2,0 s (S1 e S2 in attesa dietro S0) e a 3,4 s (dopo il rilascio di S0, prima del deadlock_timeout di 1 s).
# Uso: PGHOST=/socket PGPORT=54329 tests/db/kitchen-payments/p7e_k4_ripetizioni.sh [db_migrato] [ripetizioni]
set -uo pipefail
DB="${1:-walbox_kp_test}"; REPS="${2:-10}"; CDB="${DB}_p7e"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P7e ripetizioni K4 (DB clone $CDB, $REPS ripetizioni, output sessioni in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
sess() { ( PGAPPNAME="$1" q <<<"$3" >"$OUT/$2.out" 2>&1; echo "rc=$?" >>"$OUT/$2.out" ) & }
lr_flag() { q -c "SELECT count(*) FROM kitchen_action_log WHERE order_id='$1' AND action='payment_confirm_lost_race' AND metadata->>'double_charge'='true' AND metadata->>'losing_attempt_id'='$2'"; }

lock_s0="BEGIN; SELECT 'S0 lock ordine', clock_timestamp(); SELECT 1 FROM public.kitchen_orders WHERE id='%s' FOR UPDATE; SELECT pg_sleep(3); COMMIT; SELECT 'S0 rilascia', clock_timestamp();"
counter_s2="SELECT pg_sleep(0.5); SELECT fc_test.as_user('%s'); SELECT 'S2 record_counter -> riga', channel, status FROM public.kitchen_payment_record_counter('%s','cash'); SELECT 'S2 fine', clock_timestamp();"
confirm_s1="SELECT pg_sleep(1.0); SELECT fc_test.as_service(); SELECT 'S1 confirm -> riga', channel, status FROM public.kitchen_payment_confirm('%s','sumup-%s','{}'); SELECT 'S1 fine', clock_timestamp();"
snap_sql="SELECT a.application_name, coalesce(a.wait_event_type,'-')||'/'||coalesce(a.wait_event,'-'),
  coalesce((SELECT string_agg(b.application_name, ',') FROM pg_stat_activity b WHERE b.pid = ANY(pg_blocking_pids(a.pid))), '-'),
  coalesce((SELECT string_agg(l.locktype || ':' || coalesce(l.relation::regclass::text, 'xid ' || l.transactionid::text, '') || ':' || l.mode || ':' ||
            CASE WHEN l.granted THEN 'preso' ELSE 'ATTESA' END, ' ; ' ORDER BY l.granted, l.locktype)
          FROM pg_locks l WHERE l.pid = a.pid AND (l.locktype IN ('tuple', 'transactionid') OR NOT l.granted)), '-')
FROM pg_stat_activity a WHERE a.datname = current_database() AND a.application_name IN ('S0','S1','S2') ORDER BY 1;"
snap_s3="SELECT pg_sleep(2.0); SELECT '--- t=2,0s app|wait|bloccata_da|lock tuple/xid (e lock in attesa)'; $snap_sql SELECT pg_sleep(1.4); SELECT '--- t=3,4s'; $snap_sql"

setup_7c1() { q <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'counter') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT status AS st FROM kp_test.close_unpaid(:'a', :'s') \gset
SELECT :'oid', :'a', :'s';
SQL
}
setup_7b3() { q <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT status AS ab FROM kp_test.abandon(:'oid') \gset
SELECT :'oid', :'a', :'s';
SQL
}

fail=0
for SC in 7c1 7b3; do
  dl_reps=0; err_reps=0; bad_reps=0
  echo "-- $SC: rip | deadlock in | ERROR in | charge succeeded | vincente | lost_race double_charge | atteso"
  for i in $(seq 1 "$REPS"); do
    IFS='|' read -r OID A S < <("setup_$SC")
    t="${SC}_$i"
    sess S0 "s0_$t" "$(printf "$lock_s0" "$OID")"
    sess S2 "s2_$t" "$(printf "$counter_s2" "$S" "$OID")"
    sess S1 "s1_$t" "$(printf "$confirm_s1" "$A" "$A")"
    [ "${KP_SNAP:-1}" = 1 ] && [ "$i" = 1 ] && sess S3 "s3_$t" "$snap_s3"
    wait
    DL=$(grep -il 'deadlock' "$OUT/s1_$t.out" "$OUT/s2_$t.out" | xargs -n1 basename 2>/dev/null | sed 's/_.*//' | tr '\n' ' ')
    # errori per sessione: "sN:messaggio". Errori di dominio gia' esistenti (non di lock) non fanno fallire la ripetizione:
    # online_order_paid_status_conflict = banco su ordine payment_abandoned (guardia lifecycle 20261012100000).
    ER=$(for s in s1 s2; do grep -h '^ERROR' "$OUT/${s}_$t.out" | sed -E "s/^ERROR: +/$s:/"; done | tr '\n' ' ')
    ERX=$(echo "$ER" | tr ' ' '\n' | grep -v -e '^$' -e ':online_order_paid_status_conflict$' | tr '\n' ' ')
    read -r N W < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), coalesce((SELECT channel FROM kitchen_payments WHERE order_id='$OID' AND direction='charge' AND status='succeeded' LIMIT 1),'-')")
    LR=$(lr_flag "$OID" "$A")
    ok=1
    [ -n "$DL" ] && { dl_reps=$((dl_reps+1)); ok=0; }
    [ -n "$ER" ] && err_reps=$((err_reps+1))
    [ -n "$ERX" ] && ok=0
    [ "$N" -gt 1 ] && ok=0
    [ "$SC" = 7c1 ] && { [ "$N" = 1 ] && [ "$W" = counter ] && [ "$LR" = 1 ] || ok=0; }
    [ $ok = 1 ] || bad_reps=$((bad_reps+1))
    echo "   $i | ${DL:--} | ${ER:--} | $N | $W | $LR | $( [ $ok = 1 ] && echo si || echo NO )"
    if [ "${KP_SNAP:-1}" = 1 ] && [ "$i" = 1 ]; then sed "s/^/      [S3 $SC] /" "$OUT/s3_$t.out"; fi
  done
  echo "  RIEPILOGO $SC: $REPS ripetizioni, deadlock=$dl_reps, ripetizioni con ERROR (qualsiasi)=$err_reps, ripetizioni fuori atteso=$bad_reps"
  [ $bad_reps -eq 0 ] || fail=1
done
X=$(q -c "SELECT count(*) FROM (SELECT order_id FROM kitchen_payments WHERE direction='charge' AND status='succeeded' GROUP BY order_id HAVING count(*) > 1) d")
echo "  EVID ordini con piu' di 1 charge succeeded nel clone: $X"
[ "$X" = 0 ] || fail=1
[ $fail -eq 0 ] && echo "P7e: OK" || echo "P7e: FAIL"
exit $fail
