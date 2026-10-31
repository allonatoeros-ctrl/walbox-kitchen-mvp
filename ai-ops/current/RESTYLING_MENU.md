# Restyling menu cliente + logica

Creato 2026-10-24. Fonte unica dello stato di questo lavoro.
Dopo `/clear` o in una chat nuova: "riprendi da ai-ops/current/RESTYLING_MENU.md".

## Fase attuale
**Piano Fase 3 APPROVATO da Eros (2026-10-25) = Gate 1.** 3.0 (fix pass V1/V2/V4/V7) IN CORSO: implementazione delegata a
`walbox-dev` (report `ai-ops/reports/restyling-fase3-0-fix.md`), poi verifica + `visual-reviewer` 390/430. Niente commit
senza OK.
Stato 3.0 (2026-10-25): **fix applicati, non committati** (16 file in `src/`, report `restyling-fase3-0-fix.md`). V1/V4/V7 fatti;
V2 solo `scroll-padding-bottom` (footer sticky è l'ultimo figlio: non copre a fine scroll, ma con 7 righe nome/dove stanno
sotto e serve scroll → NEEDS_DECISION: footer più compatto o campi sopra le righe; candidato a 3.5). Verificato da me: diff
solo menu cliente, eslint 0 sui JSX toccati, transizione `grid-template-rows` presente in tutte e 6 le section (lo scroll
scatta su `transitionend`). Lint globale già rosso prima (api/scripts). Test lib 171/0 fail, build PASS (dichiarati dal
subagent). **Visual recheck FATTO: P0 0 · P1 0 · P2 6** (`ai-ops/reports/restyling-fase3-0-visual.md`, screenshot in
`ai-ops/reports/visual/restyling-fase3-0/`, ignorare `dbg.png`/`390-t.png`): V1 PASS 36/36 a 390/430 + 7/7 a 1280, V4 PASS,
V7 PASS (PAGO 4,58:1, margine stretto), nessuna regressione home/Pesi/evento. P2 residui: N1 AGGIUNGI home a `left:204px`
(→ 3.6), N2 "IL TUO SACCO" 187×34, N3 contrasti fuori elenco (`.kh-card-price` 3,49, prezzo Contorni 3,67, badge Pesi 4,44),
N4 = V2 residuo (7 righe: 744 px di scroll per il nome a 390), N5/N6 preesistenti. Arancio PAGO idle (`saturate 0.7`) sembra
spento: decide Eros. **3.0 CHIUSA: commit `a7a898e` (16 file `src/`, non pushato, OK di Eros 2026-10-25).**
**3.1 CHIUSA (2026-10-25): commit `83a93c5` (15 file, non pushato, OK di Eros).** `src/lib/kitchenPrice.js` + test (6/6) sostituisce 10 copie
locali di `formatPrice` ("8 €", "13,90 €", Pesi con decimali forzati); home e card generica in `CustomerKitchenMenu.jsx`
passano di lì; token `--poster-*` + `--font-display` Anton dentro `.kitch-page` (K1 chiuso: 0 Bebas nel menu); 1 asserzione
e2e aggiornata. Lib 183 pass/0 fail, build OK, eslint 0 sui file toccati (gli 8 errori di `CustomerKitchenMenu.jsx` sono
già in HEAD). Verifica a video 390 fatta da me. Report + comando di commit: `ai-ops/reports/restyling-fase3-1-fondamenta.md`.
Note per dopo: carrello/dock restano "€19,00" fino alla 3.5; mattone su fondo 3,74:1 (kicker 3.3); Anton solo peso 400.
**3.2 IN CORSO (2026-10-25, via di Eros):** `PosterCard.jsx/.css` nuovi + pilota solo Panini, delegato a `walbox-dev`
(report `ai-ops/reports/restyling-fase3-2-postercard.md`), poi `visual-reviewer` 390/430
(`ai-ops/reports/restyling-fase3-2-visual.md`). Niente commit senza OK. Le altre categorie restano col look di oggi.
Stato 3.2: implementata (lint 0 sui file toccati, lib 177 pass/0 fail/1 skip verificati da me). Visual review **NEEDS FIX
· P0 0 · P1 1 · P2 5**: P1 = al primo AGGIUNGI il dock compare sopra lo stepper (secondo tocco apre l'ordine). Fix pass
V1-V5 FATTO (scroll in vista, focus, aria-label, Wraptor 50% 28%, glifi −/+). **Recheck: P0 0 · P1 0 · P2 1** (V6 prezzo
"8 €" card vs "€8,00" sacco → 3.5), report §10 di `restyling-fase3-2-visual.md`. **3.2 pilota CHIUSA: commit `6f54608`
(6 file, non pushato, OK di Eros 2026-10-25).** **Prossimo: PosterCard su Insalatone** (poi Tartare, Taglieri, Cicchetti).
Comando proposto (6 file, non `RESTYLING_MENU.md` né `.claude/*`):
`git add src/components/kitchen/PosterCard.jsx src/components/kitchen/PosterCard.css src/components/kitchen/PaniniSection.jsx src/components/kitchen/PaniniSection.css src/pages/CustomerKitchenMenu.jsx tests/e2e/customer-kitchen-flow.spec.js`
`git commit -m "feat: menu cliente, locandina unica PosterCard (pilota Panini, Fase 3.2)"`
Dopo il commit: 3.2 sulle altre categorie (Insalatone, Tartare, Taglieri, Cicchetti, una per commit).
**3.2b Insalatone IN CORSO (2026-10-25, "ok" di Eros):** `InsalatoneSection.jsx/.css` passano a `PosterCard` come Panini
(mappa id → objectPosition, `onRemove`/`qtyById` da `CustomerKitchenMenu.jsx`), delegato a `walbox-dev` (report
`ai-ops/reports/restyling-fase3-2b-insalatone.md`), poi `visual-reviewer` 390/430 (`restyling-fase3-2b-visual.md`).
Caso limite principale: Caesar foto chiara sotto lo scrim. Niente commit senza OK.
Stato 3.2b: **implementata, non committata, pronta per Gate 2.** 5 file `src/` (InsalatoneSection.jsx/.css, 1 riga
CustomerKitchenMenu.jsx, commenti PosterCard.jsx + PaniniSection.jsx). eslint 0 sui file toccati (8 di HEAD invariati), lib 177
pass/0 fail/1 skip, build OK (dichiarati dal subagent). e2e flow 63 pass/11 fail: nessuna spec tocca Insalatone (alla 3.2 erano
23 fail: preesistenti, non misurato su HEAD). Visual **P0 0 · P1 0 · P2 1** (prezzo "10 €" card vs "€10,00" sacco → 3.5),
Caesar nome 14:1 / prezzo 9,9:1, stepper sopra il dock a 390/430. Screenshot Caesar 390 visto da me: OK.
Decisioni nuove: ritaglio ciotole più basso (gusto), badge VEG verde ora visibile, allergeni Caesar/Veggy da far verificare
alla cucina. Commit proposto:
`git add src/components/kitchen/InsalatoneSection.jsx src/components/kitchen/InsalatoneSection.css src/components/kitchen/PaniniSection.jsx src/components/kitchen/PosterCard.jsx src/pages/CustomerKitchenMenu.jsx`
`git commit -m "feat: menu cliente, Insalatone sulla locandina PosterCard (Fase 3.2b)"`
**3.2b CHIUSA: commit `d9ba251` (5 file, non pushato, OK di Eros 2026-10-25).**
**Prossimo: PosterCard su Tartare** (stesso schema: walbox-dev → visual-reviewer 390/430 → Gate 2 → commit), poi Taglieri, Cicchetti.
**3.2c Tartare IMPLEMENTATA, non committata, pronta per Gate 2 (2026-10-25).** 4 file `src/` (TartareSection.jsx/.css, 1 riga
CustomerKitchenMenu.jsx, commento PosterCard.jsx), ritaglio `50% 80%` per entrambe. eslint 0 sui file nuovi (8 di HEAD invariati),
lib 177 pass, build OK (dichiarati dal subagent). Visual **P0 0 · P1 0 · P2 1** (V6 prezzo "12,50 €" vs "€12,50" → 3.5), contrasto
nome 16,7:1 / prezzo 9,6:1, stepper sopra il dock (`restyling-fase3-2c-visual.md`). Da far verificare alla cucina: allergene "uova"
di item-021 (in attesa di conferma nei dati). Commit proposto:
`git add src/components/kitchen/TartareSection.jsx src/components/kitchen/TartareSection.css src/components/kitchen/PosterCard.jsx src/pages/CustomerKitchenMenu.jsx`
`git commit -m "feat: menu cliente, Tartare sulla locandina PosterCard (Fase 3.2c)"`
**3.2c CHIUSA: commit `4067b8e` (4 file, non pushato, OK di Eros 2026-10-25).**
**CORREZIONE DI ROTTA (Eros, 2026-10-25): "locandine sempre aperte" NON è quello che vuole.** Nuova regola: **locandina CHIUSA
(foto, nome, prezzo) che si apre col tocco** (come prima), poi dettagli + AGGIUNGI/stepper. Taglieri e Cicchetti FERMI finché
non è rifatta PosterCard. **3.2d IN CORSO:** PosterCard diventa apribile (una aperta alla volta, V1 scroll sopra il dock, qty
visibile da chiusa, aria-expanded), applicata a Panini/Insalatone/Tartare; delegato a `walbox-dev`
(report `ai-ops/reports/restyling-fase3-2d-apribile.md`), poi `visual-reviewer` 390/430. Niente commit senza OK.
Poi: Taglieri, Cicchetti (decisione 1 o 2 colonne ancora aperta).
Stato 3.2d: **implementata, non committata** (5 file `src/`: PosterCard.jsx/.css + 3 section; eslint OK verificato da me).
Visto da me a 390: chiusa foto+nome+prezzo, aperta con battuta/ingredienti/allergeni/AGGIUNGI/CHIUDI, una alla volta.
Dichiarati dal subagent: lib 177 pass, build OK. NON provati: Panini/Insalatone a 430, reduced-motion, fallback (prezzo null,
esaurito, foto rotta). **e2e `customer-kitchen-flow.spec.js` righe ~464 e 509-520 (`.pc-card--soldout .pc-cta`) ora falliranno**
(CTA nel pannello chiuso): task dedicato, non toccati. Prossimo: `visual-reviewer` 390/430 → Gate 2 → commit.
**DECISIONE FINALE DI EROS (2026-10-25, dopo 6 ore di confusione): l'app deve essere IDENTICA al mockup B**
(`ai-ops/reports/mockup-restyling/B-poster-da-pub.html`): intestazione striscia logo, tab chip, titolo manifesto + timbro,
locandine SEMPRE APERTE (battuta, allergeni, "+ AGGIUNGI"), barra carrello rossa, home. **3.2d BUTTATA** (backup patch nello
scratchpad `3.2d-apribile.patch`, working tree `src/` tornato a HEAD 4067b8e). Lavoro "mockup-fidelity" delegato a `walbox-dev`
(report `ai-ops/reports/restyling-fidelity.md`), poi confronto affiancato con il mockup e `visual-reviewer`. Commit solo con OK.
**FIDELITY FATTA, non committata (2026-10-25): PARZIALE** (`restyling-fidelity.md`, confronto `visual/restyling-fidelity/final-390-panini-sbs.png`).
Combacia col mockup a 390 (pagina Panini): striscia logo (`public/assets/kitchen/walrus-pub-logo.webp` nuovo), chip sticky, titolo
manifesto + timbro, locandine sempre aperte, barra rossa "VAI ALLA CASSA". 16 file modificati + 1 nuovo. Cicchetti e Taglieri ora su
PosterCard. Differenze residue: chip "←" aggiunto (tolta barra INDIETRO), riga ingredienti in più, kicker/timbro 3,7:1, Pesi Massimi/
Birre/Bevande/Contorni con card invariate (Contorni crema), foto rotta/nomi lunghi non verificati. e2e: ~30 usano "VAI ALL'ORDINE"
e totali "€19,00" (testi da aggiornare), 18 fallimenti forse preesistenti. lint 8 errori come HEAD, lib 177 pass, build OK
(dichiarati dal subagent). Da fare: visual-reviewer 390/430, aggiornare e2e, decisioni di Eros, poi commit atomici.
**(storico) Visual 3.2d: NEEDS FIX PASS · P0 0 · P1 3 · P2 7** (`restyling-fase3-2d-visual.md`, screenshot in `visual/restyling-fase3-2d/`).
Base OK (26/26 aperture con AGGIUNGI sopra il dock a 390/430, una sola aperta, tastiera, badge ×N). Da fixare in
`PosterCard.jsx/.css` prima del commit: **D1** con reduced-motion lo scroll non parte (parte su transitionend) → AGGIUNGI sotto
il dock; **D2** ESAURITO da chiusa si vede solo come foto grigia → scritta/badge ESAURITO visibile da chiusa; **D3** la card
chiusa non dice che va toccata (prima c'era "VEDI IL PANINO") → NEEDS_DECISION di Eros sulla forma (raccomandato: "+" o freccia
nell'angolo della foto; altre opzioni nel report). Dopo il fix: recheck → Gate 2 → commit. Poi e2e righe ~464/509-520, Taglieri, Cicchetti.
Decisioni nuove per Eros: battuta in corsivo prima degli ingredienti (D1); allergeni panini da verificare con la cucina
(solo Wraptor ha "Glutine": dato in `kitchenMockData.js`, protetto). e2e 3e preesistente rotto (7 vs 6 panini).
Decisioni aperte: V2 residuo (footer
compatto o campi sopra le righe → 3.5), arancio PAGO idle spento o no, cicchetti 1 o 2 colonne (3.2).

**Direzione scelta da Eros (2026-10-24): B "Poster da pub".** Piano Fase 3 scritto qui sotto (§ Piano Fase 3).

**Mockup A e B FATTI (2026-10-24):** due pagine HTML statiche (pagina Panini a 390, foto vere incorporate), in
`ai-ops/reports/mockup-restyling/A-walrus-consolidato.html` e `B-poster-da-pub.html` (gitignored, nessun file di prodotto
toccato). Si aprono con il dev server: `http://localhost:<porta>/ai-ops/reports/mockup-restyling/<file>.html`
(file:// nel pannello non regge ~1 MB). Testi e allergeni presi da `kitchenMockData.js`. **Prossimo: Eros sceglie A, B o B-lite.**

**Fase 2 v2 FATTA (2026-10-24, audit rifatto da zero su HEAD 54a1eea, coverage COMPLETA 390/430 su 9 categorie + 1280 home/carrello): NEEDS FIX PASS · P0 0 · P1 8 · P2 20 · ENV_BLOCKER 1** (report `ai-ops/reports/restyling-fase2-audit-v2.md`, evidence browser `restyling-fase2-audit-v2-browser.md`, 70 screenshot in `ai-ops/reports/visual/restyling-fase2-v2/`). Conferma 12/16 del v1, corregge 3 (muted carrello 5,3:1 non 3,09; toast sopra il dock; header non sticky), aggiunge 8 NEW: la più concreta è **V1: aprendo una card in 5 categorie su 6 AGGIUNGI finisce sotto il dock o fuori schermo** (riprodotta da me a 430), poi contrasti < 4,5 sulle CTA PAGO (3,41:1), foto rotta senza onError, nome non ricordato, font home Bebas Neue che arriva dal CSS della TV (`KitchenTvScreen.css:14` su `:root`). 3 direzioni in §6 del report: **A "Walrus consolidato" raccomandata** (CSS ~70 %, 3 sessioni), B "Poster da pub" (CSS+JSX, 5-6), C "Menu di carta" chiaro (4-5). Nessun file di prodotto toccato, nessun commit. **Prossimo: Eros sceglie la direzione (§6) e risponde alle 5 decisioni (§8); Fase 3 parte dal fix pass V1/V2/V4/V7.**

**Fase 2 FATTA (2026-10-24, audit su HEAD 54a1eea): P0 0 · P1 5 · P2 11** (report `ai-ops/reports/restyling-fase2-audit.md`, 32 screenshot in `ai-ops/reports/visual/restyling-fase2/`). Verificato a campione da me: coordinate assolute card home (`top:328px; left:204px`, `CustomerKitchenMenu.css:1497/1509`) e giallo `#ffc107` in `AllergenBadges.jsx`. P1: prezzo troppo debole (13px, contrasto 3,49:1); 4 anatomie di card diverse (Contorni con componente vecchio); target tocco <44px (AGGIUNGI 38, CHIUDI 32, +/- 36); allergeni gialli con stile inline; carrello crema su app scura con footer che copre nome/dove. Velocità: 1 tap Crudo/Mortazza, 3 Pesi Massimi, 4 le altre categorie; schermata "Il menu" e hero ripetuto superflui. Non verificato: Supabase spento, 430/1280 di alcune categorie, dopo-pagamento. **Prossimo: Eros sceglie la direzione grafica (Fase 3).**

**Fase 1 CHIUSA, Fase 2 in corso (2026-10-24).** Eros ha approvato la base ("mi piace"): segnalibro locale `menu-foto-nuove-v1` sul commit `76b8018` (non pushato). Decisione di prodotto: **cicchetti con piatti colorati ammessi**; la regola §5.2 è aggiornata in `.claude/skills/walbox-visual-review/SKILL.md` e `.claude/agents/visual-reviewer.md` (file `.claude/*`, non committati per scelta di Eros). Restano i P2 minori dei ritagli (opzione A in `PesiMassimiSection.jsx`): da fare nella Fase 3 o prima, a scelta. Taglieri "2": ancora da decidere. Prossimo: audit visivo (`ai-ops/reports/restyling-fase2-audit.md`), poi Eros sceglie la direzione grafica.

**Fase 0 chiusa (2026-10-24).** Branch `feat/restyling-menu` creato da `origin/main` (`f5bfd74`; il `main` locale era vecchio di 10 commit).
Le modifiche vecchie sono state salvate con il commit `3855a51` sul branch `feat/anniversario-15-anni` (solo `ANNIVERSARIO_15_ANNI.md`, non pushato).
`.claude/*` restano non committati (seguono il branch). Prossimo: Fase 1 (foto), serve OK di Eros per `kitchenMockData.js`.
Nota: il branch restyling NON contiene la pulizia repo Phase 4 (5 commit sul branch anniversario, non in `main`).

**Aggiornamento (2026-10-24, dopo OK di Eros):** Box Pulled Pork fatto: `kitchenMockData.js` item-018 ora punta a `box-pulled-pork.webp` (1 riga, unica modifica a quel file) e la foto è in `menu/box/`. Il vecchio `.png` resta nel repo (non cancellato). Controllo visivo pesi massimi + Orto Cattivo a 390/430 delegato a `visual-reviewer`: report in `ai-ops/reports/restyling-fase1-visual.md`. Dopo il verdetto: se OK, chiedere a Eros il commit atomico della Fase 1 (foto + 1 riga + niente `.claude/*`).

**Verdetto visual-reviewer (2026-10-24): NEEDS FIX · PARZIALE** (report `ai-ops/reports/restyling-fase1-visual.md`, screenshot in `ai-ops/reports/visual/restyling-fase1/`).
Nessuna foto deformata; il problema è il ritaglio (le foto nuove hanno il cibo fuori centro, il CSS taglia al centro). P1 (cibo tagliato): pastrami e box aperti (`PesiMassimiSection.css:~220`, altezza fissa 230px), Crudo/Mortazza in home (`CustomerKitchenMenu.css:~1429`), striscia Pesi Massimi con box (`PesiMassimiSection.css:~50`). P2: mezzo burger nella striscia; con `?evento=1` Orto Cattivo ha bande nere (`GarpezHero.jsx:23`); Garpez ha ancora la vecchia foto 3:2; il "+" copre il burger in evento.
Fix piccoli solo CSS/JSX (F1, F2, F3, F6). Per F4/F5 serve una posizione per foto: non c'è un campo dati, aggiungerlo tocca `kitchenMockData.js` (protetto). Non controllati: cicchetti, insalatone, tartare, carrello. Verificato a campione da me: l'altezza fissa 230px esiste.
**Prossimo:** Eros decide se sistemare i ritagli ora (Fase 1b, solo CSS) e se committare le foto. Poi Fase 2 (audit).

**COMMIT FASE 1 FATTI (2026-10-24, non pushati):** `24bdc8d` foto nuove + riga item-018; `76b8018` fix ritaglio (3 file). Restano fuori: `.claude/*`, `CHECKPOINT.md`, questo file. Prossimo: opzione A per striscia/CHIUDI (P2) e decisione cicchetti su piatti colorati; poi Fase 2 (audit visivo). Aggiornare `CHECKPOINT.md` a fine Fase 1.

**Ricontrollo Fase 1c (2026-10-24): fix F1/F2/F3/F6 OK, P0 0 · P1 0 · P2 6** (report `ai-ops/reports/restyling-fase1c-recheck.md`). Restano P2: bottone CHIUDI copre la cima del pane di Pulled Pork/Brisket (effetto del 72%); a 1280 pane Pulled Pork perde ~12px, Crudo/Mortazza a filo; striscia Pesi Massimi invariata (F4/F5); taglieri aperti a 390 tagliati in basso. Insalatone/Tartare OK. **Decisione di prodotto per Eros:** le 4 foto cicchetti nuove sono su piatti colorati, la regola §5.2 dice "tutti senza piatto" → nuova direzione (aggiorno la regola) o si rifanno? Fix consigliato: una posizione per foto in `PesiMassimiSection.jsx` (opzione A) che chiude CHIUDI + tagli + striscia. Non testato: Supabase locale spento.

**Fase 1b FATTA (non committata):** F1/F2/F3/F6 sistemati in 3 file (`PesiMassimiSection.css` object-position 50% 72%, `CustomerKitchenMenu.css` `.kh-card-photo img` 50% 30%, `GarpezHero.jsx` `WIDE_PHOTO_IDS` vuoto). Diff verificato da me; lib test 171 pass/0 fail (dichiarato dal subagent). Ricontrollo `visual-reviewer` in corso → `ai-ops/reports/restyling-fase1c-recheck.md`. **Opzioni F4/F5 (striscia Pesi Massimi):** (A, raccomandata) mappa per id con `objectPosition` inline in `PesiMassimiSection.jsx`, niente dati protetti né file nuovi (precedente `BILLING_BY_ID` in `GarpezHero.jsx`); (B) `:nth-child` in CSS, fragile se cambia l'ordine; (C) campo `imagePosition` nei dati protetti, ha senso con la Fase 4. Id da confermare: Box = item-018; Pulled Pork item-009, Pastrami item-010, Brisket item-011.

**Fase 1b (storico, OK di Eros):** subagent `walbox-dev` sistema F1/F2/F3/F6 solo CSS/JSX e propone opzioni per F4/F5 (report `ai-ops/reports/restyling-fase1b-fix.md`). Poi ricontrollo con `visual-reviewer` (rifare la review sulle modifiche non committate). Niente commit finché Eros non approva.

**Fase 1 quasi chiusa (2026-10-24, non committata):** 22 foto su 23 copiate in WEBP 1254x1254 (q85) SOPRA i file esistenti
(stesso percorso, quindi `kitchenMockData.js` NON modificato). Home verificata a 390 nel preview (nessun 404). Restano:
- **Box Pulled Pork:** nuova foto pronta come WEBP in scratchpad (`.../scratchpad/foto-webp/box-pulled-pork.webp`), ma oggi il prodotto punta a `box-pulled-pork.png`. Servono OK per 1 riga in `kitchenMockData.js` (item-018) oppure si lascia la vecchia.
- Pesi massimi e Orto Cattivo erano 1536x1024 (rettangolari), ora sono quadrati: da controllare sezioni interne (`PesiMassimiSection`, dettaglio) a 390/430.
- Taglieri "2" (3 foto): non usate, decide Eros. Mappa foto→file in `scratchpad/mappa.tsv`. Originali intatti in `~/Desktop/foto-panini-nuovi/`.
- Annullare: `git restore public/assets/kitchen` ripristina le foto vecchie.

## Piano Fase 3 — direzione B "Poster da pub" (proposto 2026-10-24, da approvare)
Obiettivo: il menu cliente diventa una serie di "locandine" (foto 4:3 a tutta larghezza, nome e prezzo sopra la foto,
CTA 52 px piena), come il mockup `ai-ops/reports/mockup-restyling/B-poster-da-pub.html`. Solo menu cliente: niente
staff, TV, routing, `api/`, Supabase, `kitchenMockData.js`. Ogni sotto-fase = 1 sessione, chiude con visual review +
gate di Eros + commit atomico solo con OK. Push su `main` = deploy: sempre decisione separata di Eros.

**3.0 Fix pass usabilità (sul look di oggi, si può pubblicare da solo)**
- V1: nelle 6 section con card apribile (`Panini`, `Cicchetti`, `Insalatone`, `Tartare`, `Tagliere`, `Birre` `*Section.jsx`)
  all'apertura la card scorre fino a mostrare AGGIUNGI sopra il dock (stesso schema di `PesiMassimiSection.jsx:212`).
- V2: nel carrello il footer non copre più nome e "dove" (`CustomerCheckout.css` `.cx-footer`/padding,
  `CustomerKitchenMenu.css` `.kitch-drawer-body`).
- V4: tocco ≥ 44 px su AGGIUNGI, CHIUDI, SCOPRI, −/+, VAI ALL'ORDINE, INDIETRO, Bevande (CSS delle section + menu).
- V7: contrasto ≥ 4,5:1 su PAGO ORA / AL BANCO, placeholder nome, "VAI SUL SICURO", testo muted (`CustomerCheckout.css`,
  `CustomerKitchenMenu.css`).
- Perché prima, anche se B poi toglie le card apribili: sono poche righe e proteggono la produzione nelle settimane del
  restyling. Verifica: `visual-reviewer` 390/430 solo su V1/V2/V4/V7. Commit `fix:`.

**3.1 Fondamenta poster**
- Token `--poster-*` dentro `.kitch-page` (i `--k-*` globali dello staff restano). Font: Anton per titoli/prezzi,
  Barlow Condensed per etichette, Montserrat testo (già caricati in `index.html`); il menu non eredita più Bebas
  dalla TV (K1) perché dichiara il suo font, senza toccare `KitchenTvScreen.css`.
- `formatPrice` unico in `src/lib/` con test accanto (**file nuovo**): "8 €" per gli interi, "13,90 €" altrimenti.

**3.2 Locandina unica** — **file nuovi** `src/components/kitchen/PosterCard.jsx` + `.css`
- Foto 4:3, scrim, nome + prezzo sovrapposti, N°, VEG, descrizione, allergeni come testo (chiude V5), CTA piena che
  diventa stepper − N + quando il prodotto è nel carrello. Niente apri/chiudi: −1 tap, V1 sparisce per costruzione.
- Ritaglio 4:3 con mappa id → `objectPosition` nel componente (stessa idea dell'opzione A dei Pesi, niente dati
  protetti). `onError` → riquadro "FOTO IN ARRIVO" (V18). Nomi lunghi su 2 righe (clamp, V19).
- Serve passare alle section quantità e `onRemove` da `CustomerKitchenMenu.jsx` (JSX, piccolo).
- Pilota su **Panini**, review, poi Insalatone, Tartare, Taglieri, Cicchetti (una per commit).

**3.3 Testate e tab** — in alto la striscia logo "The Walrus Pub · Food & Drink" (PNG 1120x155 dato da Eros il
2026-10-25, oggi solo nel mockup B: `ai-ops/reports/mockup-restyling/walrus-pub-logo.png`; in produzione va convertito in
WEBP in `public/assets/kitchen/` = **asset nuovo**, sostituisce/affianca `01_header_walrus_kitchen.webp`: decide Eros); titolo categoria da manifesto (kicker, Anton 56-64, timbro "Tutti 8 €" dove il prezzo è unico),
`getCategoryTitle` senza span inline (V10, V17), tab chip senza etichette tagliate + `aria-pressed` (V8).

**3.4 Le categorie speciali** — Pesi Massimi (è già poster: solo token/font, hero compatto in categoria, V16),
Birre e Bevande (struttura invariata, stile poster), Contorni sulla locandina (via la card pergamena, V6).

**3.5 Carrello e cassa** — "biglietto da bancone" scuro coerente col resto, via le emoji (V12), toast bordo oro + Esc
chiude il drawer (V15), `:focus-visible` (V21). Pagamento SumUp e `api/` non si toccano: solo CSS/JSX del drawer.

**3.6 Home** — card Crudo/Mortazza senza coordinate assolute (V9), titoli e prezzi poster.

**3.7 Chiusura** — `visual-reviewer` completo 390/430/1280 + evento `?evento=1`, lint, test lib, build con override,
diff review, CHECKPOINT.

**Casi limite da controllare a ogni passo:** foto chiare sotto lo scrim (Caesar, insalate) · nomi lunghi ("Pastrami —
Fallo Pesante") · "PREZZO IN ARRIVO" · prodotto non disponibile (CTA spenta) · foto mancante/rotta · carrello vecchio in
localStorage · modalità evento · 390/430/1280 · scroll più lungo (7 panini ≈ 3.000 px).

**Gate:** file nuovi (`PosterCard.*`, `formatPrice` in `src/lib/`) = approvati con questo piano · ogni commit · push/deploy.

**Decisioni aperte (NEEDS_DECISION, non bloccano la 3.0):**
1. Cicchetti (4 pezzi da 5-6 €): locandina piena o mini-locandine su 2 colonne? Consiglio: 2 colonne.
2. Prezzo: "8 €" senza decimali sugli interi? Consiglio: sì.
3. Ricordare il nome tra una visita e l'altra (V20): va nella Fase 4 (logica), non qui.

Modello/effort: 3.0 Sonnet alto (`walbox-dev`) + `visual-reviewer` · 3.1-3.6 Sonnet alto, un subagent per sotto-fase ·
review Opus.

## Contesto
Rinfrescare il look del **menu cliente** (il QR) con le foto nuove e migliorare la logica:
ordinare più veloce, codice più ordinato, foto/menu più facili da gestire. Solo menu cliente (staff, TV, stato ordine esclusi).
Verificato il 2026-10-24: `src/pages/CustomerKitchenMenu.jsx` = 1.124 righe e ~25 `useState`;
le foto sono scritte a mano nel campo `image` di `src/data/kitchenMockData.js` (**area protetta §5**);
foto in `public/assets/kitchen/menu/<categoria>/` (tracciate da git); CSS: `CustomerKitchenMenu.css` (1.761 righe),
`PaniniSection.css`, `CustomerCheckout.css`, token `--k-*` / `--walrus-*` in `src/index.css`.
La festa dei 15 anni è passata (16/10): il lavoro evento non blocca questo.

## Foto nuove (consegnate)
Cartella: `~/Desktop/foto-panini-nuovi/` (fuori dalla repo, 26 JPEG già nominati). **Copiare, mai spostare né cancellare.**
Convertire in WEBP, stesso formato di oggi (~1536x1024). Abbinamento file → item da fare guardando le foto e `kitchenMockData.js`;
dubbi segnalati a Eros come elenco.

| Cartella | Foto | Destinazione repo |
|---|---|---|
| panini da spacco | crudo ma educato, crudo vero, mortazza classe alta, orto cattivo, porca figura, specktacolo, wraptor | `menu/panini/` |
| pesi massimi | box pulled pork, brisket, pastrami, pulled pork | `public/assets/kitchen/photo-<nome>-special.webp` (convenzione attuale) e `menu/box/` per il box |
| cicchetti | cicchetto veg, lardo e noci, mortazza, scamorza e cipolle | `menu/cicchetti/` |
| insalatone | caesar, salmon, veggy | `menu/insalatone/` |
| taglieri | formaggi discutibili (x2), pace fatta (x2), salumi serissimi (x2) | `menu/tagliere/` (le coppie "2" = seconda foto: decide Eros se usarla) |
| tartare | cruda e contenta, dolce ma cruda | `menu/tartare/` |

Nota: i nomi dei file sono i nomi "da menu" dei prodotti, non gli id. Da verificare sul codice prima di collegare.

## Fasi (una alla volta, ognuna chiude con un gate di Eros)
0. **Setup**: nuovo branch da `main` (`feat/restyling-menu`) + questo file. Attenzione: sul branch attuale
   `feat/anniversario-15-anni` ci sono modifiche non committate (`.claude/settings.json`, `CHECKPOINT.md`,
   `ai-ops/current/ANNIVERSARIO_15_ANNI.md`, `.claude/hooks/`, `.claude/launch.json`): non perderle, chiedere a Eros
   come sistemarle prima di cambiare branch.
1. **Foto nuove**: copia + conversione in `public/assets/...`; aggiorno i campi `image` in `kitchenMockData.js`
   (protetto: serve OK esplicito). Verifica a video 390/430.
2. **Audit visivo** (skill `walbox-visual-review`, sola lettura): screenshot di home, sezioni, carrello, checkout; elenco di cosa
   sa di "vecchio". Eros sceglie la direzione (max 3 opzioni, 1 raccomandata).
3. **Restyling CSS** solo menu cliente. Tono Walrus (bold, pub, poster), mobile-first. Niente routing, `api/`, supabase.
4. **Logica** (dopo il look, un pezzo per volta, test accanto in `src/lib/`):
   - *Più veloce*: candidati dall'audit (aggiungi dal listing senza aprire il dettaglio, ricordare ultimo nome/modo, meno passaggi).
   - *Codice più ordinato*: estrarre da `CustomerKitchenMenu.jsx` hook (`useMenuCart`, `useMenuNavigation`) e componenti
     (home, drawer); stesso comportamento, test `kitchenCart` invariati.
   - *Foto/menu*: nuovo `src/data/kitchenMenuImages.js` (mappa id → foto) letto da `useKitchenMenu.js`
     (nuovo file: serve approvazione).
5. **Chiusura**: lint, `node --test src/lib/*.test.js`, build con override, diff review, CHECKPOINT. Commit atomici solo con OK.

## Casi limite
Foto mancante/pesante (il placeholder "FOTO IN ARRIVO" c'è già) · carrello in localStorage con id vecchi (`reconcileCartItems`) ·
modalità evento `?evento` · prodotto non disponibile · 390 / 430 / desktop · ordine in corso durante il deploy.

## Gate irreversibili
Modifica di `kitchenMockData.js` (§5) · nuovi file · commit · push su `main` = deploy in produzione con pagamenti reali.

## Verifica
`npm run lint` · `node --test src/lib/*.test.js` · `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build` ·
passata a video 390/430 con preview e screenshot prima/dopo.

Modello/effort: Fase 0-2 Sonnet medio · Fase 3 Sonnet alto (con visual-reviewer) · Fase 4 Sonnet alto, un subagent per pezzo.

## Decisioni aperte
- Come sistemare le modifiche non committate prima di creare il branch (Fase 0).
- Taglieri: usare anche le seconde foto ("2")?
- ~~Direzione grafica del restyling~~ → B "Poster da pub" (Eros, 2026-10-24). Decisioni della Fase 3: vedi § Piano Fase 3.

## Piano 3.4 — Pagina iniziale = menu con linguette (APPROVATO da Eros 2026-10-25, PESI MASSIMI prima linguetta OK)
Stato: passo 1 in corso, `visual-reviewer` sulla FIDELITY → `ai-ops/reports/restyling-fidelity-visual.md`; poi OK di Eros + commit
FIDELITY, poi passi 2-5.
Visual FIDELITY fatta: **NEEDS FIX · P0 0 · P1 3 · P2 9** (`restyling-fidelity-visual.md`). V1 chip "←" esce dallo schermo
(→ sparisce con la 3.4, che toglie il chip); V2 cambio categoria non torna in alto (→ dentro la 3.4, passo 2); V3 Contorni card
crema con testo in `kitchenMockData.js` (decide Eros, protetto). Proposta: commit FIDELITY così, V1/V2 chiusi dalla 3.4.
Commit proposto (13 file, no `.claude/*` né questo file):
`git add public/assets/kitchen/walrus-pub-logo.webp src/components/kitchen/CicchettiSection.css src/components/kitchen/CicchettiSection.jsx src/components/kitchen/InsalatoneSection.css src/components/kitchen/KitchenCategoryTabs.jsx src/components/kitchen/PaniniSection.css src/components/kitchen/PosterCard.css src/components/kitchen/PosterCard.jsx src/components/kitchen/TagliereSection.css src/components/kitchen/TagliereSection.jsx src/components/kitchen/TartareSection.css src/pages/CustomerKitchenMenu.css src/pages/CustomerKitchenMenu.jsx`
`git commit -m "feat: menu cliente, fedeltà al mockup B: testata logo, chip, titolo manifesto, Cicchetti e Taglieri su PosterCard"`
**FIDELITY CHIUSA: commit `f1203e3` (13 file, non pushato, OK di Eros 2026-10-25).** 3.4 passi 2-5 IN CORSO: delegati a
`walbox-dev` (report `ai-ops/reports/restyling-fase3-4-linguette.md`), poi visual-reviewer 390/430. Niente commit senza OK.
Stato 3.4: **implementata, non committata** (3 file: CustomerKitchenMenu.jsx/.css, KitchenCategoryTabs.jsx). Apre su `bbq`
(PESI MASSIMI prima linguetta), home/elenco categorie/"←" tolti, cambio linguetta torna in alto, back: linguette in replaceState,
sacco pieno = avviso 3s poi esce, drawer aperto = lo chiude (guard letto da me). eslint 8 come HEAD, lib 177 pass, build OK
(dichiarati). NEEDS_DECISION: frase "OGGI TI FACCIAMO VENIRE FAME." (copy esistente), avviso back "Hai un ordine in corso.
Tocca ancora indietro per uscire." (copy nuovo). e2e rotti: elenco nel report `restyling-fase3-4-linguette.md`. Visual **P0 0 · P1 0 · P2 4** (`restyling-fase3-4-visual.md`): V2 chiuso (9/9 linguette tornano in alto), back OK nei 3 casi.
P2: avviso back 6 px sotto la barra rossa; scheda aperta da QR chiede un indietro in più; Pesi Massimi tutti esauriti apre su
categoria finita (decide Eros); testo avviso "ordine in corso" fuorviante (decide Eros). Pronta per Gate 2. Commit proposto:
`git add src/pages/CustomerKitchenMenu.jsx src/pages/CustomerKitchenMenu.css src/components/kitchen/KitchenCategoryTabs.jsx`
`git commit -m "feat: menu cliente, si apre su Pesi Massimi con le linguette, via la home (Fase 3.4)"`
**3.4 CHIUSA: commit `3d88f9d` (3 file, non pushato, OK di Eros 2026-10-25).**
**NEXT STEP:** riallineare gli e2e rotti da FIDELITY + 3.4 (task dedicato, elenco in `restyling-fidelity.md` e
`restyling-fase3-4-linguette.md`), poi 3.5 carrello e cassa (dentro: P2 avviso back sotto la barra rossa).
**Piano 3.4b — Pesi Massimi in versione poster: OPZIONE A APPROVATA da Eros (2026-10-25).** IN CORSO: delegata a `walbox-dev`
(report `ai-ops/reports/restyling-fase3-4b-pesi.md`), poi visual-reviewer 390/430. Niente commit senza OK.
Stato 3.4b: **implementata, non committata** (4 file: PosterCard.jsx [+`children`, +`hideCta`], PesiMassimiSection.jsx/.css,
CustomerKitchenMenu.jsx). eslint 8 come HEAD, lib 177 pass, build OK, flussi SOLO PANINO/MENU a 390/430 (dichiarati). Evento:
item evento perde badge "15 ANNI" (fuori scope). NEEDS_DECISION: con MENU scelto lo stepper del panino singolo è nascosto.
Visual 3.4b: **NEEDS FIX · P0 0 · P1 1 · P2 6** (`restyling-fase3-4b-visual.md`). P1 V-01: scelta birra a 390 finisce sotto
la barra rossa, nessun riscontro. In corso FIX PASS (walbox-dev: V-01 + patate esaurite, esaurito attenuato, passi, margini, foto
Box), poi recheck visual → Gate 2 → commit (4 file). Fix pass FATTO (solo PesiMassimiSection.jsx/.css; V-01 + P2 chiusi,
foto Box solo parziale; copy nuovi "PATATE FINITE: SOLO PANINO" e "BIRRA: …" = NEEDS_DECISION). **Recheck: P0 0 · P1 0 · P2 3** (§10 di `restyling-fase3-4b-visual.md`): foto Box (serve foto
nuova), "KEILER LAND-PILS" va a capo sul trattino a 390, "PATATE FINITE" contrasto 4,04:1. Pronta per Gate 2. Commit proposto:
`git add src/components/kitchen/PosterCard.jsx src/components/kitchen/PesiMassimiSection.jsx src/components/kitchen/PesiMassimiSection.css src/pages/CustomerKitchenMenu.jsx`
`git commit -m "feat: menu cliente, Pesi Massimi sulla locandina PosterCard con scelta solo panino o menu (Fase 3.4b)"`
Fix 3 P2 fatto (Box 17,7:1, Keiler su una riga, PATATE FINITE 14,5:1; solo PesiMassimiSection.*). Verificati da me: eslint 0,
lib 177 pass/0 fail, build OK. **3.4b CHIUSA: commit `f5ed050` (4 file, non pushato, OK di Eros 2026-10-25).** 1280 non rivisto.
**NEXT STEP (aggiornato 2026-10-25): Piano 3.4c (font stile Walrus) in fondo al file, 3.4c fatta non committata, Piano 3.4d (card chiuse) in attesa di Gate 1; poi 3.5 (in attesa), poi e2e.** Prima era: riallineare gli e2e rotti da FIDELITY + 3.4 + 3.4b (task dedicato, elenchi nei report `restyling-fidelity.md`,
`restyling-fase3-4-linguette.md`, `restyling-fase3-4b-pesi.md`), poi 3.5 carrello e cassa. Decisioni di Eros: niente stepper sul MENU; stepper panino nascosto con MENU.
Richiesta di Eros: anche Pesi Massimi come le altre categorie (locandine poster). Verificato: `PesiMassimiSection.jsx` (447
righe) + `.css` (1.063) ha hero grande propria + card apribili con dentro la scelta **SOLO PANINO / MENU** (combo "Fallo
Pesante": patate incluse + birra obbligatoria, `beerOptions`, `includedSide`, testid `fallo-pesante-*` usati dagli e2e).
PosterCard oggi non sa fare questa scelta. Opzioni:
- **A (raccomandata):** testata manifesto `kp-head` come le altre (via la hero grande) + Pesi su `PosterCard` sempre aperta, con
  uno "spazio extra" nuovo in PosterCard (prop `children`) dove resta il blocco SOLO PANINO / MENU + birra, stessa logica di oggi
  (stesso carrello, stessi testid). File: PosterCard.jsx/.css, PesiMassimiSection.jsx/.css, forse 1 riga CustomerKitchenMenu.jsx.
- B: PosterCard pura per i 4 Pesi + il MENU "Fallo Pesante" diventa una locandina separata in fondo. Più pulito a vista ma
  cambia il modo di ordinare il combo (decisione di prodotto, più e2e da rifare).
- C: solo look (font, colori, hero più bassa), card apribili come oggi. Minimo rischio, ma resta diverso dalle altre.
Casi limite: birra `evening_only` di giorno, patate esaurite (combo non ordinabile), item esaurito, carrello vecchio con
`combo.id::beerId`, 390/430. Verifica: eslint, lib test, build con override, visual-reviewer 390/430. Commit solo con OK.
Modello/effort: walbox-dev Sonnet alto per il codice, Opus medium per coordinare.
Decisioni aperte nuove: testo avviso back, Pesi Massimi tutti esauriti, Contorni card crema (dati protetti), contrasto kicker/timbro.
**Eros (2026-10-25): la modalità evento/anniversario NON si conta** (né nelle review né come caso limite della 3.4).
Risposte di Eros: si apre su **PESI MASSIMI**; **una pagina per linguetta**; si tengono **logo Walrus + frase di benvenuto**;
fastidi della home di oggi: troppi passaggi, ripete le cose, è lunga.
Obiettivo: niente più schermata "home". Dal QR: logo + frase (striscia corta) → linguette sticky → locandine Pesi Massimi.
Passi:
1. Prima chiudere la FIDELITY (visual-reviewer 390/430 → OK di Eros → commit), perché tocca gli stessi file.
2. `CustomerKitchenMenu.jsx`: vista iniziale = categoria `pesi-massimi` (in evento resta la categoria evento); via blocchi
   intro lunga / panini in vetrina / "ENTRA NEL MENU"; frase di benvenuto sotto il logo; chip "←" tolto (non c'è più dove
   tornare); tasto indietro del telefono: non deve uscire dal menu per sbaglio a metà ordine.
3. `KitchenCategoryTabs.jsx`: linguetta PESI MASSIMI prima (assunzione, vedi sotto).
4. CSS: rimuovere gli stili `kh-*` rimasti senza uso solo se sicuro, altrimenti lasciarli.
5. e2e che partono dalla home: da aggiornare (task insieme a quelli della fidelity).
Casi limite: reload con categoria salvata (resta lì), `?evento=1`, Pesi Massimi esauriti tutti, link vecchi che aprono `/kitchen`.
File: `CustomerKitchenMenu.jsx/.css`, `KitchenCategoryTabs.jsx`. Niente routing, `api/`, Supabase, dati protetti.
Assunzione da confermare: PESI MASSIMI diventa la prima linguetta.
Verifica: lint file toccati, lib test, build con override, visual-reviewer 390/430. Commit solo con OK.
Modello/effort: walbox-dev Sonnet per il codice, Opus medium per coordinare.

## Piano 3.5 — Carrello e cassa (2026-10-25, IN ATTESA del Gate 1 di Eros)
Eros: "lascia gli e2e, prepara il piano della 3.5". Gli e2e rotti restano un task a parte (dopo).
**Obiettivo:** il sacco e la cassa hanno lo stesso look locandina del menu e sono più corti da compilare. Solo come appaiono:
non cambiano né la logica dell'ordine né il pagamento.
**Verificato (audit in sola lettura su HEAD f5ed050):**
- Il drawer (`CustomerKitchenMenu.jsx` 896-985, CSS 735-940) è ancora crema/arancio (`--k-cream`, `--k-orange`), il menu è poster scuro.
- Prezzi in 3 formati: dock "19,00 €", righe del sacco "€8,00", birra consigliata "+€6,00", totale cassa "€19,00"
  (`CustomerCheckout.jsx:253,290`). Card del menu: "8 €" (`formatPrice`).
- Emoji (V12): 🗑️ cestino, 🍺🍟🍔 al posto della foto mancante (`drawerIcon`), in cassa 🍽️🥡💳🧾🎲⚠️🚫 e 🦭 in 2 frasi.
- Esc non chiude il drawer (V15); toast "aggiunto al sacco ✓" senza bordo oro. `:focus-visible` c'è in cassa, manca su
  chiudi/−/+/cestino/birra del drawer (V21).
- V2/N4: footer sticky "COME PAGHI?" (`.cx-footer`) → a 390 con 7 righe servono ~744 px di scroll per arrivare al nome.
- N2: "IL TUO SACCO" 187×34. P2 3.4: l'avviso "Hai un ordine in corso" finisce sotto la barra rossa.
**Passi (un subagent `walbox-dev`, poi `visual-reviewer` 390/430):**
1. Drawer "biglietto da bancone": fondo poster scuro, titolo Anton, righe con foto 1:1 e nome/prezzo poster, cestino
   disegnato in CSS/SVG inline al posto dell'emoji (resta ≥40×40, c'è un e2e), foto mancante → riquadro "FOTO IN ARRIVO".
2. Prezzi unici via `formatPrice`: righe e birra con il formato del menu ("8 €", "+6 €"); totali di dock e cassa con
   `forceDecimals` ("19,00 €", da scontrino). Nessun file nuovo.
3. Cassa (`CustomerCheckout.jsx/.css`): stessi colori poster, via le emoji dai 4 pulsanti e dai chip (resta il testo),
   🦭 tolto dalle frasi. Footer più compatto (V2): solo totale + 2 pulsanti, il titolo "COME PAGHI?" esce dal footer.
4. Esc chiude il drawer, focus sul tasto chiudi all'apertura e torna sul dock alla chiusura; toast con bordo oro;
   `:focus-visible` su tutti i tasti del drawer. Avviso "ordine in corso" sopra la barra rossa.
**File toccati:** `src/pages/CustomerKitchenMenu.jsx` (solo blocco drawer/dock/toast/avviso), `src/pages/CustomerKitchenMenu.css`
(solo `.kitch-drawer*`, `.kitch-add-toast*`, `.kh-exit-hint`), `src/components/kitchen/CustomerCheckout.jsx/.css`.
**Non si toccano:** `api/`, `handleSubmit`, SumUp, `supabase/`, dati, testid (restano tutti uguali), logica del carrello.
**Casi limite:** sacco con 1 e con 7+ righe a 390 · nome lungo ("Pastrami — Fallo Pesante") · menu combo con birra
(`combo.id::beerId`) · prodotto senza foto · totale con centesimi (13,90) e intero (19) · cucina chiusa (PAGO spenti) ·
errore ordine (`orderError`) visibile sopra i pulsanti · tastiera del telefono aperta sul nome · Esc con tastiera fisica ·
sacco vecchio in localStorage · tasto indietro col drawer aperto (deve chiudere solo il drawer, già così).
**Test:** eslint sui 4 file, `node --test src/lib/*.test.js`, build con override, `visual-reviewer` 390/430 (+1280 rapido).
Gli e2e che cercano "€19,00" (`kitchen-cart-persistence.spec.js`) e "€6,00" cambiano formato: vanno nel task e2e già in coda.
**Gate:** commit (proposto `feat: menu cliente, sacco e cassa sul biglietto da bancone (Fase 3.5)`), push/deploy a parte.
**NEEDS_DECISION (non bloccano, uso la raccomandata se Eros non dice altro):**
1. Totali "19,00 €" con decimali (raccomandato, sembra uno scontrino) o "19 €" come le card?
2. Pulsanti PAGO ORA / PAGO AL BANCO: arancio pieno sempre (raccomandato, oggi l'idle sembra spento) o resta com'è?
Modello/effort: `walbox-dev` Sonnet alto · `visual-reviewer` Sonnet · coordinamento Opus medium.

## Piano 3.4c — Caratteri stile Walrus su Pesi Massimi e Panini (APPROVATO da Eros 2026-10-25 = Gate 1, prima della 3.5)
## Context
Eros guarda il menu e le scritte non gli piacciono: sembrano "buttate lì". Vuole il carattere del logo
"THE WALRUS PUB" (lettere alte e strette, oro). Il logo è un'immagine (`public/assets/kitchen/walrus-pub-logo.webp`),
non abbiamo il font originale: si sceglie il gratuito più simile. Oggi il menu usa 3 font (Anton grosso per titoli e
prezzi, Barlow Condensed per le etichette, Montserrat corsivo per le descrizioni) con misure che saltano: è questo lo
"stacco" che dà fastidio a Eros. La 3.5 (sacco e cassa) aspetta: questa viene prima.

Risposte di Eros (2026-10-25):
- font: il più simile al logo, scelto da lui su una **pagina di prova**;
- dove: titoli + prezzi + etichette (tutto il maiuscolo); descrizioni in **corsivo come oggi**;
- colori: **oro del logo + crema**, rosso solo per il tasto cassa;
- ritmo: **3 misure fisse** (grande = titolo categoria, media = nome prodotto e prezzo alla stessa altezza,
  piccola = etichette);
- dettaglio dal logo: **riga oro sottile** (come quella sotto THE WALRUS PUB);
- prima **Pesi Massimi e Panini** (ai Panini piacciono soprattutto le foto);
- blocco SOLO PANINO / MENU **più leggero** (due righe separate dalla riga oro, via i riquadri gialli spessi);
- foto dei Pesi: **ritaglio più stretto** sul panino, così la scatola nera si vede meno (solo CSS).

## Passi
1. **Pagina di prova font** (solo scratchpad, niente repo): logo in alto e sotto "PESI MASSIMI", "PULLED PORK",
   "13,90 €", "SOLO PANINO" in 3 candidati Google Fonts vicini al logo: **Bebas Neue**, **League Gothic**,
   **Oswald 600** (già caricato). Su fondo scuro, oro + crema, a 390 px. Eros sceglie. **STOP qui fino alla scelta.**
2. **Token unici** in `src/pages/CustomerKitchenMenu.css` (dentro `.kitch-page`, dove stanno già i `--poster-*`):
   `--poster-font-display` = font scelto; 3 misure (`--poster-size-xl/-md/-sm`); `--poster-gold` preso dal logo
   + crema per il testo; `--poster-rule` = riga oro 1 px. Se il font non è già caricato: 1 famiglia in più nel link
   Google Fonts di `index.html:14`.
3. **Pesi Massimi + Panini** usano solo quei token: `PosterCard.css` (nome, prezzo, N°, etichette),
   `PesiMassimiSection.css` (blocco scelta leggero con la riga oro, ritaglio foto con `object-position`/scala più
   stretta), `PaniniSection.css`, testata `kp-head` (kicker, titolo, timbro) in `CustomerKitchenMenu.css`.
   Descrizioni: corsivo invariato, colore crema. JSX solo se serve per il blocco scelta (`PesiMassimiSection.jsx`),
   testid invariati.
4. Eros guarda a video → se piace, stesso passaggio sulle altre categorie (task successivo, un commit).

## File toccati
`index.html` (solo se il font scelto non c'è) · `src/pages/CustomerKitchenMenu.css` · `src/components/kitchen/PosterCard.css`
· `src/components/kitchen/PesiMassimiSection.css` (+ `.jsx` solo markup del blocco scelta) · `src/components/kitchen/PaniniSection.css`.
Non si tocca: `api/`, dati (`kitchenMockData.js`), logica carrello/combo, testid, TV/staff (i loro `--k-*` restano).

## Casi limite
Nomi lunghi su 2 righe ("Pastrami — Fallo Pesante", "Crudo ma educato") · prezzo con centesimi vs intero
("13,90 €" / "8 €") alla stessa altezza del nome · numeri del font scelto leggibili (1 e 7 distinguibili) · font
che non carica → fallback condensato senza salti di layout (`font-display: swap`) · contrasto oro/crema ≥ 4,5:1 sul
fondo scuro · prodotto esaurito · patate esaurite (MENU spento) · 390 / 430 / 1280 · le altre categorie non devono
rompersi (usano gli stessi token: verificarle a colpo d'occhio).

## Verifica
eslint sui file toccati, `node --test src/lib/*.test.js`, build con `VITE_SUPABASE_URL=http://127.0.0.1:54321`,
screenshot prima/dopo di Pesi e Panini a 390/430 (anteprima `kitchen-dev`), poi `visual-reviewer`. Gli e2e
restano nel task e2e in coda.

## Gate
Scelta del font (passo 1) · commit (`feat: menu cliente, caratteri stile Walrus su Pesi Massimi e Panini (Fase 3.4c)`)
· push/deploy a parte. Prima di eseguire: salvare questo piano in `ai-ops/current/RESTYLING_MENU.md`.

Modello/effort: passo 1 io (Opus medium) · passi 2-3 `walbox-dev` Sonnet alto · `visual-reviewer` Sonnet.
Contesto a ~125k: dopo il passo 1 conviene `/clear` + "riprendi da ai-ops/current/RESTYLING_MENU.md".

**3.4c passo 1 FATTO (2026-10-25):** Eros sceglie **B · League Gothic** (pagina di prova https://claude.ai/artifact/4SE2J2qVM5EmjJ6ryVVzZn). Passi 2-3 IN CORSO, delegati a `walbox-dev` (report `ai-ops/reports/restyling-fase3-4c-font.md`). Niente commit senza OK.
**3.4c passi 2-3 FATTI (2026-10-25, non committati):** 4 file (index.html, CustomerKitchenMenu.css, PosterCard.css, PesiMassimiSection.css; nessun JSX). Misure xl 72 / md 40 / sm 20. Lib 177 pass/0 fail, build OK (dichiarati), diff e 2 screenshot 390 visti da me: OK. Report `ai-ops/reports/restyling-fase3-4c-font.md`, screenshot `ai-ops/reports/visual/restyling-fase3-4c/`. Aperti: ritaglio foto solo prime 3 card Pesi (`nth-child`, fragile), kicker/timbro da rosso a oro (decide Eros), Birre/Contorni/Bevande con stili misti da guardare, visual-reviewer non ancora fatto. **NEXT: Eros guarda a video → visual-reviewer → Gate 2 commit.**

## Piano 3.4d — Card chiuse che si aprono + foto pulite + descrizioni con aria (2026-10-25, ATTESA Gate 1)
Eros, guardando la 3.4c a video: il font va, ma **nome e prezzo sopra la foto con la sfumatura scura coprono il cibo**
(Box Pulled Pork, Pastrami, Cicchetti, Insalatone, Taglieri); le descrizioni sotto sono attaccate e "non si capisce un
diamine". Panini gli piace. Risposte di Eros:
- **card CHIUSE che si aprono** (come la 3.2d mai committata: report `ai-ops/reports/restyling-fase3-2d-apribile.md` e
  `restyling-fase3-2d-visual.md` con i fix D1/D2/D3 da includere);
- foto **quadrate per i piatti tondi** (Insalatone, Taglieri, Cicchetti); Panini e Pesi restano rettangolari;
- descrizione in **3 blocchi con aria**: frase corsivo più grande → spazio → ingredienti → spazio → ALLERGENI piccolo oro;
- Panini: nessuna preferenza → stesso schema per tutti (niente stacchi tra categorie).
**Come (PosterCard unica, vale per tutte le categorie che la usano):**
1. Chiusa: foto pulita **senza sfumatura** a tutta larghezza; sotto, su fondo scuro, nome (League Gothic md, crema) a
   sinistra + prezzo (oro) a destra; "+" oro nell'angolo della foto per dire "toccami" (D3); badge ×N se già nel sacco;
   ESAURITO scritto visibile da chiusa (D2).
2. Aperta (una alla volta, `aria-expanded`): i 3 blocchi con aria + AGGIUNGI/stepper (+ blocco SOLO PANINO / MENU per
   i Pesi); scroll che porta AGGIUNGI sopra il dock anche con reduced-motion (D1).
3. Forma foto per categoria con una prop (`ratio`): 1:1 Insalatone/Taglieri/Cicchetti, 4:3 Panini/Pesi/Tartare; il
   ritaglio `nth-child` dei Pesi diventa la mappa id → objectPosition già usata da PosterCard (non fragile).
**File:** `PosterCard.jsx/.css`, le section che la usano (Panini, Pesi, Insalatone, Tartare, Taglieri, Cicchetti: solo
props), `CustomerKitchenMenu.jsx` solo se serve lo stato "una aperta alla volta". Testid invariati; gli e2e che cercano la
CTA visibile da chiusa si romperanno → task e2e in coda.
**Casi limite:** nome lungo su 2 righe accanto al prezzo · prezzo null · foto rotta · esaurito · patate esaurite ·
prodotto già nel sacco · aprire una card chiude l'altra · tastiera (Invio/Spazio apre) · reduced-motion · 390/430/1280.
**Verifica:** eslint sui JSX, lib test, build con override, `visual-reviewer` 390/430 su tutte le categorie PosterCard.
**Gate:** commit 3.4c (font) prima, se Eros dà l'OK · commit 3.4d · push/deploy a parte.
Modello/effort: `walbox-dev` Sonnet alto + `visual-reviewer` Sonnet; coordinamento Opus medium in chat nuova (`/clear`).

**3.4d APPROVATA da Eros (2026-10-25) = Gate 1. 3.4c NON committata per scelta di Eros: si committa tutto dopo la 3.4d**
(commit separati: prima 3.4c font, poi 3.4d). 3.4d IN CORSO, delegata a `walbox-dev` (report
`ai-ops/reports/restyling-fase3-4d-apribile.md`), poi `visual-reviewer` 390/430 (`restyling-fase3-4d-visual.md`).
Patch di riferimento della vecchia 3.2d: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/f2edb4cc-dcdd-4231-86fc-386e9519b25b/scratchpad/3.2d-apribile.patch` (solo consultazione).
**3.4d IMPLEMENTATA, non committata (2026-10-25).** 9 file `src/components/kitchen/` (PosterCard.jsx/.css, PesiMassimiSection.jsx/.css,
Panini/Tartare/Insalatone/Tagliere/CicchettiSection.jsx); `CustomerKitchenMenu.jsx` non toccato. Verificato da me: eslint exit 0 sui file
toccati, lib 177 pass/0 fail/1 skip, `nth-child` dei Pesi sostituito da mappa id → posizione+zoom (nuove prop `zoom`/`zoomOrigin`),
screenshot 390 Panini con dock visto: OK. Visual **P0 0 · P1 0 · P2 7 · ENV_BLOCKER 1** (Supabase locale spento: esauriti simulati,
prezzo null e VoiceOver non verificati), 138/138 aperture con AGGIUNGI sopra il dock (`restyling-fase3-4d-visual.md`, screenshot
`visual/restyling-fase3-4d-review/`). P2 tecniche: ritaglio Pesi ancora largo (`PesiMassimiSection.jsx:79-81`), focus ring solo sulla
barra nome (`PosterCard.css:428-431`), salto ~190 px aprendo una card sotto una aperta. e2e `customer-kitchen-flow` 3b si rompe (3e da confermare).
NEEDS_DECISION: tasto CHIUDI sì/no · ritaglio Panini (mezza cornice di carta) · foto quadrate: a carrello pieno il nome della 1ª card sotto il dock.
Commit: 3.4c e 3.4d si sovrappongono su PosterCard.css/PesiMassimiSection.css → proposta 2 commit: (1) `index.html` + `CustomerKitchenMenu.css`
= token e font League Gothic; (2) PosterCard + Pesi + section = card apribili. **Prossimo: Eros sceglie fix delle 3 P2 tecniche prima o commit così.**

## Piano 3.4e — Card SEMPRE APERTE ma pulite (APPROVATO da Eros 2026-10-25 = Gate 1, sostituisce l'apertura della 3.4d)
Eros, confrontando gli screenshot: "era meglio prima" (card sempre aperte, 3.4c). Scelta: opzione 1 = card sempre aperte, ma dalla
3.4d si tiene: foto pulita senza sfumatura, nome (crema) + prezzo (giallo) SOTTO la foto, descrizione in 3 blocchi con aria
(corsivo → ingredienti → ALLERGENI), AGGIUNGI/stepper sempre visibile (per i Pesi blocco SOLO PANINO / MENU sempre visibile).
Via: stato aperta/chiusa, `aria-expanded`, "+" nell'angolo, scroll all'apertura, tocco sulla foto. Restano: ratio 1:1/4:3, mappa
id → posizione+zoom dei Pesi, ESAURITO, ×N, foto rotta, scroll di AGGIUNGI sopra il dock quando compare la barra carrello.
Insieme: P2 tecniche della 3.4d (ritaglio Pesi più stretto, focus ring su tutta la card/bottone). Backup 3.4c+3.4d:
scratchpad sessione 3d58db71 `3.4c+3.4d.patch`. File: PosterCard.jsx/.css, PesiMassimiSection.jsx/.css, section PosterCard (solo props).
Verifica: eslint, lib test, build override, e2e `customer-kitchen-flow` 3b/3e devono tornare come prima della 3.4d, `visual-reviewer` 390/430.
Gate: commit (2 commit: font 3.4c; card pulite 3.4d/e) · push/deploy a parte.
Modello/effort: `walbox-dev` Sonnet alto + `visual-reviewer` Sonnet.
**3.4e IN CORSO (2026-10-25)**, delegata a `walbox-dev` (report `ai-ops/reports/restyling-fase3-4e-aperte.md`).
**3.4e IMPLEMENTATA, non committata (2026-10-25).** PosterCard.jsx/.css, PesiMassimiSection.jsx (zoom 1.6/1.5/1.6), 5 section (props).
Verificato da me: eslint exit 0, lib 177/0/1, `aria-expanded` sparito. e2e flow 30 pass/44 fail identici a HEAD (dichiarato; 3b/3e falliscono
anche in HEAD: cercano "ENTRA NEL MENU" → task e2e). Screenshot `visual/restyling-fase3-4e/`. NEEDS_DECISION: foto Panini con mezza carta,
foto 1:1 a 390 (~1,5 card per schermo). `visual-reviewer` IN CORSO → `ai-ops/reports/restyling-fase3-4e-visual.md`.
Dopo: Gate 2 → 2 commit (1: `index.html` + `src/pages/CustomerKitchenMenu.css` font/token 3.4c; 2: PosterCard + Pesi + section 3.4e).
**Visual 3.4e (2026-10-25): NEEDS FIX PASS · P0 0 · P1 1 · P2 8 · ENV_BLOCKER 1** (`restyling-fase3-4e-visual.md`, screenshot
`visual/restyling-fase3-4e-review/`). Punti 1-8 della spec OK, stepper sopra la barra 138/138. **P1 E1:** bottoni Pesi a 40 px
(League Gothic, da 3.4c) vanno su 2 righe ("AGGIUNGI IL MENU · / 19 €", "SCEGLI UNA BIRRA PER CONTINUARE" 96 px), `PesiMassimiSection.css:535-542`.
P2 da includere nel fix: primo MENU aggiunto dal bottone basso finisce sotto la barra carrello (2° tocco apre la cassa, già in 3.4b);
toast "aggiunto" copre "1 NEL CARRELLO" per 1,2 s; Pastrami ~22% scatola nera e fondo pane tagliato. Dato da segnalare alla cucina
(file protetto): Box Pulled Pork `allergens: []` ma ha cheddar e maionese.
**PROSSIMO: fix pass 3.4e-bis** (E1 + le 3 P2 sopra; file PesiMassimiSection.jsx/.css, PosterCard.jsx/.css) con `walbox-dev`,
poi recheck `visual-reviewer` solo sui punti fixati, poi Gate 2 → 2 commit. Serve il via di Eros.
**Eros (2026-10-25, visto dal telefono, anteprima LAN `kitchen-telefono` porta 5180): i CARATTERI piacciono, le FOTO NO** —
"era molto meglio prima di tutte le modifiche alle foto". Fix pass 3.4e-bis SOSPESO. NEEDS_DECISION: quale "prima" per le foto
(screenshot HEAD `visual/restyling-fase3-4c/prima-*-390-card1.png`). Proposta: tenere font 3.4c + testo sotto la foto, foto con
inquadratura/proporzioni di HEAD (niente zoom, niente 1:1/4:3 forzati).

## Piano 3.4f — Foto come HEAD + sfumatura leggera (APPROVATO da Eros 2026-10-25 = Gate 1; sostituisce 3.4e-bis)
Eros: "le foto giuste erano queste" (HEAD `f5ed050`, screenshot `visual/restyling-fase3-4c/prima-pesi-390-card1.png`,
`prima-panini-390-card1.png`) "e forse anche la sfumatura ci stava ma meno aggressiva". I caratteri 3.4c piacciono.
**Obiettivo:** card sempre aperte con foto ESATTAMENTE come in HEAD (dimensioni, proporzioni, `objectPosition` per id, nessuno
zoom, niente ratio 1:1/4:3 forzato) e nome + prezzo di nuovo SOPRA la foto in basso, con una sfumatura più leggera di HEAD
(solo nel terzo basso, abbastanza per leggere il testo: contrasto nome/prezzo ≥ 4,5:1 misurato sul punto più chiaro).
**Si tiene dal working tree:** font/token 3.4c (League Gothic, misure xl/md/sm, crema+giallo), descrizione in 3 blocchi con aria
(corsivo → ingredienti → ALLERGENI), AGGIUNGI/stepper sempre visibili, stepper sopra la barra carrello al primo AGGIUNGI (anche
reduced-motion), focus ring sui bottoni, ESAURITO/×N/foto rotta. **Si toglie:** prop `ratio`/`zoom`/`zoomOrigin`, mappa zoom dei Pesi
(torna il ritaglio di HEAD), testo sotto la foto.
**Come:** HEAD è il riferimento per le foto (`git show f5ed050:src/components/kitchen/PosterCard.css`, idem `.jsx`,
`PesiMassimiSection.*`, section); backup del lavoro di oggi: scratchpad sessione 3d58db71 `3.4c+3.4d.patch` (salvare anche
`git diff > 3.4e.patch` prima di toccare). File: PosterCard.jsx/.css, PesiMassimiSection.jsx/.css, 5 section (props). Nessun file nuovo.
**Insieme (dalla visual 3.4e):** P1 E1 bottoni Pesi su 2 righe (`PesiMassimiSection.css:535-542`, 40 px → misura che stia su 1 riga
a 390); P2 primo MENU sotto la barra carrello; toast che copre "1 NEL CARRELLO".
**Verifica:** eslint, lib test, build override, e2e flow uguale a HEAD (30/44), `visual-reviewer` 390/430 confrontando le foto con gli
screenshot `prima-*` di HEAD. Anteprima telefono: `kitchen-telefono` in `.claude/launch.json`, http://192.168.1.51:5180/kitchen.
**Gate:** Eros guarda dal telefono → 2 commit (font 3.4c; card 3.4f) → push/deploy a parte.
Modello/effort: coordinamento Opus medium in chat nuova; `walbox-dev` Sonnet alto; `visual-reviewer` Sonnet.
**PROSSIMO: eseguire 3.4f** (dopo /clear: "riprendi da ai-ops/current/RESTYLING_MENU.md").
**3.4f IN CORSO (2026-10-25, sessione 53eded7e):** backup `git diff -- src index.html` in scratchpad 53eded7e `3.4e.patch`.
Delegata a `walbox-dev` (report `ai-ops/reports/restyling-fase3-4f-foto.md`), poi `visual-reviewer` 390/430
(`restyling-fase3-4f-visual.md`). Niente commit senza OK.
**3.4f IMPLEMENTATA, non committata (2026-10-25).** File: PosterCard.jsx/.css, PesiMassimiSection.jsx/.css; le 5 section tornate
identiche a HEAD. Verificato da me: eslint exit 0, lib 177/0/1, nessun `ratio`/`zoom`/`nth-child` rimasto, screenshot Pesi 390 card1
= stesso ritaglio di HEAD. Dichiarati: build OK, sfumatura fino al 44% (HEAD 58%), nome ≥4,51:1 (5,34 con ombra), bottoni MENU 1 riga
52 px, primo MENU/AGGIUNGI sopra barra+toast 8/8. Report `restyling-fase3-4f-foto.md`, screenshot `visual/restyling-fase3-4f/`.
NEEDS_DECISION: scrim extra del Box Pulled Pork tolto (5,83:1) · CTA "SCEGLI UNA BIRRA PER CONTINUARE" a 24 px (o testo più corto) ·
sfumatura più leggera di così solo con nome più piccolo.
**Visual 3.4f: NEEDS FIX PASS · P0 0 · P1 0 · P2 5 · ENV_BLOCKER 1** (`restyling-fase3-4f-visual.md`, screenshot
`visual/restyling-fase3-4f-review/`): foto = HEAD 23/23, MENU 1 riga 52 px, esaurito/patate/foto rotta OK, nessuna regressione
Birre/Bevande/Contorni. R3 (bottone 1-2 px dal toast) FIXATO da me: margine toast +20 → +28 in `PosterCard.jsx:78` e
`PesiMassimiSection.jsx:103`, eslint 0 (non ricontrollato a video). P2 aperte = decisioni di Eros: R1 sfumatura nella fascia del
nome più scura di HEAD (`PosterCard.css:66`; più leggera solo con nome più piccolo) · R2 nomi su 2 righe a 390 leggibili solo
grazie all'ombra (3,86-4,23 senza; Safari iOS da vedere dal telefono) · R4 dopo AGGIUNGI IL MENU nessun ×N sulla card · R5 a 360 px
"SCEGLI UNA BIRRA…" su 2 righe. Fuori scope: tasto indietro del browser esce dall'app.
**PROSSIMO: Eros guarda dal telefono** → se OK 2 commit (sotto) → push/deploy a parte.
Poi: Eros guarda dal telefono (`kitchen-telefono`, http://192.168.1.51:5180/kitchen) → 2 commit (1: `index.html` +
`src/pages/CustomerKitchenMenu.css` font 3.4c; 2: PosterCard.jsx/.css + PesiMassimiSection.jsx/.css card 3.4f).

## Hero "VENIRE FAME" su branch parallelo (opzione 1 scelta da Eros 2026-10-25)
Eros vuole provare una hero fotografica (riferimento: screenshot mobile con header nero, panino grande a destra,
"OGGI TI FACCIAMO / VENIRE / FAME.", CTA gialla, linguette, Pesi Massimi) senza rompere questo restyling.
**Ordine:** (1) Eros guarda la 3.4f dal telefono (server già attivo, http://192.168.1.51:5180/kitchen) → (2) con OK i
2 commit qui sotto → (3) cartella separata per la hero, che parte dalla punta di `feat/restyling-menu`.
Commit 1 (font 3.4c):
`git add index.html src/pages/CustomerKitchenMenu.css`
`git commit -m "feat: menu cliente, font League Gothic e misure dei titoli (Fase 3.4c)"`
Commit 2 (card 3.4f):
`git add src/components/kitchen/PosterCard.jsx src/components/kitchen/PosterCard.css src/components/kitchen/PesiMassimiSection.jsx src/components/kitchen/PesiMassimiSection.css`
`git commit -m "feat: menu cliente, card sempre aperte con foto come prima e sfumatura leggera (Fase 3.4f)"`
Fuori dai commit: `RESTYLING_MENU.md`, `AUDIT_V2_BRIEF.md`, `.claude/*`.
Cartella hero (dopo i commit, tutto locale e reversibile):
`git worktree add "../walbox-kitchen-hero" -b feat/restyling-hero feat/restyling-menu`
`ln -s "../walbox-kitchen-release/node_modules" "../walbox-kitchen-hero/node_modules"`
Copiare nella nuova cartella i file `.claude/*` non committati (hook guard, settings, agents, skill) e `launch.json` con
porte diverse (`hero-dev` 5175, `hero-telefono` 5182). Stato del lavoro hero: `ai-ops/current/RESTYLING_HERO.md` nella
nuova cartella (brief di Eros copiato esatto + riferimento in `ai-ops/reports/visual/restyling-hero/`). Chat nuova aperta
in quella cartella. Alla fine Eros sceglie: chi vince va su `main`.
**PROSSIMO: Eros guarda la 3.4f dal telefono e dà l'OK ai 2 commit.**
**FATTO (2026-10-25, OK di Eros dopo il telefono):** commit `5d1c7a5` (font 3.4c, 2 file) e `73e1de4` (card 3.4f, 4 file), non
pushati. Cartella `../walbox-kitchen-hero` creata, branch `feat/restyling-hero` da `73e1de4`, stato in
`ai-ops/current/RESTYLING_HERO.md` di quella cartella. Il guard ha bloccato la copia di `.claude/hooks` + `settings.json`:
da copiare a mano da Eros. **Questo branch è in pausa finché Eros sceglie tra restyling attuale e hero.**

## Foto cicchetti nuove (2026-10-29)
4 PNG da `~/Desktop/foto-panini-nuovi/cicchetti` (piatto arancio + tovaglietta Walrus) → WebP 800px q80, stessi nomi in `public/assets/kitchen/menu/cicchetti/` (da ~190 KB a ~90 KB l'una). Verificate a video 375. Non committate. Altre categorie: nessun PNG nuovo.
Scamorza: la foto sorgente era più ravvicinata delle altre → rimpicciolita al 91% con bordi riflessi di 36 px (ffmpeg), ~112 KB. A 375 i bordi stanno fuori dal ritaglio; su desktop (card quadrata) è appena visibile una striscia di circa 9 px.

## Foto Pesi Massimi nuove (2026-10-29)
4 PNG da `~/Desktop/foto-panini-nuovi/pesi massimi` (stesse inquadrature, ritoccate) → WebP 800px q80, stessi nomi: `photo-{pulled-pork,pastrami,brisket}-special.webp` + `menu/box/box-pulled-pork.webp` (da ~140 KB a ~65 KB l'una). Ritaglio/zoom di `PesiMassimiSection.jsx` invariato, ancora valido. Verificate a video 375. Garpez: nessun PNG nuovo.
Pulled Pork (item-009): zoom card 1 (minimo, nessun ingrandimento) invece di 1.3 (`PHOTO_ZOOM_BY_ID` in `PesiMassimiSection.jsx`), la foto è più ravvicinata. Prossimo: allineare le altre card Pesi se Eros lo chiede. Commit `932acad` (non pushato).
Pulled Pork: ritaglio spostato a `100% 62%` (`OBJECT_POSITION_BY_ID`), panino intero nella card a 375. Commit `932acad` (non pushato).
Pastrami (item-010) e Brisket (item-011): stesso ritaglio del Pulled Pork (`100% 62%`, zoom 1). Prossimo: commit foto Pesi + `PesiMassimiSection.jsx` su OK di Eros.
Garpez (2026-10-29): `pesi massimi/GARPEZ.png` (nuova inquadratura: scatola Walrus a sinistra, panino a destra su tovaglietta) → `photo-garpez-special.webp` 800px q80 (da 187 KB a 75 KB). In `PesiMassimiSection.jsx` item-059 come gli altri: ritaglio `100% 62%`, zoom 1. Verificata a video 375: panino intero. La hero evento (`GarpezHero`, `object-position: center`) non verificata: con la modalità evento accesa si vedrebbe anche la scatola. Commit `df3421b` (non pushato).
Sync GitHub (2026-10-29, OK di Eros): `feat/restyling-hero` pushato fino a `9bdb14d` (merge di `origin/main` `0e95e6a`: migration ready push timeout v2, test 3/3). Il branch contiene tutto `main`: al rilascio basta unirlo a `main` (= produzione, gate di Eros). `main` non toccato su GitHub.
