-- kitchen_push_subscriptions v1 — Web Push foundations (F6 Phase 1, 2026-09-24).
--
-- DOCUMENTATION ONLY — NOT APPLIED TO REMOTE. Supabase è area protetta (CLAUDE.md §5): questa
-- migration non va eseguita con `supabase db push`/apply finché Eros non approva esplicitamente
-- il Gate 2 di questa fase. Nessun trigger, nessuna Edge Function, nessun invio push reale: solo
-- lo schema che regge la subscription, coerente con l'audit
-- ai-ops/reports/kitchen-f6-webpush-audit-20260924.md (RECOMMENDED_ARCHITECTURE).
--
-- Modello: la subscription è per customer/device, NON per singolo ordine — un device riceverà
-- notifiche per qualunque ordine futuro creato da quello stesso auth.uid() anonimo. order_id
-- viaggerà nel payload della notifica al momento dell'invio (Fase 2, trigger + Edge Function,
-- non qui). Stesso pattern di identità di kitchen_orders.customer_id (schema baseline,
-- 20260710173936): nessun account, nessuna colonna nuova su kitchen_orders.
--
-- OWNERSHIP FIX (2026-09-24, patch pre-Gate 2, mai applicata al remoto quindi zero costo di
-- rollback): il Final Gate ha rilevato che UNIQUE(customer_id, endpoint) permette allo stesso
-- browser/endpoint di restare legato a un customer_id stale se la sessione anonima cambia sullo
-- stesso device (clear site data, device riassegnato a un altro cliente — stesso pattern del P0
-- privacy 2026-09-16). Risultato: due righe con lo stesso endpoint, rischio di push recapitato al
-- cliente sbagliato. Fix: endpoint globalmente UNIQUE + riassegnazione SOLO tramite la RPC
-- SECURITY DEFINER sotto, mai via upsert diretto dal client.

CREATE TABLE IF NOT EXISTS public.kitchen_push_subscriptions (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id     text NOT NULL DEFAULT 'walrus-main',
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_push_subscriptions_pkey PRIMARY KEY (id),
  -- Un endpoint (una PushSubscription browser) appartiene a UN SOLO customer_id alla volta:
  -- niente più righe doppie sullo stesso device con customer_id diversi (vedi nota OWNERSHIP FIX
  -- sopra). La riassegnazione a un nuovo customer_id passa dalla RPC sotto, mai da un upsert
  -- diretto sulla tabella.
  CONSTRAINT kitchen_push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_push_subscriptions_customer
  ON public.kitchen_push_subscriptions USING btree (customer_id);

ALTER TABLE public.kitchen_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Nessuna policy `anon`, nessuna policy staff: solo il customer proprietario (auth.uid()) può
-- leggere/rimuovere la propria subscription. Lo staff non deve mai vedere endpoint/keys (dato
-- pseudonimo di device, vedi audit SECURITY_PRIVACY) — un eventuale bisogno di sapere "notifica
-- inviata: sì/no" lato staff richiederà una colonna/tabella separata, decisione di prodotto non
-- presa qui.
--
-- Nessuna policy INSERT/UPDATE diretta sulla tabella (deliberato, OWNERSHIP FIX): creare o
-- riassegnare una subscription richiede di poter rimuovere l'eventuale riga stale di un
-- customer_id diverso sullo stesso endpoint, cosa che una policy own-only non può fare per
-- costruzione (RLS non permette a un customer di toccare righe di un altro). Passa quindi
-- esclusivamente dalla RPC SECURITY DEFINER kitchen_push_subscription_claim sotto, che opera con
-- privilegi elevati SOLO per questa singola operazione controllata.
CREATE POLICY customer_select_own_push_subscription ON public.kitchen_push_subscriptions
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY customer_delete_own_push_subscription ON public.kitchen_push_subscriptions
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

-- =========================================================================
-- kitchen_push_subscription_claim — SECURITY DEFINER, unico modo per creare/riassegnare una
-- subscription. auth.uid() è l'unica fonte del customer_id: nessun parametro customer_id in
-- input, quindi nessun modo per un client di reclamare una subscription per conto di un altro
-- utente. Riassegnazione atomica: rimuove prima qualunque riga stale con lo stesso endpoint
-- appartenente a un customer_id diverso, poi upsert sulla propria riga — cosi' un endpoint ha
-- sempre e solo un proprietario alla volta (vedi UNIQUE(endpoint) sopra).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_push_subscription_claim(
  p_venue_id   text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth_key   text,
  p_user_agent text DEFAULT NULL
)
RETURNS public.kitchen_push_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id uuid := auth.uid();
  v_row         public.kitchen_push_subscriptions;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_session_missing';
  END IF;
  IF p_venue_id IS DISTINCT FROM 'walrus-main' THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;
  IF p_endpoint IS NULL OR btrim(p_endpoint) = '' THEN
    RAISE EXCEPTION 'endpoint_required';
  END IF;
  IF p_p256dh IS NULL OR btrim(p_p256dh) = '' OR p_auth_key IS NULL OR btrim(p_auth_key) = '' THEN
    RAISE EXCEPTION 'subscription_keys_required';
  END IF;

  -- Evict: qualunque riga esistente su questo endpoint che NON appartiene già a questo
  -- customer_id è stale per costruzione (un endpoint = un browser = un solo proprietario reale
  -- alla volta) e va rimossa prima del claim, altrimenti l'UNIQUE(endpoint) sotto farebbe fallire
  -- l'insert invece di riassegnare.
  DELETE FROM public.kitchen_push_subscriptions
   WHERE endpoint = p_endpoint
     AND customer_id <> v_customer_id;

  INSERT INTO public.kitchen_push_subscriptions
    (customer_id, venue_id, endpoint, p256dh, auth_key, user_agent, last_seen_at)
  VALUES
    (v_customer_id, p_venue_id, p_endpoint, p_p256dh, p_auth_key, p_user_agent, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET customer_id  = EXCLUDED.customer_id,
        p256dh       = EXCLUDED.p256dh,
        auth_key     = EXCLUDED.auth_key,
        user_agent   = EXCLUDED.user_agent,
        last_seen_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- Privilegi minimi: nessun accesso pubblico/anon, solo utenti autenticati (incluse le sessioni
-- anonime Supabase, che sono comunque `authenticated` lato Postgres — stesso pattern di
-- kitchen_customer_create_order/kitchen_promo_pass_redeem_for_order).
REVOKE ALL ON FUNCTION public.kitchen_push_subscription_claim(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_push_subscription_claim(text, text, text, text, text) TO authenticated;
