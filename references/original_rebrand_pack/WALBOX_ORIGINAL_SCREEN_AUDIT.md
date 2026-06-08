# Walbox Original Screen Audit - Analisi Estetica delle Schermate

Questo documento analizza in dettaglio ogni singola schermata della vecchia Walbox originale, estraendone le caratteristiche visive, i componenti d'interfaccia e fornendo linee guida su cosa preservare o evitare.

---

## 1. Schermata di Ingresso (Entry Screen)
Implementata principalmente in `CustomerEntryWalrusUpgrade.jsx` (con una variante retrò in `CustomerEntryInsegna.jsx`).

### Analisi Visiva:
*   **Sfondo**: Un gradiente scuro molto caldo `linear-gradient(180deg, #331100 0%, #1a0800 100%)` che dà l'idea dell'interno di un pub rustico in legno scuro.
*   **Sezione Hero**:
    *   Logo circolare al centro (`walrus-logo2.png`) con bordo spesso arancione neon (`#ff6600`) e bagliore esterno `box-shadow: 0 0 40px rgba(255, 102, 0, 0.4)`.
    *   Sticker inclinato di 8 gradi in stile etichetta punk/merch con scritta "**ALWAYS THE FUCKING WALRUS**", colore arancione su sfondo nero e ombra solida color crema (`#fffdd0`).
    *   Titolo principale "**THE WALBOX**" in colore crema `#fffdd0`, font-size elevato, peso 950 e ombra solida nera traslata (`4px 4px 0 #000`).
    *   Sottotitolo "**TRICHECO MUSIC EXPERIENCE**" in arancione, peso 900, con spaziatura espansa (`letter-spacing`).
*   **Step Progress Bar**: Barra di navigazione orizzontale racchiusa in un box nero semitrasparente (`rgba(0,0,0,0.5)`) con bordo arancione sottile. Mostra i 5 passi: `ENTRA → SCEGLI → DEDICA → SALA VAR → TV LIVE`, evidenziando in arancione lo step corrente.
*   **Form Centrale (Il "Bancone")**:
    *   Contenitore rettangolare scuro `#1c0a00` con bordo spesso arancione arricchito da un bordo superiore ancora più spesso (`5px solid #ff6600`), che ricorda il piano di un bancone del pub.
    *   Input per Tavolo e Nickname con sfondo trasparente scuro, testo bianco e bordino arancione.
    *   Bottone d'azione primario "**ENTRA NEL WALBOX**" di colore arancione brillante con ombra 3D solida di colore arancione scuro/marrone (`#cc5200`), che si schiaccia leggermente al click (`whileTap`).
*   **Area Staff (Backstage)**: Pulsanti discreti a fondo pagina ad opacità 0.3 per accedere alla dashboard di regia o alla TV.

---

## 2. Schermata Jukebox Cliente (Customer Jukebox Screen)
Implementata in `CustomerJukeboxOldOrange.jsx`.

### Analisi Visiva:
*   **Layout**: Struttura mobile-first con larghezza massima di `600px` (centrata su desktop). Il flusso è diviso in step per evitare di sovraccaricare lo schermo.
*   **Header Sticky**: Di colore nero assoluto con bordo inferiore arancione spesso (`4px solid #ff6600`). Contiene il logo del locale miniaturizzato, il titolo "THE WALBOX" e un tasto di logout/indietro circolare a sinistra.
*   **Input di Ricerca**: Campo alto 55px con bordo spesso arancione neon e ombra piatta nera (`box-shadow: 6px 6px 0 #000`). Icona di ricerca arancione all'interno.
*   **Badges di Categoria (Mood Teaser)**: Tag rettangolari piatti con testo nero su sfondi crema, arancione o nero con bordi neri e ombre 3D solide (`box-shadow: 5px 5px 0 #000`).
*   **Card della Canzone (Song Card)**:
    *   Box rettangolare in legno scuro `#1a0a00` con bordo arancione e ombra solida nera (`8px 8px 0 #000`).
    *   In alto a sinistra presenta una label arancione a contrasto per definire la playlist (es. "CLASSICI DA PUB", "I PIÙ SCELTI").
    *   Copertina dell'album quadrata con bordo nero e un badge "+" sovrapposto ad angolo con effetto 3D crema.
    *   Sullo sfondo, un'icona del tricheco in filigrana semitrasparente al 5% ad opacità arancione.
*   **Griglia dei Mood (Mood Selection)**:
    *   Due colonne di pulsanti quadrati con bordo arancione e sfondo semitrasparente.
    *   Ogni mood ha un'icona emoji gigante e copy totalmente personalizzato (es. `CAVALLOOOO 🐴`, `STA SALENDO MALE 📈`).
    *   Al click, il mood si colora interamente di arancione, il testo diventa nero, compare una cornice crema spessa (`4px solid #fffdd0`) e si attiva un pallino fucsia ad angolo come indicatore.
*   **Area Dedica (Dedication Input)**:
    *   Textarea in stile console monospazio (`font-family: monospace`) con bordo arancione e contatore di caratteri integrato ad angolo (`0/80`).
*   **Pulsante d'Invio**: Pulsantone arancione ad altezza maggiorata (60px-80px) con bordo nero spesso e ombra solida nera proiettata di 8px.
*   **Modale di Successo (Popup)**:
    *   Schermata interamente nera al 95% con effetto sfocato.
    *   Il modale ha un bordo arancione spesso (`5px solid #ff6600`) e mostra il titolo "**CHE CAVALLOOOO 🐴**" in arancione peso 950.
    *   Messaggio di conferma: *"Richiesta inviata alla Sala VAR. Se Rocchi approva, ti mandiamo live da Lissone."*
    *   Tasto di chiusura: "**OK, MI DISSOCIO**".

---

## 3. Schermata di Caricamento (Loading Screen)
Implementata in `LoadingScreen.jsx`.

### Analisi Visiva:
*   **Sfondo**: Gradiente radiale dal grigio scuro `#222` al nero assoluto `#0a0a0a`.
*   **Immagine Centrale**: L'illustrazione premium `walrus-budda-cocktail.png` inserita all'interno di una cornice arrotondata con bordo giallo-oro e glow radiali. L'immagine oscilla dolcemente su e giù tramite animazioni Framer Motion.
*   **Badge Speciale**: Un badge rosa fucsia/magenta con scritta "**ZEN MODE**" inclinato di 15 gradi, con bordo bianco spesso ed effetto ombra fucsia sfocata (`box-shadow: 0 6px 20px rgba(255, 0, 127, 0.6)`).
*   **Testi**:
    *   Titoli superiori allineati con lo stile della login.
    *   Testo inferiore: *"IL TRICHECO STA CARICANDO LA PROSSIMA HIT... Caricamento birra vibes... Problemi fuori, birre dentro"*.

---

## 4. Schermata TV Live (Live TV Screen)
La perla estetica del progetto originale. Implementata in `LiveTvScreen.jsx` e `LiveTvScreenAltPoster.jsx`.

### Analisi Visiva (Layout "Cinematic"):
*   **Sfondo Sfuocato Dinamico (Ambient Glow)**: La copertina della canzone in riproduzione viene renderizzata a schermo intero ad opacità 0.3, sfocata con un filtro pesante (`blur(50px) saturate(1.4) brightness(0.6)`) e ingrandita. Crea un'atmosfera immersiva da club che cambia colore a seconda della canzone.
*   **Effetto Monitor CRT**: Una texture a righe orizzontali sottili (scanlines) sovrapposta a tutto lo schermo (`opacity: 0.3`) che simula una televisione analogica o una regia calcistica.
*   **Ticker TV Superiore (Marquee)**:
    *   A sinistra, un box arancione neon con scritta nera "**WALBOX TV / LIVE SCREEN**" in font Oswald Bold, separato da una riga nera spessa.
    *   Al centro, una barra nera dove scorre un testo in giallo-oro brillante `#ffcc00` ad altezza 2rem: *"CHE CAVALLOOOO 🐴 • STA SALENDO MALE • ALWAYS THE FUCKING WALRUS 🦭 • CORTO MUSO..."*. L'animazione è fluida ed infinita.
*   **Layout a Due Colonne (Split Screen)**:
    *   **Colonna Sinistra (Now Playing - 70% di larghezza)**:
        *   Copertina gigante della canzone al centro con bordo arancione pesante ed effetto ombra pulsante a neon (`box-shadow` variabile tra 30px e 70px arancione).
        *   Sticker rotondo color crema per l'emoji del mood (`🐴`, `🦭`, ecc.) adagiato sopra la copertina ad angolo, con bordo nero spesso e ombra arancione.
        *   Titolo della canzone in carattere gigantesco (`fontSize: 7.2rem`) di colore bianco con doppia ombra solida arancione e nera (`textShadow: 4px 4px 0 #ff6600, 8px 8px 0 #000`).
        *   Cartello Dedica: Un box nero opaco al 95% con bordo sinistro arancione spesso (`15px solid #ff6600`) che contiene due tag stile etichette vintage ("DA: [Nickname]", "TAVOLO: [Numero]") e il testo della dedica in formato gigante `"“Messaggio”"`.
        *   Applausometro: Un set di reazioni social fluttuanti colorate sotto il cartello.
    *   **Colonna Destra (Sidebar - 30% di larghezza)**:
        *   Contenitore grigio scuro semitrasparente separato da una linea arancione di 6px.
        *   **Coda Imminente (Up Next)**: Lista dei successivi 3 brani approvati. Il primo in lista ha un bordo verde Spotify e una targhetta arancione con scritto "PROSSIMO BRANO". Se la coda è vuota, compare un'emoji piangente gigante con il testo *"IL JUKEBOX PIANGE. MANDA UNA HIT"*.
        *   **Classifica Trichechi**: Tabella dei punteggi del locale con cornici tratteggiate arancioni e scritte dorate.
        *   **Breaking Nius**: Box nero con bordo arancione e scritte in giallo che ruota messaggi irriverenti (es. *"La birra piccola non conta"*, *"Se ordini una piccola il bancone ti guarda male"*).
*   **Footer**: Una fascia arancione spessa in fondo alla TV con scritte nere giganti che spiegano come usare l'app: `QR AL TAVOLO → SCEGLI LA HIT → LA SALA VAR DECIDE`.

---

## 5. Elementi Visuali Chiave da Preservare
Questi dettagli definiscono l'identità unica di Walbox e devono essere ricreati in V2:
1.  **L'effetto 3D flat/sticker**: Ombre solide senza sfocatura di colore nero (`#000`), crema (`#fffdd0`) o arancione (`#ff6600`) abbinate a bordi spessi neri.
2.  **I gradienti cioccolato/arancio**: `linear-gradient(180deg, #331100 0%, #1a0800 100%)`.
3.  **Il layout "Split Screen" della TV** con Now Playing gigante a sinistra, Sidebar a destra e Ticker scorrevole in alto.
4.  **L'effetto CRT Scanlines** e l'**Ambient Glow** sfuocato dello sfondo TV.
5.  **Il design del "Cartello Dedica"** con il bordo sinistro arancione da 15px.
6.  **I sticker tondi o rettangolari ruotati** di qualche grado (es. sticker "ALWAYS THE FUCKING WALRUS" e badge "ZEN MODE").

---

## 6. Elementi da NON Copiare (Legati alla Vecchia Logica)
Queste parti del codice originale sono accoppiate a logiche obsolete e non devono essere importate in V2:
1.  **I variant selector della TV**: Il pulsante in cima alla TV che scambiava al volo i vari stili (`cinematic`, `old`, `clean`, `poster`) modificando lo stato locale. V2 deve avere un unico stile TV pulito e coerente basato sul look cinematic/poster.
2.  **La logica di polling di Spotify integrata in `App.jsx`**: Il controllo temporizzato di riproduzione locale per allineare lo stato del database deve rimanere delegato ai servizi backend della nuova architettura V2.
3.  **La gestione del reset del database nel manager (`ManagerDashboard.jsx`)**: La logica di pulizia sincrona tramite mock locali.
4.  **L'integrazione diretta dell'API di Spotify nel client**: Chiamate come `searchTrack` o `getCurrentPlayback` all'interno dei componenti React del client. V2 deve usare la sua astrazione di rete.
5.  **I dati mockati in linea**: La mappatura manuale dei mood e delle canzoni all'interno delle schermate.
