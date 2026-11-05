# Food Club V1 — Sprint UX (checkout, premio, staff, tessera)

## ORA
- Dove: worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Origine: prompt di Eros 2026-11-05.
- Fase: **Gate 1 APPROVATO da Eros 2026-11-05 (default D-UX1..3 accettati)**. In corso: passo 0 screenshot PRIMA
  (`ai-ops/reports/food-club-ux-shots/prima/`) FATTO. Passi 1-4 implementati (lint 0 errori, test 13/13, build ok),
  review diff Opus ok (nessuna logica/importo toccato; testid vecchi mantenuti). Passo 5 FATTO: verifica PASS (0 P0/P1),
  report e DOPO nei percorsi sotto. **Prossimo passo: revisione visiva di Eros** (poi, se ok, proposta commit atomici).
  Aperti P2: rilascio buono via API annulla non provato end-to-end (404 su Vite dev, serve `vercel dev`); contrasto buono
  usato al limite (opacità 0,7). Demo: stato di DB locale e Vite 127.0.0.1:5190 non garantito (non più verificato): controllare la disponibilità della demo al riavvio; buono di 3330000002 `available` al momento del test.
  Scarto da togliere a mano: `ai-ops/reports/food-club-ux-shots/prima/_tmp_open.png`. Passo 5 (storico):
  (`ai-ops/reports/food-club-ux-shots/dopo/`, report `ai-ops/reports/food-club-ux-sprint-2026-11-05.md`).
  File sprint: ClubCartRows.jsx, ClubCheckout.css, kitchen/CustomerCheckout.css (solo CSS), StampCard.jsx, FoodClub.css,
  VoucherCard.jsx, ClubOrderStatusCard.jsx, FoodClubPage.jsx, FoodClubStaffPage.jsx/.css, foodClubRules.js(+test).
- Working tree già sporco (sessione 5445bde8, correzione UX-1, NON committata): `StampCard.jsx`, `clubText.js`,
  `ClubMenuStrip.jsx`, `FoodClubPage.jsx`, `FoodClubStaffPage.jsx`, `foodClubRules.js(+test)`, `proposed/*.sql`.
  Si lavora SOPRA queste modifiche, senza toccarle né annullarle.
- Ambiente: DB locale `walbox-fc-demo` acceso (127.0.0.1:54321); Vite :5190 da verificare al riavvio (non garantito acceso) → si riavvia con
  `scratchpad/demo/start-demo-stack.sh` della sessione 5445bde8 (solo locale, dati finti, SMS finti).
- Prossimo passo: Gate 1 di Eros sul piano sotto.
- Decisioni aperte (default proposto tra parentesi, vale se Eros approva senza commenti):
  - D-UX1 Pulsanti PAGO ORA / PAGO AL BANCO stanno nel checkout Kitchen condiviso (`CustomerCheckout`), usato da
    tutti i clienti. (Default: ritocco solo CSS — spaziature, gerarchia, focus — uguale per tutti; nessun cambio di
    testi, logica, `data-testid`.)
  - D-UX2 "Animazione una volta sola": memoria per dispositivo (localStorage con id del buono). Niente DB.
    (Default: sì; su un altro telefono la festa si rivede una volta.)
  - D-UX3 Dopo l'uso del premio la tessera mostra 0/2 "nuovo giro" + storico premi (non 2/2). (Default: resta così.)

## Piano

Obiettivo: Food Club più chiaro e curato su mobile 390×844 e staff 1440×900, identità Walrus (nero, giallo,
tipografia brand), zero cambi a logica, importi, DB, RPC, SumUp, auth, rotte.

| # | Intervento | File (solo frontend non protetto) |
|---|---|---|
| 0 | Screenshot PRIMA delle 4 sezioni (demo locale) | nessuno (scratchpad) |
| 1 | Checkout: blocco "Totale ordine / Sconto Food Club −5 € / Da pagare" separato dal blocco timbro; pulsanti PAGO più leggibili | `ClubCartRows.jsx`, `ClubCheckout.css`, CSS del checkout (`CustomerCheckout`), eventualmente 1 prop già esistente |
| 2 | Premio conquistato: evidenza 2/2, animazione CSS leggera una volta per buono, `prefers-reduced-motion`, titolo "PREMIO CONQUISTATO — BUONO DA 5 €", CTA "USA IL PREMIO" | `StampCard.jsx`, `FoodClub.css`, `FoodClubPage.jsx`, funzione pura + test in `foodClubRules.js` |
| 3 | Staff: in alto 4 numeri (Iscritti attivi, Visite riconosciute, Buoni utilizzati, Sconti concessi); tutto il resto in "Altre statistiche" espandibile (`<details>`), con avviso rosso nel titolo se ci sono anomalie | `FoodClubStaffPage.jsx`, `FoodClubStaffPage.css` |
| 4 | Tessera/portafoglio: stili distinti per timbri in corso, completato, buono disponibile, riservato, usato, nuovo giro; storico premi intatto; testi Opzione C ("resta riservato finché il pagamento non è chiuso del tutto", niente "torna subito") | `StampCard.jsx`, `VoucherCard.jsx`, `ClubOrderStatusCard.jsx`, `clubText.js`, `FoodClub.css`, `FoodClubPage.jsx` |
| 5 | Verifica + screenshot DOPO + report | report `ai-ops/reports/food-club-ux-sprint-2026-11-05.md` |

Casi limite da coprire: buono disponibile / riservato (ordine al banco non pagato) / usato / scaduto; tessera 0/2,
1/2, 2/2, nuovo giro 1/2; checkout senza buono (nessun riepilogo sconto), con buono applicato, con buono sotto soglia;
staff con DB vuoto (stato "nessun iscritto" invariato) e con anomalie > 0; animazione: primo ingresso sì, ricarica no,
reduced-motion = nessun movimento ma stessa evidenza statica; localStorage bloccato = nessun errore.

Test: `npm run lint` sui file toccati · `node --test src/lib/foodClubRules.test.js` (+ nuovo test celebrazione) ·
build con override locale · Playwright/browser su demo locale: importi checkout prima/dopo identici (13,90 → 8,90),
stati buono, 390×844 e 1440×900, focus da tastiera, contrasto, reduced-motion.

Gate irreversibili: nessuno nello sprint. Commit/push/merge/deploy restano fuori (decide Eros dopo la revisione visiva).
Se serve un'area protetta (api/, supabase/, App.jsx, deps): STOP e richiesta.

Esecuzione: sessione principale coordina; implementazione delegata a subagent `walbox-dev` (Sonnet) con brief
completo; verifica visiva a `visual-reviewer`. Stop dopo il report, attesa revisione visiva di Eros.

Modello/effort: coordinamento Opus medium · implementazione e screenshot Sonnet medium · review del diff Opus.
