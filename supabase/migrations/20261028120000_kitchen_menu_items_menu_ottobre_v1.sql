-- Kitchen Menu Items — MENU OTTOBRE: menu con birra / con bibita a prezzi diversi + bibite nuove.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Apply = decisione di Eros, solo con
-- `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md` §5.1), mai `apply_migration`
-- o `db query -f`. Richiesta di Eros del 2026-10-28 (report `ai-ops/reports/menu-update-ottobre.md`).
--
-- PERCHE'
-- `kitchen_customer_create_order(_v2)` e' l'autorita' su catalogo e prezzo (alza `unknown_menu_item`
-- per ogni item_id assente). Nuovi prezzi decisi da Eros:
--   - MENU Box Pulled Pork: 15,90 con birra (item-040), 13,90 con bibita (item-060, nuovo).
--     Il menu Pulled Pork ora e' sul BOX (patate gia' nella box), non piu' sul panino.
--   - MENU Pastrami / Brisket: 17,90 con birra (item-041/042), 16,90 con bibita (item-061/062, nuovi).
--   - Bibite nuove a 4 €: Fanta (item-063), Sprite (item-064), Estathé Pesca (item-065),
--     Estathé Limone (item-066).
-- Il server prezza per item_id: la variante bibita ha quindi un id proprio (la bevanda scelta resta
-- una nota per la cucina, come oggi).
--
-- COSA FA
--   UPSERT di 10 righe in `kitchen_menu_items`. Idempotente.
--
-- COSA NON FA (deliberatamente)
--   - NON cancella Schweppes Lemon/Tonica (item-049/050): il frontend in produzione le mostra
--     ancora finche' non va online il nuovo codice (supabase/CLAUDE.md regola 5, migration
--     additiva). Spariscono dal menu col deploy; le righe restano orfane e innocue. Si possono
--     cancellare con una migration dedicata dopo il deploy.
--   - Nessuna riga in `kitchen_menu_availability` (assenza = disponibile).
--   - Non tocca le allowlist promo (`kitchen_promo_pass_redeem*`, payment integrity): le varianti
--     bibita item-060/061/062 non sono scontabili col pass promo (funzione dormiente, pagina
--     `/kitchen/promo` legacy). Nessun DDL, RPC, policy RLS, GRANT.
--
-- FINESTRA TRA DB PUSH E DEPLOY
--   Con il frontend vecchio i menu costano gia' 15,90/17,90 lato server (il cliente paga il
--   totale del server, che e' piu' basso di quello mostrato): fare db push e deploy di seguito.
--
-- ROLLBACK
--   UPDATE kitchen_menu_items SET name = 'Pulled Pork — Fallo Pesante', price = 19, updated_at = now()
--    WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
--   UPDATE kitchen_menu_items SET price = 20, updated_at = now()
--    WHERE venue_id = 'walrus-main' AND item_id IN ('item-041', 'item-042');
--   DELETE FROM kitchen_menu_items WHERE venue_id = 'walrus-main'
--    AND item_id IN ('item-060','item-061','item-062','item-063','item-064','item-065','item-066');
--   (gli ordini storici copiano name/price in kitchen_order_items, nessuna FK verso il catalogo)

INSERT INTO public.kitchen_menu_items (venue_id, item_id, name, price) VALUES
  ('walrus-main', 'item-040', 'Box Pulled Pork — Fallo Pesante', 15.9),  -- menu box, con birra
  ('walrus-main', 'item-041', 'Pastrami — Fallo Pesante', 17.9),         -- menu, con birra
  ('walrus-main', 'item-042', 'Brisket — Fallo Pesante', 17.9),          -- menu, con birra
  ('walrus-main', 'item-060', 'Box Pulled Pork — Menu Bibita', 13.9),    -- menu box, con bibita
  ('walrus-main', 'item-061', 'Pastrami — Menu Bibita', 16.9),           -- menu, con bibita
  ('walrus-main', 'item-062', 'Brisket — Menu Bibita', 16.9),            -- menu, con bibita
  ('walrus-main', 'item-063', 'Fanta', 4),
  ('walrus-main', 'item-064', 'Sprite', 4),
  ('walrus-main', 'item-065', 'Estathé Pesca', 4),
  ('walrus-main', 'item-066', 'Estathé Limone', 4)
ON CONFLICT (venue_id, item_id) DO UPDATE
  SET name       = EXCLUDED.name,
      price      = EXCLUDED.price,
      updated_at = now();

-- ---------------------------------------------------------------------------------------------
-- VERIFICHE per il Gate 2 (da eseguire a mano, NON parte della migration)
--
-- V1  Le 10 righe (attese: prezzi come sopra):
--     select item_id, name, price from kitchen_menu_items where venue_id = 'walrus-main'
--      and item_id in ('item-040','item-041','item-042','item-060','item-061','item-062',
--                      'item-063','item-064','item-065','item-066') order by item_id;
--
-- V2  Nessuna availability che le blocca (attese: 0 righe o available = true):
--     select * from kitchen_menu_availability where venue_id = 'walrus-main'
--      and item_id in ('item-060','item-061','item-062','item-063','item-064','item-065','item-066');
-- ---------------------------------------------------------------------------------------------
