-- KITCHEN_OPEN_CLOSE_V1 — stato APERTA/CHIUSA della cucina, persistente e server-side.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Gate 1 approvato da Eros (2026-09-23) per
-- implementazione locale. Apply remoto NON eseguito in questo task (solo `supabase db push
-- --linked`, mai `apply_migration`/`db query -f`, vedi ai-ops/SECURITY_POLICY.md §5.1).
--
-- Nessun riuso di venue_settings (singleton Jukebox): CLAUDE.md vieta di mescolare strutture
-- dati Jukebox e Kitchen. Nuova tabella dedicata Kitchen, stesso pattern RLS di
-- kitchen_menu_availability (20260710173936): anon/authenticated in SELECT, solo staff del
-- venue in INSERT/UPDATE via is_staff_for_venue (funzione già live, invariata).
--
-- Enforcement reale: kitchen_customer_create_order (le due firme live, 4 e 5 argomenti) rifiuta
-- un nuovo ordine con RAISE EXCEPTION 'kitchen_closed' se il venue è chiuso. Nessuna riga per un
-- venue = aperta di default (mai un blocco per un dato mancante). Nessun'altra RPC toccata:
-- ordini esistenti, pagamenti, refund, storico, promo continuano invariati.
--
-- Rollback: DROP TABLE public.kitchen_service_state; e ripristinare i due CREATE OR REPLACE con
-- il corpo precedente, byte-identico a 20260912110000 (firma 4 arg) e 20260913130000 (firma 5 arg).

-- ---------------------------------------------------------------------------------------------
-- 1. Tabella kitchen_service_state — singleton per venue
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kitchen_service_state (
  venue_id   text NOT NULL,
  is_open    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT kitchen_service_state_pkey PRIMARY KEY (venue_id)
);

ALTER TABLE public.kitchen_service_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_kitchen_service_state ON public.kitchen_service_state
  FOR SELECT TO anon
  USING (venue_id = 'walrus-main'::text);

CREATE POLICY customer_select_kitchen_service_state ON public.kitchen_service_state
  FOR SELECT TO authenticated
  USING (venue_id = 'walrus-main'::text);

CREATE POLICY staff_insert_kitchen_service_state ON public.kitchen_service_state
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_for_venue(venue_id));

CREATE POLICY staff_update_kitchen_service_state ON public.kitchen_service_state
  FOR UPDATE TO authenticated
  USING (is_staff_for_venue(venue_id))
  WITH CHECK (is_staff_for_venue(venue_id));

INSERT INTO public.kitchen_service_state (venue_id, is_open)
VALUES ('walrus-main', true)
ON CONFLICT (venue_id) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 2. kitchen_customer_create_order — firma legacy a 4 argomenti (20260912110000).
--    Corpo identico, con l'unica aggiunta del guard kitchen_closed subito dopo la validazione
--    del venue.
-- ---------------------------------------------------------------------------------------------

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

  -- KITCHEN_OPEN_CLOSE_V1: nessuna riga per il venue = aperta di default.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_service_state s
    WHERE s.venue_id = p_venue_id AND s.is_open = false
  ) THEN
    RAISE EXCEPTION 'kitchen_closed';
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

-- ---------------------------------------------------------------------------------------------
-- 3. kitchen_customer_create_order — firma corrente a 5 argomenti (20260913130000), quella che
--    ogni client attuale chiama davvero. Stesso guard, stessa posizione.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order(
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

  -- KITCHEN_OPEN_CLOSE_V1: nessuna riga per il venue = aperta di default.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_service_state s
    WHERE s.venue_id = p_venue_id AND s.is_open = false
  ) THEN
    RAISE EXCEPTION 'kitchen_closed';
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

REVOKE ALL ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb, text) TO authenticated;
