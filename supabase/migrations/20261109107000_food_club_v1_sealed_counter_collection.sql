-- WALRUS FOOD CLUB V1 — FIX D1 (2026-11-08): incasso al banco dello STESSO ordine dopo un pagamento SumUp non riuscito.
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`), insieme
-- alle altre migration 20261109*. Report: ai-ops/reports/food-club-d1-pay-at-counter-fix-2026-11-08.md
--
-- Regressione (introdotta in 20261109104000, "Fix D1 doppio sconto"): il trigger food_club_seal_guard_insert rifiutava
-- QUALSIASI nuovo charge su un ordine sigillato, incasso al banco compreso. Il sigillo nasce solo su ordini annullati o
-- abbandonati (payment_abandoned) con buono trattenuto. Kitchen incassa al banco un ordine abbandonato con
-- kitchen_payment_record_counter (stesso ordine, stessa comanda; test p1_abbandono_banco_poi_paid): con il Club, dopo il
-- sigillo, lo stesso incasso falliva con food_club_order_sealed anche quando il buono era ANCORA riservato su
-- quell'ordine, cioe' quando non c'era nessun doppio sconto possibile.
--
-- Correzione: ridefinita SOLO la funzione trigger Club food_club_seal_guard_insert() (stesso trigger, stesso WHEN).
-- Nessuna funzione/trigger kitchen_* toccata. Unica eccezione al sigillo, specifica per l'incasso al banco:
--   * charge del banco riuscito: channel 'counter', provider cash/manual, method cash/card_counter_manual, status
--     'succeeded' (e' esattamente la riga che inserisce kitchen_payment_record_counter);
--   * il buono del sigillo e' ancora 'reserved' su QUESTO ordine, verificato con il lock della riga buono (FOR UPDATE);
--   * nessuna prova SumUp PAID registrata per l'ordine (food_club_checkout_evidence): altrimenti e' un possibile
--     secondo incasso -> errore dedicato food_club_order_paid_evidence, nessuna scrittura.
-- Tutto il resto resta rifiutato con food_club_order_sealed: charge SumUp (nessun nuovo checkout), charge del banco non
-- riusciti, qualunque charge dopo che il buono e' tornato al cliente (P-A o rilascio manuale: doppio sconto).
--
-- Atomicita' e lock (ordine K4: righe charge -> ordine -> buono -> sigillo). kitchen_payment_record_counter tiene gia'
-- righe charge e riga ordine quando inserisce: il trigger aggiunge solo il lock del buono, dopo l'ordine (compatibile
-- K4). I rilasci (food_club_release_voucher_after_evidence, food_club_manager_resolve_held_voucher) prendono gli stessi
-- lock nello stesso ordine e ricontrollano buono 'reserved' e assenza di charge 'succeeded':
--   * banco prima: charge succeeded + buono 'used' (trigger T2 kitchen_payments_food_club_on_charge) -> rilascio
--     risponde already_used / not_reserved / charge_succeeded;
--   * rilascio prima: buono 'available' -> il trigger rifiuta il banco (food_club_order_sealed).
-- Il trigger e' VOLATILE e in READ COMMITTED: dopo l'attesa dei lock legge lo stato committato.
-- Doppi incassi: invariati i presidi Kitchen (indice unico kitchen_payments_one_succeeded_charge_per_order, record_counter
-- idempotente, confirm K2 che non crea un secondo incasso registrato).
--
-- ROLLBACK (manuale): ripristinare il corpo di food_club_seal_guard_insert() da 20261109104000 (sezione 4).

CREATE OR REPLACE FUNCTION public.food_club_seal_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seal       public.food_club_release_seals;
  v_voucher_id uuid;
BEGIN
  SELECT * INTO v_seal FROM public.food_club_release_seals s WHERE s.order_id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Unica eccezione: incasso riuscito al banco dello stesso ordine, finché il buono del sigillo è riservato qui.
  IF NEW.channel = 'counter'
     AND NEW.provider IN ('cash', 'manual')
     AND NEW.method IN ('cash', 'card_counter_manual')
     AND NEW.status = 'succeeded' THEN
    SELECT v.id INTO v_voucher_id
      FROM public.food_club_vouchers v
     WHERE v.id = v_seal.voucher_id
       AND v.status = 'reserved'
       AND v.reserved_order_id = NEW.order_id
       FOR UPDATE;
    IF v_voucher_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.food_club_checkout_evidence e
                  WHERE e.order_id = NEW.order_id AND upper(e.sumup_status) = 'PAID') THEN
        RAISE EXCEPTION 'food_club_order_paid_evidence';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'food_club_order_sealed';
END;
$$;

-- Permessi invariati rispetto a 20261109104000: funzione trigger, nessun ruolo di API la esegue.
REVOKE ALL ON FUNCTION public.food_club_seal_guard_insert() FROM PUBLIC, anon, authenticated, service_role;
