-- Kitchen Menu Items — MENU Pulled Pork torna sul PANINO (non piu sul Box).
--
-- LOCAL BUILD ONLY finche' Eros non decide. Apply = solo `npx supabase db push --linked`
-- (`ai-ops/SECURITY_POLICY.md` §5.1). Decisione di Eros del 2026-10-30.
--
-- PERCHE'
-- La migration 20261028120000 aveva rinominato item-040/item-060 in "Box Pulled Pork — ...".
-- Eros: il menu Fallo Pesante del Pulled Pork torna sul panino Pulled Pork (item-009), come prima
-- del 28/10, a 19 euro (stesso prezzo con birra o con bibita). Il Box Pulled Pork (item-018) si vende solo.
-- Gli id restano gli stessi: il server prezza per item_id, cambia solo il nome mostrato/stampato.
--
-- COSA FA
--   UPDATE del solo `name` di 2 righe esistenti in `kitchen_menu_items`. Idempotente. Prezzi invariati (19).
--
-- COSA NON FA
--   Nessun DDL, RPC, policy, GRANT. Non tocca item-018, Pastrami, Brisket, bibite.
--
-- FINESTRA TRA DB PUSH E DEPLOY
--   Il prezzo non cambia: la finestra tra db push e deploy frontend e' solo di etichetta (nome), senza impatto sull'incasso.
--
-- ROLLBACK (nomi sul Box)
--   UPDATE kitchen_menu_items SET name = 'Box Pulled Pork — Fallo Pesante', updated_at = now() WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
--   UPDATE kitchen_menu_items SET name = 'Box Pulled Pork — Menu Bibita', updated_at = now() WHERE venue_id = 'walrus-main' AND item_id = 'item-060';

UPDATE public.kitchen_menu_items SET name = 'Pulled Pork — Fallo Pesante', updated_at = now()
 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';

UPDATE public.kitchen_menu_items SET name = 'Pulled Pork — Menu Bibita', updated_at = now()
 WHERE venue_id = 'walrus-main' AND item_id = 'item-060';

-- VERIFICA (a mano, dopo il push):
--   select item_id, name, price from kitchen_menu_items where venue_id = 'walrus-main'
--    and item_id in ('item-040','item-060') order by item_id;
--   attese: 040 = 'Pulled Pork — Fallo Pesante' 19 · 060 = 'Pulled Pork — Menu Bibita' 19
