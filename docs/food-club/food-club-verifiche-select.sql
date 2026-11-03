-- =====================================================================================
-- WALRUS FOOD CLUB V1 — Verifiche preliminari (Fase 2)
-- SOLO SELECT. Nessuna scrittura, nessuna funzione volatile che modifica dati.
-- Eseguire su `pcrqfdzipotprqtuemso` con un ruolo in sola lettura (es. MCP Supabase di progetto, read-only).
-- Ogni query è autonoma: si può lanciare una alla volta.
--
-- Convenzioni (decisioni approvate da Eros, Fase 2):
--   * periodo      = ultimi 30 giorni da adesso
--   * locale       = venue_id 'walrus-main' (unico venue nel codice: verificare che sia Melegnano)
--   * "pagato"     = payment_status = 'paid' (esclude refunded, cancelled, PA, PCP non pagati)
--   * serata       = (created_at in Europe/Rome − 6 h)::date  → giornata di servizio con taglio alle 06:00
--   * food         = categorie panini, bbq, cicchetti, contorni, insalatone, tagliere, tartare
--                    (mappa copiata da src/data/kitchenMockData.js + CATEGORY_BY_ITEM_ID in
--                    src/lib/kitchenServiceRules.js:425-436, branch feat/restyling-hero).
--                    Combo FALLO PESANTE (item-040/041/042/060/061/062) = food per intero (D4, opzione A).
--   * spesa food   = Σ price × quantity delle sole righe food (price = prezzo catalogo al momento dell'ordine)
--   * ordine staff = nickname 'BANCO' + marcatore 'ORDINE ASSISTITO — SENZA APP' in customer_note
--                    (src/pages/CounterAssistedOrder.jsx:35-41)
-- =====================================================================================


-- -------------------------------------------------------------------------------------
-- Q0 — Base: ordini nel periodo per stato/pagamento (controllo di coerenza con "727 pagati")
-- -------------------------------------------------------------------------------------
SELECT status, payment_status, payment_method, count(*) AS ordini
FROM public.kitchen_orders
WHERE venue_id = 'walrus-main'
  AND created_at >= now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY ordini DESC;


-- -------------------------------------------------------------------------------------
-- Q1 — Soglie: % ordini food pagati che raggiungono 10 / 12 / 15 € di food
--      (+ mediana/media di controllo e quante righe non hanno categoria nota)
-- -------------------------------------------------------------------------------------
WITH cat(item_id, cat) AS (
  VALUES
  -- food
  ('item-009','food'),('item-010','food'),('item-011','food'),('item-018','food'),('item-059','food'),
  ('item-012','food'),('item-013','food'),('item-014','food'),('item-015','food'),('item-016','food'),
  ('item-017','food'),('item-032','food'),
  ('item-020','food'),('item-021','food'),
  ('item-024','food'),('item-025','food'),('item-027','food'),
  ('item-034','food'),('item-035','food'),('item-036','food'),('item-037','food'),
  ('item-043','food'),('item-044','food'),('item-045','food'),
  ('item-058','food'),
  ('item-040','food'),('item-041','food'),('item-042','food'),
  ('item-060','food'),('item-061','food'),('item-062','food'),
  -- drink
  ('item-038','drink'),('item-046','drink'),('item-047','drink'),('item-048','drink'),
  ('item-049','drink'),('item-050','drink'),
  ('item-063','drink'),('item-064','drink'),('item-065','drink'),('item-066','drink'),
  ('item-051','drink'),('item-052','drink'),('item-053','drink'),('item-054','drink'),
  ('item-055','drink'),('item-056','drink'),('item-057','drink')
),
paid AS (
  SELECT o.id
  FROM public.kitchen_orders o
  WHERE o.venue_id = 'walrus-main'
    AND o.payment_status = 'paid'
    AND o.created_at >= now() - interval '30 days'
),
per_order AS (
  SELECT p.id,
         sum(CASE WHEN c.cat = 'food' THEN i.price * i.quantity ELSE 0 END) AS food_eur,
         bool_or(c.cat IS NULL)                                             AS ha_righe_ignote
  FROM paid p
  JOIN public.kitchen_order_items i ON i.order_id = p.id
  LEFT JOIN cat c ON c.item_id = i.item_id
  GROUP BY p.id
)
SELECT
  (SELECT count(*) FROM paid)                                          AS ordini_pagati,
  count(*) FILTER (WHERE food_eur > 0)                                 AS ordini_con_food,
  count(*) FILTER (WHERE ha_righe_ignote)                              AS ordini_con_item_non_mappati,
  round(100.0 * count(*) FILTER (WHERE food_eur >= 10) / NULLIF(count(*) FILTER (WHERE food_eur > 0), 0), 1) AS pct_food_ge_10,
  round(100.0 * count(*) FILTER (WHERE food_eur >= 12) / NULLIF(count(*) FILTER (WHERE food_eur > 0), 0), 1) AS pct_food_ge_12,
  round(100.0 * count(*) FILTER (WHERE food_eur >= 15) / NULLIF(count(*) FILTER (WHERE food_eur > 0), 0), 1) AS pct_food_ge_15,
  round(100.0 * count(*) FILTER (WHERE food_eur >= 20) / NULLIF(count(*) FILTER (WHERE food_eur > 0), 0), 1) AS pct_food_ge_20,
  round(avg(food_eur) FILTER (WHERE food_eur > 0), 2)                                              AS media_food,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY food_eur) FILTER (WHERE food_eur > 0))::numeric, 2) AS mediana_food
FROM per_order;


-- -------------------------------------------------------------------------------------
-- Q1b — Elenco degli item_id NON mappati (per correggere Q1 se ordini_con_item_non_mappati > 0)
-- -------------------------------------------------------------------------------------
SELECT i.item_id, min(i.name) AS nome_esempio, sum(i.quantity) AS pezzi, count(DISTINCT i.order_id) AS ordini
FROM public.kitchen_orders o
JOIN public.kitchen_order_items i ON i.order_id = o.id
WHERE o.venue_id = 'walrus-main'
  AND o.payment_status = 'paid'
  AND o.created_at >= now() - interval '30 days'
  AND i.item_id NOT IN (
    'item-009','item-010','item-011','item-018','item-059','item-012','item-013','item-014','item-015',
    'item-016','item-017','item-032','item-020','item-021','item-024','item-025','item-027','item-034',
    'item-035','item-036','item-037','item-043','item-044','item-045','item-058','item-040','item-041',
    'item-042','item-060','item-061','item-062','item-038','item-046','item-047','item-048','item-049',
    'item-050','item-063','item-064','item-065','item-066','item-051','item-052','item-053','item-054',
    'item-055','item-056','item-057')
GROUP BY i.item_id
ORDER BY ordini DESC;


-- -------------------------------------------------------------------------------------
-- Q2 — Ordini creati dallo staff (cassa assistita) vs avviati dal cliente
--      Tutti gli ordini del periodo e solo quelli pagati.
-- -------------------------------------------------------------------------------------
SELECT
  CASE WHEN nickname = 'BANCO' AND customer_note LIKE '%ORDINE ASSISTITO — SENZA APP%'
       THEN 'staff (cassa assistita)' ELSE 'cliente (QR / app)' END            AS origine,
  count(*)                                                                    AS ordini_totali,
  count(*) FILTER (WHERE payment_status = 'paid')                             AS ordini_pagati,
  round(sum(total) FILTER (WHERE payment_status = 'paid'), 2)                 AS incasso_pagato,
  count(*) FILTER (WHERE payment_status = 'paid' AND payment_method IN ('sumup_online','satispay_app')) AS pagati_online,
  count(*) FILTER (WHERE payment_status = 'paid' AND payment_method IN ('cash','card_counter_manual','sumup_pos','counter')) AS pagati_al_banco
FROM public.kitchen_orders
WHERE venue_id = 'walrus-main'
  AND created_at >= now() - interval '30 days'
GROUP BY 1;
-- Gruppi metodo da src/lib/kitchenServiceRules.js:245-254 (manual_comp/manual_other esclusi da entrambe le colonne).


-- -------------------------------------------------------------------------------------
-- Q2b — Controllo incrociato: ordini il cui customer_id è un utente NON anonimo
--       (= sessione staff). Richiede lettura su auth.users: se il ruolo non può, saltare.
-- -------------------------------------------------------------------------------------
SELECT
  (u.is_anonymous IS FALSE)                                  AS creato_da_utente_staff,
  (o.nickname = 'BANCO')                                     AS nickname_banco,
  count(*)                                                   AS ordini
FROM public.kitchen_orders o
LEFT JOIN auth.users u ON u.id = o.customer_id
WHERE o.venue_id = 'walrus-main'
  AND o.created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY ordini DESC;


-- -------------------------------------------------------------------------------------
-- Q3 — Limiti dei dati per riconoscere i clienti abituali (ordini cliente pagati)
-- -------------------------------------------------------------------------------------
WITH base AS (
  SELECT o.id, o.customer_id, lower(btrim(o.nickname)) AS nick,
         ((o.created_at AT TIME ZONE 'Europe/Rome') - interval '6 hours')::date AS serata
  FROM public.kitchen_orders o
  WHERE o.venue_id = 'walrus-main'
    AND o.payment_status = 'paid'
    AND o.created_at >= now() - interval '30 days'
    AND NOT (o.nickname = 'BANCO' AND coalesce(o.customer_note, '') LIKE '%ORDINE ASSISTITO — SENZA APP%')
),
per_id AS (
  SELECT customer_id,
         count(*)                 AS ordini,
         count(DISTINCT serata)   AS serate,
         count(DISTINCT nick)     AS nickname_diversi,
         max(n_serata)            AS max_ordini_stessa_serata
  FROM (
    SELECT b.*, count(*) OVER (PARTITION BY customer_id, serata) AS n_serata FROM base b
  ) x
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
)
SELECT
  (SELECT count(*) FROM base)                                             AS ordini_cliente_pagati,
  (SELECT count(*) FROM base WHERE customer_id IS NULL)                   AS senza_customer_id,
  count(*)                                                                AS customer_id_distinti,
  count(*) FILTER (WHERE serate >= 2)                                     AS id_con_2piu_serate,
  round(100.0 * count(*) FILTER (WHERE serate >= 2) / NULLIF(count(*), 0), 1) AS pct_id_ritorno_30gg,
  count(*) FILTER (WHERE nickname_diversi >= 3)                           AS id_con_3piu_nickname,
  count(*) FILTER (WHERE max_ordini_stessa_serata >= 3)                   AS id_con_3piu_ordini_stessa_serata,
  max(ordini)                                                             AS max_ordini_per_id,
  max(nickname_diversi)                                                   AS max_nickname_per_id
FROM per_id;


-- -------------------------------------------------------------------------------------
-- Q3b — I 10 customer_id con più ordini: aiuta a capire se sono persone o dispositivi condivisi
--       (nessun dato personale oltre al nickname già visibile sulla TV; id troncato)
-- -------------------------------------------------------------------------------------
SELECT left(o.customer_id::text, 8) AS id_tronco,
       count(*) AS ordini,
       count(DISTINCT ((o.created_at AT TIME ZONE 'Europe/Rome') - interval '6 hours')::date) AS serate,
       count(DISTINCT lower(btrim(o.nickname))) AS nickname_diversi,
       string_agg(DISTINCT lower(btrim(o.nickname)), ', ') AS nickname_esempi
FROM public.kitchen_orders o
WHERE o.venue_id = 'walrus-main'
  AND o.payment_status = 'paid'
  AND o.created_at >= now() - interval '30 days'
  AND o.customer_id IS NOT NULL
GROUP BY o.customer_id
ORDER BY ordini DESC
LIMIT 10;
