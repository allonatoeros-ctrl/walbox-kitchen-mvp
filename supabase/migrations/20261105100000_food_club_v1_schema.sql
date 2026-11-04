-- WALRUS FOOD CLUB V1 — F1 base dati (schema, catalogo food autorevole, provenienza ordini).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`).
-- Riferimenti: docs/food-club/fase3/FASE3-piano-tecnico.md §1, §3, §4 (F1); audit-codice.md §2, §4, §5.3.
--
-- Principi
--  * Tutte le tabelle food_club_* hanno RLS attiva. Il cliente LEGGE solo le proprie righe; nessuno (staff
--    compreso) scrive direttamente: le scritture passano solo da funzioni SECURITY DEFINER con search_path fisso.
--  * Food/bevande: decide il SERVER (colonne su kitchen_menu_items + snapshot sulla riga d'ordine). Una voce non
--    classificata vale 0 € di food (mai regalare timbri per errore).
--  * Provenienza ordine: colonna `source` scritta SOLO da trigger BEFORE INSERT in base a chi chiama
--    (staff del locale -> 'staff', altrimenti 'customer_app'). Il client non può impostarla né cambiarla.
--  * La serata di servizio è 06:00 -> 06:00 Europe/Rome (stessa regola del client, kitchenServiceRules.js).

-- ---------------------------------------------------------------------------------------------------
-- 1) Serata di servizio
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_service_night(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT ((p_ts AT TIME ZONE 'Europe/Rome') - interval '6 hours')::date
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Catalogo food autorevole
-- ---------------------------------------------------------------------------------------------------
-- food_unit_amount = quota food di UNA unità della voce. Bevande = 0. MENU (panino + patate + bevanda a prezzo
-- unico) = prezzo meno il listino della bevanda inclusa (scelta prudente in attesa della decisione D-5; con
-- qualunque scelta ogni MENU da solo supera già sia 10 € sia 12 € di food). NULL = non classificata = 0.
ALTER TABLE public.kitchen_menu_items
  ADD COLUMN IF NOT EXISTS food_category text,
  ADD COLUMN IF NOT EXISTS food_unit_amount numeric;

ALTER TABLE public.kitchen_menu_items DROP CONSTRAINT IF EXISTS kitchen_menu_items_food_category_check;
ALTER TABLE public.kitchen_menu_items ADD CONSTRAINT kitchen_menu_items_food_category_check
  CHECK (food_category IS NULL OR food_category IN ('food', 'drink', 'combo'));
ALTER TABLE public.kitchen_menu_items DROP CONSTRAINT IF EXISTS kitchen_menu_items_food_unit_amount_check;
ALTER TABLE public.kitchen_menu_items ADD CONSTRAINT kitchen_menu_items_food_unit_amount_check
  CHECK (food_unit_amount IS NULL OR food_unit_amount >= 0);

-- Food: tutto ciò che il client classifica panini/bbq/tartare/cicchetti/insalatone/tagliere/contorni.
UPDATE public.kitchen_menu_items
   SET food_category = 'food', food_unit_amount = price
 WHERE venue_id = 'walrus-main'
   AND item_id IN ('item-009','item-010','item-011','item-012','item-013','item-014','item-015','item-016',
                   'item-017','item-018','item-020','item-021','item-024','item-025','item-027','item-032',
                   'item-034','item-035','item-036','item-037','item-043','item-044','item-045','item-058',
                   'item-059','item-001','item-002','item-003','item-004','item-033');
-- Bevande (birre, bibite, acqua, legacy birre).
UPDATE public.kitchen_menu_items
   SET food_category = 'drink', food_unit_amount = 0
 WHERE venue_id = 'walrus-main'
   AND item_id IN ('item-005','item-006','item-038','item-046','item-047','item-048','item-049','item-050',
                   'item-051','item-052','item-053','item-054','item-055','item-056','item-063','item-064',
                   'item-065','item-066');
-- MENU con birra (bottiglia 6 €) e con bibita (4 €): quota food = prezzo - bevanda (D-5 aperta).
UPDATE public.kitchen_menu_items SET food_category = 'combo', food_unit_amount = GREATEST(price - 6, 0)
 WHERE venue_id = 'walrus-main' AND item_id IN ('item-040','item-041','item-042') AND price IS NOT NULL;
UPDATE public.kitchen_menu_items SET food_category = 'combo', food_unit_amount = GREATEST(price - 4, 0)
 WHERE venue_id = 'walrus-main' AND item_id IN ('item-060','item-061','item-062') AND price IS NOT NULL;
-- Combo legacy non ordinabili (prezzo NULL): non classificate -> 0.
UPDATE public.kitchen_menu_items SET food_category = 'combo', food_unit_amount = 0
 WHERE venue_id = 'walrus-main' AND item_id IN ('item-007','item-008');

-- Il cambio di prezzo di una voce food mantiene allineata la quota (solo per food puro).
CREATE OR REPLACE FUNCTION public.kitchen_menu_items_food_amount_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.food_category = 'food' AND NEW.price IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price OR NEW.food_unit_amount IS NULL) THEN
    NEW.food_unit_amount := NEW.price;
  ELSIF NEW.food_category = 'drink' THEN
    NEW.food_unit_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_menu_items_food_amount_sync ON public.kitchen_menu_items;
CREATE TRIGGER kitchen_menu_items_food_amount_sync
  BEFORE INSERT OR UPDATE ON public.kitchen_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_menu_items_food_amount_sync();

-- Snapshot sulla riga d'ordine: un cambio menu futuro non ricalcola il passato.
ALTER TABLE public.kitchen_order_items ADD COLUMN IF NOT EXISTS food_unit_amount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.kitchen_order_items_food_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Sempre dal catalogo, mai dal chiamante.
  SELECT COALESCE(m.food_unit_amount, 0) INTO NEW.food_unit_amount
    FROM public.kitchen_menu_items m
   WHERE m.venue_id = NEW.venue_id AND m.item_id = NEW.item_id;
  NEW.food_unit_amount := COALESCE(NEW.food_unit_amount, 0);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_order_items_food_snapshot ON public.kitchen_order_items;
CREATE TRIGGER kitchen_order_items_food_snapshot
  BEFORE INSERT OR UPDATE OF item_id, food_unit_amount ON public.kitchen_order_items
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_order_items_food_snapshot();
REVOKE ALL ON FUNCTION public.kitchen_order_items_food_snapshot() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.food_club_order_food_amount(p_order_id text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sum(i.quantity::numeric * i.food_unit_amount), 0)
    FROM public.kitchen_order_items i
   WHERE i.order_id = p_order_id
$$;
REVOKE ALL ON FUNCTION public.food_club_order_food_amount(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 3) Provenienza dell'ordine
-- ---------------------------------------------------------------------------------------------------
ALTER TABLE public.kitchen_orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.kitchen_orders DROP CONSTRAINT IF EXISTS kitchen_orders_source_check;
ALTER TABLE public.kitchen_orders ADD CONSTRAINT kitchen_orders_source_check
  CHECK (source IS NULL OR source IN ('customer_app', 'staff', 'system'));
COMMENT ON COLUMN public.kitchen_orders.source IS
  'Food Club: chi ha creato l''ordine. Scritto SOLO dal trigger kitchen_orders_source_stamp. NULL = ordine storico (prima del Club), mai idoneo.';

CREATE OR REPLACE FUNCTION public.kitchen_orders_source_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.source := CASE
      WHEN auth.uid() IS NULL THEN 'system'
      WHEN EXISTS (SELECT 1 FROM public.kitchen_staff_members s WHERE s.user_id = auth.uid()) THEN 'staff'
      ELSE 'customer_app'
    END;
  ELSIF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'order_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_source_stamp ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_source_stamp
  BEFORE INSERT OR UPDATE OF source ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_orders_source_stamp();
REVOKE ALL ON FUNCTION public.kitchen_orders_source_stamp() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 4) Campagne
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_campaigns (
  id                     text PRIMARY KEY,
  venue_id               text NOT NULL DEFAULT 'walrus-main',
  name                   text NOT NULL,
  kind                   text NOT NULL DEFAULT 'visits' CHECK (kind IN ('visits')),
  active                 boolean NOT NULL DEFAULT false,
  starts_at              timestamptz,
  ends_at                timestamptz,
  stamp_min_food         numeric NOT NULL DEFAULT 10 CHECK (stamp_min_food > 0),
  stamps_required        integer NOT NULL DEFAULT 2 CHECK (stamps_required >= 1),
  window_days            integer NOT NULL DEFAULT 30 CHECK (window_days >= 1),
  voucher_value          numeric NOT NULL DEFAULT 5 CHECK (voucher_value > 0),
  voucher_min_food       numeric NOT NULL DEFAULT 12 CHECK (voucher_min_food > 0),
  voucher_valid_days     integer NOT NULL DEFAULT 30 CHECK (voucher_valid_days >= 1),
  -- Decisioni aperte: valori prudenti / proposta del piano, modificabili solo con migration o RPC admin.
  stamp_on_voucher_order boolean NOT NULL DEFAULT true,   -- D-3 (proposta: sì, food prima dello sconto)
  refund_recredits_voucher boolean NOT NULL DEFAULT false, -- D-2 (default prudente: nessun riaccredito)
  retroactive_days       integer NOT NULL DEFAULT 0 CHECK (retroactive_days BETWEEN 0 AND 30), -- D-13 (0 = spento)
  referral_enabled       boolean NOT NULL DEFAULT false,  -- D-14 (spento finché Eros non decide)
  referral_inviter_cap   integer NOT NULL DEFAULT 5,
  referral_cap_days      integer NOT NULL DEFAULT 30,
  referral_min_food      numeric NOT NULL DEFAULT 10,
  welcome_stamp_enabled  boolean NOT NULL DEFAULT false,  -- D-4 (dipende da D-14)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (voucher_min_food > voucher_value)
);
-- Una sola campagna attiva per locale.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_campaigns_one_active
  ON public.food_club_campaigns (venue_id) WHERE active;

-- Campagna V1 creata SPENTA: l'accensione è una decisione di Eros (food_club_admin_set_campaign_active).
INSERT INTO public.food_club_campaigns (id, venue_id, name, active)
VALUES ('visite-v1', 'walrus-main', 'Due visite, 5 €', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------------------------------
-- 5) Iscritti, consensi
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_members (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id                text NOT NULL DEFAULT 'walrus-main',
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  display_name            text CHECK (display_name IS NULL OR char_length(display_name) <= 30),
  joined_at               timestamptz NOT NULL DEFAULT now(),
  left_at                 timestamptz,
  terms_version           text NOT NULL,
  service_consent_at      timestamptz NOT NULL,
  marketing_consent_at    timestamptz,
  marketing_revoked_at    timestamptz,
  notif_club_enabled      boolean NOT NULL DEFAULT false,
  notif_promo_enabled     boolean NOT NULL DEFAULT false,
  referral_code           text UNIQUE,
  referred_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_hash              text, -- sha256 del numero E.164, per anti-abuso inviti; mai il numero in chiaro
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (referred_by IS NULL OR referred_by <> user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS food_club_members_phone_hash_unique
  ON public.food_club_members (phone_hash) WHERE phone_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.food_club_consent_events (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('service', 'marketing', 'notif_club', 'notif_promo', 'leave')),
  granted       boolean NOT NULL,
  text_version  text NOT NULL,
  source        text NOT NULL DEFAULT 'app',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_club_consent_events_user ON public.food_club_consent_events (user_id, created_at);

-- ---------------------------------------------------------------------------------------------------
-- 6) Tessere, timbri
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id   text NOT NULL REFERENCES public.food_club_campaigns(id),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  opened_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  completed_at  timestamptz,
  voucher_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Al massimo una tessera aperta per utente e campagna.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_cards_one_open
  ON public.food_club_cards (user_id, campaign_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.food_club_stamps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id        uuid NOT NULL REFERENCES public.food_club_cards(id) ON DELETE CASCADE,
  campaign_id    text NOT NULL REFERENCES public.food_club_campaigns(id),
  kind           text NOT NULL CHECK (kind IN ('order', 'welcome')),
  order_id       text UNIQUE REFERENCES public.kitchen_orders(id) ON DELETE SET NULL,
  service_night  date NOT NULL,
  food_amount    numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoke_reason  text,
  CHECK (kind = 'welcome' OR order_id IS NOT NULL OR revoked_at IS NOT NULL)
);
-- Max 1 timbro d'ordine valido per serata per utente.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_stamps_one_per_night
  ON public.food_club_stamps (user_id, service_night) WHERE kind = 'order' AND revoked_at IS NULL;
-- Max 1 timbro di benvenuto per utente.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_stamps_one_welcome
  ON public.food_club_stamps (user_id) WHERE kind = 'welcome';
CREATE INDEX IF NOT EXISTS food_club_stamps_card ON public.food_club_stamps (card_id);

-- ---------------------------------------------------------------------------------------------------
-- 7) Buoni e storico
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_vouchers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id        text NOT NULL REFERENCES public.food_club_campaigns(id),
  source             text NOT NULL CHECK (source IN ('card', 'referral', 'manual')),
  source_ref         text,
  value              numeric NOT NULL CHECK (value > 0),
  min_food           numeric NOT NULL CHECK (min_food > value),
  status             text NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available', 'reserved', 'used', 'expired', 'revoked')),
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  reserved_order_id  text REFERENCES public.kitchen_orders(id) ON DELETE SET NULL,
  reserved_at        timestamptz,
  used_order_id      text REFERENCES public.kitchen_orders(id) ON DELETE SET NULL,
  used_at            timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'reserved' OR reserved_order_id IS NOT NULL),
  CHECK (status <> 'used' OR used_order_id IS NOT NULL)
);
-- Un buono per ordine (riservato o usato), un ordine per buono.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_vouchers_one_per_reserved_order
  ON public.food_club_vouchers (reserved_order_id) WHERE status = 'reserved';
CREATE UNIQUE INDEX IF NOT EXISTS food_club_vouchers_one_per_used_order
  ON public.food_club_vouchers (used_order_id) WHERE used_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS food_club_vouchers_one_per_source
  ON public.food_club_vouchers (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS food_club_vouchers_user ON public.food_club_vouchers (user_id, status);

ALTER TABLE public.food_club_cards DROP CONSTRAINT IF EXISTS food_club_cards_voucher_fk;
ALTER TABLE public.food_club_cards ADD CONSTRAINT food_club_cards_voucher_fk
  FOREIGN KEY (voucher_id) REFERENCES public.food_club_vouchers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.food_club_voucher_events (
  id          bigserial PRIMARY KEY,
  voucher_id  uuid NOT NULL REFERENCES public.food_club_vouchers(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  event       text NOT NULL,
  order_id    text,
  actor       text NOT NULL DEFAULT 'system',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_club_voucher_events_voucher ON public.food_club_voucher_events (voucher_id, id);

-- Integrità: transizioni ammesse del buono (anche contro chiamate SECURITY DEFINER sbagliate).
CREATE OR REPLACE FUNCTION public.food_club_vouchers_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'available' AND NEW.status IN ('reserved', 'expired', 'revoked'))
    OR (OLD.status = 'reserved'  AND NEW.status IN ('used', 'available', 'expired'))
    OR (OLD.status = 'used'      AND NEW.status IN ('available', 'expired') AND NEW.used_order_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'food_club_voucher_invalid_transition %->%', OLD.status, NEW.status;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.value IS DISTINCT FROM OLD.value
     OR NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'food_club_voucher_immutable_fields';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS food_club_vouchers_transition_guard ON public.food_club_vouchers;
CREATE TRIGGER food_club_vouchers_transition_guard
  BEFORE UPDATE ON public.food_club_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.food_club_vouchers_transition_guard();

-- ---------------------------------------------------------------------------------------------------
-- 8) Inviti
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id      text NOT NULL REFERENCES public.food_club_campaigns(id),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'capped', 'void')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  qualified_order_id text,
  rewarded_at      timestamptz,
  reward_voucher_id uuid REFERENCES public.food_club_vouchers(id) ON DELETE SET NULL,
  CHECK (inviter_id <> invitee_id)
);
CREATE INDEX IF NOT EXISTS food_club_referrals_inviter ON public.food_club_referrals (inviter_id, rewarded_at);

-- ---------------------------------------------------------------------------------------------------
-- 9) Messaggi / notifiche (outbox) e preferenze sottoscrizioni push
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('stamp', 'voucher_unlocked', 'voucher_expiring', 'referral_reward', 'promo', 'winback')),
  category     text NOT NULL CHECK (category IN ('club', 'promo')),
  ref          text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  url          text NOT NULL DEFAULT '/kitchen/club',
  created_at   timestamptz NOT NULL DEFAULT now(),
  push_status  text NOT NULL DEFAULT 'queued' CHECK (push_status IN ('queued', 'sending', 'sent', 'skipped', 'failed')),
  push_after   timestamptz NOT NULL DEFAULT now(),
  push_claimed_at timestamptz,
  push_sent_at timestamptz,
  push_skip_reason text,
  push_attempts integer NOT NULL DEFAULT 0,
  read_at      timestamptz,
  opened_at    timestamptz,
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS food_club_messages_queue ON public.food_club_messages (push_status, push_after);
CREATE INDEX IF NOT EXISTS food_club_messages_user ON public.food_club_messages (user_id, created_at DESC);

-- Le sottoscrizioni attivate col testo "solo avviso ordine, niente pubblicità" restano 'order'.
ALTER TABLE public.kitchen_push_subscriptions
  ADD COLUMN IF NOT EXISTS consent_scope text NOT NULL DEFAULT 'order';
ALTER TABLE public.kitchen_push_subscriptions DROP CONSTRAINT IF EXISTS kitchen_push_subscriptions_consent_scope_check;
ALTER TABLE public.kitchen_push_subscriptions ADD CONSTRAINT kitchen_push_subscriptions_consent_scope_check
  CHECK (consent_scope IN ('order', 'club'));

-- ---------------------------------------------------------------------------------------------------
-- 10) Eventi di misura (analytics interne, nessuno strumento esterno)
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  text NOT NULL CHECK (event_name IN (
                'club_intro_view', 'join_start', 'otp_sent', 'join_done', 'login_done',
                'invite_shown', 'install_cta_click', 'install_prompt_shown', 'install_accepted',
                'install_dismissed', 'app_installed', 'first_standalone_open',
                'push_prompt_click', 'push_granted', 'push_denied',
                'voucher_applied_cart', 'referral_link_shared', 'notification_opened')),
  context     text CHECK (context IS NULL OR char_length(context) <= 40),
  platform    text CHECK (platform IS NULL OR char_length(platform) <= 30),
  day         date NOT NULL DEFAULT food_club_service_night(now()),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Deduplica: un evento per utente/nome/contesto/serata.
CREATE UNIQUE INDEX IF NOT EXISTS food_club_events_dedupe
  ON public.food_club_events (user_id, event_name, COALESCE(context, ''), day) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS food_club_events_name_day ON public.food_club_events (event_name, day);

-- ---------------------------------------------------------------------------------------------------
-- 11) Biglietti di unione (anonimo -> iscritto su altro dispositivo)
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_club_merge_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  source_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_hash    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  redeemed_at   timestamptz,
  redeemed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------------------------------
-- 12) RLS: lettura propria per il cliente, nessuna scrittura diretta per nessuno
-- ---------------------------------------------------------------------------------------------------
ALTER TABLE public.food_club_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_consent_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_cards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_stamps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_vouchers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_voucher_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_referrals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_merge_tickets   ENABLE ROW LEVEL SECURITY;

-- Grant di tabella espliciti: anon nulla; authenticated solo SELECT (filtrato da RLS) dove serve.
REVOKE ALL ON public.food_club_campaigns, public.food_club_members, public.food_club_consent_events,
              public.food_club_cards, public.food_club_stamps, public.food_club_vouchers,
              public.food_club_voucher_events, public.food_club_referrals, public.food_club_messages,
              public.food_club_events, public.food_club_merge_tickets
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.food_club_campaigns, public.food_club_members, public.food_club_cards,
                public.food_club_stamps, public.food_club_vouchers, public.food_club_messages
  TO authenticated;
GRANT ALL ON public.food_club_campaigns, public.food_club_members, public.food_club_consent_events,
             public.food_club_cards, public.food_club_stamps, public.food_club_vouchers,
             public.food_club_voucher_events, public.food_club_referrals, public.food_club_messages,
             public.food_club_events, public.food_club_merge_tickets
  TO service_role;
REVOKE ALL ON SEQUENCE public.food_club_consent_events_id_seq, public.food_club_voucher_events_id_seq,
                       public.food_club_events_id_seq FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS food_club_campaigns_read ON public.food_club_campaigns;
CREATE POLICY food_club_campaigns_read ON public.food_club_campaigns
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS food_club_members_own ON public.food_club_members;
CREATE POLICY food_club_members_own ON public.food_club_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS food_club_cards_own ON public.food_club_cards;
CREATE POLICY food_club_cards_own ON public.food_club_cards
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS food_club_stamps_own ON public.food_club_stamps;
CREATE POLICY food_club_stamps_own ON public.food_club_stamps
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS food_club_vouchers_own ON public.food_club_vouchers;
CREATE POLICY food_club_vouchers_own ON public.food_club_vouchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS food_club_messages_own ON public.food_club_messages;
CREATE POLICY food_club_messages_own ON public.food_club_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Staff: nessuna policy diretta. Le viste staff passano da funzioni SECURITY DEFINER con controllo
-- is_staff_for_venue e numero di telefono mascherato (vedi migration staff/analytics).

-- Le funzioni interne (prefisso food_club_ e trigger) non sono eseguibili dai client salvo GRANT esplicito.
REVOKE ALL ON FUNCTION public.food_club_service_night(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.food_club_service_night(timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.kitchen_menu_items_food_amount_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_vouchers_transition_guard() FROM PUBLIC, anon, authenticated;
