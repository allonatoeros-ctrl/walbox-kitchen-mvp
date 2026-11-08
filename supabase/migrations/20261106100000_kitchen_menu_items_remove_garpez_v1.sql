-- Kitchen Menu Items — rimozione Garpez (item-059) dal catalogo server.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTO. Serve il Gate 2 esplicito di Eros per l'apply
-- (`ai-ops/SECURITY_POLICY.md` §5.1: solo `supabase db push --linked`).
--
-- ORDINE DI RILASCIO (supabase/CLAUDE.md regola 5): prima il deploy del frontend senza Garpez
-- (kitchenMockData.js), POI questa migration. Se il DELETE andasse in produzione prima del
-- deploy, il frontend live mostrerebbe ancora il Garpez e l'ordine verrebbe rifiutato.
--
-- PERCHE'
-- Il Garpez era il panino stagionale dei 15 anni (decisione Eros, 2026-11-06: esaurito per
-- sempre, via da ovunque). Non compare piu' in `kitchenMenuItems`; la riga sopravvive in
-- `kitchen_menu_items` (inserita da 20261016100000, prezzo 15) come dato orfano.
--
-- COSA FA
--   DELETE della sola riga ('walrus-main', 'item-059'). Idempotente.
--
-- COSA NON FA
--   - Non tocca `kitchen_order_items` (copia name/price nell'ordine, nessuna FK): gli ordini
--     storici con Garpez restano leggibili.
--   - Non tocca `kitchen_menu_availability`: eventuale riga residua resta orfana e innocua.
--
-- ROLLBACK
--   INSERT INTO public.kitchen_menu_items (venue_id, item_id, name, price)
--   VALUES ('walrus-main', 'item-059', 'Garpez', 15)
--   ON CONFLICT (venue_id, item_id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, updated_at = now();

DELETE FROM public.kitchen_menu_items
 WHERE venue_id = 'walrus-main'
   AND item_id = 'item-059';

-- VERIFICHE per il Gate 2 (a mano, NON parte della migration)
-- V1  Riga rimossa (attesa: 0 righe):
--     select * from kitchen_menu_items where venue_id = 'walrus-main' and item_id = 'item-059';
-- V2  Ordini storici intatti (facoltativo, sola lettura):
--     select order_id, name, price, quantity from kitchen_order_items
--      where venue_id = 'walrus-main' and item_id = 'item-059';
