# Ricerca di design — menu evento 15 anni

Copia esatta dei due piani di ricerca usati il 2026-10-14 (originali in `~/.claude/plans/`, fuori dal repo).
Le fonti vendor blog sono direzionali, non studi. Qui si aggiungono le ricerche future sul menu evento.

---

## Piano 1 — Restyling PESI MASSIMI + home (`keen-chasing-alpaca.md`)

# Restyling PESI MASSIMI + home — GARPEZ protagonista (festa 15 anni)

## Context
Oggi `PesiMassimiSection` mostra 4 panini con lo stesso peso (hero a 4 foto, lista card uguali): il GARPEZ è uno dei quattro, riconoscibile solo da un piccolo badge "15 ANNI" e dalla scenetta a card aperta. Eros vuole che sia **evidente che c'è il Garpez**, sia in home sia nel menu, con metodo da software house seria, pronto per la festa (~16 ott).
Decisioni di Eros (2026-10-14): ambito = sezione PESI MASSIMI **+ home Kitchen**; Garpez = **protagonista in cima**, i 3 classici sotto più piccoli; **deve essere pronto per la festa**; metodo = **ricerca + brief**.
Vincoli: mai toccare `api/`, `supabase/`, `vercel.json`, routing, `kitchenMockData.js`, logica carrello/checkout/combo. Solo presentazione. La sezione segue il Figma approvato (Page 4) → il restyling se ne discosta: va dichiarato.

## Brief (stile agenzia)
- **Utente**: cliente al tavolo, telefono in una mano, locale rumoroso e buio, decide in <30 s, nessun login.
- **Obiettivo di business**: la sera dei 15 anni ogni cliente capisce in 3 secondi "c'è il Garpez, 15 €, è speciale"; il Garpez è il panino più ordinato della serata.
- **Metriche** (da leggere dopo la festa, senza nuovo tracking): quota Garpez sugli ordini PESI MASSIMI; ordini completati; domande al banco "cosa c'è?".
- **Non-obiettivi**: niente nuove funzioni, niente cambi al flusso ordine, niente restyling del resto del menu.

## Regole di design (da ricerca, usate come checklist di verifica)
Fonti: vendor blog (direzionali, non studi) — [Perdiem](https://www.tryperdiem.com/post/optimize-mobile-menu-for-restaurant-orders), [Sauce](https://getsauce.com/post/10-tips-to-optimize-your-online-ordering-menu), [BPAA menu engineering](https://bpaa.com/Portals/0/Documents/Foodservice/Menu%20Bowl%20expo%20print%20menu%20for%20website.pdf), [Rota Cloud](https://rotacloud.com/blog/psychology-and-design-supercharge-your-menu/); standard: [WCAG 2.5.8](https://tabnav.com/academy/wcag/success-criterion-2.5.8) (target ≥24px AA), Apple HIG 44pt / Material 48dp.
1. **Un solo eroe per schermata**: evidenziare 1-2 item per sezione, non 4. Garpez = eroe unico.
2. **Above the fold**: nome + prezzo + foto del Garpez visibili senza scroll a 390×844.
3. **Gerarchia con dimensione e contrasto**, non con più decorazioni; box/evidenziato ≤10-15% della pagina.
4. **Prezzo sempre accanto al nome**; ingredienti brevi sotto.
5. **Un'azione primaria chiara** per card/eroe (CTA ≥48px, in zona pollice, in basso).
6. **Tap target ≥44px**, spaziatura tra target ≥8px.
7. **Contrasto testo ≥4.5:1** (locale buio: attenzione al testo piccolo su foto).
8. **Meno categorie/rumore**: in modalità evento il menu è già ridotto a 4 voci.
9. **Foto con restraint**: una grande + tre piccole, non quattro uguali.
10. **Stesso linguaggio dalla home al panino** (colori, badge, tono Walrus §8), nessun salto stilistico.
11. **`prefers-reduced-motion` rispettato**; niente animazione che blocca l'ordine.
12. **Rischio onestà**: l'eroe non deve fingere esaurito/prezzi (niente decoy); se Garpez è esaurito l'eroe lo dice.

## Approccio (raccomandato)
Restyling **gated sulla modalità evento** (`eventMode`, già presente): fuori dall'evento la sezione resta quella approvata a Figma → zero rischio sui giorni normali. In evento:
- **Home**: hero a tutta larghezza dedicato al Garpez (foto grande `photo-garpez-special.webp`, badge "15 ANNI · EDIZIONE LIMITATA", prezzo 15 €, CTA "VOGLIO IL GARPEZ" che apre direttamente la card), sotto la riga dei 3 classici in forma compatta. Sostituisce l'hero a 4 foto; `AnniversaryBanner` resta, ma più compatto per non spingere l'eroe sotto la piega.
- **Menu PESI MASSIMI**: Garpez in cima come card grande "protagonista" (già aperta o con CTA primaria visibile), poi Pastrami/Pulled Pork/Brisket come card più piccole. Ordine deciso in presentazione (tag `anniversario`, nessun id hardcoded), senza toccare `kitchenMockData.js`.
- Riuso: `PesiMassimiSection.jsx/.css` (classi `pm-*`), `GarpezScene`, `AnniversaryBanner`, `kitchenEventMode.js` (`isEventModeActive`, `filterEventMenuItems`), `AllergenBadges`. Il payload ordine (`onAdd`) resta identico.

## Passi (micro-task, anteprima a ogni passo)
0. Salvare questo piano in `ai-ops/current/ANNIVERSARIO_15_ANNI.md` (sezione "Restyling") — Sonnet medium.
1. **Audit visivo** dello stato attuale a 390/430 (screenshot home + menu + card aperta) per avere il "prima" — read-only.
2. **Home**: eroe Garpez + riga classici (nuovo `GarpezHero.jsx/.css` o variante in `PesiMassimiSection` con prop `featuredTag`). Anteprima a Eros.
3. **Menu**: card protagonista + card compatte, ordine con Garpez primo. Anteprima a Eros.
4. **QA**: checklist delle 12 regole, 390/430/desktop, contrasto, target size, reduced-motion emulato, scroll orizzontale, Garpez esaurito. Subagent `visual-reviewer` (indipendente, read-only) + `diff-risk-reviewer`.
5. Commit atomici su approvazione di Eros (scenetta · Fase 3 · Fase 4 · restyling); mai push.

## File toccati
`src/components/kitchen/PesiMassimiSection.jsx/.css`, `src/pages/CustomerKitchenMenu.jsx` (solo il blocco home evento), nuovi `GarpezHero.jsx/.css` se serve, `AnniversaryBanner.css` (compattazione), `ai-ops/current/ANNIVERSARIO_15_ANNI.md`.

## Edge case
Garpez esaurito (`available:false`) → eroe mostra ESAURITO e non cade nel vuoto · carrello con articoli fuori menu evento (già noto) · `?evento=0/1` · schermo 360px stretto · reduced-motion · foto non caricata (fallback fondo scuro) · testo lungo ingredienti.

## Verifica
`npm run lint` (baseline 121 err, nessun nuovo) · `node --test src/lib/*.test.js` (166/0) · build con override `VITE_SUPABASE_URL=http://127.0.0.1:54321` · anteprima `kitchen-dev-local` porta 5174 `?evento=1` e `?evento=0` a 390/430 · e2e dei flussi PESI MASSIMI (confronto coi 7 rossi noti di `main`).

## Decisioni di prodotto aperte (NEEDS_DECISION)
- Il restyling si discosta dal Figma approvato: va bene che valga solo in modalità evento?
- Dopo la festa il nuovo layout resta come default per i PESI MASSIMI o si torna a quello Figma?
- Frase/claim sull'eroe ("EDIZIONE 15 ANNI", testi): propongo, decide Eros.

Modello/effort: passi 0-1 Sonnet medium · passi 2-3 Opus high (design) · passo 4 Sonnet medium via subagent.


---

## Piano 2 — Banner centrale 15 anni (`sprightly-wobbling-micali.md`)

# Piano — Banner centrale 15 ANNI (home evento)

## Contesto
Eros non vuole la fascia "STASERA SI FESTEGGIA · 15 ANNI" dentro la card del GARPEZ (piccola, a sinistra, attaccata alla foto).
Vuole un **banner centrale, autonomo, tra la scritta "WALRUS KITCHEN" (header canonico) e il panino**.
Si fa ricerca prima, poi si costruisce come una software house: brief, regole, verifica a video.

## Ricerca (cosa dicono le fonti)
| Fonte | Cosa ne ricavo | Peso |
|---|---|---|
| [NN/g, Banner Blindness](https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/) (letta) | Gli utenti saltano ciò che *sembra una pubblicità*: rettangoli colorati piccoli, testo dentro immagini, animazioni. Su mobile un blocco grande e inline viene invece guardato. Il contenuto vicino a un "ad" viene saltato anche lui. | **Forte** (ricerca, citata) |
| [W3C WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) (letta) | Movimento automatico oltre 5 s richiede un controllo per fermarlo; sotto i 5 s no. | **Forte** (standard) |
| [web.dev, animazioni](https://web.dev/articles/animations-guide) (letta) | Animare solo `transform` e `opacity` (compositor): niente top/left/blur/ombre animate. | **Forte** (Google) |
| [Shopify dev, transform + reduced-motion](https://shopify.dev/docs/storefronts/themes/best-practices/performance/use-transform-for-animations) | `prefers-reduced-motion: reduce` → animation/transition none. | Medio |
| [StoreKit, promotional banners](https://storekit.com/docs/guides/marketing/promotional-banners) | Banner di ordinazione: messaggio breve, immagine forte, CTA esplicita, coerente col design del locale, un solo banner evento in cima. | Debole (documentazione di un vendor) |
| [Atlassian wiki RBI, upsell](https://rbictg.atlassian.net/wiki/x/jYAfJQE) | Upsell dopo "aggiungi": bottom sheet, 6-8 voci, sempre chiudibile ("No thanks"). | Debole (un solo vendor) |
| Baymard (cross-sell Deliveroo/Just Eat) | Esiste il benchmark ma le linee guida sono a pagamento: **non verificato**. | non letto |

Limite onesto: Material Design (bottom sheet) non si è lasciato leggere; Baymard è dietro paywall. Le cifre su pixel/numero di banner vengono da vendor, sono direzionali.

## Regole di progetto che ne derivano
1. **Non deve sembrare una pubblicità**: niente rettangolo colorato piatto con testo; deve essere *identità* del Walrus (logo W, tipografia del locale, stesso linguaggio dell'header), non uno sticker promozionale.
2. **Autonomo e centrale**: fuori dalla card, tra header e GARPEZ, centrato, larghezza piena. Non vicino a un altro "ad" (la card GARPEZ è contenuto, deve restare staccata).
3. **Corto**: kicker + "15 ANNI" + una riga. Nessuna CTA dentro il banner (la CTA resta sul GARPEZ). Altezza ≤ ~150px a 390 per non spingere la CTA fuori piega.
4. **Animazione ≤ 5 s, una sola volta**, solo `transform`/`opacity`; `prefers-reduced-motion` = statico (WCAG 2.2.2, web.dev).
5. **Prompt bevande**: bottom sheet sempre chiudibile (già così), sempre al prossimo panino se non c'è da bere (già fatto).

## Cosa si fa
**File:** `src/components/kitchen/AnniversaryBanner.jsx/.css` (esistono già, oggi inutilizzati) · `GarpezHero.jsx/.css` · `CustomerKitchenMenu.jsx` (2-3 righe). Niente `api/`, checkout, pagamenti, `kitchenMockData.js`, routing.

1. **Riscrivere `AnniversaryBanner` in versione centrata**: logo W centrale (cerchio), sopra/sotto "STASERA SI FESTEGGIA", "15 ANNI" grande al centro, riga "Grazie per averci sopportato." Raggi decorativi dietro il logo (già presenti), filetti gialli come l'header. Rimuovere la variante `compact` (morta).
2. **Montarlo sempre in evento**, subito dopo `</header>` e prima del GarpezHero (oggi è solo fallback quando manca il GARPEZ). Nello stesso punto: il testo d'intro resta nascosto.
3. **Togliere la fascia `.gzh-stamp` dalla card** del GarpezHero (la card torna: foto → nome/prezzo → CTA). Coriandoli: spostati dal banner (cadono nel banner, non sul panino).
4. **Animazione**: ingresso ~1,2 s totale (logo timbra, 15 sbatte, riga si stende — già scritta), una volta. Coriandoli ~1,6 s, poi spariscono.
5. **Verifica a piega**: a 390×844 il banner + header lasciano vedere foto GARPEZ; CTA sotto la piega accettabile? Se no, foto 3:2 → 16:10 nella sola home evento.

## Decisioni per Eros (con raccomandazione)
- **Altezza/peso del banner**: (a) *banner compatto ~110px, solo logo+15 ANNI* · **(b) raccomandata: ~140px, logo + kicker + 15 ANNI + riga grazie** · (c) banner enorme ~250px (CTA fuori piega, sconsigliato).
- **Testo "Grazie per averci sopportato."**: ok o lo cambi?
- **Pannello bevande**: oggi mostra tutte le 12 (6 birre + 6 bevande). Le fonti dicono 6-8 voci. Proposta: 3 birre + 3 bevande più vendute — scelta di prodotto tua, non la faccio da solo.

## Verifica
- `node --test src/lib/*.test.js`, eslint sui file toccati (menu = 13 errori baseline), `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build`.
- A video 390 e 430 (`?evento=1`): ordine verticale header → banner → card GARPEZ; niente scroll orizzontale; screenshot a Eros.
- `?evento=0` invariato; reduced-motion verificato emulando `prefers-reduced-motion` (stavolta davvero, non solo la regola CSS).
- QA indipendente con `visual-reviewer` a 390/430/desktop prima di dire "fatto".

Modello/effort: Sonnet medium (CSS/JSX piccoli, un solo giro di verifica visiva).


---

## Ricerca 3 — Patate, veg e attrito dei suggerimenti (2026-10-15)

Domanda: aggiungere Patate al Forno (5 €, contorno) e Orto Cattivo (VEG, 8 €) al menu evento, suggerendo le patate come le bevande, senza affollare l'esperienza.
Limite onesto: le fonti serie sono poche e non dirette sul nostro caso (pub, QR, ordine al tavolo). Nessun test A/B pubblicato confronta un prompt combinato con prompt in sequenza nel food ordering. Le pagine Baymard complete sono a pagamento (lette solo le pagine benchmark gratuite). Le pagine NN/g non sono uscite dalla ricerca: le sue linee guida sui modali arrivano solo di seconda mano.

### Fonti
| Fonte | Tipo | Cosa dice |
|---|---|---|
| [Baymard, benchmark cross-sell nel checkout](https://baymard.com/checkout-usability/benchmark/step-type/cross-sell) e [linea guida 579](https://baymard.com/guidelines/579-implementing-cross-sells-in-the-checkout-flow) | Ricerca seria (parziale, paywall) | I cross-sell nel checkout servono al venditore e possono distrarre dal pagamento; quelli iniettati che obbligano a un sì/no sono percepiti come aggressivi (esempio Amazon: 66% di frustrazione estrema allo step separato). Testo completo delle raccomandazioni non verificato. |
| [Scheibehenne et al. 2010, meta-analisi choice overload (J. Consumer Research)](https://madoc.bib.uni-mannheim.de/30861/) | Studio serio (letto via abstract/riassunti) | 50 esperimenti, 5.036 persone: effetto medio di "troppe opzioni" vicino a zero, ma molto variabile. L'overload non è garantito; non c'è una soglia magica. |
| NN/g sui modali (citato di seconda mano da [UX Planet](https://uxplanet.org/best-practices-for-modals-overlays-dialog-windows-c00c66cddd8c)) | Ricerca seria, ma riportata da blog | Evitare modali che interrompono processi ad alta posta come il checkout o per contenuti non essenziali al flusso. Non letta alla fonte. |
| [uxdesign.cc, sheet/dialog/snackbar](https://uxdesign.cc/sheet-dialog-or-snackbar-what-should-a-designer-go-for-65af3a0b4aeb) | Blog di design | Suggerimenti, promozioni e FYI vanno con pattern non modali (messaggi inline, banner, popover). Direzionale. |
| [Hostie](https://hostie.ai/resources/ai-texting-upsells-increase-restaurant-ticket-size-without-annoying-guests), [Bopple](https://blog.bopple.com/introducing-smart-upsells), [Meandu](https://help.meandu.com/hc/en-us/articles/6539899736207), [Zuppler](https://zuppler.com/ai-upsell), [Per Diem](https://www.tryperdiem.com/post/the-power-of-upselling-how-your-coffee-shops-mobile-app-can-increase-order-sizes) | Blog/doc di vendor (direzionali) | Una sola proposta riuscita per interazione; regola a cascata (cibo -> proponi bere, bere -> proponi cibo, già entrambi -> altro); gruppi di upsell per contesto ("Thirsty?", "Something on the side?"); rialzi dello scontrino 13-30% dichiarati senza metodo. Nessun test su prompt combinato vs sequenza. |
| Esperimenti già in questo file (RBI/Atlassian, bottom sheet 6-8 voci chiudibile) | Vendor, direzionale | Coerente con quanto sopra. |

### Risultati chiave
1. Il rischio documentato è l'**interruzione che obbliga a decidere** (Baymard, NN/g): il costo cresce con ogni stop in più tra il cliente e il "paga".
2. Più opzioni non sono automaticamente un male (meta-analisi), ma il nostro pannello ha già 12 voci: aggiungere un secondo blocco nello stesso pannello aumenta il rumore senza evidenza che serva.
3. I vendor convergono su: un suggerimento per volta, a cascata sul "cosa manca", sempre saltabile. Evidenza debole ma unanime.
4. Nessuna fonte seria dice che un suggerimento **non modale** (inline) abbia un attrito paragonabile a un modale; il pattern è raccomandato per contenuti non critici.

### Raccomandazione
**a) Formato: patate come suggerimento NON modale, una riga/chip inline.** Il pannello modale resta solo per le bevande (invariato). Né pannello unico "COMPLETA IL SACCO" (12 bevande + patate = lista più lunga e un modale più pesante per tutti), né due pannelli in fila (secondo stop obbligato, è il caso "step di cross-sell separato" che Baymard segnala come aggressivo). Il chip/riga "PATATE AL FORNO +€5 · AGGIUNGI" sta nel sacco/carrello e/o sotto il toast "NEL SACCO ✓", con un tap per aggiungere e nessun obbligo di rispondere.

**b) Quando e quante voci:** al massimo **un solo modale per aggiunta di panino** (le bevande, solo se manca da bere, come oggi). Le patate: chip inline solo se nel sacco c'è un panino e **nessuna patata**; sparisce appena aggiunte o ignorate (non ricompare nella stessa sessione dopo un "no"/chiusura esplicita). Una sola voce (le patate sono un solo prodotto). Regola a cascata: manca bere -> modale bevande; bere già presente e mancano patate -> chip; entrambi presenti -> niente. Bevande: tenere il pannello com'è finché Eros non decide di ridurre le voci (nota: la ricerca 2 già suggeriva 6-8).

**c) Orto Cattivo VEG:** resta una card **della stessa riga dei classici, mai sopra il GARPEZ**, stessa dimensione dei classici (non più grande), con etichetta VEG chiara (testo + icona, non solo colore verde) e prezzo accanto al nome. Nessun banner, nessun badge "novità" in competizione col "15 ANNI". Il GARPEZ resta l'unico eroe (regola 1); l'Orto è una scelta trovabile, non spinta. Riga dei classici passa da 3 a 4 voci: verificare che a 390 px non serva scroll orizzontale nascosto o schiacciamento dei target (<44 px).

### Regole aggiuntive (checklist, continuano la numerazione)
13. **Un solo modale per azione.** Dopo l'aggiunta di un panino compare al massimo un pannello modale; ogni altro suggerimento è inline e non blocca.
14. **Suggerisci solo ciò che manca**, a cascata (bere -> contorno -> niente). Se il cliente ha già la cosa, non proporla.
15. **Un "no" vale per la sessione.** Dopo NO GRAZIE o chiusura del pannello/chip, quel suggerimento non ricompare finché il sacco non cambia in modo sostanziale (decisione di prodotto sulla soglia: NEEDS_DECISION se si vuole un'eccezione).
16. **Suggerimento non modale = nessun ostacolo al pagamento.** Il chip patate non sposta il tasto di conferma, non copre il totale, ha target >=44 px e non richiede di essere chiuso.
17. **Opzione veg trovabile, non spinta.** Stessa dimensione e posizione dei classici, etichetta VEG in testo, nessun elemento che compete con l'eroe GARPEZ. Verificare 4 voci in riga a 390/430 senza target stretti.

Da misurare dopo la festa (senza nuovo tracking, a mano sugli ordini): quota ordini con patate, quota con bevande, ordini abbandonati col sacco pieno rispetto alla media; se le patate vanno sotto la soglia attesa, valutare solo allora un secondo livello di visibilità.
