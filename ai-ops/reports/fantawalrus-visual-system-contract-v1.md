# FantaWalrus — Visual System Extraction dal Tesseramento

## Context

Il commit `35ccb14` (branch `feat/fantawalrus-emergent-tesseramento`) ha introdotto
[FantaEntryTesseramento.jsx](src/fanta/pages/FantaEntryTesseramento.jsx) +
[FantaEntryTesseramento.css](src/fanta/pages/FantaEntryTesseramento.css): l'unica schermata FantaWalrus
con una direzione visiva finita ("moderno-italiano": mezzanotte, oro, pergamena, cremisi).

Tutte le altre schermate FantaWalrus sono in tre stati incompatibili tra loro:

| Route | File | Stato visivo |
|---|---|---|
| `/fanta/entry` | `FantaEntryTesseramento.jsx` + `.css` | **Riferimento canonico** (682 righe CSS) |
| `/fanta/team` | [FantaTeamBuilder.jsx](src/fanta/pages/FantaTeamBuilder.jsx) | **Mezzo-stilizzato**: importa il CSS del Tesseramento ma usa 5 classi *fantasma* |
| `/fanta/matchday` | [FantaMatchday.jsx](src/fanta/pages/FantaMatchday.jsx) | **Debug UI grezza**: `fontFamily: "monospace"`, inline styles, `<pre>` JSON |
| `/fanta/var` | [FantaVarRoom.jsx](src/fanta/pages/FantaVarRoom.jsx) | **Debug UI grezza su tema chiaro** (`#fff3cd`, link `#0d6efd`) |

Il problema non è estetico ma strutturale: **il design system non esiste come artefatto**. Vive dentro
un singolo file CSS legato a una pagina, con i token dichiarati su `.fanta-entry` (selettore di pagina)
invece che in `:root`. Il Kitchen module ha già risolto lo stesso problema in questo repo con i token
`--k-*` in [index.css:51-67](src/index.css#L51-L67): **quello è il precedente da replicare**.

Esito atteso: un contratto visivo estraibile + un piano in micro-fasi per portarlo sulle altre schermate
senza rifare il Tesseramento e senza toccare aree protette (CLAUDE.md §5).

**Questo task è read-only.** Nessun file di prodotto è stato modificato.

---

## Prova concreta del debito (verificata, non ipotizzata)

`FantaTeamBuilder.jsx` importa `./FantaEntryTesseramento.css` e usa il wrapper `.fanta-entry`, ma
**5 classi che usa non esistono nel CSS** (verificato con grep, 0 occorrenze ciascuna):

```
fanta-entry__selector-header    → 0 hit    (FantaTeamBuilder.jsx:184, 214)
fanta-entry__selector-label     → 0 hit    (:185, :215)
fanta-entry__selector-hint      → 0 hit    (:186, :216)
fanta-entry__selector-track     → 0 hit    (:190, :220)
fanta-entry__selector-cell      → 0 hit    (:198, :232)  ← + modificatore --selected
fanta-entry__cta-label          → 0 hit    (FantaEntryTesseramento.jsx:321)
```

Conseguenza: la lista giocatori del Team Builder rende **bottoni di sistema non stilizzati** su fondo
mezzanotte. In più:
- `fanta-entry__rules` stila solo i figli `p` (CSS:562); TeamBuilder usa `div` → nessuno stile.
- `fanta-entry__card-head` in TeamBuilder:161 ha uno `<span>` nudo senza `__card-head-title`.
- Colori di stato inventati inline: `#ff6b6b` (TeamBuilder:256,263), `#8aff8a` (:270) — non esistono
  nella palette.

Questo non è un bug da fixare a parte: è **il primo consumatore del design system** ed è la prova che
serve estrarlo prima di estenderlo.

---

# A. `FANTAWALRUS_VISUAL_SYSTEM_CONTRACT_V1`

## A.1 — Palette completa

**Token dichiarati** (oggi su `.fanta-entry`, CSS:11-23):

| Token | Valore | Uso reale |
|---|---|---|
| `--midnight-0` | `#05070d` | background pagina, testo su oro, scrim CTA |
| `--midnight-1` | `#0b1020` | stop gradiente atmosfera, fondo crest-card |
| `--midnight-2` | `#131a2e` | fondo rules, input soft |
| `--midnight-3` | `#1c2438` | top gradiente input/crest-card |
| `--gold` | `#E9C46A` | accento primario: bordi attivi, LED, marker, check, mono-eyebrow |
| `--gold-soft` | `rgba(233,196,106,.35)` | underline link |
| `--gold-line` | `rgba(233,196,106,.22)` | **hairline strutturale** (band, input, idx, hero rule) |
| `--parchment` | `#F4EBDA` | testo display su fondo scuro |
| `--parchment-2` | `#E7DCC3` | ⚠️ **dichiarato, mai usato** |
| `--parchment-3` | `#C9BB9C` | ⚠️ **dichiarato, mai usato** |
| `--crimson` | `#C1272D` | ufficialità: `TESSERA SOCIO`, `RICHIESTO`, timbro, riga tricolore |
| `--ink` | `#0f1116` | testo su pergamena |
| `--fanta-club-accent` | `#E9C46A` (override runtime) | unico canale di personalizzazione per-squadra |

**Valori hardcoded non tokenizzati** (da promuovere a token in F0):

- Gradiente oro CTA: `#F5D373 → #C79A32`, bordo `#7A5510`
- Gradiente oro testo (hero accent): `#F5D373 → #B47F1F`
- Gradiente pergamena tessera: `#F8EEDA 0% → #EEDFC3 55% → #E1CFAB 100%`
- Bruni su pergamena: `rgba(180,127,31, .55 / .5 / .35 / .09)`, `rgba(120,84,25, .08 / .045)`
- Atmosfera: `rgba(30,58,95,.55)` (radial navy), `rgba(233,196,106,.10)` (radial oro)
- Tricolore nastro: `#2F6A3E` / `#F4EBDA` / `#C1272D`
- Sigillo di ceralacca: `#E9C46A` → `#B47F1F` → `#7A5510`

**Scala di opacità del testo** (regola implicita, la parte più riusabile della palette):

| Su fondo scuro (`parchment` @ α) | Su pergamena (`ink` @ α) |
|---|---|
| `1.0` display / titoli | `1.0` nome club, meta-value |
| `.72` corpo (rules) | `.55` label secondarie |
| `.70` hero-sub | `.50` micro-label |
| `.55` metadati mono | |
| `.50` terziario | |
| `.45` countdown | |
| `.28` placeholder | |
| `.20 / .08` bordi inerti | |

**Palette araldiche** ([TeamCrest.jsx:29-46](src/fanta/components/TeamCrest.jsx#L29-L46)): 8 coppie
`[fondo, accento]` — `p1` Notte Adriatica, `p2` Granata, `p3` Bosco, `p4` Vulcano, `p5` Egeo,
`p6` Ducale, `p7` Salvia, `p8` Prugna. ⚠️ **`p2` e `p7` non sono referenziati da nessun preset**.
`EMPTY_PALETTE = ['#26262A','#4A4A55']`.

**Colori sociali** (`TEAM_COLORS`, TeamCrest.jsx:62-67): ORO `#E9C46A`, CREMISI `#C1272D`,
MARINA `#1E3A5F`, BOSCO `#2F6A3E`.

**❌ Buco: nessun colore di stato semantico.** Non esistono token success / warning / error / info.
Ogni schermata li improvvisa. Da definire in F0, coerenti con la palette (non `#8aff8a`).

## A.2 — Tipografia

**Tre famiglie, tre ruoli non intercambiabili:**

| Famiglia | Ruolo | Peso | Provenienza |
|---|---|---|---|
| **Anton** | display / dichiarazione / dato saliente | sempre `400` | `index.html:8` ✅ |
| **Montserrat** | prosa (unico testo "leggibile a lungo") | 400 + italic | `index.html:8` ✅ |
| **Roboto Mono** | metadata macchina, micro-label, contatori | 400/500/700 | ⚠️ `@import` in cima al CSS di pagina |

⚠️ Anton è sempre scritto `'Anton', var(--font-display, sans-serif)` — ma `--font-display` globale è
**Oswald** ([index.css:30](src/index.css#L30)). Il fallback quindi non è neutro: se Anton non carica,
la pagina cade su Oswald con metriche diverse. Da rendere esplicito con un token `--fw-font-display`.

**Scala Anton** (con la regola caratteristica del sistema):

| Elemento | Size | Tracking | Line-height |
|---|---|---|---|
| hero-title | `clamp(46px, 12vw, 62px)` | `0.5px` | `0.92` |
| card-name | `30px` | `1.6px` | `1.05` |
| band-title / stamp | `22px` | `1.5px` / `3.5px` | `24px` |
| cta-button | `20px` | `2.8px` | — |
| input-field | `19px` | `1.3px` | — |
| field-label | `15px` | `2px` | — |
| card-head-title / meta-val | `14px` | `2.4px` / `1.3px` | — |
| crest-card-name | `13.5px` | `1.4px` | `1.15` |
| rules `strong` | inherit (12.5px) | `1px` | — |

> **Regola d'oro tipografica: il tracking cresce mentre la dimensione cala.**
> Da 62px/0.5px a 14px/2.4px. È la firma "poster/stampa" del sistema. Rispettarla è il singolo
> vincolo più importante per far sembrare le nuove schermate figlie della stessa mano.

**Scala Montserrat:** `13px`/1.5 (hero-sub, max `34ch`), `12.5px`/1.45 (rules), `11px` italic (motto),
`13px` (empty state).

**Scala Roboto Mono:** `11px` (card-num) · `10.5px` (eyebrow, idx, counter, cta-sub) · `10px`
(band-status, meta-link, countdown) · `9.5px` (band-sub, card-label, card-season) · `9px` (crest-territory,
badge required/optional) · `8.5px` (card-meta-label). Tracking `1px → 3px`. **Sempre uppercase.**

**Gerarchia in una riga:**
`HERO(62) > NOME-DATO(30) > TITOLO-SEZIONE(22) > AZIONE(20) > INPUT(19) > LABEL-CAMPO(15) > DATO-META(14)`
`| prosa 13/12.5/11 | metadata mono 11→8.5`

## A.3 — Spacing

Base **2px**. Scala effettivamente usata: `2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 28`.

**Gutter di pagina (unica costante non negoziabile):** `20px` mobile → `28px` da `520px` in su.
Applicato *individualmente* a ogni sezione (hero, field, selector, card-wrap, meta, cta), non a un
container. Da centralizzare in F0.

| Blocco | Padding |
|---|---|
| band | `12px 20px`, `min-height: 72px` |
| hero | `28px 24px 8px` |
| card-wrap | `20px 20px 24px` |
| card | `18px 18px 22px` |
| field / selector | `16px 20px 4px` / `14px 20px 4px` |
| rules | `margin 20px 20px 6px`, `padding 14px 16px` |
| meta | `10px 20px 6px` |
| cta | `18px 20px 24px` |

**Gap:** `2` (stack label+value) · `6` (chip) · `8` (griglia colori, band) · `10` (griglia stemmi,
contenuto field) · `12` (band-left, selector).

## A.4 — Radius / Border / Shadow / Texture

**Radius (scala a 7 gradini):**
`3px` badge+idx+nastro · `4px` **input/CTA/stamp** (default interattivo) · `5px` color-chip ·
`6px` crest-card · `8px` filetto interno tessera · `14px` tessera · `50%` LED/check/dot/sigillo.

⚠️ Diverge dai token globali `--radius-sm/md/lg` = `6/10/16` (index.css:37-39), mai usati qui.
**Scelta deliberata da preservare**: il raggio piccolo (4px) è ciò che rende il sistema "stampa" e non "app".

**Border:** hairline `1px` sempre. `--gold-line` per strutture attive, `rgba(244,235,218,.08)` per
superfici inerti, `dashed` = opzionale/soft (input facoltativo, divisori tessera), `2.5px` timbro,
`3px` rail sinistro rules, `1.5–4px` stroke SVG.

**Shadow — tre registri distinti:**

1. **Elevazione fisica** (solo tessera): `0 30px 60px -30px rgba(0,0,0,.9)` + `0 12px 24px -12px rgba(0,0,0,.6)` + `inset 0 0 0 1px rgba(255,255,255,.55)`
2. **Glow oro** (selezione/azione): `0 8px 20px -8px rgba(233,196,106,.5)` · CTA `0 12px 30px -12px rgba(233,196,106,.55)` · micro `0 0 6–8px`
3. **Bevel inset** (solo CTA): `inset 0 1px 0 rgba(255,255,255,.6)`, `inset 0 -1px 0 rgba(0,0,0,.2)`

Crest: `drop-shadow(0 6px 10px rgba(0,0,0,.35))` applicato **dentro** l'SVG (TeamCrest.jsx:180).

**Texture — 4 strati, è la firma anti-SaaS del sistema:**

| Strato | Cosa | Dove |
|---|---|---|
| 1 | 2 radial (oro 650×460 top-right, navy 700×500 left) + ramp mezzanotte + scanline 3px | `.fanta-entry::before` z `-2` |
| 2 | grana a punti 3×3, `mix-blend-mode: overlay`, `opacity .6` | `.fanta-entry::after` z `-1` |
| 3 | trama pergamena: hatch 45° 6px + punti 3×3, `mix-blend-mode: multiply` | `.card::after` |
| 4 | filetto oro interno `inset: 8px` | `.card::before` |

Il commento nel CSS lo dichiara esplicitamente (`/* Grana finissima per togliere l'effetto "SaaS piatto" */`).
**Gli strati 1–2 vanno su ogni schermata FantaWalrus. Gli strati 3–4 restano esclusivi della tessera.**

## A.5 — Layout e breakpoint

```
max-width: 440px · margin: 0 auto · min-height: 100dvh
overflow-x: hidden · isolation: isolate · display: flex/column
```

Colonna singola mobile-first. **Non esiste layout desktop**: sopra i 440px la pagina resta una colonna
centrata su fondo mezzanotte.

- `@media (min-width: 520px)` → gutter `20 → 28px` (5 selettori)
- `@media (min-width: 720px)` → griglia stemmi `2 → 3` colonne
- `@media (prefers-reduced-motion: reduce)` → disattiva LED, timbro, cursore, tutte le transizioni ✅

**Footer CTA sticky:** `position: sticky; bottom: 0; z-index: 5` con scrim
`linear-gradient(180deg, transparent, #05070d .95 @30%, #05070d)`. Pattern eccellente, da riusare ovunque
ci sia un'azione primaria.

⚠️ **Il vincolo `440px` è il rischio strutturale n.1 dell'estensione** (vedi F.1): Classifica, Matchday
e Sala VAR sono schermate tabellari e Matchday/VAR sono anche vista "regia". Vanno previsti due archetipi.

## A.6 — CTA: primaria, secondaria, disabled

**Primaria** (`.fanta-entry__cta-button`, CSS:614-649):
```
gradiente #F5D373→#C79A32 · testo #0f1116 · Anton 20px/2.8px uppercase
padding 16px 20px · radius 4px · border 1px #7A5510
shadow: glow oro + bevel doppio inset
hover  → translateY(-1px) + glow intensificato
active → translateY(+1px)
```
Include sempre **icona scudetto SVG 18×22 + label**, gap 12px (JSX:315-322).

**Disabled** (regola caratteristica): `filter: grayscale(.65) brightness(.65)` + `box-shadow: none` +
`cursor: not-allowed`. **Non usa `opacity`** — l'oro diventa peltro invece di sbiadire. Da preservare.

Sotto la CTA c'è sempre un **`cta-sub` che cambia testo con lo stato** (JSX:324):
disabled → istruzione per sbloccare; enabled → rassicurazione. Micro-pattern eccellente, da riusare.

**❌ Buco: la CTA secondaria non esiste.** L'unica affordance non-primaria è `.meta-link`
(mono 10px oro con underline `--gold-soft`). Le altre schermate ne hanno bisogno subito
(TeamBuilder:286 clona il bottone primario con `marginTop: 8` inline). **Da progettare in F0**:
ghost su bordo `--gold-line`, testo oro, stesse metriche della primaria.

## A.7 — Card, input, badge, header, divider

**Header / Band** (`.fanta-entry__band`): `min-height 72px`, `backdrop-filter: blur(6px)`, bordo inferiore
`--gold-line`. Sinistra: crest 34×42 + titolo Anton 22px + sottotitolo mono 9.5px. Destra: stato
(LED pulsante 2.4s + label mono 10px/700 oro) + contesto mono 9.5px.
**Struttura riusabile su tutte le schermate** cambiando solo sub-title / stato / contesto.

**Card / superfici — due archetipi:**
- *Artefatto* (pergamena, tessera): esclusivo del Tesseramento.
- *Superficie scura*: `linear-gradient(180deg, rgba(28,36,56,.85), rgba(11,16,32,.85))`, bordo
  `rgba(244,235,218,.08)`, radius `5–6px`. **Questo è il contenitore generico riusabile.**

**Input** (`.fanta-entry__input`): riga flex con **marker oro 4×22px** a sinistra (con glow), campo Anton
19px uppercase trasparente, cursore lampeggiante condizionale, contatore mono a destra.
`:focus-within` → bordo oro + `box-shadow: 0 0 0 3px rgba(233,196,106,.12)`.
Variante `--soft` = `border-style: dashed` per campi facoltativi. Ottimo pattern, riusabile as-is.

**Badge:** `RICHIESTO` cremisi su bordo `rgba(193,39,45,.55)` · `FACOLTATIVO` parchment .55 su bordo
`.2` · `field-idx` (`01`–`04`) mono 10.5px oro su bordo `--gold-line` radius 3px.
Tutti: mono 9–10.5px, tracking 1.4–1.8px, `padding 3px 6-7px`, radius 3px. **Un solo componente con
variante colore** copre required / optional / index / e i futuri stati.

**Divider — tre linguaggi distinti:**
- `hero-eyebrow::before/::after` — rule oro che fiancheggia l'eyebrow (22px fisso + flex)
- `card-divider` — tratteggio `repeating-linear-gradient(90deg, oro 0 3px, transparent 3px 6px)`
- `card-meta` — bordi `dashed` sopra/sotto + fondo `rgba(180,127,31,.09)`

## A.8 — Linguaggio degli stemmi

`TeamCrest` ha un **contratto già stabile e documentato** nell'header del file
([TeamCrest.jsx:3-19](src/fanta/components/TeamCrest.jsx#L3-L19)) — non va riscritto, va solo consumato.

```
shape:    classic | round | pointed          (3 path su viewBox 100×120)
pattern:  stripes | diagonal | band | quarters | pole | chevron | stars   (7)
palette:  p1…p8                              (8 coppie [fondo, accento])
```

- **Aspect ratio fisso 1:1.2** (`width=size`, `height=size*1.2`). Vincolante per ogni layout.
- **Due modalità mutuamente esclusive:** `medallion` (cartiglio + cerchio nero + doppio anello oro +
  lettera `#F5D373` 34px + 2 stelline) per la vetrina; **letter** (lettera bianca 42px con
  `paint-order: stroke`) per le griglie compatte.
- **Stati:** `selected` → stroke oro 4px + glow + barra oro alla base · `goldBorder` → stroke 3px ·
  default → `rgba(0,0,0,.4)` 2px · `empty` → forza `classic/band/#26262A` + lettera `W`.
- **Doppio filetto:** ogni crest non-vuoto ha un secondo stroke `rgba(233,196,106,.55)` 0.8px in
  `mix-blend-mode: screen` — è ciò che dà l'aria araldica.
- **Taglie in uso:** `148` vetrina tessera · `125` Team Builder · `62` griglia scelta ·
  `34×42` band (⚠️ **SVG inline hardcoded in JSX:85-95, non usa TeamCrest** → duplicazione da sanare).

**Scala canonica da fissare in F0:** `XS 28` (riga tabella/classifica) · `S 48` (lista) · `M 62` (griglia) ·
`L 96` (header squadra) · `XL 148` (vetrina).

## A.9 — Principi di composizione

1. **L'artefatto prima del form.** La tessera live sta *sopra* i campi che la generano. Il feedback è il
   protagonista, non un'anteprima laterale.
2. **Disclosure numerata.** `01 NOME` → `02 NICKNAME` → `03 STEMMA` → `04 COLORI`, ciascuno con badge
   RICHIESTO/FACOLTATIVO. L'utente vede quanto manca senza wizard multi-step.
3. **Palco scuro, oggetto chiaro.** La pergamena è riservata a ciò che l'utente "possiede". Tutto il
   resto è mezzanotte. Non usare la pergamena come contenitore generico.
4. **Tracking inversamente proporzionale alla dimensione** (§A.2).
5. **Tre voci tipografiche non intercambiabili:** Anton dichiara, Montserrat spiega, Roboto Mono misura.
6. **Semantica del colore:** oro = stato/selezione/azione · cremisi = ufficialità e obbligo (**mai
   errore**) · pergamena = testo · mezzanotte = spazio.
7. **Nessuna superficie piatta.** Ogni fondo ha almeno un layer di grana o gradiente.
8. **Un accento per schermata**, guidato da `--fanta-club-accent` impostato inline dal React
   (JSX:72-74) → la personalizzazione della squadra tinge la UI senza classi condizionali.
9. **Il vuoto è progettato.** `empty` del crest, `IL TUO CLUB`, `ALLENATORE`, `LEGA WALRUS`,
   `«Onore. Curva. Campo.»`: nessun placeholder grigio, ogni stato vuoto è un contenuto.
10. **Motion sottile e rispettosa.** Solo `translateY(1–2px)`, `0.15–0.6s`, `cubic-bezier(.22,1,.36,1)`,
    con blocco `prefers-reduced-motion` completo.

## A.10 — Pattern da riusare (il payload del contratto)

| # | Pattern | Origine |
|---|---|---|
| P1 | Shell pagina: 440px + 4 layer texture + `100dvh` + `isolation` | CSS:10-64 |
| P2 | Band header con LED di stato + contesto a destra | CSS:67-115 |
| P3 | Section head: `idx` + label Anton + badge required/optional | CSS:349-378 |
| P4 | Hero: eyebrow mono rigato + titolo Anton + accento in gradiente | CSS:118-158 |
| P5 | Input con marker oro, `focus-within` glow, contatore, variante dashed | CSS:380-437 |
| P6 | Tile selezionabile (crest-card): `is-selected` = bordo oro + glow + check | CSS:451-502 |
| P7 | Chip compatto con dot colorato e `--chip-color` per-istanza | CSS:517-552 |
| P8 | Blocco note con rail oro 3px a sinistra | CSS:555-576 |
| P9 | CTA primaria oro + `cta-sub` che cambia con lo stato + disabled a grayscale | CSS:614-658 |
| P10 | Footer sticky con scrim gradiente | CSS:603-613 |
| P11 | Griglia responsive `2 → 3` colonne a 720px | CSS:445-449, 671-673 |
| P12 | Personalizzazione via CSS custom property inline (`--fanta-club-accent`) | JSX:72-74 |
| P13 | Blocco `prefers-reduced-motion` completo | CSS:676-681 |
| P14 | Divider tratteggiato e griglia meta a bordi dashed | CSS:283-322 |

## A.11 — Specifico del Tesseramento: NON replicare altrove

| Elemento | Perché resta qui |
|---|---|
| Timbro `TESSERATO` + `fanta-stamp-in` | Rito di iscrizione irripetibile; su altre schermate diventa rumore |
| `transform: rotate(-.35deg)` + `perspective: 1000px` | Vezzo "oggetto fisico"; su liste/tabelle rompe l'allineamento |
| Nastro tricolore | Cerimoniale; su ogni card diventa decorazione a caso |
| Sigillo di ceralacca | Idem; posizione `top:6px; right:84px` è tarata su questa card |
| Superficie pergamena + trama multiply + filetto interno | Solo per "l'oggetto che possiedi" (§A.9.3) |
| Cursore lampeggiante | Solo per il campo di fondazione |
| `N. 001` hardcoded | Numerazione finta, non un pattern |
| `«Onore. Curva. Campo.»` / `Nessun account · Nessuna app · Solo campo` | Copy di acquisizione |
| Countdown `02:14:38 · GIO 21:45` hardcoded (JSX:304) | Statico, mai riusare come "componente countdown" |
| `min-height: 100dvh` | Corretto qui, sbagliato su schermate dense e scrollabili |
| `max-width: 440px` rigido | Da rilassare per Classifica / Matchday / VAR (§F.1) |

## A.12 — Rischi di incoerenza se esteso così com'è

1. **Anton non regge la densità.** Un `19px` uppercase con tracking `1.3px` funziona per il nome di un
   club, non per 15 righe di rosa o una classifica a 10 squadre. Serve una **scala di dati** (Roboto Mono
   o Montserrat tabular) che oggi il contratto non ha.
2. **La pergamena non scala.** Se ogni card diventa crema, la tessera smette di essere speciale e
   FantaWalrus diventa un tema seppia. La regola §A.9.3 va scritta esplicitamente nel contratto.
3. **440px vs tabelle.** Classifica e Sala VAR sono per natura larghe (6 colonne in Matchday, 2 tabelle
   affiancate in VAR). Forzarle a 440px produce scroll orizzontale o troncamenti.
4. **Nessun colore di stato.** Senza token `success/error/warning`, ogni schermata inventa il proprio
   (già successo: `#8aff8a`, `#ff6b6b`, `#fff3cd`).
5. **Nessuna CTA secondaria.** Ogni schermata con più di un'azione clonerà la primaria e la gerarchia
   collasserà (già successo in TeamBuilder:286).
6. **Token su selettore di pagina.** Finché i token vivono su `.fanta-entry`, ogni nuova pagina deve
   riusare quel nome di classe (come fa TeamBuilder) o riscrivere i valori.
7. **`@import` dei font dentro il CSS di pagina** → richiesta di rete a cascata, FOUT su mobile.

---

# B. Componenti da estrarre o riusare

**Già esistenti, da riusare senza toccarli:**
- `TeamCrest` — contratto stabile (§A.8). Unico intervento: sostituire l'SVG inline della band con
  `<TeamCrest size={28} .../>` o estrarre un `<LeagueSeal>`.
- `CREST_PRESETS`, `TEAM_COLORS` — dati, già esportati.

**Da estrarre (nuovi file, richiedono approvazione §4):**

| Componente | Da | Serve a |
|---|---|---|
| `FantaShell` | P1 | tutte |
| `FantaBand` | P2 | tutte |
| `FantaSectionHead` | P3 | Team Builder, Picker, Home, VAR |
| `FantaHero` | P4 | Entry, Home |
| `FantaInput` | P5 | Picker (ricerca), VAR |
| `FantaSelectTile` | P6 | Player Picker (**sblocca `selector-cell`**) |
| `FantaChip` | P7 | Picker (filtri ruolo), Matchday |
| `FantaNote` | P8 | Team Builder (validazione), Matchday |
| `FantaButton` | P9 + nuova variante `secondary`/`ghost` | tutte |
| `FantaStickyFooter` | P10 | Team Builder, Picker, Matchday |
| `FantaBadge` | §A.7 + stati nuovi | tutte |
| `FantaPanel` | archetipo "superficie scura" (§A.7) | tutte tranne Entry |
| `FantaTable` | **nessun precedente — da progettare** | Classifica, Matchday, VAR |
| `FantaStat` | generalizzazione di `card-meta-cell` | Home, Matchday |

**Da NON estrarre:** tessera, timbro, sigillo, nastro, cursore (§A.11).

---

# C. File candidati per schermata

**F0 — fondazioni (nuovi + 1 modifica):**
- `src/fanta/styles/fanta-tokens.css` — token `--fw-*` (nuovo)
- `src/fanta/styles/fanta-system.css` — classi `.fw-*` da P1–P14 (nuovo)
- `src/fanta/components/ui/*.jsx` — componenti §B (nuovi)
- [index.html](index.html#L8) — aggiungere `Roboto+Mono` al link font esistente (rimuove l'`@import`)
- ⚠️ `src/index.css` **non va toccato**: i token FantaWalrus restano nel modulo (a differenza di Kitchen,
  che li ha in `:root`). Scelta migliore per l'isolamento.

| Schermata | File | Azione |
|---|---|---|
| Tesseramento | `FantaEntryTesseramento.jsx` / `.css` | **congelati**. Al massimo, in coda, riscrivere il CSS sopra i token senza cambiare un pixel |
| Team Builder | `FantaTeamBuilder.jsx` (+ nuovo `.css`) | riscrivere il markup sui componenti; **chiude le 5 classi fantasma** |
| Player Picker | **non esiste**: vive in `FantaTeamBuilder.jsx:183-245` | estrarre `src/fanta/components/PlayerPicker.jsx` |
| Home squadra | **non esiste**: nessuna route | nuova `src/fanta/pages/FantaTeamHome.jsx` + case in [App.jsx:128](src/App.jsx#L128) ⚠️ **area protetta §5** |
| Classifica | **non esiste**: `FantaMatchday.jsx:272-292` + `FantaVarRoom.jsx:36-60` | nuovo `src/fanta/components/Standings.jsx`, consumato da entrambe |
| Matchday | `FantaMatchday.jsx` | riscrittura completa: rimuovere tutti gli inline style e il `<pre>` JSON |
| VAR / Admin | `FantaVarRoom.jsx` | riscrittura completa: oggi è su tema chiaro |

---

# D. Piano in micro-fasi

Una fase = un obiettivo, un Gate 1 e un Gate 2 (CLAUDE.md §3). Nessuna fase parte prima
dell'approvazione della precedente.

**Decisioni bloccate da Eros (2026-08-03):**
- **Schermate mancanti** → `PlayerPicker.jsx` e `Standings.jsx` estratti come componenti condivisi;
  `FantaTeamHome.jsx` come pagina nuova, con il `case` in `App.jsx` isolato in un micro-task dedicato
  a sé (area protetta §5, approvazione esplicita).
- **Shell** → **due archetipi** definiti in F0, non uno:
  - `.fw-shell--narrow` → `max-width: 440px`, flussi cliente (Entry, Team Builder, Picker, Home)
  - `.fw-shell--wide` → `max-width: 720–960px`, dati e regia (Classifica, Matchday, VAR)
  - Stessi token, stessa band, stessi 2 layer di texture; cambia **solo** la larghezza e la densità
    tipografica. Il rischio F.1 è così chiuso in F0 e non riaperto in F4.

| Fase | Obiettivo | Vincolo di uscita |
|---|---|---|
| **F0.a** | `fanta-tokens.css`: palette, tipografia, spacing, radius, shadow, texture, **+ stati semantici mancanti** | Nessuna pagina cambia di un pixel |
| **F0.b** | `fanta-system.css` + `FantaShell` / `FantaBand` / `FantaButton` (con variante secondaria) / `FantaBadge` / `FantaPanel` | Non ancora consumati da nessuna pagina |
| **F0.c** | `Roboto Mono` in `index.html`, rimozione `@import`; scala taglie crest | `/fanta/entry` visivamente identico |
| **F1** | **Team Builder** sui componenti → chiude le 5 classi fantasma e i colori inline | Salvataggio formazione e validazione invariati |
| **F2** | Estrazione **`PlayerPicker`** da Team Builder: ricerca, filtri ruolo, contatori, `FantaSelectTile` | Stessa logica `isValidLineup`, zero regressioni sui test esistenti |
| **F3** | **Home squadra** (nuova route `/fanta/home`): crest XL + `FantaStat` + accessi rapidi | Richiede approvazione esplicita su `App.jsx` |
| **F4** | **`Standings`** + `FantaTable` (primo archetipo "denso") | Consumata sia da Matchday sia da VAR; larghezza rilassata |
| **F5** | **Matchday**: shell, band con LED live, controlli replay, breakdown | `useMatchday` intatto; via `<pre>` JSON e inline style |
| **F6** | **VAR / Admin**: variante "backstage" del sistema (più densa, meno cerimoniale) | Da tema chiaro a mezzanotte; `useVarLog` intatto |
| **F7** *(opz.)* | Riscrivere `FantaEntryTesseramento.css` sopra i token | **Diff visivo zero**, verificato a confronto |

Ogni fase: `npm run build` + i test esistenti del modulo + verifica manuale della route.

**L'ordine richiesto (Team Builder → Picker → Home → Classifica → Matchday → VAR) è confermato**, con
una sola aggiunta: **F0 deve precedere tutto**. Motivazioni: Team Builder è già mezzo agganciato al
sistema (ROI massimo, rischio minimo); il Picker vive dentro di esso; la Home è nuova e a basso rischio;
la Classifica è il primo componente condiviso e va risolta prima delle due schermate che la consumano;
Matchday e VAR sono le più lontane dal sistema e vanno per ultime, con la VAR in fondo perché è
interna/staff e merita una variante più densa invece del trattamento poster completo.

---

# E. Acceptance criteria visivi

**Per ogni fase:**
1. `npm run build` PASS + test del modulo verdi.
2. Zero valori esadecimali/px nuovi hardcoded nei file toccati: solo `var(--fw-*)`.
3. Zero `style={{...}}` inline per la presentazione (ammessi solo i custom property per-istanza, P12).
4. Nessuna classe CSS referenziata senza definizione — **grep di verifica obbligatorio** (è esattamente
   il difetto attuale del Team Builder).
5. Regola tipografica §A.2 rispettata: nessun Anton sotto i 13px, tracking crescente al calare del size.
6. Pergamena assente fuori dal Tesseramento.
7. Cremisi solo per obbligo/ufficialità, mai per errore.
8. Un solo bottone in stile primario per schermata.
9. Texture: strati 1–2 presenti, strati 3–4 assenti.
10. Blocco `prefers-reduced-motion` presente in ogni nuovo CSS.
11. A 375px: nessuno scroll orizzontale; a 768px la schermata regge (nuovo, non garantito oggi).
12. Focus visibile su ogni interattivo (`focus-within` oro, P5).
13. `/fanta/entry` invariato a ogni fase — confronto screenshot prima/dopo.
14. Navigazione fra le route FantaWalrus funzionante; contratti `localStorage`
    (`fanta_walrus_team_identity`, `fanta_walrus_custom_team`) intatti.

---

# F. Rischi (max 5)

| # | Rischio | Mitigazione |
|---|---|---|
| **F.1** | **440px vs schermate tabellari.** Classifica/Matchday/VAR non entrano nella colonna del Tesseramento. | Definire in F0 **due archetipi di shell**: `narrow` (440px, flussi cliente) e `wide` (720–960px, dati/regia). Decidere in F0, non improvvisare in F4. |
| **F.2** | **Regressione sul Tesseramento.** È l'unica schermata bella e finita; toccarne il CSS è il rischio più costoso. | Congelarla fino a F7. F0 aggiunge file, non li modifica. F7 solo con confronto screenshot e diff visivo zero. |
| **F.3** | **Scope creep visivo → riscrittura logica.** Matchday e VAR sono mescolati a `useMatchday`/`useVarLog`/`replayEngine`; "restyling" può diventare refactor (CLAUDE.md §12). | Regola dura: le fasi F5–F6 non toccano hook, engine, adapter. Se serve, si ferma e si apre un task separato. |
| **F.4** | **Il Tesseramento non copre i casi densi.** Non ha tabelle, liste lunghe, stati di errore, empty state di dati, loading. Estenderlo significa **inventare** ~30% del sistema. | Marcare esplicitamente ciò che è *estratto* vs *inventato*; le parti inventate (FantaTable, stati, CTA secondaria) passano da un Gate 1 dedicato in F0/F4. |
| **F.5** | **Route nuova = area protetta.** F3 richiede una modifica a `App.jsx` (CLAUDE.md §5). | Isolare la modifica di `App.jsx` in un micro-task suo, un solo `case`, approvazione esplicita di Eros. |

---

## Verdetto

# ✅ READY_FOR_VISUAL_SYSTEM_EXTRACTION

Il Tesseramento è **sufficientemente completo e internamente coerente** per fare da riferimento canonico:
palette tokenizzata, tre voci tipografiche con una regola chiara, spacing regolare, texture
caratterizzante e stati di interazione già progettati.

Non è READY *senza F0*: mancano al contratto tre pezzi che nessuna estrazione può inventare a valle —
**colori di stato semantici, CTA secondaria, archetipo denso/tabellare**. Vanno decisi in F0, prima di
toccare qualunque schermata.

Il difetto delle 5 classi fantasma del Team Builder non è un blocco: è la conferma empirica che
l'estrazione serve, ed è ciò che la fase F1 chiude.

---

## Verifica di questo audit

- File letti: `TeamCrest.jsx`, `FantaEntryTesseramento.jsx/.css`, `FantaTeamBuilder.jsx`,
  `FantaMatchday.jsx`, `FantaVarRoom.jsx`, `App.jsx` (routing), `index.html` (font), `index.css` (token globali).
- Comandi: solo `find`, `grep`, `sed`, `wc` in lettura.
- **File modificati: nessuno.** Nessun commit, push, merge o deploy.
- Il contratto completo va materializzato in `ai-ops/reports/fantawalrus-visual-system-contract-v1.md`
  (CLAUDE.md §0.5) — è una scrittura, quindi richiede Gate 1.
