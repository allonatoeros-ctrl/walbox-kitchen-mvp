-- Kitchen Menu Items — CATALOG SYNC V2 (P0-1 del failure-mode sweep pre-apertura 18/09).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Serve il **Gate 2 esplicito di Eros** per l'apply
-- (`ai-ops/SECURITY_POLICY.md` §5.1: solo `supabase db push --linked`, mai `apply_migration`
-- o `db query -f`, che rigenerano la version e hanno gia' causato drift del ledger).
--
-- PERCHE'
-- `kitchen_customer_create_order` e' l'autorita' su catalogo e prezzo: alza `unknown_menu_item`
-- per ogni item_id assente da kitchen_menu_items e `item_not_orderable` per ogni riga con
-- price IS NULL (20260913130000 §2). Il catalogo remoto e' fermo alla seed del 2026-09-12
-- (37 righe, verificate live il 2026-09-15 in
-- `ai-ops/reports/supabase-live-release-certification-fase1-20260915.md`), mentre il catalogo
-- cliente e' cambiato tre volte da allora (cleanup item-001..008, BEER SPRINT V1, Menu Polish).
-- Risultato misurato: 28 voci su 40 non ordinabili o con prezzo divergente — cliente E cassa.
--
-- COSA FA (tutto idempotente, rieseguibile senza effetti diversi)
--   §1  UPSERT delle 40 voci del catalogo cliente corrente (37 item + 3 combo FALLO PESANTE).
--   §2  Ritira le 9 righe legacy non piu' nel catalogo: price -> NULL, quindi
--       `item_not_orderable`. NON le cancella: `kitchen_order_items.item_id` e' testo senza FK,
--       ma resta un riferimento storico leggibile. Il DELETE definitivo e' una decisione
--       separata di Eros, non di questa migration.
--   §3  Rimuove le righe di `kitchen_menu_availability` che puntano a item_id fuori catalogo
--       (residui di sprint precedenti: senza riga catalogo l'ordine e' comunque rifiutato, ma
--       restano rumore che confonde la MenuView staff).
--
-- COSA NON FA (deliberatamente)
--   - Non tocca nessuna migration storica, nessuna funzione/RPC, nessuna policy RLS, nessun
--     GRANT, nessuna colonna, nessun dato d'ordine.
--   - Non forza `available = true` su nessun item del catalogo corrente: l'availability e'
--     intento dello staff, non la sovrascrive una migration. Se una riga stale marca ESAURITO
--     un piatto che venerdi' deve vendere, si vede con la query di verifica §4.3 e si sistema
--     dalla MenuView di `/kitchen/solo` — non da qui.
--   - Non aggiunge righe a prezzo 0 per la birra inclusa in FALLO PESANTE: sarebbero ordinabili
--     da sole gratis via RPC. La birra scelta viaggia in `customer_note` (P0-2, solo client).
--
-- CONTRATTO PRESERVATO
--   Le 3 righe combo entrano con l'id che il client manda davvero (`baseId` = item-040/041/042,
--   `PesiMassimiSection.jsx`), che e' lo stesso id nell'allowlist promo di
--   `kitchen_promo_pass_redeem_for_order` (20260910130000): l'allowlist resta valida invariata.
--
-- ROLLBACK
--   Ripristinare i valori della seed 20260912100000 con lo stesso UPSERT (nessuna riga viene
--   creata/cancellata in §1/§2, solo name/price aggiornati) e reinserire le eventuali righe
--   `kitchen_menu_availability` rimosse da §3 (elencate dalla verifica §4.4 PRIMA dell'apply).

-- ---------------------------------------------------------------------------------------------
-- §1 — Catalogo cliente corrente: 40 voci (name + price authority server-side)
--     Fonte: src/data/kitchenMockData.js (kitchenMenuItems + kitchenPesiMassimiCombos) @ 2026-09-16
-- ---------------------------------------------------------------------------------------------

INSERT INTO public.kitchen_menu_items (venue_id, item_id, name, price) VALUES
  ('walrus-main', 'item-009', 'Pulled Pork', 13.9),  -- bbq
  ('walrus-main', 'item-010', 'Pastrami', 14.5),  -- bbq
  ('walrus-main', 'item-011', 'Brisket', 15),  -- bbq
  ('walrus-main', 'item-012', 'Crudo Vero', 8),  -- panini
  ('walrus-main', 'item-013', 'Orto Cattivo', 8),  -- panini
  ('walrus-main', 'item-014', 'Crudo Ma Educato', 8),  -- panini
  ('walrus-main', 'item-015', 'Specktacolo', 8),  -- panini
  ('walrus-main', 'item-016', 'Wraptor', 8),  -- panini
  ('walrus-main', 'item-017', 'Mortazza Classe Alta', 8),  -- panini
  ('walrus-main', 'item-018', 'Box Pulled Pork', 11.5),  -- bbq
  ('walrus-main', 'item-020', 'Cruda e Contenta', 12.5),  -- tartare
  ('walrus-main', 'item-021', 'Dolce ma Cruda', 10.5),  -- tartare
  ('walrus-main', 'item-024', 'Caesar', 10),  -- insalatone
  ('walrus-main', 'item-025', 'Salmon', 12),  -- insalatone
  ('walrus-main', 'item-027', 'Veggy', 10),  -- insalatone
  ('walrus-main', 'item-032', 'Porca Figura', 8),  -- panini
  ('walrus-main', 'item-034', 'Mortazza', 5),  -- cicchetti
  ('walrus-main', 'item-035', 'Lardo & Noci', 5),  -- cicchetti
  ('walrus-main', 'item-036', 'Scamorza & Cipolle', 6),  -- cicchetti
  ('walrus-main', 'item-037', 'Cicchetto Veg', 5),  -- cicchetti
  ('walrus-main', 'item-038', 'Acqua', 1),  -- bevande
  ('walrus-main', 'item-040', 'Pulled Pork — Fallo Pesante', 19),  -- combo FALLO PESANTE su item-009
  ('walrus-main', 'item-041', 'Pastrami — Fallo Pesante', 20),  -- combo FALLO PESANTE su item-010
  ('walrus-main', 'item-042', 'Brisket — Fallo Pesante', 20),  -- combo FALLO PESANTE su item-011
  ('walrus-main', 'item-043', 'Salumi Serissimi', 8),  -- tagliere
  ('walrus-main', 'item-044', 'Formaggi Discutibili', 8),  -- tagliere
  ('walrus-main', 'item-045', 'Pace Fatta', 10),  -- tagliere
  ('walrus-main', 'item-046', 'Pepsi 33cl', 4),  -- bevande
  ('walrus-main', 'item-047', 'Pepsi Zero', 4),  -- bevande
  ('walrus-main', 'item-048', 'Seven Up', 4),  -- bevande
  ('walrus-main', 'item-049', 'Schweppes Lemon', 4),  -- bevande
  ('walrus-main', 'item-050', 'Schweppes Tonica', 4),  -- bevande
  ('walrus-main', 'item-051', 'Keiler Helles', 6),  -- birre
  ('walrus-main', 'item-052', 'Keiler Land-Pils', 6),  -- birre
  ('walrus-main', 'item-053', 'Keiler Kellerbier', 6),  -- birre
  ('walrus-main', 'item-054', 'Keiler Weisse', 6),  -- birre
  ('walrus-main', 'item-055', 'Keiler Dunkel Weisse', 6),  -- birre
  ('walrus-main', 'item-056', 'Lupulus', 6),  -- birre
  ('walrus-main', 'item-057', 'Krombacher Pils', 6),  -- birre
  ('walrus-main', 'item-058', 'Patate al Forno', 5)  -- contorni
ON CONFLICT (venue_id, item_id) DO UPDATE
  SET name       = EXCLUDED.name,
      price      = EXCLUDED.price,
      updated_at = now();

-- ---------------------------------------------------------------------------------------------
-- §2 — Righe legacy fuori catalogo: rese non ordinabili, non cancellate
--     9 id: 'item-001', 'item-002', 'item-003', 'item-004', 'item-005', 'item-006', 'item-007', 'item-008', 'item-033'
--     (item-001..008 rimossi dal catalogo dal cleanup `ai-ops/runs/cleanup-legacy-menu-items`;
--      item-033 "Panino Straccetti" mai presente in kitchenMockData.js corrente)
-- ---------------------------------------------------------------------------------------------

UPDATE public.kitchen_menu_items
   SET price = NULL,
       updated_at = now()
 WHERE venue_id = 'walrus-main'
   AND item_id IN ('item-001', 'item-002', 'item-003', 'item-004', 'item-005', 'item-006', 'item-007', 'item-008', 'item-033')
   AND price IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- §3 — Availability orfana (item_id non presente in kitchen_menu_items dopo §1)
-- ---------------------------------------------------------------------------------------------

DELETE FROM public.kitchen_menu_availability a
 WHERE a.venue_id = 'walrus-main'
   AND NOT EXISTS (
     SELECT 1 FROM public.kitchen_menu_items m
      WHERE m.venue_id = a.venue_id AND m.item_id = a.item_id
   );

-- ---------------------------------------------------------------------------------------------
-- §4 — VERIFICHE per il Gate 2 (da eseguire a mano, NON parte della migration)
--
-- §4.1  Conteggio e contenuto post-apply (attese: 40 ordinabili, 9 con price NULL fra i legacy):
--       select item_id, name, price from kitchen_menu_items
--        where venue_id = 'walrus-main' order by item_id;
--
-- §4.2  Nessuna voce del menu cliente resta non ordinabili (attesa: 0 righe):
--       select item_id, name from kitchen_menu_items
--        where venue_id = 'walrus-main' and price is null
--          and item_id not in ('item-001', 'item-002', 'item-003', 'item-004', 'item-005', 'item-006', 'item-007', 'item-008', 'item-033');
--
-- §4.3  PRE-APPLY — item del catalogo corrente marcati ESAURITO da righe stale (attesa: 0;
--       se ne esce qualcuno NON va toccato da qui, si sblocca dalla MenuView staff):
--       select a.item_id, a.available from kitchen_menu_availability a
--        where a.venue_id = 'walrus-main' and a.available = false;
--
-- §4.4  PRE-APPLY — righe availability che §3 cancellera' (da salvare per il rollback):
--       select a.* from kitchen_menu_availability a
--        where a.venue_id = 'walrus-main'
--          and a.item_id not in (select item_id from kitchen_menu_items
--                                 where venue_id = 'walrus-main');
-- ---------------------------------------------------------------------------------------------
