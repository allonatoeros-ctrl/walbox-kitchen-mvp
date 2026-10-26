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
**PROSSIMO:** commit dei test aggiornati (decisione di Eros); poi i 4 staff; poi push/merge.

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
