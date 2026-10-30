-- Kitchen Menu Items — MENU FALLO PESANTE: prezzi tornano come prima del 28/10.
--
-- LOCAL BUILD ONLY finche' Eros non decide. Apply = solo `npx supabase db push --linked`
-- (`ai-ops/SECURITY_POLICY.md` §5.1). Decisione di Eros del 2026-10-30
-- (stato in `ai-ops/current/PREZZI_ROLLBACK.md`).
--
-- PERCHE'
-- `kitchen_customer_create_order(_v2/_v3)` prezza dal catalogo per item_id. La migration
-- 20261028120000 (menu ottobre) aveva messo menu con birra 15,90/17,90 e con bibita 13,90/16,90.
-- Eros: si torna ai prezzi di prima, 19 / 20 / 20, STESSO prezzo con birra o con bibita.
-- Resta la struttura nuova (menu Pulled Pork sul Box, varianti bibita item-060/061/062, bibite nuove).
--
-- COSA FA
--   UPDATE del prezzo di 6 righe esistenti in `kitchen_menu_items`. Idempotente. Nomi invariati.
--
-- COSA NON FA
--   Nessun DDL, RPC, policy, GRANT. Non tocca panini singoli ne' bibite (invariati).
--
-- FINESTRA TRA DB PUSH E DEPLOY
--   Fare deploy del frontend (prezzi 19/20/20) e db push uno subito dopo l'altro: in mezzo il prezzo
--   mostrato e quello incassato divergono (il cliente paga sempre il totale del server).
--
-- ROLLBACK (prezzi menu ottobre)
--   UPDATE kitchen_menu_items SET price = 15.9, updated_at = now() WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
--   UPDATE kitchen_menu_items SET price = 17.9, updated_at = now() WHERE venue_id = 'walrus-main' AND item_id IN ('item-041','item-042');
--   UPDATE kitchen_menu_items SET price = 13.9, updated_at = now() WHERE venue_id = 'walrus-main' AND item_id = 'item-060';
--   UPDATE kitchen_menu_items SET price = 16.9, updated_at = now() WHERE venue_id = 'walrus-main' AND item_id IN ('item-061','item-062');

UPDATE public.kitchen_menu_items SET price = 19, updated_at = now()
 WHERE venue_id = 'walrus-main' AND item_id IN ('item-040', 'item-060');

UPDATE public.kitchen_menu_items SET price = 20, updated_at = now()
 WHERE venue_id = 'walrus-main' AND item_id IN ('item-041', 'item-042', 'item-061', 'item-062');

-- VERIFICA (a mano, dopo il push):
--   select item_id, name, price from kitchen_menu_items where venue_id = 'walrus-main'
--    and item_id in ('item-040','item-041','item-042','item-060','item-061','item-062') order by item_id;
--   attese: 040/060 = 19 · 041/042/061/062 = 20
