# Ticket: Kitchen Asset Inventory Audit

Data: 2026-06-17 · Prodotto: Walbox · Stato: OPEN

## Obiettivo
Mappare gli asset disponibili per la pagina Kitchen prima del layout polish.
Identificare quali prodotti hanno già una foto, quali sono mappabili subito e quali asset mancano ancora.

## Scope
- Modifica solo: nessuna (audit read-only)
- File da leggere: src/pages/CustomerKitchenMenu.jsx, src/data/kitchenMockData.js, public/assets/kitchen/
- Non toccare: auth, db, env, deploy, file fuori scope

---

## Research
Abbiamo analizzato la cartella degli asset `public/assets/kitchen/` incrociandola con la mappatura delle foto in `CustomerKitchenMenu.jsx` (`KITCHEN_ITEM_PHOTOS`) e gli articoli in `kitchenMockData.js`. 
Tutti gli articoli presenti nel database mock hanno attualmente una corrispondenza con un file immagine esistente in `public/assets/kitchen/`.

Esiste inoltre un asset fotografico aggiuntivo (`photo-veggie-tricheco.png`) che non è attualmente mappato a nessun elemento del menu.

## Audit

### Tabella degli Asset dei Prodotti (Product Photo Mapping)

| ID Articolo | Nome Prodotto (Mock) | Categoria | Mappatura Immagine (`KITCHEN_ITEM_PHOTOS`) | Stato Asset | Note / Mismatch |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **item-001** | Panino Porcheria Seria | panini | `/assets/kitchen/photo-walrus-classic.png` | **Presente** | Il nome del file richiama "walrus-classic", ma è associato al panino "Porcheria Seria". |
| **item-002** | Panino del Tricheco | panini | `/assets/kitchen/photo-tricheco-burger.png` | **Presente** | Perfetta corrispondenza. |
| **item-003** | Patatine da Banco | patatine | `/assets/kitchen/photo-patatine-da-banco.png` | **Presente** | Perfetta corrispondenza. |
| **item-004** | Patatine Fuori di Testa | patatine | `/assets/kitchen/photo-patatine-fuori-di-testa.png` | **Presente** | Perfetta corrispondenza. |
| **item-005** | Birra del Tricheco | birre | `/assets/kitchen/photo-birra-del-tricheco.png` | **Presente** | Perfetta corrispondenza. |
| **item-006** | Birra Scura Problemática | birre | `/assets/kitchen/photo-birra-scura-problematica.png` | **Presente** | Perfetta corrispondenza. |
| **item-007** | Combo CAVALLOOOO | combo | `/assets/kitchen/photo-combo-cavalloooo.png` | **Presente** | Perfetta corrispondenza. |
| **item-008** | Combo Sta Salendo Male | combo | `/assets/kitchen/photo-combo-sta-salendo-male.png` | **Presente** | Perfetta corrispondenza. |

### Asset Fotografici Non Utilizzati / Orfani
- `/assets/kitchen/photo-veggie-tricheco.png` (Presente nella cartella ma non associato ad alcun item in `kitchenMockData.js`).

### Riferimenti Grafici e UI (Design References)
- `00_style_anchor_board.png` (Style tile)
- `01_header_walrus_kitchen.png` (Header del menu - In uso)
- `02_hero_combo_food_only.png` (Versione alternativa senza testo - Inutilizzata)
- `02_hero_combo_porcheria_seria.png` (Banner promo combo completo - In uso)
- `03_category_icon_row.png` (Riferimento UI per la barra categorie)
- `04_product_card_walrus_classic.png` (Riferimento UI card)
- `05_product_card_tricheco_burger.png` (Riferimento UI card)
- `06_product_card_veggie_tricheco.png` (Riferimento UI card con veggie burger)
- `07_fries_promo_fritto_terapeutico.png` (Banner promo patatine fritto terapeutico - In uso)
- `08_bottom_cart_dock.png` (Riferimento UI del dock del carrello)

## Plan
1. **Conservazione della struttura attuale**: Mantenere la mappatura delle foto esistenti poiché tutti gli asset fisici sono presenti e non ci sono errori di caricamento.
2. **Supporto futuro per il Veggie Burger**: Se in futuro si volesse allineare il database con il riferimento `06_product_card_veggie_tricheco.png`, sarà possibile inserire un nuovo prodotto vegetariano (es. `item-009`) in `kitchenMockData.js` e mapparlo a `/assets/kitchen/photo-veggie-tricheco.png`.
3. **Mantenimento dei Banner**: Continuare a utilizzare i banner grafici pre-renderizzati per combo e patatine, in quanto mantengono la fedeltà visiva ottimale.

- [ ] **GATE 1 — Plan approvato da Eros**

---

## Act
<!-- Antigravity: implementazione dello scope approvato -->

File modificati:
-

## Verify
<!-- Claude Code: build / test / anti-troncamento / parse Vite -->

- [ ] Build: PASS / FAIL
- [ ] Anti-troncamento file critici: PASS / FAIL
- [ ] Vite parse error: PASS / FAIL

## Quality Gate
<!-- Claude Code /quality-gate -->


## Diff Risk
<!-- Claude Code /diff-risk-review -->


- [ ] **GATE 2 — Pronto al commit (approvato da Eros)**

---

## Commit
<!-- messaggio commit usato -->


## Knowledge
<!-- lezioni apprese → copiare anche in ai-ops/knowledge/ -->
