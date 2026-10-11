-- kitchen_orders_online_payment_lifecycle_v1 — Payment Lifecycle V2, S2 "Migration A": schema + trigger
-- (2026-10-09).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. L'apply su Production richiede Gate 2 esplicito di Eros
-- (ai-ops/SECURITY_POLICY.md §5.1: solo `supabase db push --linked`).
--
-- Cosa introduce (solo schema + guard, nessuna RPC, nessuna policy, nessun GRANT, nessuna mutazione
-- di righe esistenti):
--   1) due nuovi stati ordine: `pending_online_payment` (ordine creato dal cliente, pagamento online
--      non ancora confermato) e `payment_abandoned` (pagamento online mai completato);
--   2) `client_request_id uuid` + unique index parziale (customer_id, client_request_id) per rendere
--      idempotente la creazione ordine lato cliente (retry di rete = stesso ordine, non duplicato);
--   3) indice parziale sugli ordini online pending (sweep/abbandono e code staff per venue);
--   4) trigger BEFORE INSERT OR UPDATE che fa rispettare le invarianti di transizione.
--
-- Compatibilità (nessuna data migration):
--   - il CHECK di status viene ampliato a superset: le 6 righe legacy restano tutte valide;
--   - `client_request_id` è nullable senza default: le righe esistenti restano NULL e fuori dal
--     unique index parziale;
--   - oggi nessuna RPC inserisce `pending_online_payment`/`payment_abandoned`
--     (`kitchen_customer_create_order` inserisce sempre `pending_counter_payment`), quindi il trigger
--     non cambia il comportamento di nessun flusso esistente: le guardie scattano SOLO quando la riga
--     parte da / arriva in uno dei due stati nuovi.
--   - S3+ (fuori scope qui) dovrà estendere `kitchen_payment_confirm` al ramo
--     `pending_online_payment` -> `received` con payment_status='paid' NELLO STESSO UPDATE: oggi il ramo
--     ELSE della confirm aggiorna solo i campi payment e lascerebbe l'ordine paid in
--     pending_online_payment, cosa che questa guardia rifiuta per design.
--
-- Le costanti condivise lato client restano la allow-list positiva `STAFF_OPERATIONAL_STATUSES`
-- (src/lib/kitchenServiceRules.js, S1): i due stati nuovi NON vi compaiono e non entrano nelle code.

-- =========================================================================
-- 1) STATUS CHECK — superset dei 6 stati legacy + 2 stati online
-- =========================================================================

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_status_check;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_status_check CHECK (
    status = ANY (ARRAY[
      'pending_counter_payment'::text, 'received'::text, 'preparing'::text,
      'ready'::text, 'delivered'::text, 'cancelled'::text,
      'pending_online_payment'::text, 'payment_abandoned'::text
    ])
  );

-- =========================================================================
-- 2) IDEMPOTENZA CREAZIONE ORDINE — client_request_id
-- =========================================================================

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON COLUMN public.kitchen_orders.client_request_id IS
  'Chiave di idempotenza generata dal client alla creazione ordine (Payment Lifecycle V2). '
  'Unica per customer_id (unique index parziale): un retry con lo stesso id non crea un secondo '
  'ordine. NULL per le righe legacy e per gli ordini creati senza chiave.';

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_customer_client_request_uidx
  ON public.kitchen_orders (customer_id, client_request_id)
  WHERE customer_id IS NOT NULL AND client_request_id IS NOT NULL;

-- =========================================================================
-- 3) INDICE ORDINI ONLINE PENDING — sweep abbandono / lookup per venue
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_kitchen_orders_pending_online_created
  ON public.kitchen_orders (venue_id, created_at)
  WHERE status = 'pending_online_payment';

-- =========================================================================
-- 4) TRIGGER BEFORE INSERT OR UPDATE — guardia di transizione stati online
--    Puro SQL, nessuna chiamata di rete (stesso principio di
--    kitchen_orders_ready_event_identity). Invarianti:
--      I1. pending_online_payment non passa arbitrariamente a uno stato operativo:
--          -> received            SOLO se payment_status='paid' nello stesso statement;
--          -> pending_counter_payment SOLO se online_payment_disabled=true (switch al banco);
--          -> preparing/ready/delivered: MAI direttamente;
--          -> payment_abandoned / cancelled: consentiti.
--      I2. un ordine paid non può restare (né entrare) in pending_online_payment; lo stesso vale
--          per payment_abandoned (un pagamento confermato tardi deve riportare l'ordine a received
--          tramite la RPC, non lasciarlo "abbandonato").
--      I3. lo switch verso il pagamento al banco (-> pending_counter_payment) da uno stato online
--          richiede online_payment_disabled=true.
--    payment_abandoned segue le stesse regole di uscita di pending_online_payment (incluso il
--    rientro -> pending_online_payment per un nuovo tentativo).
--    Le transizioni che NON partono da uno stato online non vengono toccate: i flussi legacy
--    (pending_counter_payment -> received -> preparing -> ready -> delivered, cancel) restano
--    identici a oggi.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_orders_online_payment_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- I2: vale su INSERT e UPDATE, qualunque sia lo stato di partenza.
  IF NEW.payment_status = 'paid'
     AND NEW.status IN ('pending_online_payment', 'payment_abandoned') THEN
    RAISE EXCEPTION 'online_order_paid_status_conflict'
      USING ERRCODE = 'check_violation',
            DETAIL  = format('order %s: payment_status=paid incompatibile con status=%s', NEW.id, NEW.status);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Nessun cambio di status: nessuna transizione da guardare (es. update di note, paid_at, flag).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending_online_payment', 'payment_abandoned') THEN
    CASE NEW.status
      WHEN 'received' THEN
        -- I1: ingresso in cucina solo con pagamento confermato nello stesso statement.
        IF NEW.payment_status IS DISTINCT FROM 'paid' THEN
          RAISE EXCEPTION 'online_order_not_paid'
            USING ERRCODE = 'check_violation',
                  DETAIL  = format('order %s: %s -> received richiede payment_status=paid', NEW.id, OLD.status);
        END IF;
      WHEN 'pending_counter_payment' THEN
        -- I3: switch al banco solo con online_payment_disabled=true.
        IF NOT NEW.online_payment_disabled THEN
          RAISE EXCEPTION 'online_payment_switch_requires_disabled'
            USING ERRCODE = 'check_violation',
                  DETAIL  = format('order %s: %s -> pending_counter_payment richiede online_payment_disabled=true', NEW.id, OLD.status);
        END IF;
      WHEN 'pending_online_payment', 'payment_abandoned', 'cancelled' THEN
        NULL; -- consentiti
      ELSE
        -- I1: preparing / ready / delivered (o stati futuri) mai direttamente da uno stato online.
        RAISE EXCEPTION 'online_order_invalid_transition'
          USING ERRCODE = 'check_violation',
                DETAIL  = format('order %s: transizione %s -> %s non consentita', NEW.id, OLD.status, NEW.status);
    END CASE;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS kitchen_orders_online_payment_lifecycle_guard_trg ON public.kitchen_orders;

CREATE TRIGGER kitchen_orders_online_payment_lifecycle_guard_trg
  BEFORE INSERT OR UPDATE ON public.kitchen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.kitchen_orders_online_payment_lifecycle_guard();
