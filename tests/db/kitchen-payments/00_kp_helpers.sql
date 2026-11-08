-- Helper SOLO per test locali dei pagamenti Kitchen (schema kp_test, mai in una migration).
-- Si appoggia a fc_test (tests/db/food-club/00_helpers.sql, caricato prima dal runner).
-- Ruoli: come gli scenari food-club, le RPC girano come superuser `postgres` con il claim JWT
-- `request.jwt.claims` impostato da fc_test.as_user / fc_test.as_service (auth.role()/auth.uid()
-- dello shim leggono quel claim). Nessun SET ROLE: i GRANT EXECUTE non sono verificati qui.
CREATE SCHEMA IF NOT EXISTS kp_test;

-- Ordine cliente SENZA buono. p_lane: 'online' (POP) o 'counter' (PCP).
CREATE OR REPLACE FUNCTION kp_test.new_order(p_uid uuid, p_lane text DEFAULT 'online')
RETURNS public.kitchen_orders LANGUAGE sql AS $$
  SELECT fc_test.order(p_uid, '[{"item_id":"item-009","quantity":1}]'::jsonb, p_lane) $$;

CREATE OR REPLACE FUNCTION kp_test.attempt(p_id uuid) RETURNS public.kitchen_payments LANGUAGE sql AS $$
  SELECT * FROM public.kitchen_payments WHERE id = p_id $$;

CREATE OR REPLACE FUNCTION kp_test.ord(p_id text) RETURNS public.kitchen_orders LANGUAGE sql AS $$
  SELECT * FROM public.kitchen_orders WHERE id = p_id $$;

CREATE OR REPLACE FUNCTION kp_test.succeeded_charges(p_order_id text) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge' AND status = 'succeeded' $$;

CREATE OR REPLACE FUNCTION kp_test.log_count(p_order_id text, p_action text) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_action_log WHERE order_id = p_order_id AND action = p_action $$;

-- Sweep dei 5 minuti: retrodata l'ordine di 6 minuti e chiama la RPC di sistema (service_role).
CREATE OR REPLACE FUNCTION kp_test.abandon(p_order_id text) RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.backdate(p_order_id, now() - interval '6 minutes');
  PERFORM fc_test.as_service();
  RETURN public.kitchen_order_mark_payment_abandoned(p_order_id);
END $$;

-- Webhook/reconcile SumUp PAID (service_role).
CREATE OR REPLACE FUNCTION kp_test.confirm(p_attempt_id uuid) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_confirm(p_attempt_id, 'sumup-' || p_attempt_id, '{"status":"PAID"}'::jsonb);
END $$;

-- Webhook/reconcile SumUp FAILED/EXPIRED/CANCELLED (service_role), come api/_lib/sumupPaymentResolution.js:80-86.
CREATE OR REPLACE FUNCTION kp_test.fail(p_attempt_id uuid, p_reason text) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_fail(p_attempt_id, p_reason, '{}'::jsonb);
END $$;

-- "Paga al banco" del cliente (api/ chiama la RPC di sistema con service_role).
CREATE OR REPLACE FUNCTION kp_test.switch_to_counter(p_order_id text) RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  SELECT * INTO o FROM public.kitchen_orders WHERE id = p_order_id;
  PERFORM fc_test.as_service();
  RETURN public.kitchen_order_switch_to_counter_system(p_order_id, o.customer_id);
END $$;

-- "PASSA AL BANCO" dello staff sull'attempt online.
CREATE OR REPLACE FUNCTION kp_test.close_unpaid(p_attempt_id uuid, p_staff uuid) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_user(p_staff);
  RETURN public.kitchen_payment_attempt_close_unpaid(p_attempt_id, 'test');
END $$;

-- Esegue una chiamata e restituisce 'OK' oppure il messaggio d'errore (per documentare l'esito senza fermarsi).
CREATE OR REPLACE FUNCTION kp_test.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR ' || SQLERRM;
END $$;
