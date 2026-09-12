-- Kitchen Menu Items V1 — Server Price Contract V1, Migration A.
-- Spec: ai-ops/reports/server-price-contract-v1-design.md
-- Gate 1 approvato da Eros (2026-09-12): SOLO Migration A, nessun tocco a
-- RPC/frontend/kitchen_menu_availability. Additiva: nessuna tabella esistente
-- modificata. NON applicata a remoto in questo task.
--
-- Nessun campo `orderable` (decisione approvata): `kitchen_menu_availability`
-- resta l'unica authority sold-out/disponibilita'. `price IS NULL` qui significa
-- "in arrivo, non ordinabile" (item senza prezzo in kitchenMockData.js), non
-- "sold-out".
--
-- Rollback: DROP TABLE public.kitchen_menu_items;

CREATE TABLE public.kitchen_menu_items (
  venue_id    text NOT NULL,
  item_id     text NOT NULL,
  name        text NOT NULL,
  price       numeric,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_menu_items_pkey PRIMARY KEY (venue_id, item_id),
  CONSTRAINT kitchen_menu_items_price_check CHECK (price IS NULL OR price >= 0)
);

ALTER TABLE public.kitchen_menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_menu_items ON public.kitchen_menu_items
  FOR SELECT TO anon USING (venue_id = 'walrus-main'::text);

CREATE POLICY customer_select_menu_items ON public.kitchen_menu_items
  FOR SELECT TO authenticated USING (venue_id = 'walrus-main'::text);

CREATE POLICY staff_all_venue_menu_items ON public.kitchen_menu_items
  FOR ALL TO authenticated
  USING (is_staff_for_venue(venue_id)) WITH CHECK (is_staff_for_venue(venue_id));

-- Seed 1:1 da src/data/kitchenMockData.js (kitchenMenuItems, 37 righe: id/name/price).
-- kitchenPesiMassimiCombos NON incluso (non fa parte del catalogo standalone, vedi
-- commento in kitchenMockData.js).
INSERT INTO public.kitchen_menu_items (venue_id, item_id, name, price) VALUES
  ('walrus-main', 'item-001', 'Porchetta', 8.5),
  ('walrus-main', 'item-002', 'Panino del Tricheco', 9),
  ('walrus-main', 'item-012', 'Crudo Vero', 8),
  ('walrus-main', 'item-013', 'Orto Cattivo', 8),
  ('walrus-main', 'item-014', 'Crudo Ma Educato', 8),
  ('walrus-main', 'item-015', 'Specktacolo', 8),
  ('walrus-main', 'item-016', 'Wraptor', 8),
  ('walrus-main', 'item-017', 'Mortazza Classe Alta', 8),
  ('walrus-main', 'item-032', 'Porca Figura', 8),
  ('walrus-main', 'item-033', 'Panino Straccetti', 8),
  ('walrus-main', 'item-003', 'Patatine da Banco', 4),
  ('walrus-main', 'item-004', 'Patatine Fuori di Testa', 5.5),
  ('walrus-main', 'item-005', 'Birra del Tricheco', 5),
  ('walrus-main', 'item-006', 'Birra Scura Problemática', 5.5),
  ('walrus-main', 'item-007', 'Combo CAVALLOOOO', 16),
  ('walrus-main', 'item-008', 'Combo Sta Salendo Male', 17.5),
  ('walrus-main', 'item-009', 'Pulled Pork', 13.9),
  ('walrus-main', 'item-010', 'Pastrami', 14.5),
  ('walrus-main', 'item-011', 'Brisket', 15),
  ('walrus-main', 'item-020', 'Cruda e Contenta', NULL),
  ('walrus-main', 'item-021', 'Dolce ma Cruda', NULL),
  ('walrus-main', 'item-034', 'Mortazza', NULL),
  ('walrus-main', 'item-035', 'Lardo & Noci', NULL),
  ('walrus-main', 'item-036', 'Scamorza & Cipolle', NULL),
  ('walrus-main', 'item-037', 'Ciappi Veg', NULL),
  ('walrus-main', 'item-024', 'Caesar', NULL),
  ('walrus-main', 'item-025', 'Salmon', NULL),
  ('walrus-main', 'item-027', 'Veggy', NULL),
  ('walrus-main', 'item-038', 'Acqua', NULL),
  ('walrus-main', 'item-043', 'Salumi Serissimi', 8),
  ('walrus-main', 'item-044', 'Formaggi Discutibili', 8),
  ('walrus-main', 'item-045', 'Pace Fatta', 8),
  ('walrus-main', 'item-046', 'Pepsi 33cl', NULL),
  ('walrus-main', 'item-047', 'Pepsi Zero', NULL),
  ('walrus-main', 'item-048', 'Seven Up', NULL),
  ('walrus-main', 'item-049', 'Schweppes Lemon', NULL),
  ('walrus-main', 'item-050', 'Schweppes Tonica', NULL);
