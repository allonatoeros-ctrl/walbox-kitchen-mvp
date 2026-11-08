#!/usr/bin/env bash
# P3-C Passo 3A: concorrenza del rilascio sicuro del buono con sessioni psql REALI e separate, su un clone
# <db>_p3c ricreato a ogni run (lasciato li'). Ruoli reali: le RPC girano con SET ROLE service_role / authenticated.
#
# Meccaniche (come p7d):
#   M1 "barriera": S0 tiene un advisory lock esclusivo; X e Y lo chiedono in shared e partono insieme quando S0 lo
#      lascia; l'ordine di partenza e' alternato (ritardo di 0-20 ms su X o su Y a ripetizioni alterne).
#   M2 "coda":     S0 tiene i lock REALI (righe charge poi ordine, ordine K4) per 1,5 s; X, Y (e Z) arrivano a 0,4 / 0,8
#      / 1,2 s e restano in coda; l'ordine di arrivo si inverte (o ruota, a 3) a ogni ripetizione. Con M2 la claim
#      aspetta il lock di riga MENTRE il sigillo committa: prova che il trigger B vede il sigillo (READ COMMITTED).
# Giudizio per ripetizione: fallisce con deadlock, lock_timeout (dove non previsto), violazione degli invarianti
# (p3c.verdict), errori di permesso. Gli altri ERROR (errori di dominio attesi) sono elencati.
#   C1  rilascio(+sigillo) || claim      invariante: mai claim riuscita E buono rilasciato; mai claim dopo il sigillo
#   C1b come C1 con M2 (claim in attesa del lock di riga mentre il sigillo committa)
#   C2  sigillo || attempt_start         (ordine chiuso e variante "riaperto"); nessun charge SumUp dopo il sigillo
#   C3  rilascio || confirm PAID         mai buono available con charge succeeded senza reclaimed/consumed
#   C4  rilascio || rilascio             un solo evento di rilascio
#   C5  sigillo || claim || confirm      permutazioni di arrivo a rotazione, zero deadlock
#   C6  sigillo || cancel_with_payment_attempt
#   C7  sigillo || refund (ordine pagato) / rilascio || refund (late PAID su ordine sigillato)
#   S21 lock_timeout: una sessione Kitchen tiene i lock; la RPC Club rinuncia (lock timeout ~2 s), Kitchen prosegue
# Per arrivare al rilascio si usa P-A (checkout mai richiesto): non richiede le costanti di verifica, quindi NESSUN
# override delle costanti e' usato (nel clone restano false/false/false e merchant NULL).
# Uso: PGHOST=/socket PGPORT=54329 tests/db/food-club/p3c_release_concorrenza.sh [db_migrato_con_helper_fc_test] [ripetizioni>=10]
set -uo pipefail
DB="${1:-walbox_fc_test}"; REPS="${2:-12}"; CDB="${DB}_p3c"
: "${PGHOST:=/tmp}" ; : "${PGPORT:=54329}" ; : "${PGUSER:=postgres}"
case "$PGHOST" in /*|127.0.0.1|localhost) ;; *) echo "rifiuto: PGHOST non locale ($PGHOST)" >&2; exit 2;; esac
[ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}" ] || { echo "rifiuto: PGHOSTADDR/PGSERVICE impostati" >&2; exit 2; }
case "$DB" in ''|*[!A-Za-z0-9_]*) echo "rifiuto: nome DB non semplice ($DB)" >&2; exit 2;; esac
[ "$REPS" -ge 10 ] 2>/dev/null || { echo "rifiuto: servono almeno 10 ripetizioni" >&2; exit 2; }
export PGHOST PGPORT PGUSER
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${P3C_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
echo "== P3-C concorrenza rilascio buono (DB clone $CDB, >= $REPS ripetizioni per scenario, output sessioni in $OUT) =="
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $CDB WITH (FORCE)" -c "CREATE DATABASE $CDB TEMPLATE $DB" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$CDB" "$@"; }
q -f "$HERE/00_helpers.sql" >/dev/null 2>&1
q -c "SELECT fc_test.activate_campaign()" >/dev/null || exit 1

q >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS p3c;
-- Ordine online con buono + attempt SumUp 'initiated'.
--   abandon    = chiuso con kitchen_order_mark_payment_abandoned REALE (attempt failed/abandoned_timeout)
--   raw_cancel = annullo "vecchio stile" (UPDATE status): attempt ancora initiated, mai richiesto (fixture)
--   none       = ordine ancora aperto (POP)
-- Poi l'ordine e' invecchiato a 18 minuti (fixture: session_replication_role = replica, solo created_at).
CREATE OR REPLACE FUNCTION p3c.mk(p_close text, OUT m uuid, OUT s uuid, OUT v uuid, OUT o text, OUT a uuid, OUT t numeric)
LANGUAGE plpgsql AS $$
DECLARE ord public.kitchen_orders;
BEGIN
  -- Fixture: il tetto di 20 rilasci/24 h (provato in 60_release.sql S20) non deve falsare la concorrenza: gli eventi
  -- di rilascio dei giri precedenti vengono spostati fuori dalla finestra di 24 h (solo nel clone).
  UPDATE public.food_club_voucher_events SET created_at = created_at - interval '2 days'
   WHERE event = 'released_after_checkout_evidence' AND created_at > now() - interval '1 day';
  m := fc_test.new_member(); s := fc_test.new_staff();
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), m, 'visite-v1', 'manual', 5, 12, now() + interval '10 days') RETURNING id INTO v;
  ord := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  o := ord.id; t := ord.total;
  a := (fc_test.start_online(o)).id;
  IF p_close = 'abandon' THEN
    PERFORM fc_test.backdate(o, now() - interval '6 minutes');
    PERFORM fc_test.as_service();
    PERFORM public.kitchen_order_mark_payment_abandoned(o);
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.kitchen_orders SET created_at = now() - interval '18 minutes' WHERE id = o;
  UPDATE public.kitchen_payments SET created_at = now() - interval '18 minutes' WHERE order_id = o;
  PERFORM set_config('session_replication_role', 'origin', true);
  IF p_close = 'raw_cancel' THEN UPDATE public.kitchen_orders SET status = 'cancelled' WHERE id = o; END IF;
END $$;

-- Ordine abbandonato E sigillato (sigillo reale, ruolo service_role).
CREATE OR REPLACE FUNCTION p3c.mk_sealed(OUT m uuid, OUT s uuid, OUT v uuid, OUT o text, OUT a uuid, OUT t numeric)
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SELECT x.m, x.s, x.v, x.o, x.a, x.t INTO m, s, v, o, a, t FROM p3c.mk('abandon') x;
  PERFORM fc_test.as_service();
  EXECUTE 'SET LOCAL ROLE service_role';
  r := public.food_club_seal_order_for_release(o);
  EXECUTE 'RESET ROLE';
  IF (r ->> 'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'p3c.mk_sealed: sigillo rifiutato %', r; END IF;
END $$;

-- Invarianti finali. Ritorna 'ok:<riassunto>' oppure 'VIOL:<cosa>|<riassunto>'.
CREATE OR REPLACE FUNCTION p3c.verdict(p_o text, p_v uuid, p_a uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_claim timestamptz; v_st text; v_rel int; v_succ int; v_seal timestamptz; v_late int; v_sum text; v_viol text := '';
BEGIN
  SELECT checkout_claim_at INTO v_claim FROM public.kitchen_payments WHERE id = p_a;
  SELECT status INTO v_st FROM public.food_club_vouchers WHERE id = p_v;
  SELECT count(*) INTO v_rel FROM public.food_club_voucher_events WHERE voucher_id = p_v AND event = 'released_after_checkout_evidence';
  SELECT count(*) INTO v_succ FROM public.kitchen_payments WHERE order_id = p_o AND direction = 'charge' AND status = 'succeeded';
  SELECT sealed_at INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_o;
  SELECT count(*) INTO v_late FROM public.kitchen_payments p JOIN public.food_club_release_seals s ON s.order_id = p.order_id
   WHERE p.order_id = p_o AND p.provider = 'sumup' AND p.direction = 'charge' AND p.created_at > s.sealed_at;
  IF v_claim IS NOT NULL AND v_rel > 0 THEN v_viol := v_viol || 'claim_e_rilascio;'; END IF;
  IF v_claim IS NOT NULL AND v_seal IS NOT NULL AND v_claim > v_seal THEN v_viol := v_viol || 'claim_dopo_sigillo;'; END IF;
  IF v_late > 0 THEN v_viol := v_viol || 'charge_sumup_dopo_sigillo;'; END IF;
  IF v_succ > 0 AND v_st IS DISTINCT FROM 'used' THEN v_viol := v_viol || 'incassato_ma_buono_' || v_st || ';'; END IF;
  IF v_st = 'available' AND v_rel = 0 THEN v_viol := v_viol || 'available_senza_evento;'; END IF;
  IF v_rel > 1 THEN v_viol := v_viol || 'rilasci_multipli;'; END IF;
  IF v_succ > 1 THEN v_viol := v_viol || 'piu_charge_succeeded;'; END IF;
  v_sum := format('claim=%s seal=%s buono=%s rilasci=%s incassi=%s', (v_claim IS NOT NULL)::int, (v_seal IS NOT NULL)::int, v_st, v_rel, v_succ);
  RETURN CASE WHEN v_viol = '' THEN 'ok:' || v_sum ELSE 'VIOL:' || v_viol || '|' || v_sum END;
END $$;
SQL
[ $? -eq 0 ] || { echo "FAIL: helper p3c non creati"; exit 1; }

sess() { ( PGAPPNAME="$1" psql -qAtX -d "$CDB" >"$OUT/$2.out" 2>&1 <<<"$3"; echo "rc=$?" >>"$OUT/$2.out" ) & }
SVC="SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}', false); SET ROLE service_role;"
lockrows() { # lock reali K4: righe charge ORDER BY id poi ordine, tenuti $2 secondi
  echo "BEGIN; SELECT 1 FROM public.kitchen_payments WHERE order_id='$1' AND direction='charge' ORDER BY id FOR UPDATE; SELECT 1 FROM public.kitchen_orders WHERE id='$1' FOR UPDATE; SELECT pg_sleep($2); COMMIT;"; }
lockorder() { echo "BEGIN; SELECT 1 FROM public.kitchen_orders WHERE id='$1' FOR UPDATE; SELECT pg_sleep($2); COMMIT;"; }
f_seal()    { echo "$SVC SELECT 'seal ->', public.food_club_seal_order_for_release('$1');"; }
f_release() { echo "$SVC SELECT 'release ->', public.food_club_release_voucher_after_evidence('$1');"; }
f_sealrel() { echo "$SVC SELECT 'seal ->', public.food_club_seal_order_for_release('$1'); SELECT 'release ->', public.food_club_release_voucher_after_evidence('$1');"; }
f_claim()   { echo "$SVC SELECT 'claim ->', c.id IS NOT NULL FROM public.kitchen_payment_attempt_claim_checkout('$1') c;"; }
f_confirm() { echo "$SVC SELECT 'confirm ->', status FROM public.kitchen_payment_confirm('$1','sumup-p3c-$1','{}'::jsonb);"; }
f_cancel()  { echo "SELECT fc_test.as_user('$2'); SET ROLE authenticated; SELECT 'cancel ->', status FROM public.kitchen_order_cancel_with_payment_attempt('$1','p3c');"; }
f_start()   { echo "SELECT fc_test.as_user('$2'); SET ROLE authenticated; SELECT 'attempt_start ->', status FROM public.kitchen_payment_attempt_start('$1','app','sumup','sumup_online',$3,'k-p3c-$RANDOM$RANDOM');"; }
f_refund()  { echo "SELECT 'refund ->', 'ok' FROM (SELECT fc_test.refund('$1','$2')) x;"; }

barrier_pair() { # $1 etichetta, $2 sql X, $3 sql Y, $4 rep: X e Y partono insieme; ritardo 0-20 ms su X (rep dispari) o su Y (pari)
  local t="$1" i="$4" dx=0 dy=0
  local jit=(0.02 0.005 0.01 0.002 0.015 0.0)
  if [ $((i % 2)) = 1 ]; then dx=${jit[$((i % 6))]}; else dy=${jit[$((i % 6))]}; fi
  sess S0 "s0_$t" "SELECT pg_advisory_lock(7331); SELECT pg_sleep(1.0); SELECT pg_advisory_unlock(7331);"
  sess SX "x_$t" "SELECT pg_sleep(0.3); SELECT pg_advisory_lock_shared(7331); SELECT pg_advisory_unlock_shared(7331); SELECT pg_sleep($dx); $2"
  sess SY "y_$t" "SELECT pg_sleep(0.3); SELECT pg_advisory_lock_shared(7331); SELECT pg_advisory_unlock_shared(7331); SELECT pg_sleep($dy); $3"
}
fail=0
bump() { echo x >> "$OUT/cnt_$1_$2"; }              # contatore su file (bash 3.2 senza array associativi)
cnt() { [ -f "$OUT/cnt_$1_$2" ] && wc -l < "$OUT/cnt_$1_$2" | tr -d ' ' || echo 0; }

# judge <scenario> <rep> <order> <voucher> <attempt> <file...> : accumula lock/deadlock/violazioni/errori/istogramma
judge() {
  local SC="$1" i="$2" O="$3" V="$4" A="$5"; shift 5
  local LK ER VD UNEXP EX
  LK=$(grep -ilE 'deadlock|lock timeout|lock_not_available' "$@" 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')
  ER=$(for f in "$@"; do grep -h '^ERROR' "$f" | sed -E "s/^ERROR: +//"; done | sed -E 's/[0-9a-f]{8}-[0-9a-f-]{27}/<id>/g; s/order-[0-9a-f-]+/<ord>/g' | sort | uniq -c | sed -E 's/^ +//' | tr '\n' ';')
  UNEXP=$(for f in "$@"; do grep -hE 'permission denied|service_role_only|does not exist|syntax error' "$f"; done | head -1)
  VD=$(q -c "SELECT p3c.verdict('$O','$V','$A')")
  [ -n "$LK" ] && bump lk "$SC"
  case "$VD" in VIOL*) bump vio "$SC";; esac
  [ -n "$UNEXP" ] && bump unx "$SC"
  EX=$(grep -h -- '->' "$@" 2>/dev/null | sed -E 's/\{.*"reason": "([A-Za-z_:]+)".*\}/{reason=\1}/; s/\{"ok": true, "sealed_at".*/{sigillato}/; s/\{"ok": true, "released": true.*/{rilasciato}/; s/\{"ok": true, "already_sealed": true.*/{gia_sigillato}/' | tr '\n' ' ')
  echo "   $SC.$i | ${LK:--} | ${ER:--} | $VD | $EX"
  echo "$VD" | sed -E 's/\|.*//' >> "$OUT/hist_$SC"
}
summary() { # $1 scenario $2 reps
  local SC="$1" n="$2" l v u
  l=$(cnt lk "$SC"); v=$(cnt vio "$SC"); u=$(cnt unx "$SC")
  echo "  RIEPILOGO $SC: $n ripetizioni, deadlock/lock_timeout=$l, violazioni invarianti=$v, errori inattesi=$u"
  [ "$l" = 0 ] && [ "$v" = 0 ] && [ "$u" = 0 ] || fail=1
}
hist() { [ -f "$OUT/hist_$1" ] && sort "$OUT/hist_$1" | uniq -c | sed -E 's/^ +/     esiti finali: /; s/ ok:/ /'; }

echo "-- C1 rilascio(+sigillo) || claim (M1 barriera). Colonne: rip | deadlock/lock_timeout | ERROR di dominio | verdetto | esiti"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('raw_cancel')")
  barrier_pair "c1_$i" "$(f_sealrel "$O")" "$(f_claim "$A")" "$i"; wait
  judge C1 "$i" "$O" "$V" "$A" "$OUT/x_c1_$i.out" "$OUT/y_c1_$i.out"
done
hist C1; summary C1 "$REPS"

echo "-- C1b rilascio(+sigillo) || claim (M2 coda: la claim aspetta il lock di riga mentre il sigillo committa)"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('raw_cancel')")
  dx=0.4; dy=0.8; [ $((i % 2)) = 0 ] && { dx=0.8; dy=0.4; }
  sess S0 "s0_c1b_$i" "$(lockrows "$O" 1.5)"
  sess SX "x_c1b_$i" "SELECT pg_sleep($dx); $(f_sealrel "$O")"
  sess SY "y_c1b_$i" "SELECT pg_sleep($dy); $(f_claim "$A")"
  wait
  judge C1b "$i" "$O" "$V" "$A" "$OUT/x_c1b_$i.out" "$OUT/y_c1b_$i.out"
done
hist C1b; summary C1b "$REPS"

echo "-- C2 sigillo || attempt_start (M2, il holder tiene l'ordine; pari: ordine chiuso, dispari: ordine 'riaperto' in cucina)"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('raw_cancel')")
  # fixture: l'attempt non e' piu' "vivo" (scaduto lato SumUp), cosi' attempt_start INSERISCE davvero una nuova riga
  q -c "UPDATE public.kitchen_payments SET status='failed', failure_reason='sumup_expired' WHERE id='$A'" >/dev/null
  [ $((i % 2)) = 1 ] && q -c "UPDATE public.kitchen_orders SET status='received' WHERE id='$O'" >/dev/null   # fixture: riapertura
  dx=0.4; dy=0.8; [ $((i % 4)) -ge 2 ] && { dx=0.8; dy=0.4; }
  sess S0 "s0_c2_$i" "$(lockorder "$O" 1.5)"
  sess SX "x_c2_$i" "SELECT pg_sleep($dx); $(f_seal "$O")"
  sess SY "y_c2_$i" "SELECT pg_sleep($dy); $(f_start "$O" "$M" "$T")"
  wait
  judge C2 "$i" "$O" "$V" "$A" "$OUT/x_c2_$i.out" "$OUT/y_c2_$i.out"
done
hist C2; summary C2 "$REPS"
echo "     payments_changed visti in C2 (sigillo che rinuncia perche' attempt_start ha inserito): $(cat "$OUT"/x_c2_*.out | grep -c payments_changed)"

echo "-- C3 rilascio || confirm PAID (M1 barriera e M2 coda alternati)"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk_sealed()")
  if [ $((i % 2)) = 1 ]; then
    barrier_pair "c3_$i" "$(f_release "$O")" "$(f_confirm "$A")" "$i"
  else
    dx=0.4; dy=0.8; [ $((i % 4)) = 0 ] && { dx=0.8; dy=0.4; }
    sess S0 "s0_c3_$i" "$(lockrows "$O" 1.5)"
    sess SX "x_c3_$i" "SELECT pg_sleep($dx); $(f_release "$O")"
    sess SY "y_c3_$i" "SELECT pg_sleep($dy); $(f_confirm "$A")"
  fi
  wait
  judge C3 "$i" "$O" "$V" "$A" "$OUT/x_c3_$i.out" "$OUT/y_c3_$i.out"
done
hist C3; summary C3 "$REPS"

echo "-- C4 rilascio || rilascio (M1 e M2 alternati)"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk_sealed()")
  if [ $((i % 2)) = 1 ]; then
    barrier_pair "c4_$i" "$(f_release "$O")" "$(f_release "$O")" "$i"
  else
    sess S0 "s0_c4_$i" "$(lockrows "$O" 1.5)"
    sess SX "x_c4_$i" "SELECT pg_sleep(0.4); $(f_release "$O")"
    sess SY "y_c4_$i" "SELECT pg_sleep(0.8); $(f_release "$O")"
  fi
  wait
  judge C4 "$i" "$O" "$V" "$A" "$OUT/x_c4_$i.out" "$OUT/y_c4_$i.out"
  N=$(q -c "SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id='$V' AND event='released_after_checkout_evidence'")
  [ "$N" = 1 ] || { echo "     C4.$i: eventi di rilascio = $N (atteso 1)"; bump vio C4; }
done
hist C4; summary C4 "$REPS"

echo "-- C5 sigillo+rilascio || claim || confirm (M2, 6 permutazioni di arrivo a rotazione)"
PERMS=("0.4 0.8 1.2" "0.4 1.2 0.8" "0.8 0.4 1.2" "0.8 1.2 0.4" "1.2 0.4 0.8" "1.2 0.8 0.4")
N5=$(( REPS < 12 ? 12 : REPS ))
for i in $(seq 1 "$N5"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('raw_cancel')")
  read -r d1 d2 d3 <<<"${PERMS[$(( (i - 1) % 6 ))]}"
  sess S0 "s0_c5_$i" "$(lockrows "$O" 1.7)"
  sess SX "x_c5_$i" "SELECT pg_sleep($d1); $(f_sealrel "$O")"
  sess SY "y_c5_$i" "SELECT pg_sleep($d2); $(f_claim "$A")"
  sess SZ "z_c5_$i" "SELECT pg_sleep($d3); $(f_confirm "$A")"
  wait
  judge C5 "$i" "$O" "$V" "$A" "$OUT/x_c5_$i.out" "$OUT/y_c5_$i.out" "$OUT/z_c5_$i.out"
done
hist C5; summary C5 "$N5"

echo "-- C6 sigillo || cancel_with_payment_attempt (ordine aperto invecchiato; M2 con holder sull'ordine)"
for i in $(seq 1 "$REPS"); do
  IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('none')")
  dx=0.4; dy=0.8; [ $((i % 2)) = 0 ] && { dx=0.8; dy=0.4; }
  sess S0 "s0_c6_$i" "$(lockrows "$O" 1.5)"
  sess SX "x_c6_$i" "SELECT pg_sleep($dx); $(f_seal "$O")"
  sess SY "y_c6_$i" "SELECT pg_sleep($dy); $(f_cancel "$O" "$S")"
  wait
  judge C6 "$i" "$O" "$V" "$A" "$OUT/x_c6_$i.out" "$OUT/y_c6_$i.out"
  ST=$(q -c "SELECT status FROM public.kitchen_orders WHERE id='$O'")
  [ "$ST" = cancelled ] || { echo "     C6.$i: ordine non annullato ($ST)"; bump vio C6; }
  SL=$(q -c "SELECT count(*) FROM public.food_club_release_seals WHERE order_id='$O'")
  VS=$(q -c "SELECT status FROM public.food_club_vouchers WHERE id='$V'")
  [ "$VS" = reserved ] || { echo "     C6.$i: buono non trattenuto ($VS)"; bump vio C6; }
  echo "     C6.$i: ordine=$ST sigillo=$SL buono=$VS"
done
hist C6; summary C6 "$REPS"

echo "-- C7 sigillo || refund su ordine pagato (dispari)  /  rilascio || refund su late PAID sigillato (pari)"
for i in $(seq 1 "$REPS"); do
  if [ $((i % 2)) = 1 ]; then
    IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('none')")
    q >/dev/null <<SQL
SELECT fc_test.as_service(); SELECT status FROM public.kitchen_payment_confirm('$A','sumup-p3c-$A','{}'::jsonb);
SQL
    FX="$(f_seal "$O")"
  else
    IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk_sealed()")
    q >/dev/null <<SQL
SELECT fc_test.as_service(); SELECT status FROM public.kitchen_payment_confirm('$A','sumup-p3c-$A','{}'::jsonb);
SQL
    FX="$(f_release "$O")"
  fi
  dx=0.4; dy=0.8; [ $((i % 4)) -ge 2 ] && { dx=0.8; dy=0.4; }
  sess S0 "s0_c7_$i" "$(lockrows "$O" 1.5)"
  sess SX "x_c7_$i" "SELECT pg_sleep($dx); $FX"
  sess SY "y_c7_$i" "SELECT pg_sleep($dy); $(f_refund "$O" "$S")"
  wait
  judge C7 "$i" "$O" "$V" "$A" "$OUT/x_c7_$i.out" "$OUT/y_c7_$i.out"
  grep -q 'refund -> *|* *ok' "$OUT/y_c7_$i.out" || grep -q 'refund ->|ok' "$OUT/y_c7_$i.out" || { echo "     C7.$i: refund non riuscito: $(grep -h ERROR "$OUT/y_c7_$i.out" | head -1)"; bump vio C7; }
done
hist C7; summary C7 "$REPS"

echo "-- S21 lock_timeout: Kitchen tiene i lock reali 3,5 s (confirm PAID tardivo); la RPC Club parte a 0,5 s e deve rinunciare (~2 s), Kitchen non rallenta"
S21BAD=0
for i in $(seq 1 10); do
  if [ $((i % 2)) = 1 ]; then
    IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk_sealed()"); RPC="$(f_release "$O")"
  else
    IFS='|' read -r M S V O A T < <(q -c "SELECT m||'|'||s||'|'||v||'|'||o||'|'||a||'|'||t FROM p3c.mk('abandon')"); RPC="$(f_seal "$O")"
  fi
  sess K "k_s21_$i" "SELECT extract(epoch FROM clock_timestamp())::numeric(14,3) AS k0; $SVC BEGIN; SELECT 'confirm ->', status FROM public.kitchen_payment_confirm('$A','sumup-p3c-$A','{}'::jsonb); SELECT pg_sleep(3.5); COMMIT; RESET ROLE; SELECT extract(epoch FROM clock_timestamp())::numeric(14,3) AS k1;"
  sess X "x_s21_$i" "SELECT pg_sleep(0.5); SELECT extract(epoch FROM clock_timestamp())::numeric(14,3) AS x0; $RPC SELECT extract(epoch FROM clock_timestamp())::numeric(14,3) AS x1;"
  wait
  X0=$(grep -E '^[0-9]+\.[0-9]+$' "$OUT/x_s21_$i.out" | sed -n 1p); X1=$(grep -E '^[0-9]+\.[0-9]+$' "$OUT/x_s21_$i.out" | sed -n 2p)
  K0=$(grep -E '^[0-9]+\.[0-9]+$' "$OUT/k_s21_$i.out" | sed -n 1p); K1=$(grep -E '^[0-9]+\.[0-9]+$' "$OUT/k_s21_$i.out" | sed -n 2p)
  WAITX=$(echo "$X1 - $X0" | bc -l 2>/dev/null); KDUR=$(echo "$K1 - $K0" | bc -l 2>/dev/null)
  TO=$(grep -ciE 'lock timeout' "$OUT/x_s21_$i.out"); DL=$(cat "$OUT"/x_s21_$i.out "$OUT"/k_s21_$i.out | grep -ciE 'deadlock')
  KOK=$(grep -c 'confirm ->|' "$OUT/k_s21_$i.out")
  VS=$(q -c "SELECT status FROM public.food_club_vouchers WHERE id='$V'")
  AFTER=$(q -c "SELECT count(*) FROM public.kitchen_payments WHERE order_id='$O' AND status='succeeded'")
  ok=1
  [ "$TO" -ge 1 ] || ok=0
  [ "$DL" = 0 ] || ok=0
  [ "$KOK" = 1 ] || ok=0
  [ "$VS" = used ] && [ "$AFTER" = 1 ] || ok=0
  awk -v w="${WAITX:-0}" 'BEGIN{exit !(w>1.7 && w<2.8)}' || ok=0
  awk -v k="${KDUR:-99}" 'BEGIN{exit !(k<4.2)}' || ok=0
  [ $ok = 1 ] || S21BAD=$((S21BAD+1))
  echo "   S21.$i | $([ $((i % 2)) = 1 ] && echo release || echo seal) | club: lock timeout=$TO attesa=${WAITX:-?}s | kitchen: confirm ok=$KOK durata=${KDUR:-?}s | buono=$VS incassi=$AFTER | $([ $ok = 1 ] && echo ok || echo FUORI-ATTESO)"
done
echo "  RIEPILOGO S21: 10 ripetizioni, fuori atteso=$S21BAD"
[ "$S21BAD" = 0 ] || fail=1

X=$(q -c "SELECT count(*) FROM (SELECT order_id FROM public.kitchen_payments WHERE direction='charge' AND status='succeeded' GROUP BY order_id HAVING count(*) > 1) d")
echo "  EVID ordini con piu' di 1 charge succeeded nel clone: $X"
[ "$X" = 0 ] || fail=1
Y=$(q -c "SELECT count(*) FROM (SELECT voucher_id FROM public.food_club_voucher_events WHERE event='released_after_checkout_evidence' GROUP BY voucher_id HAVING count(*) > 1) d")
echo "  EVID buoni con piu' di 1 evento di rilascio nel clone: $Y"
[ "$Y" = 0 ] || fail=1
[ $fail -eq 0 ] && echo "P3-C: OK" || echo "P3-C: FAIL"
exit $fail
