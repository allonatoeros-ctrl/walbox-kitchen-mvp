#!/usr/bin/env bash
# P7c Concorrenza K2 (Passo 2, 2026-11-08) con sessioni psql REALI e separate, su un clone del DB gia' migrato.
# Stesso schema di p7_concorrenza.sh (clone <db>_p7c ricreato a ogni run, lasciato li', nessun DROP a fine run).
#   7c1 attempt staff_closed_for_counter: banco accodato prima del confirm (S0 tiene il lock ordine) -> K4 noto:
#       possibile deadlock; dopo il retry di chi e' stato annullato: 1 charge e doppio incasso mai perso in silenzio
#   7c2 D1 concorrente: confirm (switch) con tx aperta + banco -> banco attende e restituisce il charge SumUp
#   7c3 D4 concorrente: banco con tx aperta + confirm (staff_closed) -> confirm attende, lost_race con double_charge
#   7c4 webhook duplicati concorrenti dopo il banco -> una sola segnalazione lost_race
#   7c5 webhook duplicati concorrenti D1 (nessun banco) -> un solo payment_confirmed, nessun lost_race
# Uso: PGHOST=/socket PGPORT=54329 tests/db/kitchen-payments/p7c_k2_concorrenza.sh [db_migrato]
set -uo pipefail
DB="${1:-walbox_kp_test}"; CDB="${DB}_p7c"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P7c concorrenza K2 (DB clone $CDB, output sessioni in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
sess() { ( q <<<"$2" >"$OUT/$1.out" 2>&1; echo "rc=$?" >>"$OUT/$1.out" ) & }
show() { for s in "$@"; do sed "s/^/    [$s] /" "$OUT/$s.out"; done; }
fail=0
verdict() { if [ "$2" -eq 0 ]; then echo "  PASS $1 $3"; else echo "  FAIL $1 $3"; fail=1; fi; }
lr_flag() { q -c "SELECT count(*) FROM kitchen_action_log WHERE order_id='$1' AND action='payment_confirm_lost_race' AND metadata->>'double_charge'='true' AND metadata->>'needs_manual_reconciliation'='true' AND metadata->>'losing_attempt_id'='$2'"; }

# setup: $1 = corsia (online|counter), $2 = chiusura (switch|staff) -> stampa OID A STAFF
setup() {
  q -v lane="$1" -v how="$2" <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', :'lane') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT CASE WHEN :'how' = 'switch' THEN (SELECT status FROM kp_test.switch_to_counter(:'oid'))
            ELSE (SELECT status FROM kp_test.close_unpaid(:'a', :'s')) END AS st \gset
SELECT :'oid', :'a', :'s';
SQL
}
lock_s0="BEGIN; SELECT 'S0 lock ordine', clock_timestamp(); SELECT 1 FROM public.kitchen_orders WHERE id='%s' FOR UPDATE; SELECT pg_sleep(3); COMMIT; SELECT 'S0 rilascia', clock_timestamp();"
counter_s2="SELECT pg_sleep(%s); SELECT fc_test.as_user('%s'); SELECT 'S2 record_counter start', clock_timestamp(); SELECT 'S2 record_counter -> riga', channel, status FROM public.kitchen_payment_record_counter('%s','cash'); SELECT 'S2 fine', clock_timestamp();"
confirm_s1="SELECT pg_sleep(%s); SELECT fc_test.as_service(); SELECT 'S1 confirm start', clock_timestamp(); SELECT 'S1 confirm -> riga', channel, status FROM public.kitchen_payment_confirm('%s','sumup-%s','{}'); SELECT 'S1 fine', clock_timestamp();"

# ---------- 7c1 ----------
IFS='|' read -r OID A S < <(setup counter staff)
sess s0_7c1 "$(printf "$lock_s0" "$OID")"
sess s2_7c1 "$(printf "$counter_s2" 0.5 "$S" "$OID")"
sess s1_7c1 "$(printf "$confirm_s1" 1.0 "$A" "$A")"
wait; show s0_7c1 s2_7c1 s1_7c1
DL=$(grep -il 'deadlock' "$OUT"/s?_7c1.out | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
# retry di chi e' stato annullato: SumUp ripete il webhook, lo staff ripreme INCASSA
q -c "SELECT fc_test.as_service(); SELECT 1 FROM public.kitchen_payment_confirm('$A','sumup-$A','{}');" >/dev/null 2>"$OUT/r1_7c1.err"
q -c "SELECT fc_test.as_user('$S'); SELECT 1 FROM public.kitchen_payment_record_counter('$OID','cash');" >/dev/null 2>"$OUT/r2_7c1.err"
read -r N W AS < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), (SELECT channel FROM kitchen_payments WHERE order_id='$OID' AND direction='charge' AND status='succeeded'), (SELECT status FROM kitchen_payments WHERE id='$A')")
LR=$(lr_flag "$OID" "$A")
echo "  EVID 7c1 deadlock in: ${DL:-nessuna sessione} | dopo retry: charge=$N vincente=$W attempt SumUp=$AS lost_race_flag=$LR"
[ "$N" = 1 ] && { { [ "$W" = counter ] && [ "$LR" = 1 ]; } || { [ "$W" = app ] && [ "$LR" = 0 ] && [ "$AS" = succeeded ]; }; }
verdict 7c1-soldi $? "1 charge; il PAID SumUp o e' il charge o e' segnalato double_charge (mai perso)"
[ -z "$DL" ]; verdict 7c1-lock $? "nessun deadlock banco <-> confirm $( [ -n "$DL" ] && echo '[K4 NOTO, Passo 3] ordine dei lock invertito')"

# ---------- 7c2 D1 concorrente ----------
IFS='|' read -r OID A S < <(setup online switch)
sess s1_7c2 "SELECT fc_test.as_service(); BEGIN; SELECT 'S1 confirm -> riga', channel, status FROM public.kitchen_payment_confirm('$A','sumup-$A','{}'); SELECT 'S1 tiene la tx aperta', pg_sleep(2); COMMIT; SELECT 'S1 commit', clock_timestamp();"
sess s2_7c2 "$(printf "$counter_s2" 0.5 "$S" "$OID")"
wait; show s1_7c2 s2_7c2
read -r N < <(q -c "SELECT kp_test.succeeded_charges('$OID')")
echo "  EVID 7c2 charge=$N"
[ "$N" = 1 ] && grep -q 'S2 record_counter -> riga|app|succeeded' "$OUT/s2_7c2.out" && ! grep -qi deadlock "$OUT"/s?_7c2.out
verdict 7c2 $? "D1 concorrente: banco attende e restituisce il charge SumUp, 1 charge, nessun deadlock"

# ---------- 7c3 D4 concorrente ----------
IFS='|' read -r OID A S < <(setup counter staff)
sess s2_7c3 "SELECT fc_test.as_user('$S'); BEGIN; SELECT 'S2 record_counter -> riga', channel, status FROM public.kitchen_payment_record_counter('$OID','cash'); SELECT 'S2 tiene la tx aperta', pg_sleep(2); COMMIT; SELECT 'S2 commit', clock_timestamp();"
sess s1_7c3 "$(printf "$confirm_s1" 0.5 "$A" "$A")"
wait; show s2_7c3 s1_7c3
read -r N < <(q -c "SELECT kp_test.succeeded_charges('$OID')")
LR=$(lr_flag "$OID" "$A")
echo "  EVID 7c3 charge=$N lost_race_flag=$LR"
[ "$N" = 1 ] && [ "$LR" = 1 ] && grep -q 'S1 confirm -> riga|counter|succeeded' "$OUT/s1_7c3.out" && ! grep -qi deadlock "$OUT"/s?_7c3.out
verdict 7c3 $? "D4 concorrente: confirm attende il banco, lost_race con double_charge, nessun deadlock"

# ---------- 7c4 webhook duplicati dopo il banco ----------
IFS='|' read -r OID A S < <(setup online switch)
q -c "SELECT fc_test.as_user('$S'); SELECT 1 FROM public.kitchen_payment_record_counter('$OID','cash');" >/dev/null
sess s1_7c4 "SELECT fc_test.as_service(); BEGIN; SELECT 'S1 confirm -> riga', channel FROM public.kitchen_payment_confirm('$A','sumup-$A','{}'); SELECT pg_sleep(2); COMMIT;"
sess s2_7c4 "$(printf "$confirm_s1" 0.5 "$A" "$A")"
wait; show s1_7c4 s2_7c4
read -r N < <(q -c "SELECT kp_test.succeeded_charges('$OID')")
read -r LRN < <(q -c "SELECT kp_test.log_count('$OID','payment_confirm_lost_race')")
echo "  EVID 7c4 charge=$N log lost_race=$LRN"
[ "$N" = 1 ] && [ "$LRN" = 1 ] && [ "$(lr_flag "$OID" "$A")" = 1 ] && ! grep -qi 'deadlock\|ERROR' "$OUT"/s?_7c4.out
verdict 7c4 $? "due consegne PAID concorrenti dopo il banco: una sola segnalazione double_charge"

# ---------- 7c5 webhook duplicati D1 ----------
IFS='|' read -r OID A S < <(setup online switch)
sess s1_7c5 "SELECT fc_test.as_service(); BEGIN; SELECT 'S1 confirm -> riga', channel FROM public.kitchen_payment_confirm('$A','sumup-$A','{}'); SELECT pg_sleep(2); COMMIT;"
sess s2_7c5 "$(printf "$confirm_s1" 0.5 "$A" "$A")"
wait; show s1_7c5 s2_7c5
read -r N PC LRN PS < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), kp_test.log_count('$OID','payment_confirmed'), kp_test.log_count('$OID','payment_confirm_lost_race'), payment_status FROM kitchen_orders WHERE id='$OID'")
echo "  EVID 7c5 charge=$N payment_confirmed=$PC lost_race=$LRN ordine=$PS"
[ "$N" = 1 ] && [ "$PC" = 1 ] && [ "$LRN" = 0 ] && [ "$PS" = paid ] && ! grep -qi 'deadlock\|ERROR' "$OUT"/s?_7c5.out
verdict 7c5 $? "due consegne PAID concorrenti D1: un solo payment_confirmed, nessun lost_race"

[ $fail -eq 0 ] && echo "P7c: OK" || echo "P7c: FAIL"
exit $fail
