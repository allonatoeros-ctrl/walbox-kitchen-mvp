#!/usr/bin/env bash
# P7 Concorrenza con sessioni psql REALI e separate (non una sola transazione) sui pagamenti Kitchen.
# Gira su un clone del DB già migrato (CREATE DATABASE ... TEMPLATE), perché qui i dati vanno committati:
# il DB sorgente resta pulito. Il clone <db>_p7 viene ricreato a ogni run e lasciato lì (nessun DROP a fine run).
# La sovrapposizione è forzata con transazioni aperte + pg_sleep e, dove serve, con una sessione S0 che tiene
# il lock FOR UPDATE sulla riga ordine per accodare le altre due nell'ordine voluto.
#   7a  due confirm simultanei su due attempt diversi dello stesso ordine -> 1 succeeded + 1 lost_race
#   7b1 record_counter e confirm insieme, attempt initiated, banco in coda per primo -> banco rifiutato, 1 charge
#   7b2 confirm in corso (transazione aperta) e record_counter -> banco idempotente sul charge SumUp, 1 charge
#   7b3 come 7b1 ma ordine payment_abandoned (attempt failed/abandoned_timeout) -> mai 2 charge, nessun deadlock
# Uso: PGHOST=/socket PGPORT=54329 tests/db/kitchen-payments/p7_concorrenza.sh [db_migrato]
set -uo pipefail
DB="${1:-walbox_kp_test}"; CDB="${DB}_p7"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P7 concorrenza (DB clone $CDB, output sessioni in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
sess() { # nome, sql: una sessione psql propria in background
  ( q <<<"$2" >"$OUT/$1.out" 2>&1; echo "rc=$?" >>"$OUT/$1.out" ) &
}
show() { for s in "$@"; do sed "s/^/    [$s] /" "$OUT/$s.out"; done; }
fail=0
verdict() { # nome, condizione(0=ok), messaggio
  if [ "$2" -eq 0 ]; then echo "  PASS $1 $3"; else echo "  FAIL $1 $3"; fail=1; fi
}

# ---------- 7a ----------
IFS='|' read -r OID A B < <(q <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT 1 AS ok FROM kp_test.fail(:'a', 'sumup_expired') \gset x_
SELECT id AS b FROM fc_test.start_online(:'oid') \gset
SELECT 1 AS ok FROM kp_test.fail(:'a', 'sumup_failed') \gset y_
SELECT :'oid', :'a', :'b';
SQL
)
q -c "SELECT 'setup 7a: A ' || (SELECT status||'/'||failure_reason FROM kitchen_payments WHERE id='$A') || ', B ' || (SELECT status FROM kitchen_payments WHERE id='$B')" | sed 's/^/  /'
sess s1_7a "BEGIN; SELECT fc_test.as_service(); SELECT 'S1 confirm(A) ->', id='$A' AS propria, status FROM public.kitchen_payment_confirm('$A','sumup-A','{}'); SELECT 'S1 tiene la tx aperta', pg_sleep(2); COMMIT; SELECT 'S1 commit', clock_timestamp();"
sess s2_7a "SELECT pg_sleep(0.5); SELECT fc_test.as_service(); SELECT 'S2 start', clock_timestamp(); SELECT 'S2 confirm(B) -> riga', CASE WHEN id='$A' THEN 'A (vincente)' WHEN id='$B' THEN 'B' ELSE id::text END, status FROM public.kitchen_payment_confirm('$B','sumup-B','{}'); SELECT 'S2 fine', clock_timestamp();"
wait; show s1_7a s2_7a
read -r N LR BS < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), kp_test.log_count('$OID','payment_confirm_lost_race'), (SELECT status FROM kitchen_payments WHERE id='$B')")
echo "  EVID 7a charge succeeded=$N, log lost_race=$LR, attempt B resta $BS"
[ "$N" = 1 ] && [ "$LR" = 1 ] && grep -q 'A (vincente)' "$OUT/s2_7a.out"; verdict 7a $? "due confirm concorrenti: 1 succeeded + 1 lost_race"

# ---------- setup comune 7b ----------
setup_b() { # $1 = abandon? (0/1) -> stampa OID A STAFF
  q -v ab="$1" <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT CASE WHEN :ab = 1 THEN (SELECT status FROM kp_test.abandon(:'oid')) ELSE 'n/a' END AS ab_status \gset
SELECT :'oid', :'a', :'s';
SQL
}
lock_s0="BEGIN; SELECT 'S0 lock ordine', clock_timestamp(); SELECT 1 FROM public.kitchen_orders WHERE id='%s' FOR UPDATE; SELECT pg_sleep(3); COMMIT; SELECT 'S0 rilascia', clock_timestamp();"
counter_s2="SELECT pg_sleep(%s); SELECT fc_test.as_user('%s'); SELECT 'S2 record_counter start', clock_timestamp(); SELECT 'S2 record_counter -> riga', channel, status FROM public.kitchen_payment_record_counter('%s','cash'); SELECT 'S2 fine', clock_timestamp();"
confirm_s1="SELECT pg_sleep(%s); SELECT fc_test.as_service(); SELECT 'S1 confirm start', clock_timestamp(); SELECT 'S1 confirm -> riga', channel, status FROM public.kitchen_payment_confirm('%s','sumup-x','{}'); SELECT 'S1 fine', clock_timestamp();"

# ---------- 7b1: attempt initiated, banco accodato prima del confirm ----------
IFS='|' read -r OID A S < <(setup_b 0)
sess s0_7b1 "$(printf "$lock_s0" "$OID")"
sess s2_7b1 "$(printf "$counter_s2" 0.5 "$S" "$OID")"
sess s1_7b1 "$(printf "$confirm_s1" 1.0 "$A")"
wait; show s0_7b1 s2_7b1 s1_7b1
read -r N ST PS < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), status, coalesce(payment_status,'-') FROM kitchen_orders WHERE id='$OID'")
echo "  EVID 7b1 charge succeeded=$N, ordine $ST/$PS"
[ "$N" = 1 ] && grep -q 'online_payment_in_progress' "$OUT/s2_7b1.out" && ! grep -qi deadlock "$OUT"/s?_7b1.out
verdict 7b1 $? "banco e confirm concorrenti (attempt initiated): banco rifiutato, 1 charge, nessun deadlock"

# ---------- 7b2: confirm con tx aperta, banco arriva durante ----------
IFS='|' read -r OID A S < <(setup_b 0)
sess s1_7b2 "SELECT fc_test.as_service(); BEGIN; SELECT 'S1 confirm -> riga', channel, status FROM public.kitchen_payment_confirm('$A','sumup-x','{}'); SELECT 'S1 tiene la tx aperta', pg_sleep(2); COMMIT; SELECT 'S1 commit', clock_timestamp();"
sess s2_7b2 "$(printf "$counter_s2" 0.5 "$S" "$OID")"
wait; show s1_7b2 s2_7b2
read -r N < <(q -c "SELECT kp_test.succeeded_charges('$OID')")
echo "  EVID 7b2 charge succeeded=$N"
[ "$N" = 1 ] && grep -q 'S2 record_counter -> riga|app|succeeded' "$OUT/s2_7b2.out" && ! grep -qi deadlock "$OUT"/s?_7b2.out
verdict 7b2 $? "confirm in corso + banco: banco attende e restituisce il charge SumUp (idempotente), 1 charge"

# ---------- 7b3: ordine abbandonato (attempt failed/abandoned_timeout), banco accodato prima del confirm ----------
IFS='|' read -r OID A S < <(setup_b 1)
q -c "SELECT 'setup 7b3: ordine ' || status || ', attempt ' || (SELECT status||'/'||failure_reason FROM kitchen_payments WHERE id='$A') FROM kitchen_orders WHERE id='$OID'" | sed 's/^/  /'
sess s0_7b3 "$(printf "$lock_s0" "$OID")"
sess s2_7b3 "$(printf "$counter_s2" 0.5 "$S" "$OID")"
sess s1_7b3 "$(printf "$confirm_s1" 1.0 "$A")"
wait; show s0_7b3 s2_7b3 s1_7b3
read -r N ST < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), status FROM kitchen_orders WHERE id='$OID'")
DL=$(grep -il 'deadlock' "$OUT"/s?_7b3.out | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
echo "  EVID 7b3 charge succeeded=$N, ordine $ST, deadlock in: ${DL:-nessuna sessione}"
[ "$N" -le 1 ]; verdict 7b3-soldi $? "mai 2 charge succeeded"
[ -z "$DL" ]; verdict 7b3-lock $? "nessun deadlock tra record_counter (ordine->pagamenti) e confirm (pagamento->ordine) $( [ -n "$DL" ] && echo '[DIFETTO] ordine dei lock invertito')"

[ $fail -eq 0 ] && echo "P7: OK" || echo "P7: FAIL"
exit $fail
