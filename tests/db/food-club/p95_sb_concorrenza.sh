#!/usr/bin/env bash
# FASE A SB: concorrenza vera (due sessioni psql che committano) tra registrazione di una prova SumUp PAID e rilascio
# del buono. DB clone <db>_p95 ricreato a ogni run. Barriera identica a p90_d1_concorrenza.sh: S0 tiene un advisory lock
# esclusivo, X e Y lo chiedono in shared e partono insieme quando S0 lo lascia; ritardo 0/15/30 ms dopo la barriera,
# alternato su X o Y (differenza da p90: li' il ritardo e' prima della connessione).
#   CE1 evidenza PAID || rilascio   P-A (checkout mai richiesto), costanti REALI (false/false/false, merchant NULL)
#   CE2 evidenza PAID || rilascio   P-B con prove PENDING/PENDING gia' sufficienti, costanti FORZATE a true NEL CLONE
#                                   (fixture: il clone e' buttato a ogni run; le migration restano spente)
#   CE3 evidenza PAID || evidenza PAID (notifica ripetuta), poi rilascio: paid_evidence, nessun rilascio
# Invariante CE1/CE2 per ripetizione: (buono available E 1 evento di rilascio) OPPURE (buono reserved E 0 eventi E
# last_reason = paid_evidence); la prova PAID e' sempre registrata; un rilascio successivo e' coerente (already_released
# oppure ancora paid_evidence). Fallisce su deadlock, invariante violata o errore inatteso.
# Nota: la registrazione di un'evidenza NON prende lock sulle righe del rilascio; il rilascio vede solo le prove
# committate prima delle sue letture. Se il rilascio vince, la PAID arriva "dopo" ed e' il caso PAID tardivo dopo
# rilascio (SB5): il buono non viene mai usato due volte (vedi 95_sb_simulations.sql SB5-S4, p3c C3).
# Uso: PGHOST=/tmp PGPORT=54329 tests/db/food-club/p95_sb_concorrenza.sh [db_migrato] [ripetizioni>=10]
set -uo pipefail
DB="${1:-walbox_fc_test}"; REPS="${2:-10}"; CDB="${DB}_p95"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
[ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}" ] || { echo "rifiuto: PGHOSTADDR/PGSERVICE impostati" >&2; exit 2; }
case "$DB" in ''|*[!A-Za-z0-9_]*) echo "rifiuto: nome DB non semplice ($DB)" >&2; exit 2;; esac
[ "$REPS" -ge 10 ] 2>/dev/null || { echo "rifiuto: servono almeno 10 ripetizioni" >&2; exit 2; }
export PGHOST PGPORT PGUSER
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
echo "== P95 concorrenza SB (clone $CDB, $REPS ripetizioni per scenario, output in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
q -f "$HERE/00_helpers.sql" >/dev/null 2>&1
sed -n '1,/^-- ==== FINE HELPER SB ====/p' "$HERE/95_sb_simulations.sql" | q >/dev/null 2>"$OUT/setup.err" || { cat "$OUT/setup.err"; exit 1; }

fail=0
race() { # $1 nome, $2 rep, $3 sql X, $4 sql Y
  local n="$1" i="$2" dx=0 dy=0
  # Ritardo DOPO la barriera (nella stessa sessione): 0 / 15 / 30 ms, alternato su X o Y. Con 0 ms e' una gara vera;
  # con 15-30 ms l'ordine e' forzato e vengono esercitati entrambi i rami dell'invariante.
  if [ $((i % 2)) -eq 0 ]; then dx="0.0$(( (i % 3) * 15 ))"; else dy="0.0$(( (i % 3) * 15 ))"; fi
  [ "$dx" = "0.00" ] && dx=0; [ "$dy" = "0.00" ] && dy=0
  psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock(95901); SELECT pg_sleep(0.4);" >/dev/null 2>&1 &
  local s0=$!
  sleep 0.1
  psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock_shared(95901);" -c "SELECT pg_sleep($dx);" -c "$3" >"$OUT/$n.$i.x" 2>&1 &
  local px=$!
  psql -qAtX -d "$CDB" -c "SELECT pg_advisory_lock_shared(95901);" -c "SELECT pg_sleep($dy);" -c "$4" >"$OUT/$n.$i.y" 2>&1 &
  local py=$!
  wait $s0 $px $py
  if grep -qi "deadlock" "$OUT/$n.$i.x" "$OUT/$n.$i.y"; then echo "  FAIL $n rep $i: deadlock"; fail=1; fi
  if grep -q "ERROR" "$OUT/$n.$i.x" "$OUT/$n.$i.y"; then echo "  FAIL $n rep $i: errore inatteso"; grep -h ERROR "$OUT/$n.$i.x" "$OUT/$n.$i.y" | sed 's/^/    /'; fail=1; fi
}
check() { # $1 nome, $2 rep, $3 sql invariante (deve restituire 't')
  local r; r=$(q -c "$3" 2>&1)
  if [ "$r" != "t" ]; then echo "  FAIL $1 rep $2: invariante violata ($r)"; fail=1; return 1; fi
}
INV="(fc_test.vstatus(%s) = 'available' AND fc_test.vev(%s, 'released_after_checkout_evidence') = 1)
  OR (fc_test.vstatus(%s) = 'reserved' AND fc_test.vev(%s, 'released_after_checkout_evidence') = 0
      AND (SELECT last_reason FROM public.food_club_release_seals WHERE order_id = %s) = 'paid_evidence')"
paid_ev() { echo "(SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = '$1' AND upper(sumup_status) = 'PAID')"; }
after() { # rilascio sequenziale dopo la gara: coerente con lo stato
  echo "SELECT CASE fc_test.vstatus('$2') WHEN 'available' THEN fc_test.release('$1') ->> 'result' = 'already_released'
                                         ELSE fc_test.release('$1') ->> 'reason' = 'paid_evidence' END"
}
winners() { q -c "SELECT CASE fc_test.vstatus('$2') WHEN 'available' THEN 'rilascio' ELSE 'paid' END" >>"$OUT/$1.winners"; }

# CE1: P-A, costanti reali
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a < <(q -c "SELECT r.o || '|' || r.v || '|' || r.a FROM fc_test.mk_sealed('A') r;")
  race CE1 "$i" "SELECT fc_test.rpc_evidence('$a', 'get', '{\"http_status\":200,\"sumup_status\":\"PAID\"}'::jsonb);" "SELECT fc_test.release('$o');"
  winners CE1 "$v"
  check CE1 "$i" "SELECT ($(printf "$INV" "'$v'" "'$v'" "'$v'" "'$v'" "'$o'")) AND $(paid_ev "$a") = 1"
  check CE1 "$i" "$(after "$o" "$v")"
done
echo "OK CE1 evidenza PAID || rilascio P-A ($REPS rip.; esiti: $(sort "$OUT/CE1.winners" | uniq -c | tr -s ' ' | tr '\n' ' '))"

# CE2: P-B con prove gia' sufficienti, costanti forzate nel clone
q -c "SELECT fc_test.rules_set(true, true, true, 'M-TEST');" >/dev/null
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a < <(q -c "SELECT r.o || '|' || r.v || '|' || r.a FROM fc_test.mk_sealed('B') r, LATERAL fc_test.std(r.a, 'PENDING', 'PENDING') s;")
  race CE2 "$i" "SELECT fc_test.rpc_evidence('$a', 'get', fc_test.gf('$a', 'PAID'));" "SELECT fc_test.release('$o');"
  winners CE2 "$v"
  check CE2 "$i" "SELECT ($(printf "$INV" "'$v'" "'$v'" "'$v'" "'$v'" "'$o'")) AND $(paid_ev "$a") = 1"
  check CE2 "$i" "$(after "$o" "$v")"
done
echo "OK CE2 evidenza PAID || rilascio P-B a regole forzate ($REPS rip.; esiti: $(sort "$OUT/CE2.winners" | uniq -c | tr -s ' ' | tr '\n' ' '))"

# CE3: notifica PAID ripetuta in parallelo, poi rilascio
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r o v a < <(q -c "SELECT r.o || '|' || r.v || '|' || r.a FROM fc_test.mk_sealed('B') r, LATERAL fc_test.std(r.a, 'PENDING', 'PENDING') s;")
  race CE3 "$i" "SELECT fc_test.rpc_evidence('$a', 'get', fc_test.gf('$a', 'PAID'));" "SELECT fc_test.rpc_evidence('$a', 'get', fc_test.gf('$a', 'PAID'));"
  check CE3 "$i" "SELECT fc_test.release('$o') ->> 'reason' = 'paid_evidence' AND $(paid_ev "$a") = 2 AND fc_test.vstatus('$v') = 'reserved'
                   AND fc_test.vev('$v', 'released_after_checkout_evidence') = 0"
done
echo "OK CE3 evidenza PAID || evidenza PAID, poi rilascio ($REPS rip.)"
q -c "SELECT fc_test.rules_set(false, false, false, NULL);" >/dev/null

[ $fail -eq 0 ] && echo "P95 PASS" || echo "P95 FAIL"
exit $fail
