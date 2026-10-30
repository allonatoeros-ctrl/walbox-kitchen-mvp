# Restyling menu cliente + logica

Creato 2026-10-24. Fonte unica dello stato di questo lavoro.
Dopo `/clear` o in una chat nuova: "riprendi da ai-ops/current/RESTYLING_MENU.md".

## Fase attuale
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
- Direzione grafica del restyling (dopo l'audit, Fase 2).
