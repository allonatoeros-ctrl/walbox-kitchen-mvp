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
