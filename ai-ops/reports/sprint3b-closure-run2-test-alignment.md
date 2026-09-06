# Sprint 3B Closure RUN 2 — Test Alignment + No-Tables Residuals

Data: 2026-09-06 · Branch `integration/fantawalrus-kitchen-v1` · Base: `ai-ops/reports/sprint3b-closure-run-fase-ab.md`
Nessun commit, push, deploy, mutazione DB/RPC/migration. Nessuno script aggiunto a `package.json`.

---

## 1. CHANGES (9 file)

### 1.1 Riallineamento E2E (Parte 1)

**`tests/e2e/kitchen-solo-service.spec.js`**
- Test 1: `getByText('DA PAGARE')` → `getByText('DA INCASSARE')` — allineato al contratto reale (`KitchenSoloService.jsx:505`, già `'DA INCASSARE'`).
- Test 4 "pagamento rapido": aggiunto `page.route('**/rest/v1/rpc/kitchen_payment_record_counter', ...)` che risponde `200 {}` prima della navigazione. La UI attuale chiama la RPC Supabase reale (`useKitchenOrders.js:confirmPayment`); l'ordine seed è locale/demo e non esiste lato server → la RPC reale falliva con `order_not_found`. Il mock intercetta esattamente il path RPC corrente (nessuna asserzione indebolita, nessun cambio di prodotto).

**`tests/e2e/customer-kitchen-flow.spec.js`**
- Test 3c/3e: `getByText('0 prodotti')` → `getByText('0 ROBE NEL SACCO')` (3 occorrenze). Verificato in `CustomerKitchenMenu.jsx:722`: la stringa "0 prodotti" non esiste più dal redesign promo già committato (`80b0c46`); il comportamento attuale approvato è "0 ROBE NEL SACCO".
- Test 7 "Bancone confirma pagamento": `getByRole('button', {name: /PAGATO/i})` → `/CONTANTI/i`, allineato allo split `CONTANTI ✓` / `CARTA/POS ✓` di `CounterOrdersView.jsx:238` (già committato in questo branch). Aggiunto lo stesso mock RPC `kitchen_payment_record_counter` di cui sopra: la stessa RPC reale viene chiamata da `CounterOrdersView.jsx:69` e falliva per lo stesso motivo (ordine seed non esistente lato server).

### 1.2 Chiusura residui no-tables (Parte 2)

**`src/pages/AlertView.jsx`**
- Sezione URGENZA TEMPI: rimosso `<span className="ksd-row-table">{order.table}</span>` (sempre vuoto), sostituito con `{order.orderCode && <span className="ksd-row-code">#{order.orderCode}</span>}` — stesso pattern già usato in `CounterOrdersView.jsx`/`StoricoView.jsx`.
- Sezione ALLERGENI ATTIVI: raggruppamento riscritto da "per tavolo" (`o.table`, sempre `undefined` → tutti gli ordini collassavano in un unico gruppo vuoto) a "per ordine" (un row per ordine attivo con allergeni, chiave `orderCode`/`nickname`). Contatore sezione da "N tavoli" a "N ordini".

**`src/pages/StoricoView.jsx`** — rimossa riga 143, pill tavolo vuoto (`order.orderCode` è già mostrato subito prima, nessuna perdita di identificatore).

**`src/pages/KitchenOrdersView.jsx`** — rimossa riga 119, pill tavolo vuoto (il nickname resta l'identificatore visibile; non aggiunto `orderCode` qui per restare nel perimetro minimo "rimuovi pill vuoto", non richiesto).

**`src/pages/KitchenStaffDashboard.css`** — rimossa la regola `.ksd-row-table` (verificato con grep: zero riferimenti residui in `src/` dopo i 3 fix sopra + i 2 già chiusi in RUN 1 su `CounterOrdersView.jsx`).

**Fixture demo/preview** — rimosso il campo `table: 'Tx'` da tutti gli ordini:
- `src/data/kitchenMockData.js` (`demoKitchenOrders`, 6 ordini)
- `src/pages/kitchenSoloPreviewFixtures.js` (`usePreviewKitchenOrders`, 4 ordini)
- `src/pages/kitchenSoloDemoFixtures.js` (`seedOrders` del Live Demo Harness, 6 ordini)

Le fixture ora rispecchiano il contratto reale (`table` mai presente), invece di mascherare il problema in demo con pill piene.

### 1.3 Non toccato (vincolo esplicito della run)
- **Bridge Jukebox / fallback `'7'`** in `CustomerOrderStatus.jsx` (righe 601, 612) — lasciato invariato, decisione separata come richiesto.
- **Matching "stesso cliente" via `o.table`** in `CustomerOrderStatus.jsx` (righe 93, 286) — ramo morto già noto, non menzionato nel perimetro Parte 2, non toccato.
- RPC/Supabase/DB, migration, promo, `App.jsx`, `package.json`, `useKitchenAudio.js`, realtime — non toccati.

### 1.4 Regressione emersa e risolta durante la run
`tests/e2e/customer-kitchen-flow.spec.js` test 5 "Staff dashboard shows T12 and Eros" era verde nel baseline Fase A/B (23/26) perché asseriva esattamente il pill tavolo (`getByText('T12')`) rimosso da `KitchenOrdersView.jsx` in questo run (§1.2). È una conseguenza diretta e prevista del fix approvato, non una regressione del prodotto: il test verificava un comportamento che il task ha esplicitamente chiesto di eliminare. Aggiornato: rinominato in "Staff dashboard shows Eros", rimossa l'asserzione `T12`, mantenuta `Eros` (nickname, unico identificatore visibile rimasto). La fixture condivisa `makeSeedOrder()` (con `table: 'T12'`) **non è stata toccata**: il test 4 (bridge Jukebox, esplicitamente escluso da questa run) dipende ancora da quel campo.

---

## 2. E2E_RESULTS

| Suite | Comando | Esito |
|---|---|---|
| `tests/e2e/kitchen-solo-service.spec.js` | `npx playwright test` (porta isolata 5199, scratch config) | **17/17 PASS** |
| `tests/e2e/customer-kitchen-flow.spec.js` | idem | **26/26 PASS** |

Metodologia invariata rispetto a Fase A/B: porta 5174 occupata da un dev server esterno alla sessione (PID 10601, non toccato); run eseguita su porta 5199 con una config Playwright temporanea in scratchpad (stesso `testDir`, `VITE_E2E_BYPASS_STAFF_AUTH=true`), nessun file di config del repo modificato.

Baseline Fase A/B: 15/17 + 23/26 (5 rossi pre-esistenti). **Delta: +2 +3 = tutti i 5 test rossi allineati, zero rossi residui.**

## 3. UNIT / BUILD / LINT

| Verifica | Comando | Esito |
|---|---|---|
| Build | `npm run build` | **PASS** (`✓ built in 311ms`, solo warning pre-esistenti chunk size) |
| Lint (9 file toccati) | `npx eslint <9 file>` | **0 errori** |
| Unit migration | `node supabase/migrations/20260901120000_kitchen_pilot_order_contract_v1.test.js` | **PASS 5/5** |
| Unit realtime | `node tests/unit/sprint3b-kitchen-realtime.test.mjs` | **PASS 2/2** |

---

## 4. NO_TABLES_RESIDUALS

Chiuso rispetto a `sprint3b-closure-run-fase-ab.md` §6:
- ✅ Punto 3 — `AlertView.jsx`: raggruppamento allergeni ripensato su `orderCode`/`nickname`.
- ✅ Punto 4 — `StoricoView.jsx`, `KitchenOrdersView.jsx`: pill `ksd-row-table` vuoto rimosso.
- ✅ Punto 6 — fixture demo/preview Kitchen ripulite dal campo `table`.
- ✅ Punto 7 — `.ksd-row-table` rimosso da `KitchenStaffDashboard.css` (verificato dead con grep).
- ⏸️ Punto 8 — test permanente del redirect `/kitchen/entry` (ad-hoc in RUN 1, non promosso): non richiesto in questa run, resta pendente.

Non toccato (esplicitamente fuori scope, come da istruzione):
- Punto 5 — `CustomerOrderStatus.jsx` righe 93, 286, 601, 612 (matching stesso cliente + bridge Jukebox fallback `'7'`).
- Punto 9 — riconciliazione ledger migration.

## 5. UNRESOLVED_CROSS_DOMAIN

1. **Bridge Jukebox `CustomerOrderStatus.jsx:601,612`** — `navigate('/request?table=' + (order.table || '') ... || '7')` finisce sempre sul fallback hardcoded `'7'` dato che `order.table` è sempre vuoto. Decisione esplicitamente rimandata a una run separata (non tecnica di questa run: tocca il confine Kitchen/Jukebox).
2. **Matching "stesso cliente" `CustomerOrderStatus.jsx:93,286`** — ramo morto (`o.table === 'T'+session.table`), il fallback `nickname` regge. Non menzionato nel perimetro Parte 2 di questa run, non toccato.
3. **Certificazione Realtime multi-device** — bloccata dal sandbox (redazione `VITE_SUPABASE_URL`/`ANON_KEY`), invariato da Fase A/B, richiede Eros da terminale reale.
4. **Ledger migration disallineato** (Fase A/B §3.9) — invariato, decisione tecnica pendente prima di qualunque `supabase db push`.

## 6. REGRESSIONS

**Zero regressioni nette nello stato finale.** Una regressione è emersa a metà run come conseguenza diretta e prevista del fix Parte 2 (§1.4 sopra: test 5 su `T12`), identificata e risolta nella stessa run aggiornando l'asserzione del test al nuovo contratto no-tables — non il prodotto. Nessun'altra regressione: entrambe le suite E2E complete sono ora al 100% (17/17, 26/26), superiore al baseline Fase A/B (15/17, 23/26).

## 7. Diff Risk Review

| File | Perché | In scope | Rischio |
|---|---|---|---|
| `tests/e2e/kitchen-solo-service.spec.js` | Allineo label + mock RPC | Sì | **Nullo** — solo asserzioni/mock, nessuna logica prodotto |
| `tests/e2e/customer-kitchen-flow.spec.js` | Allineo label/copy/RPC + 1 asserzione test 5 | Sì (test 5 conseguenza diretta di §1.2) | **Basso** — 26/26 verde, nessuna copertura persa (nickname resta verificato) |
| `src/pages/AlertView.jsx` | No grouping per table | Sì | **Basso** — 2 test E2E dedicati (16, 17) verdi |
| `src/pages/StoricoView.jsx` | Rimosso pill vuoto | Sì | **Nullo** — cosmetico, orderCode già presente |
| `src/pages/KitchenOrdersView.jsx` | Rimosso pill vuoto | Sì | **Basso** — nickname resta identificatore, 1 test aggiornato di conseguenza |
| `src/pages/KitchenStaffDashboard.css` | Rimossa classe morta | Sì | **Nullo** — verificato zero riferimenti residui |
| `src/data/kitchenMockData.js` | Fixture demo senza table | Sì | **Nullo** — demo ora coerente col contratto reale |
| `src/pages/kitchenSoloPreviewFixtures.js` | idem | Sì | **Nullo** |
| `src/pages/kitchenSoloDemoFixtures.js` | idem | Sì | **Nullo** |

**Edit inattesi: nessuno.** `CounterOrdersView.jsx`, `CustomerKitchenEntry.jsx`, `CustomerOrderStatus.jsx`, `KitchenSoloService.jsx`, `PaymentsView.jsx` restano modificati in `git status` ma sono il diff pre-esistente di RUN 1 / Sprint 3B, non toccati in questa run.

## 8. Rischi residui

- Bridge Jukebox `?table=` con fallback hardcoded `'7'` resta aperto (punto 5, cross-domain).
- Realtime multi-device e ledger migration restano bloccati per motivi ambientali/tecnici indipendenti da questa run.
- Test permanente del redirect `/kitchen/entry` (RUN 1 §2.2) resta ad-hoc, non promosso a `tests/e2e/`.

## 9. Cosa approva Eros

1. Il riallineamento dei 5 test E2E rossi (Parte 1) e il fix del test 5 emerso di conseguenza.
2. La chiusura dei residui no-tables su AlertView/StoricoView/KitchenOrdersView/fixture/CSS (Parte 2).
3. Se e quando aprire il bridge Jukebox `?table=`/fallback `'7'` e il ramo morto di matching cliente in `CustomerOrderStatus.jsx` (decisione separata, esplicitamente non presa in questa run).
4. Promuovere il test ad-hoc del redirect `/kitchen/entry` a `tests/e2e/` (pendente da RUN 1).

**CHECKPOINT.md da aggiornare: SÌ** — 5 test E2E rossi chiusi, residui no-tables Kitchen chiusi salvo bridge Jukebox/ledger/realtime — non aggiornato in questa run, richiede approvazione.

---

## READY_FOR_RUNTIME_CERTIFICATION: NO

Il blocco "5 test E2E rossi" di Fase A/B (§5 punto 1) è **chiuso**: entrambe le suite sono ora al 100%. Restano però gli altri due blocchi, invariati e fuori dal mandato di questa run:
1. **Certificazione Realtime multi-device** — bloccata dal sandbox, richiede Eros da terminale reale.
2. **Ledger migration disallineato** — decisione tecnica pendente prima di `supabase db push`.

Il bridge Jukebox `?table=`/fallback `'7'` (cross-domain, §5 sopra) resta inoltre una decisione prodotto aperta, non un blocco tecnico alla certificazione runtime del solo dominio Kitchen.
