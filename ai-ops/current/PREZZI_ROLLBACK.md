# Ritorno ai prezzi di prima del 28/10

## ORA
- Data: 2026-10-30 · Branch di lavoro attuale `feat/restyling-hero` · Fase: **DECISO da Eros (30/10): tenere la versione nuova, rimettere solo i prezzi di prima. **GATE 1 APPROVATO da Eros (30/10, "Confermo").** Prossimo: eseguire il piano.**
- Richiesta di Eros: "voglio tutto come prima del 28/10" (prezzi).
- Verificato (DB prod in sola lettura, 30/10): item-040 Box Pulled Pork Fallo Pesante 15,90 · 041/042 Pastrami/Brisket 17,90 ·
  060 13,90 · 061/062 16,90 (menu con bibita) · 063-066 Fanta/Sprite/Estathé pesca e limone 4 €. Aggiornati il 30/10.
  Tutti gli altri prezzi invariati dal 16/09.
- Prima del 28/10 (dal ROLLBACK della migration `20261028120000_kitchen_menu_items_menu_ottobre_v1.sql`):
  item-040 "Pulled Pork — Fallo Pesante" 19 € (menu sul panino) · 041/042 20 € · stesso prezzo con birra o bibita (commit `a84ad65`).
- Origine: commit `7bb51b7` (migration) + `55e7cd3` (frontend) del 28/10, gia' in `main`/produzione.
  `55e7cd3` contiene anche "ritiro al Walrus con orario" + note cucina (migration `20261028121000_kitchen_orders_pickup_slot_v1.sql`, RPC `_v3`).
- Dopo il 28/10 su `main` ci sono ~30 commit che ci costruiscono sopra (restyling, foto, scelta bibita/birra in due passi `729a3ca`,
  riga FALLO PESANTE `d2895a3`, scheda Pesi Massimi `58c0391`, sottotitoli con prezzi `7d546bd`, privacy, freeze). Un revert letterale li rompe.

## FATTO (30/10) — menu Pulled Pork sul panino, Box da solo — ONLINE
- PR #9 mergiata (main 7f189a5), deploy prod OK (bundle live verificato). db push 20261030160000 applicata; SQL prod: 040 'Pulled Pork — Fallo Pesante' 19, 060 'Pulled Pork — Menu Bibita' 19, 009 13,90, 018 Box 11,50.
- Cherry-pick su feat/restyling-hero (locale, non pushato). Non provato: ordine reale completo.

## FATTO (30/10) — ONLINE
- PR #8 mergiata su main (4e40c7e), deploy prod OK: bundle live mostra menu 19/20/20.
- `db push --linked` applicata 20261030150000; verifica SQL prod: 040/060=19, 041/042/061/062=20, panini singoli invariati.
- Cherry-pick del fix su `feat/restyling-hero` (locale, non pushato). Worktree hotfix in scratchpad: si puo' rimuovere con `git worktree remove` (decide Eros).
- Non provato: un ordine reale completo a 19/20.

## Esecuzione (30/10)
- Worktree hotfix: scratchpad `.../scratchpad/hotfix`, branch `fix/prezzi-menu-come-prima` da `origin/main` (33cb0f1). NON committato.
- Modificati: `src/data/kitchenMockData.js` (040/060=19, 041/042/061/062=20), test `src/lib/kitchenCart.test.js`,
  `src/lib/kitchenPesiMassimi.test.js`, `supabase/migrations/kitchen_menu_items_catalog_state_cumulative.test.js`,
  `supabase/migrations/20261028120000_..._menu_ottobre_v1.test.js`. Nuovi: migration `20261030150000_kitchen_menu_items_prezzi_menu_come_prima_v1.sql` + test.
- Verifica: test lib+migration = stessi fail di main (12 preesistenti), build OK. Ledger remoto allineato fino a 20261030140000.
- Rilascio (gate Eros): commit → push → PR su main → merge (deploy prod) → appena live, cherry-pick su `feat/restyling-hero`
  e `npx supabase db push --linked` DA QUESTO worktree (l'hotfix non ha 20261030140000) → verifica SQL prezzi.

## Decisione Eros 30/10
"Aggiorna la versione nuova con i prezzi di prima": restyling, foto, ritiro con orario, scelta bibita/birra, struttura Box RESTANO.
Assunzioni (da confermare al Gate 1): menu Box Pulled Pork 19 € · Pastrami 20 € · Brisket 20 €, con birra E con bibita
(item-060/061/062 = stesso prezzo di 040/041/042); bibite nuove restano a 4 € (come Pepsi/Seven Up).

Panini singoli Pesi Massimi "come prima" (Eros 30/10): VERIFICATO gia' uguali a prima del 28/10 in codice (`a84ad65`) e DB prod:
Pulled Pork 13,90 · Pastrami 14,50 · Brisket 15 · Box Pulled Pork 11,50 · Garpez 15. Nessuna modifica; se a video si vede altro → controllare sottotitoli/hero (`7d546bd`, `58c0391`).

## Domande aperte (superate dalla decisione, storico)
1. "Tutto come prima" = solo prezzi e menu (birra/bibita stesso prezzo, Pulled Pork sul panino) tenendo foto, restyling, privacy? (consigliato)
   Oppure anche togliere il ritiro con orario?
2. Bibite nuove (Fanta, Sprite, Estathé): togliere o tenere a 4 €?
3. Menu con bibita: tornare a "stesso prezzo della birra" (come `a84ad65`)?

## Piano proposto (dopo le risposte, Gate 1)
1. Nuova migration additiva: UPDATE prezzi item-040 (nome+19), 041/042 (20); item-060/061/062 allo stesso prezzo della birra
   oppure non piu' usati dal frontend (non cancellare righe: ordini storici). Test sul testo SQL. Gate: `db push --linked` (Eros).
2. Frontend `src/data/kitchenMockData.js` (area protetta) + componenti Pesi Massimi: prezzi e Pulled Pork sul panino come prima;
   tenere UI restyling. Unit + build con override + visual 390.
3. Ordine di rilascio: db push e deploy uno dopo l'altro (finestra prezzo mostrato ≠ prezzo incassato).
Modello/effort: piano e migration in sessione principale (soldi); frontend → subagent walbox-dev Sonnet medium.
