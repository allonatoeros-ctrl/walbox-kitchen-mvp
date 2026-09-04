---
name: walbox-visual-review
description: Visual QA read-only per le UI Walbox/Walrus (Customer Kitchen, Jukebox, Poster TV, FantaWalrus). Confronta Figma approvato, frontend reale e asset reali su viewport 390/430/desktop, con click reali e evidence screenshot, e produce un VISUAL VERDICT con issue classificate P0/P1/P2 + ENV_BLOCKER e tipo A/B/C/D. Non modifica il prodotto.
---

# Walbox Visual Review — Visual QA **V1.1**

Workflow standard di visual QA per Walbox / Walrus.
**Default: REVIEW-ONLY.** Questa skill non modifica mai file di prodotto.

> **Changelog V1 → V1.1.** V1 ha prodotto 4 errori metodologici (claim globale sui prezzi
> senza coverage, navigation dedotta dal solo `pathname`, `.env.local` classificato come P0
> visuale, claim "blu" non ancorato a evidence univoca). V1.1 aggiunge: profilo Figma
> canonico (§1.1), Hard Evidence Rules (§3), coverage minima obbligatoria (§4),
> constraint di design già approvati da Eros (§5), categoria `ENV_BLOCKER` separata (§7).

## 0. Posizionamento (evita sovrapposizioni)

| Skill | Quando |
|---|---|
| **walbox-visual-review** (questa) | Guardare la UI reale e criticarla. Nessuna modifica. |
| `walrus-visual-polish` | Applicare polish visivo, dopo approvazione di Eros. |
| `walbox-safe-ui-edit` | Applicare edit UI chirurgici in scope ristretto. |
| `figma-kitchen-sync` | Estrarre spec da un frame Figma per implementarlo. |
| `walbox-client-grade-qa` | QA su diff/codice, non su pixel. |

Sequenza tipica: `walbox-visual-review` → Eros approva → `walbox-safe-ui-edit` / `walrus-visual-polish`.

**Separazione dei ruoli (hard).** Chi esegue la review **non applica il fix del proprio
finding**. Il reviewer produce il report; il fix pass è un task separato, con un altro
esecutore, dopo approvazione di Eros. Un reviewer che "già che c'ero l'ho sistemato"
ha invalidato la review.

---

## 1. Source of truth

Nell'ordine, quando in conflitto vince quello più in alto:

1. **Figma approvato** — profilo canonico in §1.1, via MCP `mcp__claude_ai_Figma__get_screenshot` / `get_design_context` / `get_variable_defs`.
2. **Frontend reale** — l'app in esecuzione, non il codice letto a mente.
3. **Asset reali** — i file in `public/assets/**` (dimensioni, crop, background, watermark), ispezionati aprendo davvero il file.
4. **Constraint di design approvati da Eros** — §5. Sono vincoli, non suggerimenti.
5. **CLAUDE.md §8 + design rules del repo** — tono Walrus: bold, pub, poster, ironico ma leggibile; mai SaaS generico; Customer mobile-first; niente asset con fondo bianco / scacchiera / trasparenza rotta.

### 1.1 Walbox Canonical Source Profile (Figma)

```
fileKey : 8f8ZqE0Q2ysRr9saQkEP7d
page    : 4  →  node 74:2
```

| Schermata | Node |
|---|---|
| Home | `111:58` |
| Pesi Massimi — Hero | `128:2` |
| Pesi Massimi — Closed | `129:2` |
| Pesi Massimi — Expanded | `130:59` · `130:121` · `130:183` |
| Panini — Lista | `162:2` |
| Menu Categorie | `166:2` |
| Cicchetti — Lista | `164:2` |
| Insalatone — Lista | `164:65` |
| Tartare — Lista | `164:116` |

**Regola Figma (hard).**
- Se l'MCP Figma è **disponibile**: nessun claim `C FIGMA_MISMATCH` è valido senza evidence
  letta dal node corrispondente della tabella (screenshot o `get_design_context`). Un
  mismatch dichiarato "a memoria" o dedotto dal codice è un **falso positivo** e va scartato.
- Se l'MCP Figma è **non disponibile**: dichiaralo in cima al report, marca la voce 7 della
  checklist `N/A` con motivo, e **non emettere alcun finding di tipo C**. Non inventare il
  design atteso.
- Il node va citato nell'evidence: `Figma 8f8ZqE0Q2ysRr9saQkEP7d / 164:2`.

### 1.2 Palette Kitchen di riferimento

`src/pages/CustomerKitchenMenu.css`:
`--kh-card #1c1a14` · `--kh-red #c84020` · `--kh-gold #c8960a` · `--kh-cream #e8ddb8` ·
`--kh-sand #d4c89a` · `--kh-muted #8a7e60` · `--kh-rule #2e2a1e`.

Qualunque blu/viola/ciano fuori da questo set è fuori design system — **ma vedi §3.4**:
un claim "c'è del blu" richiede di dire *dove*, con quale valore computato e in quale
superficie (CSS renderizzato / token sorgente non renderizzato / pixel di un asset).

---

## 2. Setup

### 2.1 Working tree pulito — **obbligatorio**

```bash
git status --porcelain
```

- **Tree pulito** → review direttamente nel repo.
- **Tree sporco** → **NON** revisionare il working tree. Crea un worktree isolato sull'HEAD
  committato e revisiona quello:
  ```bash
  git worktree add --detach <scratchpad>/wt-visual HEAD
  ln -s <repo>/node_modules <scratchpad>/wt-visual/node_modules
  ```
  Il report deve dichiarare in testa: **commit SHA revisionato** + il fatto che le modifiche
  non committate sono **fuori scope della review**.

Motivo: un finding su codice non committato non è riproducibile da nessun altro e può
sparire al prossimo `git restore`.

### 2.2 Dev server

```bash
npm run dev            # porta default 5174 — chiedi conferma prima di avviarlo
```

In worktree isolato usa una porta dedicata (`--port 5177 --strictPort`) per non collidere
con l'istanza di Eros.

Se `.env.local` non è utilizzabile (assente nel worktree, o malformato), avvia con env
inline **placeholder** — mai scrivendo file, mai stampando segreti:
```bash
VITE_SUPABASE_URL=https://placeholder.supabase.co VITE_SUPABASE_ANON_KEY=placeholder npx vite ...
```
e registra un **`ENV_BLOCKER`** (§7) con l'elenco esatto di ciò che quel placeholder rende
`NOT_VERIFIED` (disponibilità voci, badge esaurito, stato ordine, dock con prodotti dentro…).

Rotte Walbox utili:
`/kitchen` `/kitchen/entry` `/kitchen/status` `/kitchen/staff` `/kitchen/solo` `/kitchen/tv` `/kitchen/promo` · `/tv-poster` `/staff` `/request` `/entry`

Browser: MCP Playwright o chrome-devtools. Screenshot in `ai-ops/reports/visual/<slug>/` o
nella scratchpad di sessione — **mai** nella root del repo.

---

## 3. HARD EVIDENCE RULES (V1.1) — vincolanti

Un finding che viola una di queste regole **non entra nella issue table**: va in §9 del
report come `NOT_VERIFIED`.

### 3.1 Ogni finding porta un tag di confidenza

| Tag | Significato |
|---|---|
| **OBSERVED** | L'ho visto io, in questa run, con evidence allegata (screenshot / valore computato / output tool). |
| **INFERRED** | Deduzione dal codice o dai dati, **senza** conferma runtime. Ammesso in issue table solo con severità ≤ P1 e con la deduzione esplicitata. |
| **NOT_VERIFIED** | Non ho potuto verificarlo. **Vietato** in issue table: va in §9 "Rischi residui / non verificato". |

Il tag va scritto in ogni riga della issue table e in ogni blocco evidence.

### 3.2 Niente claim globali senza coverage completa

Un claim che contiene *tutti / nessuno / 100% / ogni / sempre / mai* è valido **solo** se
ogni surface coinvolta è stata visitata in questa run e l'elenco delle surface visitate è
nel report.

> **Errore V1 da non ripetere:** «100% dei prodotti mostra `PREZZO IN ARRIVO`», dichiarato
> dopo aver visitato 3 categorie su 5 e senza aver letto i dati runtime di tutte.
> Il claim corretto sarebbe stato: «in Cicchetti/Panini/Insalatone, N voci su M».

Corollario prezzi: **mai** dichiarare prezzi mancanti in modo globale senza aver letto il
dato runtime (`price`) di **tutte** le categorie, sia dalla sorgente dati sia dal DOM
renderizzato. Se una sola categoria ha prezzi, il claim globale è falso.

### 3.3 Navigation: mai dedurla dall'URL

Vietato concludere alcunché sul comportamento di back/navigazione osservando solo
`location.pathname`. Un'app può gestire la history senza cambiare pathname.
Verifica obbligatoria, **tutte e tre**:

1. `history.state` e `history.length` prima e dopo ogni transizione;
2. **back reale del browser** (`browser_navigate_back`, non un bottone in-app) e screenshot
   dello stato risultante;
3. la schermata effettivamente mostrata dopo il back, non quella attesa.

> **Errore V1 da non ripetere:** «la navigazione interna non tocca l'URL → il back salta un
> livello», concluso senza ispezionare `history.state`.

### 3.4 Claim su colore

Un finding "colore fuori design system" deve dichiarare **quale delle tre superfici**:

| Superficie | Come si prova |
|---|---|
| **CSS renderizzato** | scan `getComputedStyle` su `color/backgroundColor/borderColor/fill/stroke/outlineColor/accentColor` degli elementi **effettivamente presenti nel DOM in quello stato**, con il valore trovato e il selettore. |
| **Token sorgente non renderizzato** | hex nel sorgente **che in questa run non è mai finito a schermo** → è al massimo debito tecnico, **non** un difetto visivo: severità ≤ P2, tipo A, e va detto esplicitamente "non visibile nelle surface visitate". |
| **Pixel di un asset** | ispezione dell'immagine reale, con nome file e descrizione della zona. |

Mescolare le tre superfici in un unico claim ("c'è del blu") è un falso positivo.

> **Errore V1 da non ripetere:** la voce «no blu» marcata FAIL citando insieme un tema
> sorgente mai renderizzato e il piatto decorato di una foto, mentre lo scan del CSS
> renderizzato dava 0 valori bluastri.

### 3.5 P0 e P1 visuali richiedono evidence visiva

Nessun P0/P1 visuale senza **screenshot** (o valore computato inequivocabile) allegato.
Un ragionamento, per quanto convincente, non è evidence.

### 3.6 Problemi di click: click reale + `elementFromPoint`

```js
const r = el.getBoundingClientRect();
document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
```
Se torna un elemento diverso dalla CTA → overlay che intercetta → P0. Uno snapshot DOM da
solo non prova né il problema né la sua assenza.

### 3.7 Claim su asset: ispeziona il file reale

Niente giudizi su una foto vista solo come thumbnail nello screenshot di pagina. Apri
l'asset a piena risoluzione (`Read` sul PNG) e cita path + dimensioni.

### 3.8 DESIGN_DECISION ≠ bug

Se il comportamento è coerente con una scelta dichiarata (commento nel codice, constraint
in §5, decisione di Eros), è `D DESIGN_DECISION` o non è un finding affatto. Non
travestire una preferenza da difetto.

### 3.9 Build/test verdi non autorizzano un VISUAL PASS

`npm run build` verde e Playwright 17/17 **non sono evidence visiva** e non contano come
PASS di nessuna voce della checklist. Simmetricamente: build rotto non è un finding visivo.

### 3.10 Ambiente ≠ prodotto

Un problema di configurazione locale (`.env.local`, porta occupata, chiave assente) è un
**`ENV_BLOCKER`** (§7), **mai** un P0/P1/P2 visuale, e non entra nel conteggio delle
severità visuali.

> **Errore V1 da non ripetere:** `.env.local` malformato classificato «P0 · A CODE_ONLY (env)»
> e conteggiato come l'unico P0 dell'audit.

### 3.11 Il reviewer non corregge il proprio finding

Read-only assoluto su `src/`, `public/`, `supabase/`, config, asset. Il fix si **propone**.

---

## 4. Coverage minima obbligatoria

### 4.1 Walbox Kitchen — review "completa"

Una review Customer Kitchen può dirsi **completa** solo se ha visitato **tutte** queste surface:

- [ ] Home
- [ ] Menu Categorie
- [ ] Panini
- [ ] Pesi Massimi
- [ ] Cicchetti
- [ ] Insalatone
- [ ] Tartare
- [ ] Cart (dock carrello **con almeno un prodotto dentro**, non solo a 0)

Viewport, per ognuna delle surface principali: **390** · **430** · **desktop (≥1280)**.

Il report deve contenere una **matrice di coverage** surface × viewport con `✓` / `—` e
motivo per ogni `—`. Se la matrice non è completa, il verdetto **non può essere `SHIP-READY`**
e il report deve dirsi `PARZIALE` in testa.

### 4.2 Claim cross-category

Un claim che confronta categorie ("le card di X e Y hanno anatomia diversa", "solo Z è
coerente") richiede la visita di **tutte** le categorie coinvolte, con screenshot di ognuna.

---

## 5. Constraint di design già approvati da Eros

Sono **vincoli**, non proposte. Un finding che li contraddice è un falso positivo; un
finding che rileva la loro **violazione nel prodotto** è legittimo e va alzato.

### 5.1 CATEGORY NAV

- **Niente colore per categoria**: nessun verde, rosa, viola, blu come tinta di categoria.
- **Sistema cromatico unico Walrus** per tutta la barra.
- **Inactive** = dark + cream/muted.
- **Active** = red/orange Walrus + cream/gold.
- Active e inactive devono essere **chiaramente distinguibili a colpo d'occhio**.

Conseguenza operativa: un tinting per-categoria (verde Insalatone, viola Special, …) è una
**violazione di constraint approvato** → finding legittimo, tipo `A CODE_ONLY`, **non** una
`D DESIGN_DECISION` aperta. La decisione è già stata presa.

### 5.2 CICCHETTI

- **Direzione approvata: TUTTI SENZA PIATTO.**
- **Mortazza = reference di art direction.**
- Superficie **calda**.
- Famiglia coerente di **luce, angolo e crop**.

Conseguenza operativa: ogni cicchetto che devia da Mortazza (piatto presente, superficie
fredda, crop/angolo diverso) è un finding `B ASSET` con direzione già decisa — non serve
chiedere di nuovo a Eros *se* farlo, solo *quando*.

**Nessun asset va modificato in questo ciclo.** Il reviewer elenca, non rilavora.

---

## 6. Checklist obbligatoria

Ogni voce va marcata `PASS` / `FAIL` / `N/A`. `N/A` richiede una motivazione.
Ogni `FAIL` deve puntare a un finding con tag `OBSERVED` o `INFERRED`.

### Layout & responsive
1. **Viewport 390** (iPhone standard) — la baseline Customer.
2. **Viewport 430** (iPhone Pro Max).
3. **Desktop** (≥1280).
4. **Responsive** — nessuno scroll orizzontale, nessun testo tagliato tra i 3 viewport.
5. **Overflow / sticky overlap** — header sticky, dock carrello, CTA fissa non devono coprire contenuto né l'ultimo item.
6. **Spacing / radius / alignment** — griglia coerente, raggi coerenti tra card sorelle, allineamenti ottici.

### Figma ↔ frontend
7. **Screenshot comparison** — node canonico (§1.1) vs frontend, stesso viewport, stessa sezione. Differenze misurabili (px, peso font, colore), non impressioni. Senza node letto: `N/A`, e nessun tipo C.

### Design system
8. **Typography** — famiglia, peso, size scale, line-height, uppercase/tracking.
9. **Palette** — solo token del design system; ogni hex fuori palette classificato per superficie (§3.4).
10. **Icone active/inactive** — stato attivo leggibile a colpo d'occhio, coerente su tutte le categorie, conforme a §5.1.
11. **No blu fuori design system** — con la disciplina di §3.4: superficie dichiarata, valore computato citato.

### Asset & fotografia
12. **Crop e background immagini** — stesso crop logic nella categoria; niente fondo bianco su superficie scura, alone, trasparenza rotta.
13. **Coerenza fotografica** — per Cicchetti il metro è §5.2 (Mortazza reference, tutti senza piatto, superficie calda).
14. **Watermark / testo baked-in** — nessun watermark, logo di stock, testo cotto nell'immagine.

### Comportamento reale
15. **Real click + `elementFromPoint`** su ogni CTA critica (§3.6).
16. **Back / navigation** — con la procedura di §3.3 (`history.state` + back reale + screenshot).
17. **Console / broken images** — zero errori console non attesi, zero immagini 404/failed.
18. **Visual consistency cross-category** — tutte le categorie di §4.1 visitate (§4.2).
19. **Cart con prodotti dentro** — dock/carrello con ≥1 item: layout, prezzo totale, CTA abilitata.
20. **Coverage matrix completa** — §4.1 compilata. Se incompleta: report `PARZIALE`.

---

## 7. Classificazione issue

### Severità

| | Significato |
|---|---|
| **P0** | *Difetto visivo/di prodotto* che blocca l'uso o fa sembrare l'app rotta davanti a un cliente: CTA non cliccabile, contenuto coperto, immagine mancante, flusso bloccato. Richiede screenshot (§3.5). |
| **P1** | Non blocca, ma fa percepire il prodotto come non finito. Richiede screenshot (§3.5). |
| **P2** | Rifinitura: micro-allineamenti, tracking, debito tecnico non visibile a schermo. |
| **ENV_BLOCKER** | **Categoria separata, fuori dal conteggio P0/P1/P2.** Configurazione locale/ambiente che impedisce di eseguire o verificare (`.env.local`, chiavi, porte, servizi esterni). Va elencata a parte, con l'elenco di ciò che rende `NOT_VERIFIED`. |

Il verdetto e il conteggio in testa al report riportano: `P0 n · P1 n · P2 n · ENV_BLOCKER n`
— con gli ENV_BLOCKER **fuori** dai primi tre numeri.

### Tipo

| | Significato | Chi risolve |
|---|---|---|
| **A CODE_ONLY** | Si risolve in CSS/JSX, nessun nuovo asset, nessuna decisione. | `walbox-safe-ui-edit` |
| **B ASSET** | Serve un file nuovo o rilavorato (foto, icona, SVG). | Eros / Antigravity |
| **C FIGMA_MISMATCH** | Il frontend diverge dal node canonico §1.1. **Solo con evidence dal node.** | Fix codice, o aggiornare Figma |
| **D DESIGN_DECISION** | Non c'è risposta oggettiva **e** §5 non copre già il caso. | Eros |

---

## 8. Rivalutazione di una review precedente

Quando questa run rivede i finding di una review precedente, ogni finding va classificato:

| Esito | Quando |
|---|---|
| **CONFIRMED** | Riprodotto in questa run con evidence propria. |
| **PARTIALLY_CONFIRMED** | Il fenomeno esiste ma la portata o la severità dichiarata era sbagliata (es. claim globale vero solo su una categoria). Va riscritto con la portata corretta. |
| **REJECTED_FALSE_POSITIVE** | Non riprodotto, o basato su una regola che V1.1 vieta (§3). Va detto **quale regola** lo scarta. |
| **NOT_VERIFIED** | Non verificabile in questa run (tipicamente per `ENV_BLOCKER`). |

Il report deve contenere una tabella V(n) → V(n+1) con questi esiti, più le issue **NEW**.

---

## 9. Output standard

Usa `review-template.md` in questa cartella. Sezioni obbligatorie:

1. **Header** — commit SHA revisionato, worktree sì/no, Figma disponibile sì/no, dev URL, `ENV_BLOCKER` noti.
2. **VISUAL VERDICT** — `SHIP-READY` / `NEEDS FIX PASS` / `NOT READY`, più `COMPLETA` / `PARZIALE`.
3. **Coverage matrix** — §4.1, surface × viewport.
4. **Issue table** — ID, severità, tipo, **tag OBSERVED/INFERRED**, schermata, viewport, descrizione, fix proposto.
5. **Evidence** — screenshot, `file:riga`, output runtime, node Figma. Nessun claim senza evidence.
6. **Checklist** a 20 voci.
7. **Rivalutazione review precedente** — §8, se applicabile.
8. **Quick wins / Asset gaps / Recommended fix pass**.
9. **Rischi residui / NOT_VERIFIED / ENV_BLOCKER**.

Applica CLAUDE.md §0.5 (Silent First): report completo su file, chat max 8 righe.

---

## 10. Regole hard

- **Review-only.** Niente Edit/Write su `src/`, `public/`, `supabase/`, config o asset. Fix si propone, non si applica (§3.11).
- Nessun `git add/commit/push`, nessun deploy, nessun `npm install`.
- Nessuna modifica al Figma (solo tool di lettura).
- Tree sporco → worktree isolato su HEAD (§2.1).
- Non dichiarare `PASS` su una voce non realmente verificata: usa `N/A` con motivo.
- Non dichiarare `SHIP-READY` senza coverage matrix completa (§4.1) e almeno un click reale + un back reale.
- Mai stampare segreti; mai scrivere `.env*`.
- Screenshot e report fuori dalla root del repo.
- Se serve toccare un'area protetta (CLAUDE.md §5) anche solo per riprodurre: **STOP CONDITION**.
