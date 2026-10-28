-- Kitchen Orders — RITIRO AL WALRUS con orario (pickup_slot) + RPC cliente v3.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Apply = decisione di Eros, solo con
-- `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md` §5.1). Richiesta di Eros del
-- 2026-10-28 (report `ai-ops/reports/menu-update-ottobre.md`): terza scelta nel checkout
-- "RITIRO AL WALRUS" con orario a fasce di 15 minuti, 12:00-14:30 (pranzo) e 18:00-22:30 (sera).
--
-- MODELLO
--   Un ritiro e' un ordine `fulfillment_type = 'takeaway'` con `pickup_slot` valorizzato
--   ('HH:MM', ora di Roma, giorno di servizio dell'ordine). Nessun nuovo valore di
--   fulfillment_type: il vincolo CHECK esistente (20260913130000) e il codice live non cambiano.
--   PORTO VIA = takeaway senza orario (come oggi).
--
-- COSA FA
--   1. Colonna `kitchen_orders.pickup_slot text NULL` + CHECK di formato e fasce ammesse.
--   2. `kitchen_customer_create_order_v3(...)`: stessi argomenti della v2 + `p_pickup_slot`.
--      Valida l'orario (solo con takeaway, fascia ammessa, non gia' passato), poi DELEGA alla v2
--      (nessuna copia della logica di catalogo/prezzo/idempotenza) e scrive `pickup_slot`
--      sull'ordine restituito. Retry con lo stesso client_request_id: la v2 restituisce l'ordine
--      esistente, l'orario si scrive solo se ancora vuoto (vince il primo, come la v2).
--   La v2 resta invariata: il frontend la usa ancora per MANGIO QUI / PORTO VIA.
--
-- COMPATIBILITA'
--   Additiva: colonna nullable, nuova funzione. Il frontend in produzione non la conosce e
--   continua a funzionare. Gli UPDATE di pickup_slot non cambiano status: i trigger su
--   kitchen_orders (lifecycle guard, ready identity, ready push) li ignorano.
--
-- SICUREZZA
--   SECURITY DEFINER con search_path fisso; la guardia `auth.uid()` e' nella v2 (la chiamata
--   annidata eredita i claim della richiesta) ed e' ripetuta qui prima di ogni scrittura.
--   EXECUTE revocato a PUBLIC/anon, concesso a authenticated (stesso schema della v2).
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text);
--   ALTER TABLE public.kitchen_orders DROP CONSTRAINT IF EXISTS kitchen_orders_pickup_slot_check;
--   ALTER TABLE public.kitchen_orders DROP COLUMN IF EXISTS pickup_slot;

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS pickup_slot text;

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_pickup_slot_check;

-- Fasce: 12:00-14:30 e 18:00-22:30, minuti 00/15/30/45.
ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_pickup_slot_check CHECK (
    pickup_slot IS NULL
    OR pickup_slot ~ '^(1[2-3]:(00|15|30|45)|14:(00|15|30)|(1[89]|2[01]):(00|15|30|45)|22:(00|15|30))$'
  );

CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order_v3(
  p_venue_id text,
  p_nickname text,
  p_customer_note text,
  p_items jsonb,
  p_fulfillment_type text,
  p_payment_lane text,
  p_client_request_id uuid DEFAULT NULL,
  p_pickup_slot text DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.kitchen_orders;
  v_now_rome time := timezone('Europe/Rome', now())::time;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'customer_session_required';
  END IF;

  IF p_pickup_slot IS NOT NULL THEN
    IF p_fulfillment_type IS DISTINCT FROM 'takeaway' THEN
      RAISE EXCEPTION 'invalid_pickup_slot';
    END IF;
    IF p_pickup_slot !~ '^(1[2-3]:(00|15|30|45)|14:(00|15|30)|(1[89]|2[01]):(00|15|30|45)|22:(00|15|30))$' THEN
      RAISE EXCEPTION 'invalid_pickup_slot';
    END IF;
    -- Orario gia' passato (10 minuti di tolleranza per orologi del telefono e checkout lenti).
    IF p_pickup_slot::time < v_now_rome - interval '10 minutes' THEN
      RAISE EXCEPTION 'pickup_slot_in_past';
    END IF;
  END IF;

  v_order := public.kitchen_customer_create_order_v2(
    p_venue_id, p_nickname, p_customer_note, p_items,
    p_fulfillment_type, p_payment_lane, p_client_request_id
  );

  IF p_pickup_slot IS NOT NULL AND v_order.pickup_slot IS NULL THEN
    UPDATE public.kitchen_orders
       SET pickup_slot = p_pickup_slot
     WHERE id = v_order.id
       AND customer_id = auth.uid()
    RETURNING * INTO v_order;
  END IF;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- VERIFICHE per il Gate 2 (da eseguire a mano, NON parte della migration)
--
-- V1  Colonna e vincolo:
--     select column_name, data_type, is_nullable from information_schema.columns
--      where table_name = 'kitchen_orders' and column_name = 'pickup_slot';
--     select conname from pg_constraint where conname = 'kitchen_orders_pickup_slot_check';
--
-- V2  Grant (attesi: anon false, authenticated true):
--     select has_function_privilege('anon', 'public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text)', 'EXECUTE'),
--            has_function_privilege('authenticated', 'public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text)', 'EXECUTE');
-- ---------------------------------------------------------------------------------------------
