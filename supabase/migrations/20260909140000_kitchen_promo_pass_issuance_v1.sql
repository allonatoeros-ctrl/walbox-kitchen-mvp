-- Kitchen Promo Pass Issuance V1 — vero PASS personale per /kitchen/promo.
-- Spec: ai-ops/reports/kitchen-promo-pass-issuance-v1-spec.md
-- Gate 1 approvato da Eros (2026-09-09) con una modifica: NESSUN fallback
-- md5/random per la generazione del codice. pgcrypto (extensions.gen_random_bytes)
-- verificato disponibile e attivo sul progetto in Gate 1 (mcp__supabase__list_extensions,
-- installed_version 1.3, schema "extensions") prima di scrivere questo file.
--
-- Nessuna redemption in questo scope: status resta 'issued', redeemed_at/redeemed_by
-- restano NULL finche' un task V2 dedicato non viene approvato separatamente.

CREATE TABLE public.kitchen_promo_passes (
  id            text PRIMARY KEY DEFAULT ('promo-' || gen_random_uuid()::text),
  code          text NOT NULL,
  venue_id      text NOT NULL DEFAULT 'walrus-main',
  customer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign      text NOT NULL DEFAULT 'personalita_discutibile_v1',
  benefit       text NOT NULL DEFAULT '-10% primo panino',
  status        text NOT NULL DEFAULT 'issued'
                  CHECK (status IN ('issued', 'redeemed')),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  redeemed_at   timestamptz,
  redeemed_by   uuid,
  CONSTRAINT kitchen_promo_passes_code_key UNIQUE (code),
  CONSTRAINT kitchen_promo_passes_one_per_customer UNIQUE (venue_id, customer_id, campaign)
);

CREATE INDEX kitchen_promo_passes_customer_idx
  ON public.kitchen_promo_passes USING btree (customer_id, campaign);

ALTER TABLE public.kitchen_promo_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_select_own_promo_pass ON public.kitchen_promo_passes
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY staff_select_promo_passes ON public.kitchen_promo_passes
  FOR SELECT USING (is_staff_for_venue(venue_id));

-- Nessuna policy INSERT/UPDATE/DELETE: l'unico canale di scrittura e' l'RPC
-- SECURITY DEFINER sotto, stesso pattern di kitchen_customer_create_order.

CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_issue(
  p_venue_id  text,
  p_campaign  text DEFAULT 'personalita_discutibile_v1'
)
RETURNS public.kitchen_promo_passes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_existing public.kitchen_promo_passes;
  v_new      public.kitchen_promo_passes;
  v_code     text;
  v_attempt  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'customer_session_required';
  END IF;
  IF p_venue_id IS NULL OR btrim(p_venue_id) = '' THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;

  SELECT * INTO v_existing
  FROM public.kitchen_promo_passes
  WHERE venue_id = p_venue_id AND customer_id = auth.uid() AND campaign = p_campaign;
  IF FOUND THEN
    RETURN v_existing; -- idempotente: stesso cliente, stesso pass
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'WALRUS-' || (
      SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                (get_byte(extensions.gen_random_bytes(1), 0) % 33) + 1, 1), '')
      FROM generate_series(1, 5)
    );
    BEGIN
      INSERT INTO public.kitchen_promo_passes (venue_id, customer_id, campaign, code)
      VALUES (p_venue_id, auth.uid(), p_campaign, v_code)
      RETURNING * INTO v_new;
      RETURN v_new;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE EXCEPTION 'promo_pass_code_generation_failed';
      END IF;
      -- retry: puo' essere collisione sul codice (raro) o sul vincolo per-cliente
      -- (race tra due tab), in quel caso il prossimo giro trova v_existing... ma
      -- serve rientrare nel ramo SELECT, quindi si ricontrolla qui:
      SELECT * INTO v_existing
      FROM public.kitchen_promo_passes
      WHERE venue_id = p_venue_id AND customer_id = auth.uid() AND campaign = p_campaign;
      IF FOUND THEN
        RETURN v_existing;
      END IF;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_promo_pass_issue(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_promo_pass_issue(text, text) TO authenticated;
