-- Kitchen Server Price Contract V1 — Migration B.
-- Spec: ai-ops/reports/server-price-contract-v1-design.md (FINAL_RPC_CONTRACT).
-- Gate 1 approvato da Eros (2026-09-12): SOLO questa RPC, nessun tocco a
-- frontend/Payment Hub/SumUp/altre RPC o tabelle. NON applicata a remoto in
-- questo task. Depends on Migration A (20260912100000_kitchen_menu_items_v1.sql).
--
-- Rende kitchen_customer_create_order autoritativa su nome/prezzo: p_items non
-- e' piu' la fonte di name/price, solo di item_id + quantity. name/price/total
-- vengono sempre da kitchen_menu_items (catalogo) + kitchen_menu_availability
-- (sold-out), mai dal client. Firma RPC invariata.
--
-- Rollback: CREATE OR REPLACE FUNCTION con il corpo precedente, byte-identico a
-- 20260906171426_kitchen_pilot_order_contract_rpc_v1.sql:39-117 (la versione che
-- leggeva name/price/quantity direttamente da p_items).

CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order(
  p_venue_id text,
  p_nickname text,
  p_customer_note text,
  p_items jsonb
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service_day date := timezone('Europe/Rome', now())::date;
  v_sequence integer;
  v_total numeric;
  v_order public.kitchen_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'customer_session_required';
  END IF;
  IF p_venue_id IS NULL OR btrim(p_venue_id) = '' THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;
  IF p_nickname IS NULL OR btrim(p_nickname) = '' THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  -- p_items in ingresso puo' contenere solo item_id + quantity, oppure anche
  -- name/price legacy: jsonb_to_recordset proietta solo le colonne dichiarate
  -- qui sotto, quindi eventuali name/price client (incluso un tentativo
  -- price=0.01) non vengono mai letti, ne' per il totale ne' per il catalogo.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    LEFT JOIN public.kitchen_menu_items m
      ON m.venue_id = p_venue_id AND m.item_id = line.item_id
    WHERE m.item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'unknown_menu_item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    JOIN public.kitchen_menu_items m
      ON m.venue_id = p_venue_id AND m.item_id = line.item_id
    LEFT JOIN public.kitchen_menu_availability a
      ON a.venue_id = p_venue_id AND a.item_id = line.item_id
    WHERE m.price IS NULL OR COALESCE(a.available, true) = false
  ) THEN
    RAISE EXCEPTION 'item_not_orderable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    WHERE line.quantity IS NULL OR line.quantity < 1
  ) THEN
    RAISE EXCEPTION 'invalid_order_items';
  END IF;

  SELECT sum(line.quantity::numeric * m.price)
  INTO v_total
  FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
  JOIN public.kitchen_menu_items m
    ON m.venue_id = p_venue_id AND m.item_id = line.item_id;

  INSERT INTO public.kitchen_service_order_counters (venue_id, service_day, last_sequence)
  VALUES (p_venue_id, v_service_day, 1)
  ON CONFLICT (venue_id, service_day)
  DO UPDATE SET last_sequence = public.kitchen_service_order_counters.last_sequence + 1,
                updated_at = now()
  RETURNING last_sequence INTO v_sequence;

  INSERT INTO public.kitchen_orders (
    id, order_code, venue_id, table_id, nickname, customer_id,
    status, customer_note, total, payment_status, payment_method, service_day, service_sequence
  ) VALUES (
    'order-' || gen_random_uuid()::text,
    public.kitchen_format_operational_code(v_sequence),
    p_venue_id,
    NULL,
    btrim(p_nickname),
    auth.uid(),
    'pending_counter_payment',
    NULLIF(btrim(p_customer_note), ''),
    v_total,
    'pending_counter_payment',
    NULL,
    v_service_day,
    v_sequence
  )
  RETURNING * INTO v_order;

  -- name/price scritti sempre dal catalogo (m.name/m.price), mai da p_items:
  -- anche un client legacy che manda ancora name/price vede quei campi
  -- ignorati e sovrascritti dai valori server-side.
  INSERT INTO public.kitchen_order_items (order_id, venue_id, item_id, name, quantity, price)
  SELECT v_order.id, v_order.venue_id, line.item_id, m.name, line.quantity, m.price
  FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
  JOIN public.kitchen_menu_items m
    ON m.venue_id = p_venue_id AND m.item_id = line.item_id;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb) TO authenticated;
