# Review Operativa Brand: The Walrus Pub (Milano) per Walbox V2

**Versione:** 1.0  
**Ruolo:** Walrus Brand Intelligence / Visual Analyst Agent  
**Modalità:** READ-ONLY (Analisi e Pianificazione - Nessuna modifica al codice sorgente)  
**Data:** 3 Giugno 2026  

---

## 1. Sintesi Visiva del Brand Walrus

### Fatti Osservati
* **Marchio Centrale:** Il logo è circolare, nero con grafica e testi bianchi (nella versione insegna) o metallico spazzolato inciso e retroilluminato (all'interno). Al centro spicca la testa stilizzata di un tricheco caratterizzato da due enormi baffi a manubrio arricciati all'insù e due zanne appuntite verticali sporgenti verso il basso.
* **Insegna Esterna:** Di colore nero opaco con bordo superiore arcuato. Il testo "THE WALRUS PUB MILANO" utilizza un carattere custom di tipo display/hand-written, morbido e leggermente informale. Ai lati sono presenti due loghi tondi con l'icona del tricheco.
* **Bancone del Bar:** La parte frontale del bancone è composta da una composizione unica di valigie e bauli vintage impilati di diversi colori (verde foresta scuro, rosso scuro, nero e cuoio) con cinghie in pelle, borchie e finiture in metallo ottonato/dorato. Il top del bancone è in legno massiccio scuro.
* **Pareti:** Muro perimetrale interamente in mattoni rossi/arancio a vista, solcato da tubazioni e canaline in rame lucido per i cablaggi elettrici.
* **Dettagli Pop:** I sottobicchieri ufficiali presentano un anello perimetrale fucsia acceso/rosa neon che racchiude una complessa illustrazione circolare in bianco e nero.

### Ipotesi Creative
* **Fusione Retro-Moderno:** L'estetica del pub unisce il calore e la storicità del legno, del mattone e dei bauli con tocchi grafici decisi (il font dell'insegna, i coaster fucsia). Walbox V2 non deve sembrare un'applicazione flat e asettica, ma deve riprodurre questa tridimensionalità calda e materica.
* **Il Tricheco come Mascotte Dinamica:** Le zanne e i baffi del tricheco sono geometrie forti che possono servire per gli indicatori di stato (loader, animazioni di transizione, icone di approvazione) all'interno dell'interfaccia.

---

## 2. Palette Reale Percepita

L'analisi visiva delle immagini in `references/walrus-brand/` evidenzia i seguenti colori chiave, mappati in variabili CSS provvisorie per l'implementazione:

```css
:root {
  /* Toni di Sfondo e Struttura */
  --walrus-charcoal: #121212;       /* Il nero profondo dell'insegna e dei sottobicchieri */
  --walrus-white-warm: #F7F5F0;     /* Il bianco avorio delle scritte dell'insegna e dei menu */
  
  /* Toni Caldi Materici */
  --walrus-brick-red: #9E3F2B;      /* Il rosso terroso dei mattoni a vista */
  --walrus-copper: #D48952;         /* Il rame lucido dei tubi interni e della rubinetteria */
  --walrus-amber-beer: #FFBF00;     /* Il colore dorato/ambrato della birra e delle luci soffuse */
  
  /* Toni degli Elementi Vintage (Bancone Bauli) */
  --walrus-trunk-green: #37533D;    /* Verde foresta spento delle valigie */
  --walrus-trunk-brown: #5C4033;    /* Cuoio/marrone scuro delle valigie */
  
  /* Accenti Social & Hype (Dalle foto reali dei Coaster) */
  --walrus-neon-fuchsia: #FF1493;   /* Rosa/fucsia neon dei sottobicchieri e dei dettagli social */
}
```

* **Separazione Fatti/Ipotesi:** La palette riprende esattamente le dominanti cromatiche estratte dai pixel delle immagini di riferimento (fatti). L'applicazione di questi colori come variabili strutturate CSS per la UI di Walbox V2 è la traduzione progettuale proposta (ipotesi creativa).

---

## 3. Materiali e Texture Ricorrenti

### Fatti Osservati
1. **Mattone Rosso/Arancio Terroso:** Parete a secco con fughe cementizie.
2. **Legno Scuro Lucidato:** Finitura del piano del bancone e mensole dei liquori.
3. **Rame/Metallo Satinato:** Condutture esterne decorative e protettive, impianto di spillatura delle birre.
4. **Pelle/Cuoio e Metallo Vintage:** Bauli, valigie, cinghie, fibbie e borchie.
5. **Vetro Trasparente / Effetto Glow:** Bottiglie retroilluminate da strisce LED calde e bicchieri da birra.

### Ipotesi Creative per la UI
* **Design Materico Non-Flat:** Utilizzo di ombreggiature sfocate color ambra o rame per dare tridimensionalità alle card.
* **Effetto "Glassmorphism" Caldo:** Le modali e i popup della UI mobile possono sfruttare uno sfondo traslucido sfocato (`backdrop-filter: blur()`) abbinato a un gradiente radiale ambrato/mattone, simulando la vista attraverso i bicchieri da birra o le bottiglie retroilluminate del bancone.
* **Separatori Personalizzati:** Sostituire le linee di divisione standard con sottili gradienti lineari che richiamino l'effetto metallico dei tubi di rame.

---

## 4. Atmosfera Dominante

### Fatti Osservati
* **Urban Pub Accogliente:** Non è un locale algido o asettico; l'arredamento è denso, ricco di oggetti (la testa di moro, il teschio sul banco, le etichette delle birre disegnate).
* **Illuminazione Intima:** Punti luce concentrati sul banco e retroilluminazione caldissima dei loghi e delle bottiglie, lasciando le zone circostanti in una penombra confortevole.
* **Dettagli Ironici/Pop:** Sottobicchieri accesi, spine con rubinetti colorati e illustrati, frasi d'impatto.

### Ipotesi Creative per Walbox
* **La UI come Prolungamento del Locale:** L'interfaccia utente deve sembrare "vissuta". Si consiglia di applicare una texture di disturbo (noise/grana fine) sullo sfondo scuro per emulare la matericità del legno o del cartone pressato dei sottobicchieri.
* **Transizioni Neon:** Gli indicatori di stato (come la canzone attualmente in riproduzione o il tavolo più attivo) possono avere micro-animazioni di sfarfallio (neon flicker) all'attivazione.

---

## 5. Elementi Iconici da Portare in Walbox

### Fatti Osservati
* La forma circolare del logo e l'illustrazione del tricheco (baffi a manubrio e due zanne).
* I sottobicchieri neri con cerchio rosa neon/fucsia.
* Le valigie vintage impilate nel bancone.
* I tubi di rame.

### Ipotesi Creative di Traduzione UI
1. **Il Pulsante "Coaster" (Mobile):** Il pulsante primario per inviare una richiesta musicale o una reaction sul telefono dell'utente deve riprodurre la forma del sottobicchiere reale: tondo, con sfondo nero opaco, bordo fucsia luminescente e l'icona stilizzata del tricheco al centro.
2. **I Baffi come Loader:** Nelle transizioni di caricamento o nell'attesa dell'approvazione della canzone da parte del banco, mostrare un'animazione dei baffi a manubrio del tricheco che oscillano.
3. **Le Valigie dei Tavoli (TV & Staff):** Nella classifica dei tavoli o nella coda delle richieste, associare ad ogni tavolo un'icona di valigia vintage colorata (verde, rossa o cuoio), richiamando la struttura fisica del bancone.
4. **La Barra di Progresso in Rame:** La timeline del brano "Now Playing" sulla TV può essere resa graficamente come un tubo metallico di rame lucido che si riempie di luce dorata man mano che la canzone avanza.

---

## 6. Cosa NON Usare o Evitare

* **NO a Colori Freddi Dominanti:** Bandire ciano, blu elettrico techno, grigi metallici asettici e sfondi completamente bianchi. Infastidirebbero l'occhio dei clienti all'interno della penombra del locale e ne tradirebbero l'atmosfera.
* **NO a Layout Flat ed Estetiche SaaS:** Evitare di far somigliare lo Staff Dashboard o la TV a un foglio Excel o a una dashboard analitica aziendale (niente griglie standard o bottoni piatti grigio chiaro).
* **NO a Animazioni Frenetiche/Stroboscopiche:** Il locale è un pub accogliente per amici, birra e cocktail, non un club notturno techno. Le animazioni devono essere fluide, calde e non invasive.
* **NO a Inside Jokes Non Convalidati come Testi Hardcoded:** Espressioni come "CAVALLOOOO" o "OSCAR" (rilevate nei post social) sono divertenti ma vanno gestite come easter egg o personalizzazioni opzionali, non come testi bloccanti dell'interfaccia.

---

## 7. Regole Visuali per Walbox V2

1. **Sfondo Sempre Scuro:** L'applicazione (mobile e TV) deve operare esclusivamente in dark mode personalizzata. Sfondo base: `--walrus-charcoal` (#121212) con overlay radiali caldi.
2. **Uso Rigido del Colore di Accento:** 
   * **Ambra Birra:** Per evidenziare lo stato attivo standard (tempo traccia, testi principali, icone attive).
   * **Fucsia Neon:** Da usare rigorosamente per stati ad alta priorità, avvisi temporanei, notifiche di "Takeover" (quando un brano scavalca la coda) e reaction flash.
3. **Tipografia Distintiva:** 
   * Per i titoli principali (es. "Now Playing", "Tavolo 5 in Hype"): un font slab-serif o display rustico come *Alfa Slab One* o *Arvo* (caricabili da Google Fonts).
   * Per i testi di lettura e le liste: un sans-serif moderno e pulito come *Outfit* o *Inter*.
4. **Bordi Smussati Coerenti:** Card e box devono avere un `border-radius` marcato (16px o 24px) con bordi dorati o ramati sottilissimi.

---

## 8. Schermate da Brandizzare per Prime

1. **Live TV Screen (`src/pages/LiveTvScreen.jsx`):**
   * Deve ospitare uno sfondo caldo basato sul gradiente del mattone terroso e dell'ambra.
   * Il box del "Now Playing" deve essere incorniciato come l'insegna circolare luminosa del pub.
   * La lista dei brani in coda deve scorrere all'interno di elementi grafici che ricordano i ripiani in legno del bancone o bauli vintage.
2. **Customer Entry Screen (`src/pages/CustomerEntry.jsx`):**
   * La schermata di accoglienza sul cellulare deve riprodurre la facciata esterna del pub: un'insegna nera arcuata retroilluminata con scritte bianche calde che recita: *"Stay Thirsty, Stay Walrus — Entra nella famiglia dei trichechi"*.
3. **Customer Request Screen (`src/pages/CustomerRequest.jsx`):**
   * La schermata dove il cliente invia richieste.
   * Il pulsante centrale per inviare richieste deve essere il "sottobicchiere interattivo" (tondo, bordo fucsia vibrante).
   * La selezione dei mood deve utilizzare nomi ispirati al pub (es. *"Birra in Mano"*, *"Aperitivo Serio"*, *"Sta Salendo Male"*).

---

## 9. Handoff al Creative Director

> [!NOTE]
> **Concetto Visivo Guida:** *"Industrial-Eccentric Cozy Pub"*
> L'estetica deve sposare la tradizione industriale milanese (rame, mattoni) con l'originalità del vintage (il bancone a valigie) e l'energia pop delle serate (sottobicchieri fucsia).

### Asset Richiesti
1. **Definizione Font:** Selezionare e testare l'abbinamento tra un font display rustico (es. *Alfa Slab One* / *Special Elite*) per i titoli e *Outfit* per i testi.
2. **Set di Icone Personalizzate:** Creare o stilizzare icone vettoriali per:
   * Mascotte Tricheco (versione base, versione approvazione, versione hype).
   * Categorie Drink, Birra e Panino coerenti con le icone del menu del sito web.
   * Valigie colorate per identificare i tavoli.
3. **Copy Guidelines:** Adottare un tono amichevole, diretto e leggermente ironico. Sostituire le diciture tecniche con espressioni da bancone (es. *"La tua richiesta è in viaggio verso il banco"*).

---

## 10. Handoff al Frontend Agent

> [!IMPORTANT]
> **Direttive per lo Sviluppo CSS e UI (Non modificare la logica di stato)**
> * Modificare esclusivamente la parte stilistica (CSS custom properties, classi di stile e markup visuale).
> * Non toccare le integrazioni Supabase, Spotify o la logica dei componenti React.

### Struttura CSS Consigliata (`src/index.css`)
```css
/* Custom Properties per il Brand Walrus */
:root {
  --color-walrus-dark: #121212;
  --color-walrus-light: #F7F5F0;
  --color-walrus-amber: #FFBF00;
  --color-walrus-brick: #9E3F2B;
  --color-walrus-copper: #D48952;
  --color-walrus-fuchsia: #FF1493;
  
  --font-walrus-title: 'Alfa Slab One', 'Arvo', serif;
  --font-walrus-body: 'Outfit', sans-serif;
}

/* Texture di Sfondo Calda per la TV */
.walrus-tv-bg {
  background: radial-gradient(circle at center, rgba(158, 63, 43, 0.2) 0%, #121212 100%);
  background-color: var(--color-walrus-dark);
  position: relative;
  overflow: hidden;
}

/* Pulsante Sottobicchiere Interattivo */
.walrus-btn-coaster {
  background-color: var(--color-walrus-dark);
  border: 4px solid var(--color-walrus-fuchsia);
  color: var(--color-walrus-light);
  border-radius: 50%;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 15px rgba(255, 20, 147, 0.4);
  transition: transform 0.2s, box-shadow 0.2s;
}
.walrus-btn-coaster:active {
  transform: scale(0.95);
  box-shadow: 0 0 5px rgba(255, 20, 147, 0.2);
}
```

---

## 11. Prossimo Step Singolo

1. **Creazione del file di piano d'azione per l'implementazione visiva:**
   Iniziare la stesura di un piano dettagliato per aggiornare `src/index.css` e integrare le classi visuali e le variabili CSS all'interno di `CustomerEntry.jsx`, `CustomerRequest.jsx`, e `LiveTvScreen.jsx` senza intaccare il codice logico, pronto per la sottomissione al Creative Director e al Frontend Agent.

---

## 12. Stop Condition & Rilevamento Assenze

### Stato dei Visual Reference
Le immagini fornite nella cartella `references/walrus-brand/` sono di ottima qualità e coprono egregiamente l'insegna, i materiali interni (mattoni, bancone-valigie, rame) e lo stile del servizio (sottobicchieri, birra, cibo). 

### Cosa Manca (Identificato ai fini dell'ottimizzazione TV)
* **Foto/Screenshot della TV fisica installata nel locale:**
  * **Perché manca:** Per progettare al meglio il layout della `LiveTvScreen` è fondamentale sapere dove lo schermo è posizionato fisicamente nel locale (es. sopra la spillatura, su una parete laterale, altezza dal suolo) e la distanza media di visione dei tavoli.
  * **Impatto pratico:** Senza questa informazione, dovremo assumere una risoluzione standard 1080p in orientamento orizzontale e dimensioni dei caratteri ad alto contrasto generiche. Se la TV reale fosse posizionata in un angolo stretto o avesse un formato differente, l'usabilità ne risentirebbe.
  * **Azione correttiva:** Richiedere questa specifica o una foto del contesto TV al locale prima di finalizzare i fogli di stile definitivi.
