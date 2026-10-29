# Restyling hero "VENIRE FAME"

Dopo `/clear`: "riprendi da ai-ops/current/RESTYLING_HERO.md" → leggi solo `## ORA`.
Storia completa (H1 → H7 fase 3, audit, brief di Eros copiato esatto): `docs/checkpoints/RESTYLING_HERO_storia.md`
(copia identica del 2026-10-29). Le sezioni dello storico si leggono solo se servono, per titolo (`grep -n '^## '`).

## ORA (2026-10-29)
- **Dove:** cartella `walbox-kitchen-release`, branch `feat/restyling-hero`, HEAD `4d80b92`. 4 commit non pushati
  (origin fermo a `24f87f2`), 61 commit avanti a `main`. Nessun deploy.
- **Fatto:** hero, testata, schede compatte, sacco nero/giallo, foto pulled pork, H7 fasi 1-3 (Pesi Massimi chiari,
  testi, orientamento + ritocco Ritiro). Tutto committato in locale con OK di Eros.
- **Prossimo passo:** `tests/e2e-real/kitchen-real-order.spec.js` AGGIORNATO (2026-10-29, non committato): tolto
  "ENTRA NEL MENU", scheda Pesi Massimi via `.pm-list .pc-cta:not(.pmx-menu-cta)`, "VAI ALLA CASSA" (selettori presi
  dai test mockati). ESEGUITO su Supabase LOCALE: **PASS** 1/1 (ordine A01, 13,90 €, 1 riga). Manca solo il
  commit (OK di Eros): `git add tests/e2e-real/kitchen-real-order.spec.js ai-ops/current/RESTYLING_HERO.md` +
  `test: e2e-real ordine allineato al menu nuovo`.
- **Dopo:** Eros decide push del branch / merge su `main` / anteprima (Vercel Preview = controllare prima le env:
  rischio DB e pagamenti reali; alternativa sicura `hero-telefono` http://192.168.1.51:5182/kitchen).
- **Da fare a mano (Eros):** cancellare il file vuoto `src/pages/__head_tmp.jsx` (divieto `rm` per Claude).
- **Fuori da questo lavoro (non committare qui):** modifiche a `.claude/*`, `ai-ops/current/RESTYLING_MENU.md`,
  `package-lock.json`, `.claude/hooks/`, `.claude/launch.json`, `ai-ops/current/AUDIT_V2_BRIEF.md`.

## Task in corso: allergeni (2026-10-29, approvato da Eros)
Obiettivo: ricavare dagli ingredienti i 14 allergeni UE per TUTTE le voci (cibo + bevande), ricontrollando anche
quelle già compilate; i probabili si mettono (segnati "dedotto" nella bozza). Passi: bozza in
`ai-ops/reports/allergeni-bozza.md` → aggiornare solo gli array `allergens` in `src/data/kitchenMockData.js`
(area protetta, OK di Eros) → unit test + lint → Eros fa controllare la bozza al cuoco → commit.
Niente DB (gli allergeni stanno solo nel file). L'avviso "allergeni da confermare" in UI resta.
Modello/effort: subagent Sonnet medium; review qui.
Esito fase 1 (PARZIALE, non committato): 11 voci aggiornate in `kitchenMockData.js` (diff rivisto: solo array
`allergens`), test lib/api 219/0 come prima, lint invariato (121 preesistenti). Bozza: `ai-ops/reports/allergeni-bozza.md`.
BLOCCATE dai test (valori bloccati nei test, non toccati): Pulled Pork 009 (+glutine, senape), Pastrami 010 e
Brisket 011 (+glutine), Box Pulled Pork 018 (glutine, latte, uova, senape), Salumi 043 (frutta_secca, latte).
Manca anche la chiave 'solfiti' (serve `AllergenBadges.jsx`). Serve l'OK di Eros per modificare test + badge.
Esito fase 2 (PASS, OK Eros, NON committato): sbloccate 009/010/011/018/043, solfiti aggiunti (010, 011, 059 dedotti) +
badge `🍷 Solfiti`. Test aggiornati solo nelle attese (`kitchenAllergens.test.js`, `kitchenPrepAggregation.test.js`).
lib/api 219/0, lint 121 invariato, build ok. Rosso in tests/unit `kitchen-analytics-service-night-selector`
(useKitchenPayments.js, non toccato: preesistente dedotto) e `sumup-refund-reliability` (preesistente verificato).
018/043 restano `allergensVerified: false` (staff vede NON VERIFICATI) finché il cuoco conferma la bozza.
Prossimo: commit (4 file src + questo file) con OK di Eros → cuoco controlla `ai-ops/reports/allergeni-bozza.md`.

## Decisioni aperte (NEEDS_DECISION, di Eros)
1. Allergeni veri di Box Pulled Pork e Salumi serissimi (oggi `allergens: []`; dati = area protetta).
2. ~~"SETI IMPLACABILI": voluto o refuso?~~ CHIUSA 2026-10-29: è un nome voluto, confermato da Eros.
3. Fascia prezzo Pesi Massimi con decimali ("Da 11,50 € a 15,00 €"), le altre senza.
4. Foto mancanti Fanta/Sprite/Estathé (item-063..066, `image: null` in `kitchenMockData.js`, protetto).
5. Dal giro 5, da riconfermare: N-11 prezzo unitario nel sacco, N-13 dock rosso, N-03 ingredienti tagliati,
   N-05 foto bevande su fondo chiaro, emoji 🦭.
Fuori scope noto: staff/cucina/stato ordine vedono ancora "Menu Bibita".

## Promemoria tecnici
- Anteprima: `npm run dev` → **http://127.0.0.1:5174/kitchen** (la 5175 di launch.json è sbagliata). Supabase finto:
  non cliccare invio/PAGO.
- e2e con chiavi finte: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anteprima-locale npx playwright test`
  (senza chiavi il lancio è INVALIDO). Rossi noti e preesistenti (staff/SumUp, non del restyling): 14, 15, 36, 49, 52, C7.
- Report: `ai-ops/reports/chiarezza-menu/` (fasi H7), `ai-ops/reports/visual/restyling-hero/` (verdetti visivi).

Modello/effort: prossimo passo (test e2e-real) → subagent Sonnet medium; review del diff qui su Opus medium.
