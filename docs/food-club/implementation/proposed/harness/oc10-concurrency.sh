#!/usr/bin/env bash
# OC10 concorrenza Opzione C: due sessioni Postgres REALI in parallelo sul DB LOCALE (127.0.0.1:54322).
# Lanciato da run-oc-local.sh dopo i controlli di isolamento. I dati restano nello stack temporaneo (fermato a fine run).
#  C1 webhook tardivo PAID  vs  sblocco manuale del manager  -> buono usato una volta, mai tornato disponibile
#  C2 webhook tardivo PAID  vs  cliente che riusa lo stesso buono su un nuovo ordine -> riuso rifiutato, nessun doppio sconto
set -uo pipefail
case "${PGHOST:-}:${PGPORT:-}" in 127.0.0.1:54322) ;; *) echo "BLOCKED OC10: DB non locale"; exit 2;; esac
Q() { psql -qAtX -d postgres "$@"; }

Q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION fc_test.oc10_setup(p_code text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, p_code);
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id);
  RETURN m || '|' || v.id || '|' || a.order_id || '|' || a.id || '|' || fc_test.new_manager();
END $$;
SQL

late_confirm() {  # sessione A: conferma tardiva che tiene i lock per 2 secondi
  Q 2>&1 <<SQL
SELECT fc_test.as_service();
BEGIN;
SELECT (public.kitchen_payment_confirm('$1'::uuid, 'late-conc', '{}'::jsonb)).status;
SELECT pg_sleep(2);
COMMIT;
SQL
}

verdict() {  # $1 nome, $2 voucher, $3 ordine
  local res
  res=$(Q <<SQL
SELECT (SELECT status || '/' || COALESCE(used_order_id, '-') FROM public.food_club_vouchers WHERE id = '$2')
  || '|' || fc_test.oc_events('$2', 'used') || '|' || fc_test.oc_events('$2', 'available')
  || '|' || (SELECT count(DISTINCT order_id) FROM public.food_club_voucher_events WHERE voucher_id = '$2' AND event = 'reserved_on_order');
SQL
)
  if [ "$res" = "used/$3|1|0|1" ]; then echo "PASS  $1"; else echo "FAIL  $1"; echo "        atteso used/<ordine>|1 used|0 available|1 ordine; ottenuto $res"; fi
}

# C1
IFS='|' read -r M V O A MG <<<"$(Q -c "SELECT fc_test.oc10_setup('WC-OC10A')")"
late_confirm "$A" > "${TMPDIR:-/tmp}/oc10-c1-a.log" & PA=$!
sleep 0.5
B=$(Q 2>&1 <<SQL
SELECT fc_test.as_user('$MG');
SELECT public.food_club_admin_release_voucher('$O', 'conc');
SQL
)
wait $PA
echo "        sessione B (manager): $(echo "$B" | tail -1 | cut -c1-110)"
verdict "OC10-C1 webhook tardivo vs sblocco manager" "$V" "$O"

# C2
IFS='|' read -r M V O A MG <<<"$(Q -c "SELECT fc_test.oc10_setup('WC-OC10B')")"
late_confirm "$A" > "${TMPDIR:-/tmp}/oc10-c2-a.log" & PA=$!
sleep 0.5
B=$(Q 2>&1 <<SQL
SELECT (fc_test.order('$M', '[{"item_id":"item-010","quantity":1}]', 'counter', '$V')).id;
SQL
)
wait $PA
echo "        sessione B (riuso buono): $(echo "$B" | grep -E "ERROR|^order-" | head -1 | cut -c1-110)"
verdict "OC10-C2 webhook tardivo vs riuso del buono" "$V" "$O"
