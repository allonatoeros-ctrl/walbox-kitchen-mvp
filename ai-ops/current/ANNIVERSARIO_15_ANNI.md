# Anniversario 15 anni — The Walrus Pub

Creato 2026-10-13. Fonte unica dello stato di questo lavoro.
Dopo `/clear`: "riprendi da ai-ops/current/ANNIVERSARIO_15_ANNI.md".

## Obiettivo
Serata dei 15 anni (**fra 3 giorni, ~2026-10-16 — data esatta da confermare**): il menu cliente mostra
solo PESI MASSIMI con il panino speciale **GARPEZ 15,00 €**, più un'animazione a tema sulla home.
Prima della festa il checkout V2 (branch `claude/customer-experience-v2`) va in produzione da solo,
così non debutta la sera dell'evento.

| Fase | Tocca | Rischio |
|---|---|---|
| 0 — Collaudo e merge V2 su main | nessun file (merge + test) | **alto: deploy in produzione, pagamenti reali** |
| 1 — Item GARPEZ | `src/data/kitchenMockData.js` (**protetto §5**) | medio: allergeni |
| 2 — Foto scontornata | `public/assets/kitchen/menu/bbq/` (nuovo asset) | basso |
| 3 — Modalità evento | `src/lib/kitchenEventMode.js` (nuovo) + `CustomerKitchenMenu.jsx` | medio |
| 4 — Animazione 15 anni | `AnniversaryBanner.jsx/.css` (nuovi) + `PesiMassimiSection.jsx` | basso |

Vincolo trasversale: **mai** toccare `api/`, `supabase/`, `vercel.json`, routing, env.
Nessuna migration: l'interruttore evento è client-side (vedi Fase 3).

---

## Cosa modificare per ogni fase

### Fase 0 — Collaudo e merge del checkout V2
- Nessuna modifica di codice. Si collauda `claude/customer-experience-v2` (1 commit sopra `main`).
- Comandi: `npm run lint` · `node --test src/lib/*.test.js` · `npm run test:e2e` ·
  `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build` · passata a video 390/430.
- Esito atteso: elenco PASS/FAIL, confronto con i rossi preesistenti già noti in CHECKPOINT.
- Il merge e il push su `main` (= deploy Vercel in produzione) **li autorizza Eros**, mai in automatico.

### Fase 1 — Item GARPEZ nel menu
- File: `src/data/kitchenMockData.js` — **area protetta §5**, una sola aggiunta, niente altro.
- Nuovo item `id: 'item-059'`, `category: 'bbq'` (= sezione PESI MASSIMI), `price: 15.0`,
  `name: 'Garpez'`, `tags: ['special', 'v2', 'anniversario']`, `available: true`.
- `ingredients`: "Stinco cotto nella birra Petrus Red Aged · cetriolini sott'aceto · cipolla caramellata · cheddar · senape".
- `allergens`: **DECISO 2026-10-13** (Eros: "prendili dagli ingredienti") → `['glutine', 'latte', 'senape']`.
  Derivazione: pane + birra Petrus Red Aged (orzo/malto) = glutine · cheddar = latte · senape = senape ·
  cetriolini e cipolla caramellata non aggiungono nulla. **`allergensVerified: false`** resta, come il Box
  Pulled Pork (`item-018`): è una derivazione da lista ingredienti, non da etichette fornitore. Due incerti
  non verificabili da qui: solfiti nei cetriolini, burro nella cipolla caramellata. Chi ha un'allergia vera
  deve poter chiedere al banco.
- **Nessuna combo Fallo Pesante** (decisione Eros): nessuna entry in `kitchenPesiMassimiCombos`.

### Fase 2 — Foto GARPEZ — **FATTA 2026-10-13, in attesa di OK visivo**
- La foto consegnata da Eros **non era su green screen**: gia' su fondo scuro, stessa luce degli altri
  scatti. Niente chroma key: solo riformattazione 1254x1254 -> 1536x1024 WEBP (3-slice su fondo e piano,
  panino non riscalato ne' ritoccato). Dettaglio: `ai-ops/reports/anniversario-fase2-foto-garpez.md`.
- **Path reale: `public/assets/kitchen/photo-garpez-special.webp`**, non `menu/bbq/` come scritto nel
  piano: quella cartella non esiste e nessun item `bbq` la usa — tutti gli scatti PESI MASSIMI stanno
  in `public/assets/kitchen/photo-<nome>-special.webp`. Da confermare con Eros.
- Confronto a video per l'OK: `ai-ops/reports/garpez-confronto.webp`.

### Fase 3 — Modalità evento (solo PESI MASSIMI)
- Nuovo `src/lib/kitchenEventMode.js` + `kitchenEventMode.test.js` (logica pura, §9).
- `CustomerKitchenMenu.jsx`: a modalità accesa, `CATEGORIES` filtrate a `bbq`, `activeCategory`
  iniziale `'bbq'` invece di `'panini'`. Nient'altro cambia: carrello, checkout e pagamenti invariati.
- **Interruttore — DECISO 2026-10-13** (Eros: data e ora non rilevanti): **niente finestra di date**.
  Modalità **spenta di default**, si accende in due modi: costante `EVENT_MODE_ON` in cima al file (a `true`
  il giorno della festa, a `false` dopo) e override URL `?evento=1` / `?evento=0` per provare e per
  spegnere al volo. Niente si attiva da solo nel momento sbagliato.
  Niente colonna su `kitchen_service_state`: eviterebbe migration + `db push` in produzione, troppo rischio.
- **Attenzione: dopo la serata la modalità NON si spegne da sola** — va rimessa `EVENT_MODE_ON = false`,
  altrimenti il menu resta ai soli PESI MASSIMI.
- **DECISIONI Eros 2026-10-14 (confermate, vincolanti per la Fase 3):**
  - Interruttore **acceso a mano da Eros la sera** della festa (nessun automatismo).
  - Il resto del menu **nascosto del tutto** (non "visibile ma non ordinabile").
  - **Menu della serata = solo 4 panini**: Pastrami, Pulled Pork, Brisket, GARPEZ. **I Box NON ci sono**:
    a modalità accesa vanno esclusi anche i box dentro la categoria `bbq`, non solo le altre categorie.
    (Da definire in implementazione: come riconoscere i box — id/tag — senza toccare `kitchenMockData.js`
    oltre il necessario; è area protetta, serve approvazione dedicata se va modificata.)

### Fase 4 — Animazione 15 anni
- Nuovi `src/components/kitchen/AnniversaryBanner.jsx` + `.css`, montati sulla home `/kitchen`
  (dentro `CustomerKitchenMenu.jsx`, vista home), visibili solo a modalità evento accesa.
- Tono Walrus (§8): "15 ANNI", logo, animazione d'ingresso breve. Mobile-first 390/430.
- `prefers-reduced-motion`: animazione disattivata, resta la grafica statica.
- `PesiMassimiSection.jsx`: badge a tema sulla card GARPEZ (riuso del pattern `pm-hero-badge`,
  nessun id hardcoded nel componente — si legge dal tag `anniversario`).

---

## Prompt brevi per attivazione fasi

```
FASE 0 — Collaudo checkout V2 (read-only + test, nessuna modifica)
Branch claude/customer-experience-v2, 1 commit sopra main (9c6877c).
Esegui: npm run lint; node --test src/lib/*.test.js; npm run test:e2e;
VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build; screenshot 390 e 430 del checkout.
Confronta i FAIL con i rossi preesistenti elencati in CHECKPOINT.md (OPEN ISSUES).
Report in ai-ops/reports/, chat max 8 righe. NON fare merge, NON fare push: decide Eros.
```

```
FASE 1 — Item GARPEZ (area protetta §5, solo questo file)
Aggiungi a src/data/kitchenMockData.js un solo item: id 'item-059', category 'bbq', name 'Garpez',
price 15.0, tags ['special','v2','anniversario'], available true, image = asset della Fase 2,
ingredients "Stinco cotto nella birra Petrus Red Aged · cetriolini sott'aceto · cipolla caramellata · cheddar · senape".
allergens: usa la lista confermata da Eros; se non ancora confermata, ['glutine','latte','senape'] CON allergensVerified: false.
Nessuna entry in kitchenPesiMassimiCombos. Nessun'altra riga del file toccata. Poi diff-risk-reviewer.
```

```
FASE 2 — Foto GARPEZ
Scontorna il green screen della foto GARPEZ (PIL + numpy), panino su fondo scuro coerente con
photo-pulled-pork-special.webp. Salva .webp in public/assets/kitchen/menu/bbq/.
Mostra l'anteprima a Eros PRIMA di collegarla all'item. Nessun altro asset toccato.
```

```
FASE 3 — Modalità evento
Crea src/lib/kitchenEventMode.js (logica pura: finestra di date + override ?evento=1/0) con
kitchenEventMode.test.js accanto. In CustomerKitchenMenu.jsx: a modalità accesa filtra CATEGORIES a 'bbq'
e parti da activeCategory 'bbq'. Non toccare carrello, checkout, pagamenti, routing.
Test: node --test src/lib/*.test.js + e2e del flusso ordine. Poi diff-risk-reviewer.
```

```
FASE 4 — Animazione 15 anni
Crea AnniversaryBanner.jsx + .css in src/components/kitchen/, montalo nella vista home di
CustomerKitchenMenu.jsx solo a modalità evento accesa. Tono Walrus, mobile-first 390/430,
rispetta prefers-reduced-motion. In PesiMassimiSection.jsx aggiungi il badge a tema sulla card
che ha il tag 'anniversario' (nessun id hardcoded). Screenshot 390 e 430 a Eros.
```

## PROSSIMA CHAT — ripartenza (scritto 2026-10-13)

Eros arriva con **la foto GARPEZ su green screen in allegato** e vuole iniziare la parte visiva
("fase restyling"). Letto questo file, l'ordine di lavoro è:

1. **Fase 2 — foto** (prima della 1: l'item ha bisogno del path dell'asset per il campo `image`).
   Scontorno green screen con PIL + numpy, fondo scuro coerente con `photo-pulled-pork-special.webp`,
   output `.webp` in `public/assets/kitchen/menu/bbq/`. **Anteprima a Eros prima di collegarla.**
2. **Fase 1 — item GARPEZ** in `src/data/kitchenMockData.js` (**area protetta §5**, solo questo file,
   una sola aggiunta): `id 'item-059'`, `category 'bbq'`, `name 'Garpez'`, `price 15.0`,
   `tags ['special','v2','anniversario']`, `available: true`, `image` = asset della Fase 2,
   `ingredients` come scritto nella Fase 1, `allergens: ['glutine','latte','senape']`,
   `allergensVerified: false`. Nessuna entry in `kitchenPesiMassimiCombos`.
3. **Fase 4 — animazione 15 anni**, poi **Fase 3 — modalità evento** (ultima: spegne mezzo menu,
   meglio accenderla quando il resto è pronto e verificato).

Ambiguità da sciogliere al primo messaggio: **"restyling" = le Fasi 1-4 di questo piano**, oppure un
redesign vero della UI Kitchen? Se è il secondo, è §19 (richiesta ampia): niente codice, prima audit e
Gate 1. Chiedere, non assumere.

Contesto già chiuso, non rifarlo: Fase 0 fatta, checkout V2 in produzione (`origin/main` = `11cf144`),
allergeni e interruttore evento decisi. **Aperto e non mio:** smoke a video del checkout V2 in
produzione con un pagamento SumUp vero — lo deve fare Eros prima della festa.

## STATO

- **[SUPERATO 2026-10-14] Scenetta GARPEZ RIMOSSA per decisione di Eros** (codice e asset dei due volti fuori dal repo). Le righe su scenetta, volti invertiti e V-07 qui sotto sono storico, non più valide.
- Fase corrente: **Fasi 2 e 1 ESEGUITE** (foto + item GARPEZ nel menu) + **scenetta GARPEZ FATTA, non committata**
  (2026-10-14). Prossima: Fase 4, poi Fase 3.
- **Scenetta GARPEZ (2026-10-14, Eros ha fornito i due volti e approvato l'implementazione):**
  `src/components/kitchen/GarpezScene.jsx/.css` (nuovi) + 6 righe in `PesiMassimiSection.jsx` (mount nella
  `.pm-card-media` della card aperta col tag `anniversario`, non esaurita). Asset derivati SOLO dai due ritagli
  forniti da Eros: `public/assets/kitchen/garpez/garpez-volto-{indignato,interdetto}.webp` (~20 KB l'uno).
  3 battute + finale, ~8,5 s, tap = avanti, SALTA, RIVEDI per la sessione (niente localStorage), chiudere la card
  = reset, `prefers-reduced-motion` gestito. Verificato a video 375px: scena completa, SALTA, tap, reset,
  AGGIUNGI AL SACCO attivo durante la scena. Lint 121 err (baseline), unit lib 161/0, build PASS, E2E 4 spec
  pertinenti 98/105: 6 rossi in test che non aprono la card GARPEZ (scena non montata), da confrontare
  con i 7 rossi noti di `main`. Uso pubblico dei volti: decisione e rischio di Eros.
  `.claude/launch.json` creato solo per l'anteprima locale: non committare.
- Fatto:
  - audit read-only (menu, categorie, service state, asset, tooling immagini)
  - **Fase 0 collaudo V2 — PASS, nessuna regressione.** Report completo:
    `ai-ops/reports/anniversario-fase0-collaudo-v2.md`, screenshot in `ai-ops/reports/anniversario-fase0-shots/`.
    Sintesi: lint 121 err su V2 contro 124 su main (migliora di 3) · unit 0 fail nuovi, i 4 rossi sono i
    preesistenti noti · build PASS · E2E 158/166 con **gli stessi identici 7 rossi di `main`**, tutti in
    file che V2 non tocca. Nessun file del repo modificato, nessun merge, nessun push.
  - Due ENV_BLOCKER del container cloud risolti fuori dal repo (chromium build 1194 invece di 1228;
    manca `VITE_SUPABASE_ANON_KEY` perche' qui non esiste `.env.local`). Su questa macchina
    `npm run test:e2e` nudo non gira: serve il config override.
  - **Merge V2 su `main` FATTO in locale 2026-10-13** (Eros ha approvato): commit di merge `d1fe37e`,
    10 file, +1118/-370, nessuna area protetta toccata. Ricollaudo sul risultato del merge: lint 121 err
    (come il branch), unit lib 161/0 fail, api 6/0, mjs 348 con i soliti 4 rossi noti, build PASS, **E2E 158/166 con gli stessi identici 7 rossi**.
    Il merge non introduce nulla: ogni numero coincide con quello del branch.
    **NON pushato**: il push su `main` fa partire il deploy Vercel in produzione, gate di Eros.
  - **Fase 2 FATTA 2026-10-13**: `public/assets/kitchen/photo-garpez-special.webp` creato
    (1536x1024 WEBP, 183 KB). Nessun file di codice toccato. Report:
    `ai-ops/reports/anniversario-fase2-foto-garpez.md`.
- Decisioni aperte:
  - **GATE: `git push -u origin main`** = pubblicazione del checkout V2 ai clienti, pagamenti reali
  - ~~allergeni GARPEZ~~ **CHIUSA 2026-10-13**: `['glutine','latte','senape']` derivati dagli ingredienti,
    `allergensVerified: false` (vedi Fase 1)
  - ~~data e orari evento~~ **CHIUSA 2026-10-13**: non rilevanti, niente finestra di date (vedi Fase 3)
  - Promemoria operativo: la modalità evento va **spenta a mano** dopo la festa (`EVENT_MODE_ON = false`)
  - Due P2 non bloccanti trovati in V2 (footer appiccicato che copre ~30px di contenuto; `'Ospite Walrus'`
    duplicato a mano in `CustomerOrderPanel.jsx` invece di importare `GUEST_NICKNAME`): da sistemare prima
    del merge o dopo la festa — decide Eros
- **Fase 1 FATTA 2026-10-13** (Eros: "la foto va bene, aggiungi il panino al menu"). Aggiunto il solo
  `item-059` in `src/data/kitchenMockData.js` dopo Brisket, prima del Box: 22 righe, nessun'altra riga
  toccata, nessuna entry in `kitchenPesiMassimiCombos`. Verifiche: eslint sul file pulito, unit lib
  160/0 fail, unit mjs 344/4 (**gli stessi 4 rossi preesistenti**), build PASS, asset presente in `dist/`.
- Due scelte mie da confermare, nessuna bloccante:
  - `description: 'Quindici anni di Walrus in mezzo al pane. Non si ripete.'` — il piano non la
    specificava e tutti gli altri item `bbq` ne hanno una. Cambiabile con una riga.
  - **Posizione nel menu**: GARPEZ e' ultimo dei panini PESI MASSIMI (dopo Brisket) per non spostare
    l'ordine degli item esistenti. Se Eros lo vuole primo, si sposta il blocco.
- **2026-10-14 (non committato):** scenetta GARPEZ: battute scambiate tra i due personaggi (scambio `FACE_A`/`FACE_B`
  in `GarpezScene.jsx`, in attesa di OK a video). **Fase 3 FATTA**: `src/lib/kitchenEventMode.js` + test (5/5) e
  `CustomerKitchenMenu.jsx` (menu = bbq con tag `special`, i Box sono esclusi senza toccare `kitchenMockData.js`;
  home senza sezione panini; combo FALLO PESANTE nascosto; modalita' letta una volta al mount).
  `EVENT_MODE_ON = false` di default; `?evento=1` per provare. Verificato a 390px: 1 categoria, 4 voci. Lint menu
  13 err = baseline, unit lib 166/0, build PASS. Resta: Fase 4 (banner 15 anni + badge).
  Nota: un carrello salvato prima della festa puo' contenere articoli fuori menu evento (non li rimuovo).
- **Fase 4 FATTA 2026-10-14 (non committata):** `src/components/kitchen/AnniversaryBanner.jsx/.css` (nuovi),
  montato nella home di `CustomerKitchenMenu.jsx` solo con `eventMode` (+2 righe). Logo: **la W gialla fornita da Eros
  in chat** (Eros: niente logo TV, niente tricheco), convertita in `public/assets/kitchen/walrus-logo-w.webp`
  (512px, 19 KB), angoli neri tolti con ritaglio a cerchio in CSS. Testi: "STASERA SI FESTEGGIA" · "15 ANNI" ·
  "Grazie per averci sopportato." (scelta mia, cambiabile). Ingresso ~0,9 s, `prefers-reduced-motion` = statico.
  Badge giallo "15 ANNI" (classe `pm-hero-badge` + `pm-anniv-badge`) sulla foto della card chiusa col tag
  `anniversario`, in `PesiMassimiSection.jsx` (+3) e `.css` (+17, file non nel piano ma necessario).
  Verifica: eslint file nuovi/Pesi 0 err, menu 13 = baseline, unit lib 166/0, build PASS (logo in `dist/`),
  anteprima 390 e 430 ok, niente scroll orizzontale, `?evento=0` = banner assente. Reduced-motion verificato solo
  come regola CSS presente, non emulato. Header storico col tricheco **non toccato** (fuori scope).
- ~~Decisione aperta (2026-10-14):~~ nella scenetta GARPEZ i due personaggi erano **invertiti**
  (visto da Eros in anteprima): vanno scambiati. Serve da Eros una riga su cosa è scambiato (posizione /
  battute / volto) oppure lo leggo da `GarpezScene.jsx`. Modifica piccola, solo `GarpezScene.jsx/.css`.
- Prossimo passo: **OK a video di Eros su banner + badge**, poi commit atomici (scenetta · Fase 3 · Fase 4) su sua approvazione.
- Ancora aperto e non mio: smoke a video del checkout V2 in produzione con un pagamento SumUp vero.
- Non committato: il commit e il push restano gate di Eros (siamo su `main`).

## Restyling PESI MASSIMI + home (2026-10-14, non committato)
Piano: `~/.claude/plans/keen-chasing-alpaca.md` (brief + 12 regole da ricerca, vendor blog = direzionali; WCAG 2.5.8, HIG 44pt).
Decisioni Eros: ambito sezione + home · Garpez protagonista in cima · pronto per la festa.
FATTO (solo con modalita' evento, `?evento=0` verificato invariato):
- Home: `GarpezHero.jsx/.css` (nuovi) = foto grande, nome, prezzo, ingredienti, CTA gialla "VOGLIO IL GARPEZ" + riga "ANCHE STASERA" con i 3 classici. `AnniversaryBanner` con prop `compact` (+CSS). Eroe sopra la piega a 375.
- Menu: `PesiMassimiSection` prop `featuredTag` (Garpez primo, gia' aperto, cornice gialla `pm-card--featured`, hero 4 foto nascosta); gli altri 3 miniature.
- `CustomerKitchenMenu.jsx`: `garpezFeatured` + mount GarpezHero (solo blocco home evento + prop menu).
Verifica: lint file toccati senza nuovi errori (menu 13 = baseline), unit lib 166/0, build PASS, anteprima 375 home+menu, niente scroll orizzontale.
NON fatto: QA visiva indipendente (visual-reviewer), 390/430/desktop, reduced-motion emulato, e2e PESI MASSIMI, Garpez esaurito a video.
Decisioni aperte: restyling solo in evento (ora cosi') o anche dopo la festa? claim "EDIZIONE 15 ANNI" ok?

Modello/effort: Fase 0 e 3 → Opus high · Fasi 1, 2, 4 → Sonnet medium

## Conversione + banner (piano approvato da Eros 2026-10-14: "accetto tutto", opzione 3)
Decisione Eros: in modalità evento **restano tutte le bevande già in menu, BIRRE e BEVANDE** (supera "resto nascosto").
Passi: (1) `kitchenEventMode.js` + test: categorie evento = bbq special + birre + bevande · (2) home: banner fuso
nel poster GARPEZ (logo W + 15 ANNI timbrato + coriandoli CSS, reduced-motion statico) · (3) CTA "VOGLIO IL GARPEZ"
e chip dei classici = aggiunta diretta al sacco · (4) riga "E DA BERE?" con birre e bevande aggiungibili · (5) dopo
il primo panino aggiunto, se nel sacco non c'è da bere: pannello "CI METTI DA BERE?" una volta per sessione.
File: kitchenEventMode.js/.test.js, GarpezHero.jsx/.css, CustomerKitchenMenu.jsx, nuovo EventDrinkPrompt.jsx/.css.
Niente api/, checkout, pagamenti, kitchenMockData. Test: unit lib, lint file toccati, build, anteprima 390/430.
Modello/effort: Opus medium
**ESEGUITO 2026-10-14 (non committato):** banner fuso nel poster GARPEZ (timbro W + 15 ANNI + coriandoli), CTA e chip
classici = aggiunta diretta al sacco ("NEL SACCO ✓"), riga "E DA BERE?" (6 birre + 6 bevande), pannello "CI METTI DA BERE?"
dopo il primo panino se nel sacco non c'è da bere (1 volta per sessione, `EventDrinkPrompt.jsx/.css` nuovi). Menu evento =
PESI MASSIMI 4 · BIRRE 6 · BEVANDE 6. `AnniversaryBanner` in home solo se manca il GARPEZ (fallback).
Verifica: unit lib 167/0 (test nuovo prima rosso poi verde), lint file nuovi 0, menu 13 = baseline, build PASS,
a video 390 e 430: flusso GARPEZ → pannello → birra → classico ok, niente scroll orizzontale, `?evento=0` invariato.
NON fatto: reduced-motion emulato, e2e, QA indipendente. Variante `compact` di AnniversaryBanner ora inutilizzata.
Prossimo passo: OK a video di Eros, poi commit atomici su sua approvazione.

## Fix 2026-10-14 (richiesta Eros, non committato)
- Fascia "STASERA SI FESTEGGIA · 15 ANNI" **staccata dalla foto**: ora e' una fascia propria sopra il panino dentro la card
  (`GarpezHero.jsx/.css`, niente piu' timbro sovrapposto ne' rotazione).
- Pannello "CI METTI DA BERE?": tolto il limite "una volta per sessione" (`CustomerKitchenMenu.jsx`, `maybeOfferDrink`).
  Ora compare a ogni panino PESI MASSIMI aggiunto (GARPEZ e i 3 classici) se nel sacco non c'e' gia' una bevanda.
  Verificato a 390: GARPEZ -> pannello -> NO GRAZIE -> Pulled Pork -> pannello di nuovo.

## Banner centrale (2026-10-14, piano approvato da Eros, non committato)
Ricerca: NN/g banner blindness, WCAG 2.2.2, web.dev animazioni (piano: `~/.claude/plans/sprightly-wobbling-micali.md`).
FATTO: `AnniversaryBanner.jsx/.css` riscritto = fascia centrale a tutta larghezza tra header e card GARPEZ (kicker, logo W + "15 ANNI",
"Grazie per averci sopportato.", raggi, coriandoli dentro il banner; ingresso una volta ~1,2 s, solo transform/opacity).
Montato sempre in evento (`CustomerKitchenMenu.jsx`). Fascia e coriandoli tolti da `GarpezHero.jsx/.css` (la card torna foto → nome → CTA).
Verifica: unit lib 167/0, lint file nuovi 0 (menu 13 = baseline), build PASS, a video 390 e 430: ordine header → banner (146px) → GARPEZ,
CTA sopra la piega, niente scroll orizzontale, `?evento=0` senza banner. NON fatto: reduced-motion emulato (solo regola CSS), QA `visual-reviewer`.
Aperto (scelta di Eros): pannello bevande mostra 12 voci, le fonti dicono 6-8 → proposta 3 birre + 3 bevande; testo "Grazie per averci sopportato." ok?

## STATO DI RIPARTENZA — chiusura chat 2026-10-14 (leggere questo per primo)
Nulla e' committato (siamo su `feat/anniversario-15-anni`). Il commit e il push restano gate di Eros.
**Fatto in questa chat (tutto non committato, verificato a 390/430):**
- Banner centrale 15 ANNI tra header e card GARPEZ (`AnniversaryBanner.jsx/.css`), fascia tolta dalla card (`GarpezHero.jsx/.css`).
- Pannello "CI METTI DA BERE?" a ogni panino se nel sacco non c'e' una bevanda (`CustomerKitchenMenu.jsx`, `maybeOfferDrink`).
**Decisione Eros (2026-10-14) sul pannello bevande: "3 birre, le bevande lasciale tutte".** NON ancora implementata.
  - Birre in menu (6): Keiler Helles, Land-Pils, Kellerbier, Weisse, Dunkel Weisse, Lupulus. **Quali 3 tenere: NON detto da Eros → chiedergli.**
  - Bevande (6): Acqua, Pepsi, Pepsi Zero, Seven Up, Schweppes Lemon, Schweppes Tonica → restano tutte.
  - Dove: `eventDrinks` in `CustomerKitchenMenu.jsx:368` alimenta sia il pannello sia la riga "E DA BERE?" della home. Da chiarire con Eros se il taglio vale
    solo per il pannello (fonti: 6-8 voci) o anche per la riga home e il menu. Modifica minima: filtro per id/nome in `kitchenEventMode.js` (+ test), non toccare `kitchenMockData.js`.
**Prossimi passi, in ordine:**
1. Chiedere a Eros quali 3 birre (e se il taglio e' solo pannello o anche home) → implementare + test.
2. Lanciare il `visual-reviewer` (390/430/desktop, `?evento=1`, reduced-motion emulato davvero) sul banner, sulla home e sul pannello bevande.
3. Commit atomici su approvazione di Eros: (a) scenetta GARPEZ · (b) modalita' evento · (c) home evento + banner + pannello. Mai `git add -A`; `.claude/launch.json` NON va committato.
Ancora aperto e non mio: smoke a video del checkout V2 in produzione con un pagamento SumUp vero. Promemoria: dopo la festa `EVENT_MODE_ON = false`.
Modello/effort prossima fase: Sonnet medium.

## Bevande e birre: TUTTE presenti (Eros 2026-10-14, supera "3 birre")
Decisione: in modalita' evento restano **tutte le 6 birre e tutte le 6 bevande**, nessun taglio, ne' nel pannello ne' nella home ne' nel menu.
Verificato a video (`?evento=1`): home "E DA BERE?" = 12 voci · menu schede PESI MASSIMI / BIRRE (6) / BEVANDE (6) · pannello "CI METTI DA BERE?" legge
`eventDrinks` (nessun `slice`, filtra solo `available`). Nessuna modifica al codice necessaria: il taglio proposto non era mai stato implementato.
Prossimo passo: QA `visual-reviewer` (390/430/desktop, reduced-motion emulato), poi commit atomici su approvazione di Eros.

## RIPARTENZA FINALE — decisioni Eros 2026-10-14 dopo la QA visiva (leggere questo per primo, supera le sezioni sopra)
QA visiva fatta: `ai-ops/reports/anniversario-visual-review.md` (P0 0 · P1 1 · P2 7 · screenshot in `ai-ops/reports/anniversario-visual-shots/`).
Eros: "questo che hai creato è perfetto". **Nulla è committato** (branch `feat/anniversario-15-anni`). Commit e push = gate di Eros.

**DECISIONI (vincolanti):**
1. **ELIMINARE la scenetta GARPEZ** e tenere il codice super pulito. Da togliere: `src/components/kitchen/GarpezScene.jsx/.css`,
   asset `public/assets/kitchen/garpez/` (i due volti, usati solo dalla scenetta), import + mount (`<GarpezScene>`) in
   `PesiMassimiSection.jsx:5,205`, e ogni CSS/riga rimasta orfana. Nessun `rm`: sono file non tracciati, spostarli in una cartella
   temporanea fuori dal repo (es. scratchpad) e verificare che non resti nessun riferimento (grep). Eros ha chiesto di eliminarli: vale come ok per quello spostamento.
   Per effetto cadono V-07 (tap target scenetta) e la decisione sui volti invertiti.
2. **Questo menu è SOLO per la festa dell'anniversario.** Badge "15 ANNI" e ogni elemento a tema compaiono **solo a modalità evento accesa**:
   con `?evento=0` / `EVENT_MODE_ON = false` il menu deve essere identico a prima della festa. (Chiude la decisione D1 del reviewer.)
3. **Accetto tutte le correzioni proposte dal reviewer** (tranne V-07, caduta con la scenetta; V-08 e V-09 sono preesistenti e fuori scope festa → non toccare):
   - **V-01 (P1)**: pannello "CI METTI DA BERE?" aperto + back del telefono → il back chiude solo il pannello. Stesso ramo di `cartOpenRef`
     in `handlePopState` (`CustomerKitchenMenu.jsx:~446`) per `drinkPromptOpen`.
   - V-02: `scroll-padding-inline: 12px` su `.gzh-drinks-row` (`GarpezHero.css`).
   - V-03: a desktop deve vedersi che ci sono altre bevande (card che lascia sempre un pezzo della successiva, o sfumatura/frecce solo desktop).
   - V-04: conferma "nel sacco" visibile con il pannello aperto (dentro il pannello, es. "GARPEZ nel sacco ✓", oppure toast sopra il pannello).
   - V-05: prezzi allineati nel pannello (`margin-top:auto` su `.edp-price`).
   - V-06: focus dentro il pannello all'apertura, Esc chiude, focus torna all'origine alla chiusura.
4. **Pulizia codice** (richiesta Eros "super pulito"): rimuovere la variante `compact` di `AnniversaryBanner` (inutilizzata), CSS/props/import orfani,
   niente codice morto lasciato dalle iterazioni. Solo nei file del lavoro anniversario; non toccare `kitchenMockData.js` oltre l'item-059 già fatto.

**DECISIONI ANCORA APERTE (piccole, non bloccanti):**
- D2 reviewer: con GARPEZ esaurito resta lui l'eroe della home. Proposta: se non ordinabile, la home mostra banner + i 3 classici come protagonisti. Eros non ha risposto: usare la proposta salvo contrordine.
- Pannello bevande: 12 voci (decisione 2026-10-14: tutte presenti, nessun taglio).

**Rischio da ricordare a Eros:** un refresh con solo `?evento=1` torna al menu normale → la sera della festa serve `EVENT_MODE_ON = true`
in `src/lib/kitchenEventMode.js`, e dopo la festa rimetterlo a `false`.
**Non verificato (ENV_BLOCKER):** Supabase locale spento → disponibilità reale e checkout non provati. Smoke del checkout V2 in produzione con pagamento SumUp vero: lo fa Eros.

**PROSSIMI PASSI, in ordine:**
1. Togliere la scenetta + pulizia codice (punti 1 e 4).
2. Fix V-01…V-06 (punto 3) + badge solo in modalità evento (punto 2).
3. Verifica: `node --test src/lib/*.test.js`, lint dei file toccati (menu 13 = baseline), build con `VITE_SUPABASE_URL=http://127.0.0.1:54321`, anteprima 390/430/desktop con `?evento=1` e `?evento=0` (identico al normale), reduced-motion.
4. `diff-risk-reviewer` sul diff finale, poi commit atomici su approvazione di Eros: (a) modalità evento + test · (b) home evento: banner + GarpezHero + EventDrinkPrompt + badge · (c) docs. Mai `git add -A`; `.claude/launch.json` NON va committato.
Modello/effort: Sonnet medium.

## ESEGUITO 2026-10-14 (ripartenza finale) — non committato
- Scenetta GARPEZ tolta (file e asset spostati in scratchpad `garpez-scene/`, nessun riferimento residuo). Variante `compact` del banner: non esisteva più.
- Badge "15 ANNI" e card in evidenza solo con `featuredTag` (= modalità evento). `?evento=0`: nessun banner/hero/badge, home identica.
- V-01 back chiude solo il pannello · V-02 scroll-padding · V-03 sfumatura desktop · V-04 "X NEL SACCO ✓" nel pannello · V-05 prezzi allineati · V-06 focus/Esc/ritorno focus.
- D2: GARPEZ esaurito → sparisce la card, restano i classici ("I CLASSICI DI STASERA").
- Verifiche: `node --test src/lib/*.test.js` 167/167 · lint menu 13 (= baseline), altri file puliti · build ok · prova a video (evento=1: pannello, Esc, back; evento=0).
- DECISO da Eros (opzione 1): GARPEZ visibile e ordinabile solo a modalità evento accesa. Filtro `excludeEventOnlyItems` (tag `anniversario`) in `kitchenEventMode.js`, applicato al catalogo del menu: fuori evento sparisce anche da un sacco salvato. Provato ON/OFF a video, 168 test ok.
- Prossimo: `diff-risk-reviewer`, poi commit atomici su approvazione di Eros.
