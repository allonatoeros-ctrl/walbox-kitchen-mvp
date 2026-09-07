-- Kitchen schema baseline v1 — DOCUMENTATION ONLY, NOT APPLIED TO REMOTE.
--
-- Fotografa fedelmente lo schema Kitchen già esistente sul DB remoto (applicato fuori da questo repo,
-- prima dell'Extraction Audit). Ricostruita via introspection read-only diretta
-- (information_schema / pg_catalog / pg_policies) il 2026-08-28, a fronte del report:
-- ai-ops/reports/kitchen-payment-hub-v1-fase0-mcp-schema-confirmed.md
--
-- Questo file NON va eseguito con `supabase db push` finché Eros non lo approva esplicitamente:
-- il remoto ha già questo schema, questa migration serve solo a tracciarlo in `supabase/migrations/`.
-- Usa `CREATE TABLE IF NOT EXISTS` / `ADD CONSTRAINT IF NOT EXISTS` dove possibile per essere
-- non distruttiva anche se applicata per errore contro un DB che ha già questi oggetti.

-- =========================================================================
-- kitchen_staff_members — creata per prima: is_staff_for_venue() la referenzia
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_staff_members (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id   text NOT NULL,
  role       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_staff_members_pkey PRIMARY KEY (user_id, venue_id),
  CONSTRAINT kitchen_staff_members_role_check CHECK (role = ANY (ARRAY['staff'::text, 'manager'::text]))
);

ALTER TABLE public.kitchen_staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_select_own_member_record ON public.kitchen_staff_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =========================================================================
-- is_staff_for_venue() — SECURITY DEFINER, usata da tutte le policy staff sotto
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_staff_for_venue(p_venue_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.kitchen_staff_members ksm
    WHERE ksm.user_id = auth.uid()
      AND ksm.venue_id = p_venue_id
  );
$function$;

-- =========================================================================
-- kitchen_orders
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
  id             text NOT NULL,
  order_code     text NOT NULL,
  venue_id       text NOT NULL,
  table_id       text NOT NULL,
  nickname       text NOT NULL,
  customer_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending_counter_payment',
  note           text,
  staff_note     text,
  total          numeric NOT NULL DEFAULT 0,
  payment_status text,
  payment_method text,
  paid_at        timestamptz,
  ready_at       timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  customer_note  text,
  CONSTRAINT kitchen_orders_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_orders_status_check CHECK (
    status = ANY (ARRAY['pending_counter_payment'::text, 'received'::text, 'preparing'::text,
                         'ready'::text, 'delivered'::text, 'cancelled'::text])
  ),
  CONSTRAINT kitchen_orders_payment_status_check CHECK (
    payment_status IS NULL OR payment_status = ANY (ARRAY['pending_counter_payment'::text, 'paid'::text, 'cancelled'::text])
  ),
  -- NB: hardcoded a un solo metodo. Qualsiasi Payment Hub multi-metodo richiede un ALTER esplicito qui.
  CONSTRAINT kitchen_orders_payment_method_check CHECK (
    payment_method IS NULL OR payment_method = 'counter'::text
  ),
  CONSTRAINT kitchen_orders_total_check CHECK (total >= 0::numeric)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_orders_venue_status_created
  ON public.kitchen_orders USING btree (venue_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_customer_created
  ON public.kitchen_orders USING btree (customer_id, created_at);

ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;

-- NB: nessuna policy DELETE, nessuna policy staff INSERT su questa tabella (confermato remoto).
CREATE POLICY customer_insert_own_orders ON public.kitchen_orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND venue_id = 'walrus-main'::text);

CREATE POLICY customer_select_own_orders ON public.kitchen_orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY staff_select_venue_orders ON public.kitchen_orders
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));

CREATE POLICY staff_update_venue_orders ON public.kitchen_orders
  FOR UPDATE TO authenticated
  USING (is_staff_for_venue(venue_id))
  WITH CHECK (is_staff_for_venue(venue_id));

-- =========================================================================
-- kitchen_order_items
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_order_items (
  id       uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
  venue_id text NOT NULL,
  item_id  text NOT NULL,
  name     text NOT NULL,
  quantity integer NOT NULL,
  price    numeric NOT NULL,
  CONSTRAINT kitchen_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT kitchen_order_items_price_check CHECK (price >= 0::numeric)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_order_id
  ON public.kitchen_order_items USING btree (order_id);

ALTER TABLE public.kitchen_order_items ENABLE ROW LEVEL SECURITY;

-- NB: nessuna policy staff INSERT/UPDATE/DELETE su questa tabella (confermato remoto) — lo staff
-- non può aggiungere/modificare righe ordine dopo la creazione cliente.
CREATE POLICY customer_insert_own_order_items ON public.kitchen_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kitchen_orders o
      WHERE o.id = kitchen_order_items.order_id
        AND o.customer_id = auth.uid()
        AND o.venue_id = kitchen_order_items.venue_id
        AND o.venue_id = 'walrus-main'::text
    )
  );

CREATE POLICY customer_select_own_order_items ON public.kitchen_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.kitchen_orders o
      WHERE o.id = kitchen_order_items.order_id
        AND o.customer_id = auth.uid()
        AND o.venue_id = kitchen_order_items.venue_id
    )
  );

CREATE POLICY staff_select_venue_order_items ON public.kitchen_order_items
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));

-- =========================================================================
-- kitchen_action_log
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_action_log (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  -- NB: order_id è testo libero SENZA FK verso kitchen_orders(id) sul remoto (confermato) — probabile
  -- scelta voluta per preservare il log oltre il ciclo di vita dell'ordine referenziato.
  order_id    text,
  venue_id    text NOT NULL,
  action      text NOT NULL,
  from_status text,
  to_status   text,
  actor_type  text NOT NULL,
  actor_id    uuid,
  reason      text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_action_log_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_action_log_actor_type_check CHECK (
    actor_type = ANY (ARRAY['customer'::text, 'staff'::text, 'system'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_kitchen_action_log_order_created
  ON public.kitchen_action_log USING btree (order_id, created_at);

ALTER TABLE public.kitchen_action_log ENABLE ROW LEVEL SECURITY;

-- NB: nessuna policy customer/anon su questa tabella (confermato remoto) — solo staff legge/scrive il log.
CREATE POLICY staff_insert_venue_action_log ON public.kitchen_action_log
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_for_venue(venue_id));

CREATE POLICY staff_select_venue_action_log ON public.kitchen_action_log
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));

-- =========================================================================
-- kitchen_menu_availability
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_menu_availability (
  venue_id   text NOT NULL,
  item_id    text NOT NULL,
  available  boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_menu_availability_pkey PRIMARY KEY (venue_id, item_id)
);

-- NB: indice non-unique ridondante sulle stesse colonne della PK, presente sul remoto così com'è
-- (probabile residuo pre-PK) — riprodotto qui per fedeltà, non rimosso.
CREATE INDEX IF NOT EXISTS idx_kitchen_menu_availability_venue_item
  ON public.kitchen_menu_availability USING btree (venue_id, item_id);

ALTER TABLE public.kitchen_menu_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_menu_availability ON public.kitchen_menu_availability
  FOR SELECT TO anon
  USING (venue_id = 'walrus-main'::text);

CREATE POLICY customer_select_menu_availability ON public.kitchen_menu_availability
  FOR SELECT TO authenticated
  USING (venue_id = 'walrus-main'::text);

CREATE POLICY staff_select_venue_menu_availability ON public.kitchen_menu_availability
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));

CREATE POLICY staff_insert_venue_menu_availability ON public.kitchen_menu_availability
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_for_venue(venue_id));

CREATE POLICY staff_update_venue_menu_availability ON public.kitchen_menu_availability
  FOR UPDATE TO authenticated
  USING (is_staff_for_venue(venue_id))
  WITH CHECK (is_staff_for_venue(venue_id));

-- =========================================================================
-- kitchen_customer_sessions
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.kitchen_customer_sessions (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id      text NOT NULL,
  table_id      text NOT NULL,
  nickname      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_customer_sessions_pkey PRIMARY KEY (id)
);

ALTER TABLE public.kitchen_customer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_insert_own_session ON public.kitchen_customer_sessions
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND venue_id = 'walrus-main'::text);

CREATE POLICY customer_select_own_session ON public.kitchen_customer_sessions
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY staff_select_venue_customer_sessions ON public.kitchen_customer_sessions
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));
