# BRIEF CREATIVO: BRANDIZZAZIONE WALRUS LIVE TV
**Versione:** 1.0  
**Autore:** Creative Director Agent, AI Business Factory  
**Stato:** Pronto per Handoff Frontend / Approvazione CEO  
**Modalità:** READ-ONLY (Nessuna modifica al codice)

---

## 1. Creative Direction Summary

L'obiettivo di questo brief è guidare la trasformazione visiva della schermata **Live TV** (`LiveTvScreen.jsx`) di Walbox V2, convertendola da un look cyber/neon generico in una visual identity materica, calda e coerente con **The Walrus Pub** (Milano, Via Vigevano 33).

Il concetto creativo di riferimento è **"Industrial-Eccentric Cozy Pub"**:
* **Calore e Accoglienza:** Il design deve rievocare il legno massiccio scuro, i mattoni rossi a vista e le luci ambrate soffuse del pub fisico.
* **Eccentricità Vintage:** Elementi caratteristici come il bancone fatto di bauli e valigie impilate devono tradursi in dettagli dell'interfaccia (es. badge dei tavoli, contenitori delle card).
* **High-Contrast Social Accent:** Per evidenziare l'interazione dei tavoli (richieste, takeover e reaction) useremo tocchi di fucsia neon vibrante, derivati direttamente dai sottobicchieri reali del locale.
* **TV Readability First:** La decorazione deve essere subordinata alla leggibilità da 2-5 metri di distanza all'interno di un ambiente buio e caotico.

---

## 2. Observed Brand Facts

Questi sono i fatti grafici e materici reali documentati dalle fonti e dalle immagini di riferimento (`references/walrus-brand/`):

1. **Marchio Centrale:** Logo circolare nero con grafica e testi in bianco avorio. Al centro c'è la mascotte stilizzata di un tricheco con due baffi a manubrio arricciati all'insù e due zanne sporgenti verticalmente.
2. **Insegna Esterna:** Nera, con bordo superiore arcuato. Il testo "THE WALRUS PUB MILANO" ha un font display morbido, informale, stile hand-written.
3. **Pareti del Locale:** Muri interni in mattoni rossi/arancio a vista, con condutture esterne decorative in rame lucido.
4. **Il Bancone del Bar:** Composto da una combinazione di valigie e bauli vintage di vari colori (verde foresta, rosso scuro, nero e cuoio) con cinghie e borchie ottonate.
5. **Sottobicchieri Ufficiali:** Sfondo nero, illustrazione centrale in bianco/nero racchiusa da un cerchio esterno fucsia/rosa neon molto acceso.

---

## 3. Creative Choices

Ecco come traduciamo i fatti osservati in scelte di interfaccia utente (UI) per la Live TV Screen:

* **Sfondo e Texture (Dai mattoni e rame):** Sostituire il mesh mesh cyber con un gradiente radiale scuro incentrato sul mattone terroso e l'ambra, impreziosito da un filtro di rumore o disturbo fine (`noise`) per simulare la matericità di carta pressata, legno e muro. I divisori di sezione useranno un gradiente lineare metallico simile a tubi di rame.
* **Now Playing Card (Dall'insegna):** Il pannello della traccia corrente sarà incorniciato come l'insegna arcuata del pub, abbandonando il design flat. La barra di avanzamento simulerà un condotto in rame riempito di luce liquida ambrata.
* **Badges e Classifiche (Dal bancone bauli):** Il badge del tavolo o lo stato in coda sarà racchiuso in una grafica che richiama una piccola valigetta colorata (verde foresta, cuoio o rosso scuro) con piccole fibbie simulate in CSS.
* **Widget QR Code (Dai sottobicchieri):** La card del QR code della sidebar diventerà un cerchio perfetto nero con bordo fucsia vibrante ed effetto glow, emulando il sottobicchiere del Walrus posato sul tavolo.
* **Tipografia (Dall'insegna):** Proposta di abbinamento Google Fonts:
  * Titoli display e macro-badge: `Alfa Slab One` o `Arvo` (serif solidi e rustici).
  * Informazioni di lettura (artista, tempo, dediche): `Outfit` o `Inter`.

---

## 4. Assumptions / Hypotheses

* **Ipotesi 1 (Distanza di visione):** Assumiamo che la TV sia montata in alto nel locale (es. sopra le spine o su pareti perimetrali). Per questo motivo, ogni testo critico deve avere un contrasto superiore a 4.5:1 e dimensioni generose. La decorazione non deve MAI sovrapporsi al testo.
* **Ipotesi 2 (Contesto d'uso notturno):** Il pub ha luci basse. Una schermata troppo luminosa darebbe fastidio. La palette rimarrà rigorosamente scura (`charcoal` `#121212` come base), con la luce concentrata solo su Now Playing e QR Code.
* **Ipotesi 3 (Social Hype):** Il fucsia neon rappresenta il "trigger" dell'interazione social. Quando lo staff attiva un *Hype Trigger* o parte un *Song Takeover*, il fucsia prenderà temporaneamente il sopravvento sulla palette calda (ambra/rame), segnalando un evento eccezionale.

---

## 5. MVP / Demo Fake / Roadmap / Not Now

| Categoria | Elementi inclusi | Rationale |
| :--- | :--- | :--- |
| **MVP NOW** | Variante isolata `LiveTvScreenWalrus.jsx`. <br> Variabili CSS nel tema `.tv-walrus-variant` in `index.css`. <br> Tipografia rustica (Alfa Slab/Arvo). <br> Now Playing arcuato, QR tondo fucsia coaster, timeline rame/ambra. <br> Particelle calde (ambra/braci) al posto di quelle cyber. | Rispetta lo scope del brief: rebrand puramente stilistico e isolato su una variante della schermata TV. |
| **DEMO FAKE** | Badge virtuali "Tricheco di Serata" o "Tavolo Hype" nella lista della coda. <br> Sezione statica "Drink Consigliato dello Staff" nella sidebar (es. *Bassa Marea Pils* o *Espresso Martini*). | Utile per mostrare al proprietario o al SMM il potenziale commerciale, senza logiche dinamiche. |
| **ROADMAP** | Transizioni animate dei baffi del tricheco come loader. <br> Animazione fumo/vapore sopra le card per emulare il pub caldo. <br> Switcher dinamico di temi (Club/Pub/Cinema) dalla dashboard. | Feature più complesse che richiedono un design degli asset SVG più dettagliato o stati aggiuntivi. |
| **NOT NOW** | Modifiche a Supabase, Spotify API, o routing globale. <br> Logiche di pagamento, ordini tavoli o POS. <br> Modifica alle schermate Customer/Staff. | Vincolo tassativo del progetto per preservare la stabilità del core e non fare scope creep. |

---

## 6. Visual Hierarchy

1. **Focus Primario (Now Playing):** Il titolo del brano, la cover e il Tavolo richiedente devono occupare almeno il 60% della larghezza utile della TV. Devono attirare l'occhio all'istante tramite scala e bagliore ambrato.
2. **Focus Secondario (QR Code Coaster):** Posizionato in alto a destra nella sidebar. Essendo la Call To Action per far partecipare i clienti, deve risaltare grazie al bordo fucsia retroilluminato.
3. **Contenuto Terziario (Coda Richieste):** Sotto il QR Code, ordinata, con badge tavolo color valigia vintage.
4. **Livello di Sfondo (Ticker Dediche):** In basso, a scorrimento lento, con aspetto di lavagna scura o tubo di rame.

---

## 7. TV Readability Evaluation

* **Rapporto di Contrasto:** Il testo principale userà `--walrus-white-warm` (`#F7F5F0`) su sfondi `--walrus-charcoal` (`#121212`), garantendo un contrasto eccellente.
* **Elementi da Ingrandire:** La dicitura "Richiesto dal Tavolo X" deve passare da 14px a 20px o più, usando il font Display per essere decifrabile al volo.
* **Elementi da Ridurre/Semplificare:** Rimuovere la dicitura generica "WALBOX SYSTEM / Live Venue Audio". Al suo posto inserire un badge sobrio "WALRUS LIVE SHUFFLE" con il logo circolare del tricheco stilizzato.

---

## 8. Visual Rules

1. **No Flat Design:** Ogni pannello deve avere un'ombreggiatura morbida e sfocata color rame (`rgba(212, 137, 82, 0.15)`) o ambra, e un bordo sottilissimo metallico.
2. **Limitazione Neon:** Il fucsia neon (`#FF1493`) è riservato esclusivamente a:
   * Bordo esterno del QR Coaster.
   * Schermata di Takeover (prossimo brano).
   * Overlay delle Reaction temporanee dello staff.
3. **Texture Organiche:** Applicare alle card e allo sfondo la grana fine in CSS (grigio scuro su nero) per eliminare la sensazione di "schermo LCD da ufficio".

---

## 9. Copy/Microcopy Rules

* **Voce del Locale:** Niente testi asettici. Sostituire le etichette con espressioni da bancone:
  * "Jukebox in Attesa" $\rightarrow$ "Banco in attesa di richieste. Fai la prima mossa!"
  * "Prossimi in coda" $\rightarrow$ "Prossimi al bancone 🍻"
  * "Dedica del tavolo" $\rightarrow$ "Al tavolo dicono che... 💬"
* **Evitare termini tecnici:** Niente parole come "Playback", "Playlist", "Queue", "System", "Status". Usare "Musica", "Serata", "Banco", "Coda", "Hype".

---

## 10. Motion/Interaction Rules

* **Particelle Atmosferiche:** Sostituire le particelle fluttuanti cyber-cyan con piccole scintille dorate/arancioni (effetto braci del camino o bollicine di birra) che salgono dal basso molto lentamente.
* **Flicker Neon Controllato:** All'avvio del *Song Takeover*, il pannello del brano in arrivo deve avere una micro-animazione di accensione a sfarfallio (2 decimi di secondo) tipica delle insegne neon vintage.
* **Equalizzatore Morbido:** Ridurre la velocità dell'animazione delle barre dell'equalizzatore premium per non distrarre eccessivamente l'occhio dallo schermo.

---

## 11. Variant Recommendation

Per non compromettere la versione stabile dell'app, **non si deve sovrascrivere `LiveTvScreen.jsx`**.
1. Il Frontend Agent creerà un nuovo file isolato: `src/pages/LiveTvScreenWalrus.jsx`.
2. Il file importerà le stesse logiche di stato (mock data, storage listener, reaction, takeover) ma utilizzerà un markup HTML e classi orientate al tema Walrus.
3. Tutte le nuove classi di stile saranno inserite in fondo a `src/index.css` racchiuse sotto il selettore `.tv-walrus-variant` o prefissate con `.walrus-tv-`.

---

## 12. Frontend Agent Handoff

```md
# FRONTEND AGENT HANDOFF — Live TV Screen Walrus Variant

## From
Creative Director Agent

## To
Frontend Agent

## Task Type
Rebrand / UI Polish / Nuova Variante Isolata

## Target Files
- [NEW] src/pages/LiveTvScreenWalrus.jsx
- [MODIFY] src/index.css

## Goal
Creare la variante "Walrus Pub" per la Live TV Screen applicando la palette calda materica
(charcoal, rame, mattone, ambra, fucsia social) e la tipografia display rustica.

## Must Change
1. Creare src/pages/LiveTvScreenWalrus.jsx copiando la logica di LiveTvScreen.jsx ma
   sostituendo il layout visivo e le classi CSS con la variante Walrus.
2. In index.css, aggiungere le variabili del brand Walrus e le classi per la variante.
3. Sfondo: gradiente radiale ambrato/mattone scuro con effetto grain/noise.
4. Now Playing: card ad arco (come l'insegna), timeline in rame metallico, eq ambrato.
5. QR Code Card: contenitore circolare nero con bordo neon fucsia pulsante (coaster style).
6. Badge Tavoli: icone stilizzate di valigie vintage colorate (verde foresta, cuoio, rosso).
7. Tipografia: Importare Google Fonts (Alfa Slab One o Arvo) per i titoli principali.

## Must Preserve
- Tutta la logica di React: useState, useEffect, useRef.
- La gestione del localStorage (storage listener per tv_reaction).
- L'effetto takeover (durata 4s, stato showTakeover).
- Il calcolo dei brani in coda (approvedQueue).

## Do Not Touch
- src/pages/LiveTvScreen.jsx (la versione stabile attuale non va toccata).
- App.jsx e il sistema di routing (lo switcher o il test della variante avverranno tramite indirizzo URL o mock diretto).
- src/data/mockData.js o altri servizi/database.

## Test Instructions
- Aprire la route della TV e verificare che la nuova variante si veda correttamente a 1080p.
- Simulare un cambio canzone per attivare il takeover con stile vintage poster.
- Attivare una reaction dalla Staff Dashboard e verificare l'overlay di Hype/Cheers/Party con lo stile corretto.
- Verificare la leggibilità di testi e tabelle simulando una distanza di 3 metri dallo schermo.

## Stop Condition
Fermati e chiedi istruzioni se per completare il task ritieni di dover modificare App.jsx,
modificare i file di backend o alterare il data model di mockData.js.
```

---

## 13. QA Visual Checklist

### Brand Fit (Coerenza del Brand)
* [ ] I colori dominanti sono `--walrus-charcoal` (#121212), ambra e rame.
* [ ] Il fucsia neon è usato solo per elementi social e reaction ad alto impatto.
* [ ] L'interfaccia non sembra una SaaS dashboard fredda o una console techno.
* [ ] I badge ricordano valigie vintage e il QR ricorda un sottobicchiere del pub.

### Product & TV Clarity (Chiarezza visiva da lontano)
* [ ] Now Playing domina la scena ed è leggibile da almeno 3 metri.
* [ ] I titoli e gli artisti non si sovrappongono ad altri elementi decorativi.
* [ ] Il testo scorrevole del ticker delle dediche ha una velocità di lettura confortevole.
* [ ] Il QR code è facilmente scansionabile anche con riflessi o da angolazioni angolate.

### Copy & Microcopy
* [ ] Niente termini tecnici come "playback state", "queue index", "system log".
* [ ] Tono amichevole ed evocativo del pub ("Prossimi al bancone", "Al tavolo dicono...").

### Motion & Particles
* [ ] Le particelle sembrano scintille calde o bollicine ambrate, non elementi cyber.
* [ ] Le animazioni di transizione (takeover, reaction) non causano lag grafici.

---

## 14. Stop Conditions

Il Frontend Agent deve interrompere immediatamente il lavoro e chiedere assistenza se:
1. Viene richiesta la modifica o la cancellazione del file `src/pages/LiveTvScreen.jsx` originale.
2. Si rende necessario installare pacchetti npm aggiuntivi per icone o animazioni.
3. Si riscontrano problemi di sincronizzazione delle reaction tramite localStorage che richiedono modifiche a `mockData.js`.

---

## 15. Next Step — Single

Il prossimo passo operativo è:
**Presentare questo brief al CEO/user per ottenere l'approvazione formale prima di delegare il compito al Frontend Agent per la creazione della variante.**
