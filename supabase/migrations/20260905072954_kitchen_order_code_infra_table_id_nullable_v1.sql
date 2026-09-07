-- Walbox Kitchen Pilot — order-code infrastructure e table_id nullable.
--
-- APPLICATA SUL REMOTO il 2026-09-05 come migration version `20260905072954`
-- (name nel ledger: `kitchen_order_code_infra_table_id_nullable_v1`).
--
-- Questo file ricostruisce in locale una migration che era stata applicata fuori da
-- `supabase db push` e che quindi non aveva un file corrispondente nel repo. Il contenuto SQL e'
-- identico a quello registrato nel ledger remoto (md5 sole righe SQL: 46cae1300c2ec63f01b90590ef0abd6b)
-- ed e' la sezione 1 del draft superato `20260901120000_kitchen_pilot_order_contract_v1.sql`, oggi
-- conservato in `ai-ops/archive/migrations/`. Le sezioni 2 e 3 di quel draft sono invece applicate
-- come `20260906171426_kitchen_pilot_order_contract_rpc_v1.sql`.
--
-- NON rieseguire: gia' live sul remoto. Ricostruzione documentata in
-- `ai-ops/reports/kitchen-migration-ledger-reconciliation-20260907.md`.

-- =============================================================================
-- 1. Operational-code ledger and the table_id relaxation the no-tables contract requires
-- =============================================================================

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS service_day date,
  ADD COLUMN IF NOT EXISTS service_sequence integer;

-- kitchen_orders.table_id is NOT NULL on the live schema (20260710173936). The no-tables
-- contract stops writing any table value from the customer order path, so the column must
-- become optional. No existing table_id value is touched or backfilled.
ALTER TABLE public.kitchen_orders
  ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_service_sequence_positive_check
    CHECK (service_sequence IS NULL OR service_sequence > 0) NOT VALID;

ALTER TABLE public.kitchen_orders
  VALIDATE CONSTRAINT kitchen_orders_service_sequence_positive_check;

CREATE TABLE IF NOT EXISTS public.kitchen_service_order_counters (
  venue_id     text NOT NULL,
  service_day  date NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_service_order_counters_pkey PRIMARY KEY (venue_id, service_day),
  CONSTRAINT kitchen_service_order_counters_nonnegative_check CHECK (last_sequence >= 0)
);

ALTER TABLE public.kitchen_service_order_counters ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_venue_service_sequence_unique
  ON public.kitchen_orders (venue_id, service_day, service_sequence)
  WHERE service_day IS NOT NULL AND service_sequence IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_venue_service_code_unique
  ON public.kitchen_orders (venue_id, service_day, order_code)
  WHERE service_day IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kitchen_format_operational_code(p_sequence integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_value integer := ((p_sequence - 1) / 99);
  v_letters text := '';
BEGIN
  IF p_sequence IS NULL OR p_sequence < 1 THEN
    RAISE EXCEPTION 'invalid_service_sequence';
  END IF;

  LOOP
    v_letters := chr(65 + (v_value % 26)) || v_letters;
    v_value := (v_value / 26) - 1;
    EXIT WHEN v_value < 0;
  END LOOP;

  RETURN v_letters || lpad((((p_sequence - 1) % 99) + 1)::text, 2, '0');
END;
$function$;
