# Prezzi gestiti dallo staff

## ORA
- Data: 2026-10-31 · Branch: da creare da `origin/main` (worktree in scratchpad, come gli hotfix) · Fase: **PIANO, attesa Gate 1**.
- Decisione Eros (31/10): **tutto lo staff** cambia **tutti** i prezzi in autonomia (panini, bibite, combo con birra e con bibita),
  **uno alla volta o tanti insieme**. Effetto immediato, niente bozza, niente ruolo gestore.
- Deep dive: `ai-ops/reports/prezzi-staff-deep-dive.md`.
- Prossimo passo: Gate 1 di Eros su questo piano, poi Fase 1.
- Decisioni aperte (non bloccanti, assunzione tra parentesi):
  1. Promo TV con prezzi scritti a mano (`KitchenTvScreen.jsx:155-156`, 18,50/15,90): (la lascio com'è, fuori scope; da togliere o rendere dinamica in un task a parte).
  2. Articoli "PREZZO IN ARRIVO" (prezzo vuoto): (lo staff può dargli un prezzo e così diventano ordinabili).
  3. Togliere un prezzo (rimettere "in arrivo"): (no: per togliere un articolo si usa ESAURITO).

## Obiettivo
Lo staff da `/kitchen/solo` cambia i prezzi senza deploy. Il DB diventa l'unica fonte: menu cliente, cassa e combo
mostrano lo stesso prezzo che il server incassa.

## Fasi
**F1 — DB (sessione principale, soldi + RLS).** Migration nuova:
- tabella `kitchen_menu_price_log` (item, prezzo vecchio, nuovo, chi, quando); staff legge, nessuno scrive a mano.
- funzione `kitchen_staff_set_prices(p_changes jsonb)`: solo staff del locale; 1–100 modifiche in un colpo, **tutte o nessuna**;
  ogni prezzo tra 0,50 e 99 €, max 2 decimali, articolo esistente; scrive il log.
- policy `staff_all_venue_menu_items` sostituita: lo staff non scrive più direttamente sulla tabella (solo via funzione).
- `kitchen_menu_items` in Realtime (i telefoni aperti vedono il prezzo nuovo).
- Test sul testo SQL + E2E su Supabase locale (anonimo e cliente NON cambiano prezzi; 190 € rifiutato; lotto con 1 errore = nulla salvato).
- Gate: `npx supabase db push --linked` (Eros).

**F2 — Prezzi letti dal DB (subagent walbox-dev, Sonnet medium).**
- `useKitchenMenu.js`: sovrappone i prezzi del DB (come già fa con ESAURITO) + aggiornamento live.
- Combo (`kitchenPesiMassimiCombos`, usato in `CustomerKitchenMenu.jsx`, `CounterAssistedOrder.jsx`, `PesiMassimiSection.jsx`):
  prezzo birra e bibita presi dal DB tramite lo stesso hook. `kitchenMockData.js` non si tocca (resta riserva).
- Unit test sulla regola di fusione prezzi in `src/lib/`.

**F3 — Schermata prezzi staff (subagent walbox-dev + visual-reviewer).**
- In `/kitchen/solo` → nuova voce "Prezzi": elenco per categoria, un campo prezzo per articolo; le combo hanno due campi
  (con birra / con bibita) e un tasto "stesso prezzo".
- Singolo e massivo con lo stesso flusso: modifichi uno o tanti campi → barra "SALVA 3 MODIFICHE" → riepilogo
  vecchio → nuovo (in evidenza i salti oltre ±50%) → CONFERMA → salvataggio unico.
- Errori chiari (prezzo non valido, rete giù = niente salvato). Mobile e tablet.

**F4 — Verifica.** lint + unit + test SQL + build con override + E2E locale + QA visiva 390 (cliente) e tablet (staff).

## Casi limite (comportamento atteso)
- Cliente con carrello aperto quando cambia il prezzo: il prezzo si aggiorna da solo; il server incassa comunque quello del DB.
- Ordini già fatti/pagati e rimborsi: non cambiano (prezzo salvato sull'ordine).
- DB non risponde: il menu mostra i prezzi del codice (riserva).
- Due persone dello staff salvano insieme: vince l'ultimo, entrambi nel log.

## File toccati
Nuovi: `supabase/migrations/<ts>_kitchen_menu_prices_staff_v1.sql` + test, schermata prezzi staff (+ css), regola in `src/lib/` + test.
Modificati: `src/hooks/useKitchenMenu.js`, `src/pages/KitchenSoloService.jsx`, `CustomerKitchenMenu.jsx`,
`CounterAssistedOrder.jsx`, `PesiMassimiSection.jsx`. Aree protette: migrations, RLS, Realtime.

## Rilascio (ognuno è un gate di Eros)
1. commit → push → PR → merge del codice di F2+F3 **solo dopo** che la migration è in produzione.
2. Ordine: `db push` (F1) → deploy. Oggi DB e codice hanno gli stessi prezzi, quindi nessun salto per i clienti.
3. Prova reale: cambiare 1 prezzo, ordine al banco, rimettere il prezzo giusto.

Modello/effort: F1 sessione principale Opus (proporre `/effort high`); F2-F3 subagent Sonnet medium; QA visual-reviewer.
