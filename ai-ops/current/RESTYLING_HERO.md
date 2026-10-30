# Restyling hero "VENIRE FAME"

Dopo `/clear`: "riprendi da ai-ops/current/RESTYLING_HERO.md" → leggi solo `## ORA`.
Storia completa (H1 → H7 fase 3, audit, brief di Eros copiato esatto): `docs/checkpoints/RESTYLING_HERO_storia.md`
(copia identica del 2026-10-29). Le sezioni dello storico si leggono solo se servono, per titolo (`grep -n '^## '`).

## ORA (2026-10-30)
- **Dove:** cartella `walbox-kitchen-release`, branch `feat/restyling-hero`, HEAD = `origin/feat/restyling-hero`
  (tutto pushato 2026-10-30, OK Eros: locale e GitHub uguali sui commit). 59 commit avanti a `main`, 0 indietro.
  PR #6 verso `main` aperta, NON mergiata: merge = deploy produzione, decide Eros.
- **Fatto (2026-10-30):** foto nuove Insalatone/Tartare/Taglieri e Bevande (`2ffb383`: 8 webp, via le 6 vecchie),
  riga FALLO PESANTE con etichetta MENU (`d2895a3`), scelta da bere in due passi (`729a3ca`). Lib `kitchenPesiMassimi` 12/0.
  Prima: hero, testata, schede compatte, sacco, H7 fasi 1-3, allergeni dedotti (`b6698ca`), zoom foto, pannello gruppi.
- **Prossimo passo:** il cuoco controlla `ai-ops/reports/allergeni-bozza.md` (018/043 restano `allergensVerified: false`).
  Poi Eros guarda la Preview Vercel della PR #6 (env Preview: DB e pagamenti reali, non pagare) e decide il merge.
- **Aperto:** e2e 4 fail non misurati su HEAD (3g2 pannello 11 bottoni, 14/15 annulla staff, 24 `.bv-list .pc-photo`);
  test `kitchenMenuCopy` "selettore birra" rosso preesistente.
- **Da fare a mano (Eros):** cancellare il file vuoto `src/pages/__head_tmp.jsx` (divieto `rm` per Claude);
  decidere se tenere il PNG sorgente 2 MB `.../bevande/San Benedetto naturale su bancone ambrato.png` (non usato).
- **Non committato di proposito:** `.claude/*` (hooks, launch.json, settings), `package-lock.json`,
  `ai-ops/current/RESTYLING_MENU.md`, `AUDIT_V2_BRIEF.md`, `REEL_WALBOX.md`.

## Task in corso: riga FALLO PESANTE (2026-10-30, scelte di Eros)
Obiettivo: nella scelta Pesi Massimi via "MENU ·" dal sottotitolo. Titolo `FALLO PESANTE` + etichetta gialla `MENU`,
supplemento `+2,40 €` invariato, sottotitolo leggero (Montserrat, minuscolo): "Panino + patate + da bere" / "Box con
patate + da bere". Sacco/carrello invariati (`falloPesanteCartDisplay` non si tocca).
File: `PesiMassimiSection.jsx/.css`, `src/lib/kitchenPesiMassimi.js` + test, `tests/e2e/customer-kitchen-flow.spec.js`
(2 asserzioni). Test: lib, lint file, build con override, browser 375. Niente commit.
Modello/effort: Opus medium qui (modifica piccola).
**Esito: FATTO, commit `d2895a3` (non pushato, OK Eros 2026-10-30).** Lib 12/0, lint 0 sui file, build ok, browser 375 ok (panini + Box). E2E non lanciati.
Commit proposto: `git add src/components/kitchen/PesiMassimiSection.jsx src/components/kitchen/PesiMassimiSection.css src/lib/kitchenPesiMassimi.js src/lib/kitchenPesiMassimi.test.js tests/e2e/customer-kitchen-flow.spec.js` + `git commit -m "feat: riga FALLO PESANTE con etichetta MENU e sottotitolo leggero"`

## Task: scelta da bere in due passi (2026-10-30, "vai" di Eros = Gate 1)
**Esito: FATTO, commit `729a3ca` (non pushato, OK Eros 2026-10-30).** 5 file: `PesiMassimiSection.jsx/.css` + 3 e2e (solo tocco sul gruppo, nome
"Helles"). Fix in più: `.pc-under p { margin: 0 }` di PosterCard azzerava gli spazi delle etichette BIBITE/BIRRE (ora
`.pmx-beer .pm-drink-label`). Verificato da me: lint 0, build ok, lib 218/1 fail/1 skip (il fail `kitchenMenuCopy` "selettore
birra" trova `item-059` già in HEAD: preesistente), browser 375/430: passo 1, liste, nomi corti, cambio gruppo azzera la scelta,
dettaglio birra col nome completo, niente scroll orizzontale. **E2E (3 spec) 96 pass / 4 fail / 1 skip**, lanciati con
`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anteprima-locale npx playwright test ...` (senza override
l'app va in crash nel webServer di Playwright: 98 fail di ambiente). Tutti i test bevanda/FALLO PESANTE (20, 21, 21a, 23*) passano.
I 4 fail non toccano questa modifica (dedotto, non misurato su HEAD): 3g2 pannello categorie 11 bottoni invece di 10 (Cicchetto
Veg di `9a689bf`), 14/15 annulla ordine staff (W99 resta in coda), 24 BEVANDE `.bv-list .pc-photo` 0 invece di 4. Report `ai-ops/reports/scelta-bere-due-passi.md`.
Commit proposto: `git add src/components/kitchen/PesiMassimiSection.jsx src/components/kitchen/PesiMassimiSection.css tests/e2e/customer-kitchen-flow.spec.js tests/e2e/kitchen-cart-persistence.spec.js tests/e2e/kitchen-p0-closure.spec.js` +
`git commit -m "feat: scelta da bere del menu in due passi (bibita o birra)"`. In attesa: foto Fanta, Sprite, Estathé pesca/limone (Eros).
Problema (visto a 375, Pastrami): sotto FALLO PESANTE titoli attaccati (SCEGLI DA BERE / BIBITE / BIRRE), 13 bottoni
uguali in griglia, nomi birra su 2 righe, quadratini vuoti. Scelte di Eros: **B "due passi"**, **nomi birra corti**,
**foto bibite mancanti le porta Eros** (il quadratino resta finché non arrivano).
Passi: (1) sotto SCEGLI DA BERE due bottoni grossi `BIBITA · compresa` / `BIRRA · +1 €` (extra calcolato come oggi);
(2) tocco → compare solo quella lista, con più aria tra titolo, gruppo e bottoni; (3) bottoni birra senza "KEILER"
(es. HELLES, LAND-PILS), nome completo resta nel dettaglio birra, nella riga "DA BERE:" e nel sacco; (4) e2e: un tocco
in più prima di bibita/birra.
Casi limite: solo bibite o solo birre → niente passo 1, lista diretta · cambio BIBITA↔BIRRA con una bevanda già scelta →
la scelta si azzera (il bottone torna "SCEGLI DA BERE", niente +1 € a sorpresa) · torno a SOLO PANINO e poi MENU → resta
il gruppo aperto · birre "solo la sera" → lucchetto come oggi · Lupulus non ha "Keiler": nome invariato.
Invariati: prezzi, righe carrello/cassa (`buildFalloPesanteCartLine`), dati menu, PosterCard.
File: `PesiMassimiSection.jsx/.css`, e2e `customer-kitchen-flow` / `kitchen-p0-closure` / `kitchen-cart-persistence`
(solo il tocco in più), forse `kitchenMenuCopy.test.js`. Test: lib, lint file, build con override, browser 375/430 (Pastrami,
Box, cambio gruppo). Niente commit senza OK.
Modello/effort: implementazione a subagent `walbox-dev` Sonnet medium, verifica e review del diff qui (Opus medium).

## Fatto: hero nera ad arco (2026-10-29)
Commit `6110715` (non pushato): `MenuHero.css` fondo `#000` fuso con la testata + `.mh-shade` radiale ad arco
(`circle calc(var(--mh-w) * 1.3) at 102% 68%`). Scartati da Eros: filtro sulla foto, alone grigio, sfumatura lunga.

## Task in corso: gruppi nel pannello categorie (2026-10-29, OK Eros "Opzione 1")
Obiettivo: il pannello dell'hamburger (CATEGORIE) mostra 4 gruppi con titolo: APERITIVO (Taglieri, Cicchetti) ·
LEGGERO (Insalatone + bottone "Cicchetto Veg" che apre Cicchetti) · FAME VERA (Pesi Massimi, Tartare, Panini,
Contorni) · DA BERE (Birre, Bevande). Dati, linguette, cassa e TV invariati. Nomi gruppi = proposta di Claude,
Eros li può cambiare. File: `CustomerKitchenMenu.jsx` (solo pannello), `CustomerKitchenMenu.css` (`.kc-*`).
Test: lint file, build con override, browser 390 (anche modalità evento). Niente commit.
Modello/effort: Opus medium qui (modifica piccola).
**Esito (2026-10-29): FATTO, commit `9a689bf` (non pushato, OK Eros).** Lint del file 8 errori = stessi di HEAD, build ok. Browser 375: 4 gruppi
ok, Cicchetto Veg apre Cicchetti e chiude il pannello, `?evento=1` mostra solo FAME VERA (Pesi Massimi, Contorni).
Errori console = solo `ERR_CONNECTION_REFUSED` del Supabase locale spento (preesistenti).
Commit proposto: `git add src/pages/CustomerKitchenMenu.jsx src/pages/CustomerKitchenMenu.css` +
`git commit -m "feat: pannello categorie diviso in gruppi (Aperitivo, Leggero, Fame vera, Da bere)"`.
Aperto: ordine delle linguette sticky invariato (Pesi Massimi primo); allinearlo ai gruppi = decisione di Eros.

## Task chiuso: zoom foto a doppio tocco (2026-10-29, OK Eros "vai con A")
Obiettivo: doppio tocco sulla foto della scheda compatta → finestra sopra il menu (~90% larghezza, sfondo scuro),
panino che si "apre" con effetto molla + frase Walrus. Chiude: tocco ovunque, X, Esc, Indietro del telefono.
Frasi: 3 a rotazione per indice ("GUARDALO BENE. POI MANGIALO." · "SÌ, È GRANDE COSÌ DAVVERO." · "NON LECCARE LO
SCHERMO."); i 4 Pesi Massimi (009/010/011/059) ne hanno una diversa ciascuno (4ª proposta da Claude:
"QUESTO NON SI DIVIDE CON NESSUNO.", da confermare). File: `PosterCard.jsx`, `PosterCard.css`,
`PesiMassimiSection.jsx` (solo mappa frasi). Test: lint, build con override, browser 390. Niente commit.
Modello/effort: Opus medium qui (lavoro piccolo).
Esito (PASS, committato `670f26a` con OK Eros, pushato 2026-10-29 con OK Eros, nella PR #6): browser 390 → 1 tocco non apre, doppio tocco apre, chiude con tocco/X/Indietro,
URL resta `/kitchen`, scroll pagina sbloccato dopo. Pesi Massimi: 5 frasi diverse (anche Box 018:
"PESO MASSIMO. FAME ZERO.", proposta da Claude). Lint 121 invariato, build ok. Da confermare: le 2 frasi nuove.

## Task chiuso: allergeni (2026-10-29, committato `b6698ca`)
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
Commit fatto (`b6698ca`). Resta: il cuoco controlla `ai-ops/reports/allergeni-bozza.md`.

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

Modello/effort: nessun lavoro di codice in sospeso; decisioni (push/merge) qui su Opus medium.
