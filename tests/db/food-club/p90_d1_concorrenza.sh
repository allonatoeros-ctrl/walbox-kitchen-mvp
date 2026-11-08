#!/usr/bin/env bash
# FIX D1: concorrenza vera (due sessioni psql che committano) sul passaggio al banco di un ordine Food Club.
# DB clone <db>_p90 ricreato a ogni run. Barriera: S0 tiene un advisory lock esclusivo, X e Y lo chiedono in shared e
# partono insieme quando S0 lo lascia; l'ordine di partenza si alterna (ritardo 0-20 ms su X o su Y).
#   C10 switch || switch           (due richieste "Pago al banco")    -> ordine PCP, poi un solo incasso, buono usato 1 volta
#   C07 switch || confirm PAID     (PAID concorrente alla transizione)-> mai due incassi, buono usato 1 volta
#   C09 INCASSA || INCASSA         (doppio click staff)               -> un solo incasso
#   CR  INCASSA || rilascio buono  (ordine sigillato riportato al banco, P-A)
#        invariante: (incasso E buono used su questo ordine E nessun rilascio) oppure (nessun incasso E buono available)
#        nota: su un ordine riportato al banco il rilascio rifiuta sempre (order_not_closed); CR2 copre il lato opposto
#   CR2 INCASSA || rilascio buono  (ordine sigillato ancora abbandonato): il banco non passa mai, il rilascio si'
#   CP  INCASSA || confirm PAID    (ordine sigillato riportato al banco) -> un solo incasso, buono usato 1 volta
# Giudizio: fallisce su deadlock, violazione di invariante o errore inatteso.
# Uso: PGHOST=/tmp PGPORT=54329 tests/db/food-club/p90_d1_concorrenza.sh [db_migrato] [ripetizioni>=10]
set -uo pipefail
DB="${1:-walbox_fc_test}"; REPS="${2:-12}"; CDB="${DB}_p90"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
[ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}" ] || { echo "rifiuto: PGHOSTADDR/PGSERVICE impostati" >&2; exit 2; }
case "$DB" in ''|*[!A-Za-z0-9_]*) echo "rifiuto: nome DB non semplice ($DB)" >&2; exit 2;; esac
[ "$REPS" -ge 10 ] 2>/dev/null || { echo "rifiuto: servono almeno 10 ripetizioni" >&2; exit 2; }
export PGHOST PGPORT PGUSER
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
echo "== P90 concorrenza fix D1 (clone $CDB, $REPS ripetizioni per scenario, output in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
q -f "$HERE/00_helpers.sql" >/dev/null 2>&1
# Helper del test 90 (parte prima degli scenari), qui committati nel clone.
sed -n '1,/^-- D1-01\/02/p' "$HERE/90_d1_banco.sql" | q >/dev/null 2>"$OUT/setup.err" || { cat "$OUT/setup.err"; exit 1; }

fail=0
race() { # $1 nome, $2 rep, $3 sql X, $4 sql Y
  local n="$1" i="$2" dx=0 dy=0
  if [ $((i % 2)) -eq 0 ]; then dx="0.0$((i % 3))"; else dy="0.0$((i % 3))"; fi
  psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock(90901); SELECT pg_sleep(0.4);" >/dev/null 2>&1 &
  local s0=$!
  sleep 0.1
  ( sleep "$dx"; psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock_shared(90901);" -c "$3" ) >"$OUT/$n.$i.x" 2>&1 &
  local px=$!
  ( sleep "$dy"; psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock_shared(90901);" -c "$4" ) >"$OUT/$n.$i.y" 2>&1 &
  local py=$!
  wait $s0 $px $py
  if grep -qi "deadlock" "$OUT/$n.$i.x" "$OUT/$n.$i.y"; then echo "  FAIL $n rep $i: deadlock"; fail=1; fi
}
check() { # $1 nome, $2 rep, $3 sql invariante (deve restituire 't')
  local r; r=$(q -c "$3" 2>&1)
  if [ "$r" != "t" ]; then echo "  FAIL $1 rep $2: invariante violata ($r)"; fail=1; return 1; fi
}
errs() { grep -h "ERROR" "$OUT/$1".*.x "$OUT/$1".*.y 2>/dev/null | sed -E 's/.*ERROR: +//' | sort | uniq -c | sed 's/^/    /'; }

# Setup committato: ordine online Club, attempt SumUp fallito (sumup_failed). Stampa "o|v|a|staff".
mk_failed() { q -c "SELECT r.o || '|' || r.v || '|' || r.a || '|' || fc_test.new_staff() FROM fc_test.mk_online(true) r, LATERAL fc_test.fail_sumup(r.a) f;"; }
mk_sealed_counter() { q -c "SELECT r.o || '|' || r.v || '|' || r.a || '|' || fc_test.new_staff() FROM fc_test.mk_sealed(false) r, LATERAL fc_test.reopen_counter(r.o) x;"; }
mk_sealed_counter_claim() { q -c "SELECT r.o || '|' || r.v || '|' || r.a || '|' || fc_test.new_staff() FROM fc_test.mk_sealed(true) r, LATERAL fc_test.reopen_counter(r.o) x;"; }

ONE="fc_test.ok_charges(%s) = 1 AND fc_test.vev_to_used(%s) = 1 AND fc_test.vstatus(%s) = 'used'"

for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(mk_failed)
  race C10 "$i" "SELECT fc_test.switch('$o');" "SELECT fc_test.switch('$o');"
  q -c "SELECT fc_test.pay_counter('$o', '$s');" >/dev/null 2>&1
  check C10 "$i" "SELECT fc_test.ostatus('$o') = 'received|paid' AND $(printf "$ONE" "'$o'" "'$v'" "'$v'")
                  AND (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = '$o' AND to_status = 'pending_counter_payment') = 1"
done
echo "OK C10 switch || switch ($REPS rip.)"; errs C10

for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(q -c "SELECT r.o || '|' || r.v || '|' || r.a || '|' || fc_test.new_staff() FROM fc_test.mk_online(true) r;")
  race C07 "$i" "SELECT fc_test.switch('$o');" "SELECT fc_test.confirm('$a', 'co-$a');"
  q -c "SELECT fc_test.pay_counter('$o', '$s');" >/dev/null 2>&1
  check C07 "$i" "SELECT $(printf "$ONE" "'$o'" "'$v'" "'$v'") AND fc_test.ostatus('$o') = 'received|paid'"
done
echo "OK C07 switch || confirm PAID ($REPS rip.)"; errs C07

for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(mk_failed)
  q -c "SELECT fc_test.switch('$o');" >/dev/null
  race C09 "$i" "SELECT fc_test.pay_counter('$o', '$s');" "SELECT fc_test.pay_counter('$o', '$s', 'card_counter_manual');"
  check C09 "$i" "SELECT $(printf "$ONE" "'$o'" "'$v'" "'$v'")"
done
echo "OK C09 INCASSA || INCASSA ($REPS rip.)"; errs C09

for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(mk_sealed_counter)
  race CR "$i" "SELECT fc_test.pay_counter('$o', '$s');" "SELECT fc_test.release('$o');"
  check CR "$i" "SELECT (fc_test.ok_charges('$o') = 1 AND fc_test.vstatus('$v') = 'used' AND fc_test.vused_on('$v') = '$o'
                          AND fc_test.vev_to_used('$v') = 1 AND fc_test.vev('$v', 'released_after_checkout_evidence') = 0)
                      OR (fc_test.ok_charges('$o') = 0 AND fc_test.vstatus('$v') = 'available'
                          AND fc_test.vev('$v', 'released_after_checkout_evidence') = 1)"
  q -c "SELECT CASE WHEN fc_test.ok_charges('$o') = 1 THEN 'banco' ELSE 'rilascio' END" >>"$OUT/CR.winners"
done
echo "OK CR INCASSA || rilascio buono ($REPS rip.; vincitori: $(sort "$OUT/CR.winners" | uniq -c | tr -s ' ' | tr '\n' ' '))"; errs CR

# CR2: stesso duello su ordine sigillato ancora ABBANDONATO (P-A): qui il banco non puo' passare (guard Kitchen I2 o
# sigillo a buono restituito), il rilascio si'. Invariante identica a CR.
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(q -c "SELECT r.o || '|' || r.v || '|' || r.a || '|' || fc_test.new_staff() FROM fc_test.mk_sealed(false) r;")
  race CR2 "$i" "SELECT fc_test.pay_counter('$o', '$s');" "SELECT fc_test.release('$o');"
  check CR2 "$i" "SELECT fc_test.ok_charges('$o') = 0 AND fc_test.vstatus('$v') = 'available'
                         AND fc_test.vev('$v', 'released_after_checkout_evidence') = 1"
done
echo "OK CR2 INCASSA || rilascio su sigillato abbandonato ($REPS rip.)"; errs CR2

for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a s < <(mk_sealed_counter_claim)
  race CP "$i" "SELECT fc_test.pay_counter('$o', '$s');" "SELECT fc_test.confirm('$a', 'co-$a');"
  check CP "$i" "SELECT $(printf "$ONE" "'$o'" "'$v'" "'$v'")"
done
echo "OK CP INCASSA || confirm PAID su sigillato ($REPS rip.)"; errs CP

[ $fail -eq 0 ] && echo "P90 PASS" || echo "P90 FAIL"
exit $fail
