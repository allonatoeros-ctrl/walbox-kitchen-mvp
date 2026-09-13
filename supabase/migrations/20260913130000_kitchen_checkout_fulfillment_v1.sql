-- Customer Checkout V1 — fulfillment (MANGIO QUI / PORTO VIA).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Gate 1 approvato da Eros per implementazione locale
-- (design: ai-ops/reports/customer-checkout-v1-design.md, audit: ai-ops/reports/customer-checkout-v1-audit.md).
-- Apply remoto NON eseguito in questo task.
--
-- Decisione di prodotto approvata: NO TABLES resta invariato — fulfillment_type sostituisce SOLO la
-- scelta mangio-qui/porto-via, nessun table_id/numero tavolo reintrodotto in nessuna forma.
--
-- Depends on Migration B (20260912110000, live) e F03 (20260913120000, live): questa migration non
-- tocca nessuna delle due funzioni che modificano, solo aggiunge una colonna e un nuovo OVERLOAD di
-- kitchen_customer_create_order — la firma a 4 argomenti (20260912110000) resta invariata, con i suoi
-- grant intatti, come meccanismo di backward compatibility per client non ancora aggiornati.
--
-- Rollback: DROP FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb, text);
-- ALTER TABLE public.kitchen_orders DROP CONSTRAINT kitchen_orders_fulfillment_type_check;
-- ALTER TABLE public.kitchen_orders DROP COLUMN fulfillment_type;

-- ---------------------------------------------------------------------------------------------
-- 1. Colonna fulfillment_type — nullable, nessun default: storico e client legacy restano NULL,
--    mai inventato un valore che il cliente non ha scelto.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS fulfillment_type text;

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_fulfillment_type_check;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_fulfillment_type_check CHECK (
    fulfillment_type IS NULL OR fulfillment_type = ANY (ARRAY['eat_here'::text, 'takeaway'::text])
  );

-- ---------------------------------------------------------------------------------------------
-- 2. kitchen_customer_create_order — nuovo OVERLOAD a 5 argomenti, p_fulfillment_type SENZA
--    DEFAULT (obbligatorio in ogni chiamata a questa firma: NULL e' un valore esplicito valido,
--    mai un default silenzioso). Senza DEFAULT le due firme non si sovrappongono mai in arity,
--    quindi la risoluzione dell'overload resta sempre univoca — una chiamata a 4 argomenti risolve
--    solo sulla firma legacy (20260912110000), una chiamata a 5 solo su questa. Vedi
--    ai-ops/reports/customer-checkout-v1-design.md (AMBIGUITY_RISK) per il motivo per cui un
--    DEFAULT NULL qui avrebbe reso le due firme ambigue a runtime su una chiamata a 4 argomenti
--    (Postgres: "function ... is not unique").
--
--    Corpo identico a 20260912110000 (autorita' catalogo su nome/prezzo invariata, name/price
--    sempre da kitchen_menu_items, mai da p_items) + validazione e scrittura di fulfillment_type.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION public.kitchen_customer_create_order(
  p_venue_id text,
  p_nickname text,
  p_customer_note text,
  p_items jsonb,
  p_fulfillment_type text
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
  IF p_fulfillment_type IS NOT NULL AND p_fulfillment_type NOT IN ('eat_here', 'takeaway') THEN
    RAISE EXCEPTION 'invalid_fulfillment_type';
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

  -- table_id resta sempre NULL: NO TABLES invariato, fulfillment_type non porta mai con se' un
  -- numero tavolo in nessuna forma (decisione di prodotto approvata).
  INSERT INTO public.kitchen_orders (
    id, order_code, venue_id, table_id, nickname, customer_id,
    status, customer_note, total, payment_status, payment_method, service_day, service_sequence,
    fulfillment_type
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
    v_sequence,
    p_fulfillment_type
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

-- Grant esplicito sulla NUOVA firma a 5 argomenti: i grant non sono ereditati tra overload,
-- la firma legacy a 4 argomenti (20260912110000) mantiene i suoi grant invariati.
REVOKE ALL ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb, text) TO authenticated;
