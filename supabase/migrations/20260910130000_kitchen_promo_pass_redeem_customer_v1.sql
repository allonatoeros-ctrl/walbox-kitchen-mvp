-- Kitchen Promo Pass — Redemption V2, Opzione 2: il cliente redime il proprio codice.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Do not run `supabase db push` / apply_migration
-- until Eros gives explicit Gate 2 approval (CLAUDE.md §3, SECURITY_POLICY.md §5).
--
-- Fonte: ai-ops/reports/kitchen-promo-customer-redeem-audit.md (Opzione 2 raccomandata e approvata
-- da Eros — 2026-09-10: cliente inserisce il codice nel drawer carrello, staff NON inserisce più
-- codici, SOLO mantiene solo il badge passivo).
--
-- CREATE OR REPLACE sulla funzione già live sul remoto (20260910120000_kitchen_promo_pass_redeem_v1.sql,
-- Opzione A staff-side). Unica riga di logica cambiata: il gate di autorizzazione, da "solo staff"
-- a "staff OR proprietario dell'ordine". Tutto il resto — lock FOR UPDATE, retry idempotente,
-- allowlist Pesi Massimi, calcolo sconto, guardia atomica anti-doppio-uso, blocco su ordine già
-- pagato/già scontato — resta identico, invariato.

CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_redeem_for_order(
  p_code     text,
  p_order_id text
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order       public.kitchen_orders;
  v_promo       public.kitchen_promo_passes;
  v_code        text := upper(btrim(coalesce(p_code, '')));
  v_unit_price  numeric;
  v_discount    numeric;
BEGIN
  IF v_code = '' THEN
    RAISE EXCEPTION 'invalid_promo_code';
  END IF;
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT (is_staff_for_venue(v_order.venue_id) OR v_order.customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_for_order';
  END IF;

  -- Retry idempotente: stesso codice già applicato a questo stesso ordine (doppio tap cliente /
  -- retry di rete) → ritorna l'ordine invariato invece di sbagliare o scontare due volte.
  IF v_order.promo_code = v_code THEN
    RETURN v_order;
  END IF;
  IF v_order.promo_code IS NOT NULL THEN
    RAISE EXCEPTION 'order_already_has_promo';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  SELECT * INTO v_promo
  FROM public.kitchen_promo_passes
  WHERE code = v_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_code_not_found';
  END IF;
  IF v_promo.status = 'redeemed' THEN
    RAISE EXCEPTION 'promo_already_redeemed';
  END IF;
  IF v_promo.venue_id <> v_order.venue_id THEN
    RAISE EXCEPTION 'promo_venue_mismatch';
  END IF;

  -- Scelta automatica server-side del Peso Massimo meno costoso presente nell'ordine. Allowlist
  -- hardcoded qui (non dal client): unico punto da aggiornare se in futuro cambiano i Pesi Massimi
  -- ordinabili.
  SELECT oi.price INTO v_unit_price
  FROM public.kitchen_order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.item_id = ANY (ARRAY['item-009', 'item-010', 'item-011', 'item-040', 'item-041', 'item-042'])
  ORDER BY oi.price ASC
  LIMIT 1;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'promo_no_eligible_item';
  END IF;

  v_discount := round(v_unit_price * 0.10, 2);

  UPDATE public.kitchen_orders
  SET discount_amount = v_discount,
      promo_code = v_code,
      total = total - v_discount
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Guardia atomica anti-doppio-uso: WHERE status='issued' garantisce che, in caso di due
  -- chiamate concorrenti sullo stesso codice, solo una aggiorni la riga. L'altra rientra qui con
  -- FOUND=false e l'intera transazione (incluso lo sconto sopra) viene annullata dall'eccezione.
  UPDATE public.kitchen_promo_passes
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid()
  WHERE code = v_promo.code AND status = 'issued';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_already_redeemed';
  END IF;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) TO authenticated;
