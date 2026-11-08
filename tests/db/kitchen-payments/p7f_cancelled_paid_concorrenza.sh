#!/usr/bin/env bash
# P7f Concorrenza K2: due consegne PAID SumUp concorrenti (sessioni psql REALI) sullo stesso attempt `cancelled`.
#   7f-A banco gia' incassato (contanti) + attempt SumUp cancelled -> per ogni ripetizione: 1 solo log
#        payment_confirm_lost_race (double_charge), 1 solo charge succeeded (banco), attempt resta cancelled
#   7f-B ordine annullato dallo staff, nessun banco -> 1 solo charge succeeded, 1 solo log payment_confirmed_after_cancel,
#        ordine resta cancelled, attempt succeeded
# In ogni ripetizione: 0 deadlock, 0 ERROR in qualunque sessione. Righe NUOVE a ogni ripetizione, su un clone
# <db>_p7f ricreato a ogni run (lasciato li', nessun DROP a fine run). Le due sessioni partono insieme con pg_sleep_until.
# Uso: PGHOST=/socket PGPORT=54329 bash tests/db/kitchen-payments/p7f_cancelled_paid_concorrenza.sh [db_migrato] [ripetizioni]
set -uo pipefail
DB="${1:-walbox_kp_test}"; REPS="${2:-10}"; CDB="${DB}_p7f"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
export PGHOST PGPORT PGUSER
OUT="${KP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P7f concorrenza PAID su attempt cancelled (clone $CDB, $REPS ripetizioni, output in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
sess() { ( q <<<"$2" >"$OUT/$1.out" 2>&1; echo "rc=$?" >>"$OUT/$1.out" ) & }
confirm_sql() { # $1 = attempt, $2 = istante comune di partenza
  echo "SELECT pg_sleep_until('$2'::timestamptz); SELECT fc_test.as_service(); SELECT 'confirm -> riga', channel, status FROM public.kitchen_payment_confirm('$1','co-concorrente-$1','{}');"; }

setup_A() { q <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT status AS st FROM kp_test.switch_to_counter(:'oid') \gset
SELECT id AS c FROM fc_test.pay_counter(:'oid', :'s') \gset
UPDATE public.kitchen_payments SET status = 'cancelled', failure_reason = NULL WHERE id = :'a';
SELECT :'oid', :'a';
SQL
}
setup_B() { q <<'SQL'
SELECT fc_test.new_user() AS u \gset
SELECT fc_test.new_staff() AS s \gset
SELECT id AS oid FROM kp_test.new_order(:'u', 'online') \gset
SELECT id AS a FROM fc_test.start_online(:'oid') \gset
SELECT status AS st FROM fc_test.cancel(:'oid', :'s') \gset
SELECT :'oid', :'a';
SQL
}

fail=0
for SC in A B; do
  bad=0; dlt=0; errt=0
  echo "-- 7f-$SC: rip | deadlock | ERROR | charge succ | log lost_race | log after_cancel | attempt | ordine | esito"
  for i in $(seq 1 "$REPS"); do
    IFS='|' read -r OID A < <("setup_$SC")
    T=$(q -c "SELECT (clock_timestamp() + interval '1 second')::text")
    t="7f${SC}_$i"
    sess "s1_$t" "$(confirm_sql "$A" "$T")"
    sess "s2_$t" "$(confirm_sql "$A" "$T")"
    wait
    DL=$(grep -ilc 'deadlock' "$OUT/s1_$t.out" "$OUT/s2_$t.out" | grep -vc ':0$' || true)
    ER=$(grep -h '^ERROR\|^psql:.*ERROR' "$OUT/s1_$t.out" "$OUT/s2_$t.out" | wc -l | tr -d ' ')
    RC=$(grep -h '^rc=' "$OUT/s1_$t.out" "$OUT/s2_$t.out" | grep -vc '^rc=0$' || true)
    read -r N LR AC AS OS < <(q -F' ' -c "SELECT kp_test.succeeded_charges('$OID'), kp_test.log_count('$OID','payment_confirm_lost_race'), kp_test.log_count('$OID','payment_confirmed_after_cancel'), (SELECT status FROM kitchen_payments WHERE id='$A'), (SELECT status FROM kitchen_orders WHERE id='$OID')")
    CH=$(q -c "SELECT string_agg(channel, ',') FROM kitchen_payments WHERE order_id='$OID' AND direction='charge' AND status='succeeded'")
    ok=1
    [ "$DL" != 0 ] && ok=0; [ "$ER" != 0 ] && ok=0; [ "$RC" != 0 ] && ok=0; [ "$N" = 1 ] || ok=0
    if [ "$SC" = A ]; then
      [ "$LR" = 1 ] && [ "$AC" = 0 ] && [ "$AS" = cancelled ] && [ "$CH" = counter ] \
        && [ "$(q -c "SELECT count(*) FROM kitchen_action_log WHERE order_id='$OID' AND action='payment_confirm_lost_race' AND metadata->>'double_charge'='true' AND metadata->>'needs_manual_reconciliation'='true'")" = 1 ] || ok=0
    else
      [ "$LR" = 0 ] && [ "$AC" = 1 ] && [ "$AS" = succeeded ] && [ "$OS" = cancelled ] || ok=0
    fi
    [ "$DL" != 0 ] && dlt=$((dlt+1)); [ "$ER" != 0 ] && errt=$((errt+1))
    if [ $ok = 1 ]; then r=OK; else r=FUORI_ATTESO; bad=$((bad+1)); sed 's/^/      /' "$OUT/s1_$t.out" "$OUT/s2_$t.out"; fi
    echo "   $i | dl=$DL | err=$ER | charge=$N ($CH) | lost_race=$LR | after_cancel=$AC | $AS | $OS | $r"
  done
  if [ $bad -eq 0 ]; then echo "  PASS 7f-$SC $REPS/$REPS ripetizioni attese, 0 deadlock, 0 errori"; else echo "  FAIL 7f-$SC $bad/$REPS ripetizioni fuori atteso (deadlock=$dlt, con errori=$errt)"; fail=1; fi
done
[ $fail -eq 0 ] && echo "P7f: OK" || echo "P7f: FAIL"
exit $fail
