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

- Fase corrente: **Fasi 2 e 1 ESEGUITE** (foto + item GARPEZ nel menu). Prossima: Fase 4, poi Fase 3.
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
- Prossimo passo: **Fase 4** (animazione 15 anni + badge sulla card col tag `anniversario`), poi
  **Fase 3** (modalita' evento, ultima perche' spegne mezzo menu).
- Ancora aperto e non mio: smoke a video del checkout V2 in produzione con un pagamento SumUp vero.
- Non committato: il commit e il push restano gate di Eros (siamo su `main`).

Modello/effort: Fase 0 e 3 → Opus high · Fasi 1, 2, 4 → Sonnet medium
