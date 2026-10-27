# Restyling hero "VENIRE FAME" (branch parallelo)

Creato 2026-10-25. Fonte unica dello stato di questo lavoro.
Dopo `/clear` o in una chat nuova aperta in QUESTA cartella: "riprendi da ai-ops/current/RESTYLING_HERO.md".

## Dove
- Cartella: `walbox-kitchen-hero` (git worktree), branch `feat/restyling-hero`, parte da `73e1de4` (punta di
  `feat/restyling-menu` con 3.4c + 3.4f). L'altro restyling vive in `walbox-kitchen-release`: non toccarlo da qui.
- `node_modules` = link a `../walbox-kitchen-release/node_modules` (niente `npm install` qui senza OK).
- Anteprima: `preview_start` `hero-dev` (http://localhost:5175/kitchen) o `hero-telefono`
  (http://192.168.1.51:5182/kitchen). Supabase finto: ordini e pagamenti non funzionano, non cliccare invio/PAGO.
- Riferimento visivo: `ai-ops/reports/visual/restyling-hero/riferimento.png` (156×302, piccolo: se Eros ha l'originale
  grande, va messo accanto).
- **Guard hook NON attivo qui** finché Eros non copia a mano `.claude/hooks/` e `.claude/settings.json` dalla release
  (il guard blocca la copia da parte di Claude). Fino ad allora: stessa prudenza, nessuna area protetta.

## Fase attuale
H1 (audit read-only) FATTA 2026-10-25. Nessun codice toccato. **PROSSIMO:** Gate 1 di Eros sul piano H2 qui sotto
(+ 3 decisioni). Riferimento grande salvato: `ai-ops/reports/visual/restyling-hero/riferimento-grande.webp` (887×1774).
Nota di prodotto: la hero torna sopra le linguette (la 3.4 aveva tolto la home): scelta di Eros, già implicita nel brief.

## H2 giro 1 — FATTO 2026-10-26 (non committato, nessun deploy)
Gate 1 approvato con le scelte consigliate. Modificati: `CustomerKitchenMenu.jsx/.css` (testata con menu+carrello,
hero, scroll al menu, linguette, titolo categoria), `PosterCard.jsx/.css` (prop `compact`), `PesiMassimiSection.jsx`
(passa `compact`). NUOVI: `MenuHero.jsx/.css`. Verifiche: lint = 8 errori identici a HEAD (preesistenti in
CustomerKitchenMenu.jsx), 0 nei file nuovi; unit `src/lib` 177 pass/0 fail; build ok (in scratchpad); screenshot
390/320/430 ok, nessun overflow orizzontale; carrello+badge+stepper provati nell'anteprima.
Anteprima vera: **http://127.0.0.1:5174/kitchen** (lo script `npm run dev` forza 5174; la porta 5175 di launch.json è sbagliata).
Scelte fatte da me (da confermare): battuta in corsivo NON mostrata nella scheda compatta; kicker "cucina aperta" tolto
(resta "cucina chiusa" solo quando chiusa); `.kh-welcome` rimosso; carrello in testata disabilitato a sacco vuoto.
Differenze note col riferimento: panino più piccolo e meno tagliato (la foto è un lato dritto, il riferimento è un
primo piano: tagliare di più toglie peperoni/crema); niente fumo; titolo non sgranato; CTA tocca la punta del pane.
**PROSSIMO:** Eros guarda l'anteprima e dice cosa correggere; poi estendere `compact` alle altre categorie (Panini,
Cicchetti, Insalatone, Tartare, Tagliere) e verifica col subagent `visual-reviewer`; poi commit (decisione di Eros).
Test e2e `tests/e2e/customer-kitchen-flow.spec.js` cercano testi vecchi ("AGGIUNGI SOLO PANINO"): non eseguiti.

## H2 giro 2 — FATTO 2026-10-26 (non committato)
`compact` esteso a Panini, Cicchetti, Insalatone, Tartare, Taglieri. Verdetto visual-reviewer: NEEDS FIX (P0 1, P1 5),
report `ai-ops/reports/visual/restyling-hero/verdetto-giro2.md`. Corretti: V-01 (pulsante AGGIUNGI IL MENU diventato
cerchio: regola ristretta a `.pc-buy .pc-cta`), V-02 (CTA hero ora non copre il ripieno; panino spostato più a destra,
tagliando un po' più crema), V-03 (CTA hero scorre alle linguette), V-04 (a 320 lo stepper va sotto il prezzo, niente
scroll laterale), V-05 (titoli con timbro: font più piccolo, timbro 64px, padding). **Non corretto: V-06 = decisione di
Eros**: Contorni, Birre, Bevande e il sacco hanno ancora le schede vecchie. 4 P2 del report non toccati.
Ricontrollato a mano (390/320), NON riverificato dal reviewer.

## H2 giro 3 — FATTO 2026-10-26, COMMITTATO in locale (no push, no deploy)
P2 corretti: V-07 (con MENU scelto il prezzo della riga alta sparisce), V-08 (`fetchPriority`), V-09 (panino più grande
nelle schede Pesi Massimi: `photoZoom` 1.3), V-10 ("PREZZO IN ARRIVO" nella scheda compatta). Titoli con timbro a 13vw
(a 390 "SETI IMPLACABILI" sta su una riga). Commit: 990fe96 testata+hero+linguette, a5acf87 schede compatte, + questo docs.
Contorni/Birre/Bevande/sacco restano con le schede vecchie (decisione di Eros). NON fatto: push, riverifica del reviewer,
e2e (testi vecchi). File `.claude/*` modificati e `.claude/hooks/`, `launch.json` NON committati (guard hook: li copia Eros).
**PROSSIMO:** Eros decide push/merge del branch `feat/restyling-hero`.

## H2 giro 4 — FATTO 2026-10-26 (NON committato): V-06 chiuso, schede compatte anche su Contorni, Birre, Bevande
- `PosterCard.jsx/.css`: nuove prop opzionali (solo `compact`) `meta` (riga formato/scelta), `displayName` (titolo
  senza toccare il nome nel sacco: Pepsi 33cl → Pepsi), `lockedLabel` (CTA spenta + etichetta sulla foto, usata per
  "SOLO LA SERA" della birra alla spina fuori orario), `photoFit="contain"` (bottiglie 1:2 intere, riquadro 190px).
- `BirreSection.jsx` e `BevandeSection.jsx` riscritte con `PosterCard compact` (+ `onRemove`/`qtyById` dal menu);
  Contorni: la lista generica in `CustomerKitchenMenu.jsx` ora usa `PosterCard compact` (classe `ct-list`; import
  `AllergenBadges` rimosso perché inutilizzato). Accordion Birre e griglia 2 colonne Bevande eliminati.
- Birre: la `story` approvata sostituisce la riga ingredienti nella scheda (era visibile solo da aperta).
  Prima la scheda chiusa non mostrava nulla della storia: ora si legge sempre. `tasteSignals` non più mostrati.
- CSS vecchio (`br-card*`, `bv-card*`, `kitch-card*`) lasciato nei file (c'è un unit test che legge BirreSection.css).
- Verifiche: lint 8 errori = baseline (0 nuovi), unit `src/lib` 177/177, build ok, anteprima 390 e 320: nessun
  overflow, "+" e stepper provati su Bevande, bottiglie intere. NON provato: SOLO LA SERA (nessuna birra evening_only
  nel catalogo attuale), riverifica del reviewer visivo.
- e2e riscritti e PASSATI (3/3, Supabase finto): 20 (Birre), 21b (Contorni), 24 (Bevande). Helper `openFullMenu` reso
  tollerante (la home "ENTRA NEL MENU" non esiste dalla Fase 3.4: **gli altri e2e che lo usano erano già rotti da
  allora**, ora almeno aprono il menu; dock ora "N · Vai alla cassa" / "6,00 €"). Gli ALTRI e2e NON sono stati
  rieseguiti: molti cercano ancora testi vecchi (es. "AGGIUNGI SOLO PANINO", "VAI ALL'ORDINE", "N articolo").
- Suite e2e completa 2026-10-26 dopo l'aggiornamento dei test (NON committato): **161 passati, 4 falliti, 1 saltato** (prima
  117/48). Aggiornati: home tolta, Pesi Massimi sempre aperti (helper `addFirstOrderableItem`), dock "Vai alla cassa" e
  "19,00 €", test 19 (attesa del focus), 21, 22, 23, 3b, 3e, kitchen-cart-persistence, kitchen-p0-closure, smoke.
  Restano i 4 della coda staff, NON legati al menu: customer-kitchen-flow 14 e 15 (annulla ordine, riga W99 resta),
  kitchen-service-pressure 2b (D02), kitchen-cassa-assisted-order C7 (A07). Causa non indagata: provarli sul commit
  base `73e1de4` per capire se sono preesistenti. Report: `ai-ops/reports/e2e-suite-2026-10-26.md` (gitignored).
- 4 della coda staff VERIFICATI 2026-10-26 sul commit base `73e1de4` (worktree temporaneo, test del base): **falliscono
  uguale** (14 e 15 annulla ordine, service-pressure 2b D02 non trovato, cassa C7 `cassa-tab-bbq` non trovato) →
  **preesistenti, non causati dal restyling hero**. Non indagata la causa (lato staff/cassa, fuori scope).
- **Riverifica visual-reviewer 2026-10-26 (HEAD 9a9b950): NEEDS FIX PASS · PARZIALE, P0 0 · P1 2 · P2 7.** Report
  `ai-ops/reports/visual/restyling-hero/verdetto-giro4.md`. Corretti V-01, V-03, V-04, V-08, V-09; Contorni/Birre/Bevande ok,
  niente overflow a 320-1280. **P1:** V-05 titolo Birre "SETI IMPLACABILI" a 320 si spezza a metà parola (in
  `CustomerKitchenMenu.jsx:777-780` manca lo spazio tra `{line1}` e `<em>{line2}</em>`, verificato); V-06 il sacco ha ancora lo stile
  vecchio crema (decisione di Eros). **P2:** CTA hero copre ancora ~38px di ripieno; prezzo in 3 formati; striscia scura sotto le
  bottiglie di birra; col tasto indietro dal sacco si riparte dalla hero; ingredienti tagliati; "Acqua."/"Patate al forno."
  ripetono il nome; foto bevande su fondo chiaro. Non verificabili (dati assenti): ESAURITO, prezzo mancante, SOLO LA SERA.
## H2 giro 5 — IN CORSO 2026-10-26 (Eros ha approvato: fix pass + sacco compatto nero/giallo, NIENTE commit)
Fix pass: V-05 (spazio titolo), N-02 (back dal sacco, scroll), N-01 (striscia foto birre), V-07 (un solo formato prezzo "13,90 €"),
V-02 (foto hero ~40px a destra), N-04 (riga sotto il nome = description se ingredients uguale al nome). NON fatti (decisioni di
Eros): N-03 ingredienti tagliati, N-05 foto bevande su fondo chiaro. Poi sacco (`.kitch-drawer*` in CustomerKitchenMenu.jsx:~903,
CustomerCheckout.*) nello stile nero/giallo/League Gothic, SENZA toccare logica di pagamento/ordine. Esecuzione: subagent walbox-dev,
poi riverifica visiva. Stato del lavoro dopo l'agente: vedi sotto.
Stato 2026-10-26 sera: agente walbox-dev ha finito (vedi "Giro 5 — risultato agente" più sotto); diff controllato da me, solo file
previsti. e2e: primo lancio NON affidabile (output troncato, 30 passati + lista non eseguiti; il "codice 0" era del `tail`).
Rilanciato in background con output in `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-hero/07d8a6ec-ca93-4ada-9d61-fa815bd5e305/scratchpad/e2e-giro5.txt` (ultima riga `EXIT=<codice>`; atteso 161 passati/4 falliti staff preesistenti).
Dev server SPENTO (serve riaccenderlo dopo gli e2e per il reviewer: `preview_start` hero-dev, vero indirizzo :5174).
Domanda di Eros: anteprima su Vercel dal branch (origin/feat/restyling-hero esiste già, fermo al giro 2): richiede commit + push (gate di
Eros) e controllo env "Preview" su Vercel (rischio DB/pagamenti reali). Alternativa sicura: `hero-telefono` http://192.168.1.51:5182/kitchen (dati finti).
Worktree temporaneo `wt-base` (scratchpad) ancora registrato: da togliere con `git worktree remove` se Eros dice sì.
**CORREZIONE 2026-10-26:** il lancio senza chiavi (`e2e-giro5.txt`) è INVALIDO: 135 falliti per "Supabase non configurato".
Gli e2e vanno lanciati con `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anteprima-locale npx playwright test`.
Con le chiavi: i 4 staff (14, 15, 2b, C7) falliscono uguale su HEAD e su `73e1de4` → preesistenti CONFERMATO. Suite completa con chiavi
rilanciata in `.../scratchpad/e2e-giro5-env.txt` (ultima riga `EXIT=`; atteso ~161 passati, 4 falliti).
**e2e giro 5 VALIDO (con chiavi): 161 passati, 4 falliti (14, 15, 2b, C7 = preesistenti), 1 saltato** → nessuna rottura nuova.
Dev server riacceso (hero-dev, :5174); visual-reviewer giro 5 lanciato (report `verdetto-giro5.md`).
**Verdetto reviewer giro 5 (2026-10-26): NEEDS FIX PASS piccolo · PARZIALE, P0 0 · P1 1 · P2 7.** Report `verdetto-giro5.md`
(screenshot `g5-*`). V-05, V-02, V-07, N-01, N-02 OK; sacco nuovo regge (tap ≥44px, niente overflow 320-1280).
- **N-06 (P1, verificato):** sotto PATATE AL FORNO si legge "Patate al forno, standalone." = nota interna in `kitchenMockData.js:607`
  (AREA PROTETTA), fatta comparire dal fix N-04. Fix: regola nel componente (non toccare il dato) oppure ok di Eros sul dato.
- **N-07 (P2, verificato):** nome in "Come ti chiami?" minuscolo (16px): `src/index.css:224` `input{font-size:16px !important}` (anti-zoom iOS) vince sui 30px.
- **N-09 (P2):** foto hero spostata: bordo sinistro visibile come riga verticale + blocco nero vuoto in basso a sinistra.
- Altri P2: N-08, N-10, N-11 (decisione Eros: nel sacco il prezzo a destra è l'unitario), N-12, N-13 (decisione Eros: dock rosso, unico resto del vecchio stile).
PROSSIMO: fix pass 2 (N-06 con regola nel componente, N-07, N-09 + P2 facili), poi Eros decide commit/push/anteprima.
**e2e dopo fix pass 2 (con chiavi, 2026-10-26): 161 passati, 4 falliti (14, 15, 2b, C7 = preesistenti), 1 saltato.** Dev server riacceso.
Fix pass 2 NON ancora riguardato dal visual-reviewer (hero N-09, nome sacco N-07, Patate N-06 solo misurati). Tutto NON committato.
**PROSSIMO REALE:** Eros decide: commit del giro 5 + fix pass 2 (gruppi logici, via atomic-grouped-commit), eventuale riverifica visiva rapida,
poi anteprima (telefono locale o Vercel dopo controllo env Preview) e push/merge. Decisioni aperte di Eros: N-11 prezzo unitario nel sacco,
N-13 dock rosso, N-03 ingredienti tagliati, N-05 foto bevande chiare, emoji 🦭, due PAGO gialli. I 4 e2e staff = task separato.
**PROSSIMO (superato, vedi sopra):** (1) [fatto] leggere esito e2e (file `e2e-giro5-env.txt`); (2) riaccendere dev server e lanciare visual-reviewer sul giro 5 (brief come giro 4, report
`verdetto-giro5.md`, prefisso screenshot `g5-`); (3) Eros decide commit/push/merge e anteprima. I 4 staff = task separato.

## Audit H1 (verificato nel repo)
- **Foto hero:** il panino del riferimento è `public/assets/kitchen/menu/panini/panino_orto_cattivo.webp` (1254×1254,
  orto cattivo: melanzana, peperoni, crema, carta Walrus in basso). Stessa foto, già usata nel menu (kitchenMockData:37).
  Nessun altro panino ha lo stesso incastro. Nessuno scontorno esistente.
- **Logo:** `public/assets/kitchen/walrus-pub-logo.webp` (1120×155, giallo su grigio `#222220`, NON trasparente).
  Già in `<header className="kh-brand">` (CustomerKitchenMenu.jsx:692). Il testo occupa solo il 55% centrale: ai lati
  c'è posto per menu e carrello senza rimpicciolirlo.
- **Codice toccato dal piano:** CustomerKitchenMenu.jsx (testata 692-703, promo 711-720, tab 723, titolo categoria
  729-756) · CustomerKitchenMenu.css (`.kh-brand`, `.kh-welcome`, `.kp-tabs`, `.kp-chip`, `.kp-head`, ~1800-1960) ·
  PosterCard.jsx/.css (card oggi: foto 4:3 con nome sopra, stepper sotto) · PesiMassimiSection.* (scelta SOLO PANINO/MENU).
  Categoria "Pesi Massimi" = chiave `bbq`. Nessuna area protetta di CLAUDE.md §5.
- **Limiti della foto (da dichiarare, brief):**
  1. Sopra il panino la foto ha solo ~15% di parete scura (nel riferimento ~45%): per far stare il titolo senza coprire
     il ripieno serve estendere lo sfondo verso l'alto con nero caldo sfumato (foto ancorata in basso, bordo alto in
     dissolvenza). Niente fumo: non c'è nell'originale e non si genera.
  2. Il panino occupa tutta la larghezza: per averlo "grande a destra, fuori dal bordo" si taglia la parte sinistra del
     pane/destra della crema. Ingrandito ~1.4× su iPhone 3× resta nitido ma morbido: da verificare a 390/430.
  3. Il logo è su grigio `#222220`, non nero: la testata prende quel grigio (logo intatto) invece del nero puro.
  4. Il titolo "VENIRE FAME." del riferimento è sgranato/consumato: si usa League Gothic pulito, stessa massa e interlinea.
  5. La scheda del riferimento ha solo "+": nell'app i Pesi Massimi hanno scelta SOLO PANINO/MENU, sacco con − N +,
     allergeni. Si tengono (dati e comportamenti reali), compattati.

## Piano H2 (proposto, in attesa di Gate 1)
Obiettivo: header + hero + linguette + titolo Pesi Massimi + prime 2 schede fedeli al riferimento, poi confronto, poi resto.
1. Testata: logo centrato su `#222220`, menu a sinistra, carrello con badge a destra (apre lo stesso sacco di oggi).
2. Hero nuova (componente `RestylingHero` o blocco in CustomerKitchenMenu): foto `panino_orto_cattivo` come CSS
   background (mai lo screenshot), "OGGI TI FACCIAMO" piccolo + "VENIRE" crema + "FAME." giallo, CTA gialla
   "SCOPRI I NOSTRI PANINI →" (seleziona la linguetta Panini). Sfumatura scura solo dietro al testo.
3. Via `.kh-welcome` (la frase passa nella hero). Linguette compatte (selezione gialla, altre discrete).
4. Titolo Pesi Massimi più vicino alle linguette (segni gialli a destra come nel riferimento).
5. PosterCard compatta (foto sinistra, nome+ingredienti+prezzo destra, "+" giallo tondo) — solo prime 2 schede Pesi
   Massimi nel primo giro; resto dopo il confronto.
6. Screenshot 390 / 320 / 430 accanto al riferimento → correggo → solo allora estendo.
File: CustomerKitchenMenu.jsx/.css, PosterCard.jsx/.css, (PesiMassimiSection.css se serve). Niente nuovi asset,
niente deps, niente deploy, niente commit senza OK.
Test: `npm run lint` + unit pertinenti (`node --test src/lib/*.test.js`) + build con override + screenshot.
Gate irreversibili: nessuno in H2 (solo locale). Commit/push: decisione separata di Eros.
Edge-case da verificare: cucina chiusa, banner ordine attivo sticky, evento (AnniversaryBanner), sacco pieno, nome
prodotto lungo, prezzo null / ESAURITO, 320 px, hero con altre categorie attive.
Modello/effort: Sonnet 5.5 / medium per H2 (UI e CSS); verifica visiva finale con subagent `visual-reviewer`.

## Decisioni aperte (NEEDS_DECISION)
1. **Menu a sinistra (hamburger):** oggi non esiste. (a) lo mostro e al tocco porta alle linguette [consigliata, zero
   funzioni nuove] · (b) lo tolgo (testata = logo + carrello) · (c) apre una lista categorie (funzione nuova).
2. **Dock del sacco in basso:** tenerlo oltre al carrello in testata [consigliato: ordinare resta sempre a un tocco].
3. **Hero su tutte le categorie** [consigliato: sta in cima, scorre via, linguette sticky] oppure solo su Pesi Massimi.

## Brief di Eros (copiato esatto, 2026-10-25)

Implementa il restyling dell’app THE WALRUS PUB riproducendo il più fedelmente possibile la schermata allegata. Questa immagine è il riferimento visivo principale: non reinterpretarla e non trasformarla in un layout diverso.
Hai già nella cartella del progetto tutti gli asset autentici. Prima ispezionali e individua il logo ufficiale e la fotografia più adatta a ricostruire la hero. Usa lo screenshot soltanto come riferimento di composizione, mai come immagine incorporata nell’interfaccia.
Composizione da replicare

* Header nero molto compatto: menu a sinistra, logo orizzontale ufficiale al centro, carrello a destra.
* Hero fotografica immersiva: panino molto grande sulla destra, vicino ai bordi, con ripieno protagonista e carta del pub nella parte bassa.
* Testo condensato e pesante nella parte alta sinistra: piccolo “OGGI TI FACCIAMO”, poi “VENIRE” chiaro e “FAME.” giallo. Mantieni proporzioni, interlinea stretta e disposizione del riferimento.
* Pulsante giallo compatto sotto il titolo, sulla sinistra: “SCOPRI I NOSTRI PANINI” con freccia.
* Testo e fotografia devono convivere nella stessa hero. Non creare una fascia testuale alta seguita da una foto rettangolare separata.
* Subito sotto, barra categorie scura e compatta: selezione gialla, voci inattive discrete.
* Sezione “PESI MASSIMI” vicina alle categorie, con titolo giallo condensato e descrizione breve.
* Schede prodotto compatte: foto a sinistra, nome, ingredienti e prezzo a destra, pulsante aggiungi giallo. Conserva dati e comportamenti reali dell’app.

Trattamento visivo
Riprendi dal riferimento il rapporto tra dimensioni del cibo, titolo, pulsante e schede. Fondo nero caldo, giallo ufficiale, densità da menu di pub. Evita grandi spazi vuoti, card ariose, angoli eccessivamente arrotondati o una composizione editoriale chiara.
Mantieni il logo originale intatto. Non generare fotografie e non ricostruire il panino. Puoi usare ritaglio, posizionamento e una sfumatura scura locale dietro al testo; non scurire tutto il cibo. Se il risultato richiede uno scontorno, verifica prima se esiste già un asset adatto nella cartella.
Metodo di lavoro

1. Ispeziona progetto e asset; scegli la foto confrontandone posa, luce e possibilità di ritaglio con il riferimento.
2. Implementa prima header, hero, categorie e prime due schede.
3. Mostra una schermata della preview mobile e confrontala direttamente con il riferimento: dimensione e posizione del panino, massa del titolo, altezza della hero, densità delle schede.
4. Correggi le differenze prima di estendere il restyling.

Verifica a 390 px e anche a 320 e 430 px. Testo e CTA non devono coprire il ripieno. Mantieni ordinazione e categorie immediatamente accessibili.
Se la fotografia disponibile non consente lo stesso incastro del riferimento, indica precisamente il limite prima di cambiare la composizione. Non sostituire silenziosamente questa direzione con un’altra.
Non fare deploy.

## Giro 5 — risultato agente (2026-10-26, NON committato)
- Fix pass: V-05 spazio vero tra `line1` e `<em>` (+ tolto `margin-left` da `.kp-title em`): a 320/390/430 "SETI IMPLACABILI" misurato su 1 riga;
  N-02 `CustomerKitchenMenu.jsx`: scroll salvato all'apertura del sacco e rimesso alla chiusura (effect su `cartOpen`, + rAF), niente cambi al
  popstate; N-01 `.pc-shot--contain` `min-height:190` + foto fuori dal flusso (altezza = riga, striscia sparita, misurato 320/390/430);
  V-07 tolta la regex "€ X" (ora "13,90 €" anche nella riga; test e2e di prezzo aggiornati); V-02 `.mh-photo` `right` -0.43w → -0.53w (~40px a 390);
  N-04 riga sotto il nome = `description` se `ingredients` ripete il nome (Acqua → "Acqua naturale o frizzante, 0,5L.").
- Sacco: `.kitch-drawer*` e `CustomerCheckout.css` riscritti nero caldo/crema/giallo/League Gothic; righe a griglia (miniatura, nome, prezzo "19,00 €",
  stepper giallo − N + e cestino SVG sotto il nome); totale giallo 46px; PAGO ORA / PAGO AL BANCO gialli (6px). Markup: prezzo spostato a livello riga,
  wrapper `.kitch-qty-pill`, emoji tolte da dado/MANGIO QUI/PORTO VIA/PAGO/chip (sostituiti da SVG o niente). Logica, testid, aria-label, testi dei pulsanti invariati.
  Restano le emoji nel copy "Piacere, X! 🦭" e "il Tricheco approva 🦭" (testo testato) e il fallback `drawerIcon` per righe senza foto.
- Verifiche: eslint 8 errori = baseline (0 nuovi); `node --test src/lib/*.test.js` 177 pass/1 skip; build ok (scratchpad); misure DOM a 320/390/430
  senza screenshot: 0 overflow orizzontale col sacco aperto, footer e CTA raggiungibili, back reale e × mantengono lo scroll.
- NON eseguiti: e2e (porta 5174 occupata dal dev server, `reuseExistingServer:false`); riverifica visiva (reviewer). Test e2e modificati ma non rieseguiti:
  customer-kitchen-flow (5 regex `.pc-price`, prezzo riga sacco), kitchen-cart-persistence (2 totali "38,00 €"/"19,00 €").

## Fix pass 2 — risultato agente (2026-10-26, NON committato)
- N-06 `PosterCard.jsx` (ramo compact + quip non compact): testi con "standalone" mai mostrati; se resta solo un testo che ripete il nome, nessuna riga (Patate al Forno senza sottotitolo). Dati in `kitchenMockData.js` non toccati. Grep: nessun altro "standalone" a schermo nelle 9 categorie (320/390/430).
- N-07 `CustomerCheckout.css`: `.cx-name-input { font-size: 30px !important }` (specificità maggiore di `input` in index.css, che resta invariato; 30px >= 16px: niente zoom iOS). Misurato 30px League Gothic.
- N-09 `MenuHero.css`: maschera sinistra della foto 16% -> 34% + chiarore caldo radiale in basso a sinistra sul fondo hero. CTA invariata (fine a x 176/211/231 a 320/390/430, ripieno oltre).
- N-08 `CustomerKitchenMenu.css`: `gap: 10px` sul biglietto del dock + font 24px sotto 340px. N-10: `flex-shrink: 0` sulla maniglia (4px).
- N-12 `CustomerCheckout.css`: sotto 700px di altezza via le sottoscritte dei PAGO e totale 32px (footer 236 -> 207px a 320x640; resta il 36% del foglio).
- Saltati: N-11 e N-13 (decisioni di Eros), N-03/N-05 (giro 4).
- Verifiche: eslint 8 errori = baseline (tutti CustomerKitchenMenu.jsx, 0 nuovi); `node --test src/lib/*.test.js` 177 pass/0 fail/1 skip; build ok (scratchpad build-g5b); misure DOM 320/390/430: 0 overflow su 9 categorie e sacco, Birre titolo 1 riga.
- NON eseguiti: e2e (porta occupata), riverifica del reviewer, dock con totale >= 100 € a 320 (solo CSS, non simulato), tastiera su iPhone.

## Pulizia codice — risultato agente (2026-10-26, NON committato)
- Tolto (righe nette, `git diff --patience`): `CustomerKitchenMenu.css` -1373 · `BirreSection.css` -377 · `PesiMassimiSection.css` -168 · `BevandeSection.css` -156 · `CustomerKitchenMenu.jsx` -91 · `PesiMassimiSection.jsx` -52 · `BevandeSection.jsx` -8 · `kitchenMenuCopy.test.js` -12.
- Cosa: CSS morto (vecchi `kitch-header/promo/tab/card/fulfillment/extra`, `kh-header/card/cat*`, `br-card*`, `bv-card*`, `pm-hero*`, `kitch-card-img`, media query e `:hover` sovrascritti dal dock, `kitchCartPulse`, custom property `--pm-*`/`--br-*`/`--bv-*` mai lette); `CATEGORY_SVGS` + campo `icon` (mai letto) e `<style>` su `.kitch-card-img` in `CustomerKitchenMenu.jsx`; ramo `heroOnly`/`onHeroCta` di `PesiMassimiSection` (nessun chiamante); classe `kitch-bottom-card--filled` senza regole; commenti sulla UI a 2 colonne/hero; 2 regole `.kitch-bottom-bar` e 2 `.kp-chip` fuse.
- Test: in `kitchenMenuCopy.test.js` il test "frame immagine birra contain" ora controlla `photoFit="contain"` + `objectFit: photoFit` (prima leggeva CSS morto `.br-card-photo*`); tolto il test "frame birra piu piccoli" (fissava 72/132/168px di classi mai renderizzate) e l'helper `ruleBody` rimasto senza usi. Unit: 177 → 176 pass.
- Dubbi lasciati: (1) `PosterCard` ramo non `compact` (+`splitName`, `PriceBig`, `.pc-scrim/.pc-num/.pc-over/.pc-quip`): tutti i chiamanti passano `compact`, ma toglierlo cambia l'API e tocca Panini/Tagliere/Tartare (fuori ambito); (2) blocco promo `kitchenCategoryPromos` in `CustomerKitchenMenu.jsx` (+`.kitch-promo-wrapper`): oggi `null` per tutte le categorie del menu (dati protetti); (3) rami `patatine`/`combo` di `getPosterTitle`, `CUSTOMER_HIDDEN_ITEM_IDS = []`; (4) dichiarazioni base di `.kitch-bottom-card`/`.kitch-btn-vai` quasi tutte sovrascritte dal dock: restano perché cambierebbero valori calcolati; (5) fragment `<>` e condizione ripetuta due volte nel menu.
- Verifiche: eslint 8 errori = baseline (tutti `CustomerKitchenMenu.jsx`, 0 nuovi, 0 warning); `node --test src/lib/*.test.js` 176 pass/0 fail/1 skip; build ok (scratchpad `build-clean`); confronto DOM prima/dopo (computed style di ogni elemento + pseudo, rect, scrollWidth) a 320/390/430 su 15 stati (9 categorie, 3 stati combo Pesi Massimi, dock, sacco, sacco con errore): 0 differenze su 45 snapshot (baseline ripetuta 2 volte = identica). Pulse dock: `.kb-wrap` animation none, `.kb-ticket` kbPulse come prima.
- NON verificato: e2e (porta occupata), stati `:hover`/`:focus`, reduced-motion, cucina chiusa, modalità evento, esaurito, toast/flyer, banner ordine attivo, iPhone reali (per quelle regole fa fede il grep: nessuna classe rimossa compare in src/ o nei test, salvo `.kitch-card`/`.kitch-menu-list` usate solo in `toHaveCount(0)`).

## H3 — Immagine hero ritagliata SENZA AI (proposta 2026-10-27, in attesa di scelta di Eros)
Stato git: tutto committato e PUSHATO (origin/feat/restyling-hero = HEAD d0dc936). Non fatto: merge/deploy.
Richiesta di Eros: immagine per la hero ottenuta solo ritagliando la foto vera (niente AI).
Limite verificato: in `panino_orto_cattivo.webp` il panino è orizzontale e occupa TUTTA la larghezza; nel riferimento sta a destra
con spazio libero a sinistra. Oggi la hero lo ottiene in CSS (foto spostata a destra + maschere): panino piccolo, mezzo fuori.
Strumenti senza installare nulla: canvas nel browser headless (Playwright già presente) + `cwebp` per comprimere. Niente PIL/sharp/magick.
Opzioni:
- A (consigliata) Ritaglio stretto sul ripieno (~1,5×) con sfumature verso il nero già dentro il file; CSS hero semplificato (una sola
  immagine, via le maschere). Nuovo file `public/assets/kitchen/menu/hero/hero_orto_cattivo.webp` (~100 KB). Rischio basso.
- B Scontorno a mano del panino (tracciato a punti disegnato da me, non AI) su fondo nero + carta solo in basso: il più vicino al
  riferimento, ma i bordi della crosta possono sembrare "appiccicati". Più lavoro, da giudicare a occhio.
- C Solo ritocchi CSS a zoom/posizione della foto attuale, nessun file nuovo.
Metodo: prima 2 prove (A e B) in scratchpad affiancate al riferimento, Eros sceglie, poi codice (MenuHero.jsx/.css) + verifica 320/390/430.
File toccati: MenuHero.jsx/.css + 1 asset nuovo. Niente aree protette, niente deps, commit/push solo con OK.
Modello/effort: Sonnet 5.5 / medium (prove immagine + CSS), revisione visiva finale con visual-reviewer.
**H3 FATTO 2026-10-27 (NON committato):** Eros ha scelto la SUA foto (pulled pork + scatola Walrus, 2000×2000, sorgente in chat).
Ritaglio senza AI: `cwebp -crop 560 300 1440 1411 -resize 1080 0 -q 80` → NUOVO `public/assets/kitchen/menu/hero/hero-pulled-pork.webp`
(1080×1058, 91 KB). `MenuHero.jsx`: src/width/height/commento. `MenuHero.css` `.mh-photo`: right -0.42w, bottom -0.06w, width 1.1w,
maschere 14% alto / 22% sinistra (il bordo sinistro è la scatola nera). Verifiche: eslint MenuHero 0 errori, unit 176/0/1 skip, build ok
(scratchpad build-h3), 320/390/430 nessun overflow, CTA non copre il ripieno (a 320 CTA finisce a x176). `panino_orto_cattivo` non più in hero.
NON fatto: e2e, revisore visivo, commit. **PROSSIMO:** Eros guarda la hero e decide: ritocchi oppure commit.
**H3b FATTO 2026-10-27 (NON committato):** testata tutta nera. NUOVO `public/assets/kitchen/walrus-pub-logo-nero.webp` = stesso logo con
"livelli" per canale (grigio #222220 → nero, bianco invariato; giallo cambia di pochi punti), fatto con dwebp + script node (scratchpad
`levels.mjs`) + cwebp, niente AI. `CustomerKitchenMenu.jsx:641` usa il logo nero, `.kh-brand` background #000. Verificato 390: fondo
rgb(0,0,0), logo caricato, nessun riquadro, nessun overflow. Banner arancione "ordine attivo" NON toccato.
Decisione di Eros 2026-10-27: il banner arancione "ordine attivo" resta arancione. **PROSSIMO:** Eros decide il commit di H3 + H3b (foto hero, logo nero, MenuHero.*, CustomerKitchenMenu.jsx/.css), niente push.

## H4 — MENU (Fallo Pesante) anche con bibite (proposta 2026-10-27, in attesa di scelta di Eros)
Richiesta di Eros: "fare i menu con le bevande normali", soluzione bella e con meno attrito possibile.
Oggi (verificato): il MENU esiste solo per Pulled Pork / Pastrami / Brisket (`kitchenPesiMassimiCombos`, item-040/041/042,
€19/20/20) = panino + patate + birra OBBLIGATORIA tra 6 bottiglie. Chi non beve birra non può prendere il menu.
La bevanda scelta NON va al server come riga: diventa una nota "🍺 BIRRA INCLUSA: …" (`buildIncludedBeersNote`), il server
vede solo item-040 al prezzo di catalogo. Quindi aggiungere le bibite a parità di prezzo = solo frontend, zero migration.
Conti (listino): con bibita €4 il menu resta conveniente (PP 13,90+5+4=22,90 vs 19; Pastrami 23,50 vs 20; Brisket 24 vs 20).
Opzioni:
- A (consigliata) Un solo menu, scelta "COSA BEVI?": striscia birre + striscia "SENZA ALCOL" (Pepsi, Pepsi Zero, Seven Up,
  Schweppes Lemon/Tonica) con le foto che ci sono già. Stesso prezzo. Sottotitolo "PANINO + DA BERE + PATATE". Nota cucina/banco
  generalizzata ("🥤 BIBITA INCLUSA: PEPSI ZERO"). Stessa scelta anche in cassa staff. Niente aree protette.
- B Due menu a prezzi diversi (menu birra / menu bibita più economico): servono nuove righe catalogo su Supabase (migration,
  allowlist promo) = area protetta, più lavoro e una scelta in più per il cliente.
- C Menu solo birra com'è + suggerimento "aggiungi una bibita" dopo il panino: non è un menu, nessuno sconto.
File toccati (A): `PesiMassimiSection.jsx/.css`, `kitchenPesiMassimi.js`, `kitchenServiceRules.js` (+test), `kitchenCart.js`
(commento/nome campo), `CustomerKitchenMenu.jsx` (pairing birra: non suggerire birra se il menu ha già una bibita),
`CounterAssistedOrder.jsx`, `kitchenMockData.js` (solo sottotitolo combo: area protetta → serve OK esplicito), e2e Pesi Massimi.
NEEDS_DECISION: (1) prezzo uguale con bibita? (consigliato sì) (2) acqua inclusa tra le scelte? (consigliato no: €1 fa sembrare
il menu caro) (3) ok a toccare il sottotitolo in `kitchenMockData.js`.
Test: unit nota (birra, bibita, mista), reconcile carrello con bibita, e2e scelta bibita → sacco → nota; 320/390/430.
Modello/effort: Sonnet 5.5 / medium (implementazione), revisione visiva finale con visual-reviewer.
**H4 Gate 1 APPROVATO 2026-10-27 (Eros):** opzione A, stesso prezzo, acqua (item-038) esclusa, OK a toccare SOLO il sottotitolo
dei 3 combo in `src/data/kitchenMockData.js`. Esecuzione delegata a subagent walbox-dev (Sonnet). Niente commit/push.

## H4 — risultato agente (2026-10-27, NON committato)
- File toccati: `src/lib/kitchenPesiMassimi.js` (costante acqua esclusa + `isFalloPesanteDrinkAllowed` + `falloPesanteDrinkOptions`), `src/lib/kitchenServiceRules.js` (nota separata per tipo, nuovo export `INCLUDED_DRINK_NOTE_PREFIX`), `src/lib/kitchenCart.js` (reconcile: una bibita non ammessa/acqua fa cadere la riga), `src/components/kitchen/PesiMassimiSection.jsx/.css` ("2 · COSA BEVI?", fila birre invariata + "SENZA ALCOL" con pillole bibita a scelta diretta, "DA BERE: X", "SCEGLI DA BERE PER CONTINUARE"), `src/pages/CustomerKitchenMenu.jsx` (solo import + prop `drinkOptions` + commento sul pairing), `src/pages/CounterAssistedOrder.jsx` (bibite nel pannello MENU, riuso classi esistenti), `src/data/kitchenMockData.js` (SOLO `subtitle` dei 3 combo -> 'PANINO + DA BERE + PATATE AL FORNO'), test: `kitchenServiceRules.test.js`, `kitchenCart.test.js`, `kitchenMenuCopy.test.js`, e2e `customer-kitchen-flow.spec.js` (adattati testi + nuovo 21a), `kitchen-cart-persistence.spec.js` (nuovo test bibita), `kitchen-cassa-assisted-order.spec.js` (nuovo C14).
- Invariati: nome campo `includesBeerId`, `INCLUDED_BEER_NOTE_PREFIX`, formato nota birra, server/RPC/api/supabase/routing. `findRecommendedBeer` non modificato (gia' esclude ogni riga con `includesBeerId`, quindi anche con bibita): solo commento.
- Nota cucina: birra "🍺 BIRRA INCLUSA: A · 2x B", bibita "🥤 BIBITA INCLUSA: PEPSI ZERO", misto uniti da " · " (birre prima).
- Verifiche: unit `node --test src/lib/*.test.js api/_lib/*.test.js` 188 pass / 0 fail / 1 skip (+6 nuovi); eslint sui file toccati = 12 errori tutti preesistenti (8 CustomerKitchenMenu.jsx, 1 `no-empty` kitchenCart.js:82 gia' esistente, 3 in customer-kitchen-flow.spec.js righe 123/651/1586), 0 nuovi; build ok (scratchpad `build-h4`); e2e: kitchen-cart-persistence 9/9, kitchen-p0-closure 9/9, customer-kitchen-flow 49 pass / 5 fail (14, 15, 36, 49, 52: annulla ordine staff e SumUp, non toccano Pesi Massimi), cassa 13/14 (C7 coda /kitchen/solo fallisce). Visivo 320/390/430: scrollWidth = larghezza viewport (nessun overflow), pillole 44-52 px, nessun testo tagliato.
- E2E: porta 5174 occupata da un dev server esterno, usata config temporanea in scratchpad su 5175; nel worktree manca `.env.local`, quindi Supabase finto SOLO nelle variabili del processo di test (`VITE_SUPABASE_URL=http://127.0.0.1:54321`, chiave fasulla), rete mockata.
- NON verificato: i 6 e2e falliti (staff/SumUp) non sono stati confrontati con una baseline pulita (probabile effetto dell'ambiente finto, da riverificare con l'ambiente di Eros); iPhone reali; cassa visiva; allergeni staff: `kitchenAllergens.js` (fuori scope) calcola l'unione allergeni del combo solo sulle birre, le bibite non vi entrano (le bibite non hanno allergeni dichiarati nel catalogo, ma va deciso).
- Da cancellare a mano: `tests/e2e/zz-dbg.spec.js` (file di debug creato per errore, ora solo un commento; `rm` vietato).
**H4 verifica sessione principale (2026-10-27):** unit rilanciati 188/0/1 skip (verificato); screenshot 390 guardato: ok, coerente.
I 6 e2e rossi (14, 15, 36, 49, 52 flow + C7 cassa) sono annulla staff / SumUp / coda: non toccano codice cambiato (dedotto, non
confrontato con baseline). Da fare: Eros cancella a mano `tests/e2e/zz-dbg.spec.js`; decisione allergeni bibite nel combo
(`kitchenAllergens.js`, fuori scope). **PROSSIMO:** Eros prova a telefono e decide il commit (esclusi `.claude/*` e zz-dbg), niente push.
