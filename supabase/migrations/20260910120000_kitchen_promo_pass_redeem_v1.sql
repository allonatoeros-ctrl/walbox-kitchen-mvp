-- Kitchen Promo Pass — Redemption V2 (smallest safe V2, Opzione A: staff-side, al pagamento).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Do not run `supabase db push` / apply_migration
-- until Eros gives explicit Gate 2 approval (CLAUDE.md §3, SECURITY_POLICY.md §5).
--
-- Fonte: ai-ops/reports/kitchen-promo-redeem-feasibility-audit.md (Opzione A raccomandata) +
-- kitchen-promo-code-uniqueness-audit.md (smallest next patch). Regole prodotto approvate da Eros
-- (2026-09-10): promo valida solo sui Pesi Massimi; -10% su un solo Peso Massimo per ordine;
-- scelta automatica server-side del Peso Massimo meno costoso; staff inserisce solo il codice,
-- nessun calcolo/manual selection; se nessun Peso Massimo è presente nessuno sconto e il pass non
-- viene consumato; stesso codice = single-use; retry sullo stesso ordine è idempotente.
--
-- Allowlist item_id verificata sul codice reale prima di scrivere questa migration (non dal
-- client): src/components/kitchen/PesiMassimiSection.jsx (LO VOGLIO → item.id, FALLO PESANTE →
-- combo.id) + src/data/kitchenMockData.js — sono gli UNICI 6 item_id che un Peso Massimo può
-- produrre in kitchen_order_items: item-009/010/011 (Pulled Pork/Pastrami/Brisket, solo panino) e
-- item-040/041/042 (stessi tre, combo "Fallo Pesante").
--
-- Nessuna nuova tabella: 2 colonne nullable/default su kitchen_orders (retrocompatibili) + 1 RPC
-- SECURITY DEFINER, stesso pattern già in uso in questo repo per kitchen_payment_record_counter e
-- kitchen_promo_pass_issue. Le RPC Payment Hub (kitchen_payment_record_counter/confirm) non sono
-- toccate: ereditano lo sconto leggendo kitchen_orders.total, a costo zero.

ALTER TABLE public.kitchen_orders
  ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN promo_code text;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_discount_amount_check CHECK (discount_amount >= 0);

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
  IF NOT is_staff_for_venue(v_order.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  -- Retry idempotente: stesso codice già applicato a questo stesso ordine (doppio click staff /
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
