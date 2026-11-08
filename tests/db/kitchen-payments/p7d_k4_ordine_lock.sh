#!/usr/bin/env bash
# P7d Ordine dei lock K4 (Passo 3, 2026-11-08): coppie di RPC concorrenti con sessioni psql REALI e separate, su un
# clone <db>_p7d ricreato a ogni run (lasciato li'). Ordine NUOVO a ogni ripetizione, nessun retry.
# Meccanica come p7/p7c: S0 tiene la riga ordine FOR UPDATE per 2 s, la prima RPC parte a 0,5 s, la seconda a 1,0 s;
# nelle ripetizioni pari l'ordine di arrivo si inverte, cosi' entrambe le code vengono provate.
#   d1 close_unpaid (PASSA AL BANCO) || confirm sullo stesso attempt initiated
#   d2 cancel_with_payment_attempt   || confirm sullo stesso attempt initiated
#   d3 switch_to_counter_system      || record_counter (attempt initiated)
#   d4 record_counter                || confirm su attempt initiated -> online_payment_in_progress oppure il banco
#                                       restituisce il charge SumUp; mai 2 charge
#   d5 due ordini distinti: H tiene charge e riga di O2 per 2 s, record_counter su O1 -> nessuna attesa (tempo)
#   d6 utente NON staff su record_counter mentre H tiene ordine e attempt FOR UPDATE, lock_timeout 500ms
#      -> dopo K4 atteso not_staff_for_venue immediato (prima di K4: attesa sul lock ordine / lock_timeout)
# Giudizio per ripetizione: fallisce con deadlock, lock_timeout (d1-d5), piu' di 1 charge succeeded, o esito fuori
# atteso. Gli altri ERROR (errori di dominio, es. payment_attempt_not_cancelable) sono elencati, non fanno fallire.
# Uso: PGHOST=/socket PGPORT=54329 tests/db/kitchen-payments/p7d_k4_ordine_lock.sh [db_migrato] [ripetizioni]
set -uo pipefail
DB="${1:-walbox_kp_test}"; REPS="${2:-5}"; CDB="${DB}_p7d"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P7d ordine dei lock K4 (DB clone $CDB, $REPS ripetizioni per scenario, output sessioni in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
fill() { local t="${1//@O@/$2}"; t="${t//@A@/$3}"; printf '%s' "${t//@S@/$4}"; }
sess() { ( PGAPPNAME="$1" q <<<"$3" >"$OUT/$2.out" 2>&1; echo "rc=$?" >>"$OUT/$2.out" ) & }
errs() { for f in "$@"; do grep -h '^ERROR' "$OUT/$f.out" | sed -E "s/^ERROR: +/$f:/"; done | sed -E 's/_d[0-9]_[0-9]+//' | tr '\n' ' '; }
fail=0

setup() { # $1 corsia -> OID A(attempt initiated) S(staff)
  q -v lane="$1" <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', :'lane') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT :'oid', :'a', :'s';
SQL
}
lock_s0="BEGIN; SELECT 1 FROM public.kitchen_orders WHERE id='%s' FOR UPDATE; SELECT pg_sleep(2); COMMIT;"
f_close="SELECT fc_test.as_user('@S@'); SELECT 'close_unpaid ->', status, failure_reason FROM public.kitchen_payment_attempt_close_unpaid('@A@','test');"
f_cancel="SELECT fc_test.as_user('@S@'); SELECT 'cancel ->', status FROM public.kitchen_order_cancel_with_payment_attempt('@O@','test');"
f_confirm="SELECT fc_test.as_service(); SELECT 'confirm ->', channel, status FROM public.kitchen_payment_confirm('@A@','sumup-@A@','{}');"
f_switch="SELECT 'switch ->', status FROM kp_test.switch_to_counter('@O@');"
f_counter="SELECT fc_test.as_user('@S@'); SELECT 'record_counter ->', channel, status FROM public.kitchen_payment_record_counter('@O@','cash');"

# coppia: nome scenario, corsia, sql X, sql Y, etichetta X, etichetta Y
pair() {
  local SC="$1" LANE="$2" X="$3" Y="$4" LX="$5" LY="$6" i bad=0 dl=0
  echo "-- $SC: rip | primo | deadlock/lock_timeout | ERROR di dominio | charge succeeded | esiti"
  for i in $(seq 1 "$REPS"); do
    IFS='|' read -r OID A S < <(setup "$LANE")
    local t="${SC}_$i" dx=0.5 dy=1.0 first="$LX"
    [ $((i % 2)) = 0 ] && { dx=1.0; dy=0.5; first="$LY"; }
    sess S0 "s0_$t" "$(printf "$lock_s0" "$OID")"
    sess SX "x_$t" "SELECT pg_sleep($dx); $(fill "$X" "$OID" "$A" "$S")"
    sess SY "y_$t" "SELECT pg_sleep($dy); $(fill "$Y" "$OID" "$A" "$S")"
    wait
    local LK ER N ES ok=1
    LK=$(grep -ilE 'deadlock|lock timeout' "$OUT/x_$t.out" "$OUT/y_$t.out" | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
    ER=$(errs "x_$t" "y_$t")
    N=$(q -c "SELECT kp_test.succeeded_charges('$OID')")
    ES=$(grep -h -- '->' "$OUT/x_$t.out" "$OUT/y_$t.out" | tr '\n' ' ')
    [ -n "$LK" ] && { dl=$((dl+1)); ok=0; }
    [ "$N" -gt 1 ] && ok=0
    if [ "$SC" = d4 ]; then # banco: o rifiutato (online_payment_in_progress) o restituisce il charge SumUp
      grep -q 'record_counter ->|counter|' "$OUT/x_$t.out" && grep -q 'confirm ->' "$OUT/y_$t.out" && ok=0
    fi
    [ $ok = 1 ] || bad=$((bad+1))
    echo "   $i | $first | ${LK:--} | ${ER:--} | $N | $ES"
  done
  echo "  RIEPILOGO $SC: $REPS ripetizioni, deadlock/lock_timeout=$dl, fuori atteso=$bad"
  [ $bad -eq 0 ] || fail=1
}

pair d1 online "$f_close"   "$f_confirm" close_unpaid confirm
pair d2 online "$f_cancel"  "$f_confirm" cancel       confirm
pair d3 online "$f_switch"  "$f_counter" switch       record_counter
pair d4 online "$f_counter" "$f_confirm" record_counter confirm

# ---------- d5: due ordini distinti ----------
echo "-- d5: rip | esito record_counter su O1 | attesa (ms) mentre H tiene i lock di O2"
bad=0
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r O2 A2 S < <(setup online)
  O1=$(q -v s="$S" <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT id FROM kp_test.new_order(:'u', 'counter');
SQL
)
  sess H "h_d5_$i" "BEGIN; SELECT 1 FROM public.kitchen_payments WHERE order_id='$O2' AND direction='charge' ORDER BY id FOR UPDATE; SELECT 1 FROM public.kitchen_orders WHERE id='$O2' FOR UPDATE; SELECT pg_sleep(2); COMMIT;"
  sess R "r_d5_$i" "SELECT pg_sleep(0.5); SET lock_timeout='1500ms'; SELECT fc_test.as_user('$S'); DO \$\$ DECLARE t0 timestamptz := clock_timestamp(); r public.kitchen_payments; BEGIN r := public.kitchen_payment_record_counter('$O1','cash'); RAISE NOTICE 'ESITO % % dopo % ms', r.channel, r.status, round(extract(epoch FROM clock_timestamp()-t0)*1000); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ESITO ERR % dopo % ms', SQLERRM, round(extract(epoch FROM clock_timestamp()-t0)*1000); END \$\$;"
  wait
  E=$(grep -ho 'ESITO.*' "$OUT/r_d5_$i.out"); MS=$(echo "$E" | grep -oE 'dopo [0-9]+' | grep -oE '[0-9]+')
  echo "   $i | $E | ${MS:-?}"
  echo "$E" | grep -q 'ESITO counter succeeded' && [ "${MS:-9999}" -lt 300 ] || bad=$((bad+1))
done
echo "  RIEPILOGO d5: $REPS ripetizioni, fuori atteso (errore o attesa >= 300 ms)=$bad"
[ $bad -eq 0 ] || fail=1

# ---------- d6: utente non staff ----------
echo "-- d6: rip | esito record_counter non staff (lock_timeout 500ms) mentre H tiene attempt e ordine"
bad=0
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r OID A S < <(setup online)
  NS=$(q -c "SELECT fc_test.new_user(false)")
  sess H "h_d6_$i" "BEGIN; SELECT 1 FROM public.kitchen_payments WHERE order_id='$OID' AND direction='charge' ORDER BY id FOR UPDATE; SELECT 1 FROM public.kitchen_orders WHERE id='$OID' FOR UPDATE; SELECT pg_sleep(2); COMMIT;"
  sess N "n_d6_$i" "SELECT pg_sleep(0.5); SET lock_timeout='500ms'; SELECT fc_test.as_user('$NS'); DO \$\$ DECLARE t0 timestamptz := clock_timestamp(); BEGIN PERFORM public.kitchen_payment_record_counter('$OID','cash'); RAISE NOTICE 'ESITO OK dopo % ms', round(extract(epoch FROM clock_timestamp()-t0)*1000); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ESITO ERR % dopo % ms', SQLERRM, round(extract(epoch FROM clock_timestamp()-t0)*1000); END \$\$;"
  wait
  E=$(grep -ho 'ESITO.*' "$OUT/n_d6_$i.out"); MS=$(echo "$E" | grep -oE 'dopo [0-9]+' | grep -oE '[0-9]+')
  echo "   $i | $E"
  echo "$E" | grep -q 'ESITO ERR not_staff_for_venue' && [ "${MS:-9999}" -lt 300 ] || bad=$((bad+1))
done
echo "  RIEPILOGO d6: $REPS ripetizioni, fuori atteso (non not_staff_for_venue immediato)=$bad"
[ $bad -eq 0 ] || fail=1

X=$(q -c "SELECT count(*) FROM (SELECT order_id FROM kitchen_payments WHERE direction='charge' AND status='succeeded' GROUP BY order_id HAVING count(*) > 1) d")
echo "  EVID ordini con piu' di 1 charge succeeded nel clone: $X"
[ "$X" = 0 ] || fail=1
[ $fail -eq 0 ] && echo "P7d: OK" || echo "P7d: FAIL"
exit $fail
