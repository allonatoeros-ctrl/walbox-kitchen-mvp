-- Kitchen Menu Items — aggiunta GARPEZ (item-059) al catalogo server, serata 15 anni.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Apply = decisione di Eros, solo con
-- `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md` §5.1), mai `apply_migration`
-- o `db query -f`. Autorizzata da Eros il 2026-10-16 ("aggiungi anche GARPEZ su supabase").
--
-- PERCHE'
-- `kitchen_customer_create_order` e' l'autorita' su catalogo e prezzo: alza `unknown_menu_item`
-- per ogni item_id assente da kitchen_menu_items (20260913130000, 20260923130000). Il GARPEZ
-- (`item-059`, 15 €, src/data/kitchenMockData.js) e' nel catalogo cliente dal 2026-10-13 ma in
-- nessuna migration: senza questa riga il cliente lo vede e non riesce ad ordinarlo.
--
-- COSA FA
--   UPSERT della sola riga ('walrus-main', 'item-059', 'Garpez', 15). Idempotente.
--
-- COSA NON FA (deliberatamente)
--   - Nessuna riga in `kitchen_menu_availability`: l'assenza di riga = disponibile (LEFT JOIN
--     nella RPC), e l'esaurito lo decide lo staff da `/kitchen/solo`.
--   - Nessun DDL, RPC, policy RLS, GRANT. Nessuna combo Fallo Pesante (decisione Eros).
--   - Non tocca item-013 / item-058 (gia' presenti dalla seed 20260916120000).
--
-- ROLLBACK
--   DELETE FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-059';
--   (gli ordini storici copiano name/price in kitchen_order_items, nessuna FK verso il catalogo)

INSERT INTO public.kitchen_menu_items (venue_id, item_id, name, price) VALUES
  ('walrus-main', 'item-059', 'Garpez', 15)  -- bbq, solo modalita' evento
ON CONFLICT (venue_id, item_id) DO UPDATE
  SET name       = EXCLUDED.name,
      price      = EXCLUDED.price,
      updated_at = now();

-- ---------------------------------------------------------------------------------------------
-- VERIFICHE per il Gate 2 (da eseguire a mano, NON parte della migration)
--
-- V1  Riga presente (attesa: 1 riga, Garpez, 15):
--     select item_id, name, price from kitchen_menu_items
--      where venue_id = 'walrus-main' and item_id = 'item-059';
--
-- V2  Catalogo completo (attese: 40 righe = 39 della seed meno item-057, piu' item-059):
--     select count(*) from kitchen_menu_items where venue_id = 'walrus-main' and price is not null;
--
-- V3  Nessuna availability che blocca il GARPEZ (attesa: 0 righe o available = true):
--     select * from kitchen_menu_availability where venue_id = 'walrus-main' and item_id = 'item-059';
-- ---------------------------------------------------------------------------------------------
