# Walbox From Zero V2 - Manuale Operativo di Rebranding

Questo manuale contiene istruzioni passo-passo destinate a un agente AI (o a uno sviluppatore frontend) per applicare l'identità visiva della vecchia Walbox originale all'interno del nuovo progetto **Walbox From Zero V2**.

> [!IMPORTANT]
> **REGOLA FONDAMENTALE:**
> *Walbox From Zero V2* deve rimanere l'unica base logica, architetturale e funzionale del progetto. La vecchia app originale deve essere utilizzata **esclusivamente come riferimento estetico e visivo**.
> Non copiare la vecchia logica della coda, del routing o dello stato. Trasferisci solo font, palette colori, componenti visuali, asset statici e il tono ironico del copy.

---

## Piano di Lavoro in Micro-Step

Di seguito sono riportati i passaggi sequenziali per effettuare il rebrand di V2. Ciascun passo include il livello di rischio, le istruzioni operative e il modello Antigravity consigliato.

---

### Step 1: Configurazione Font e Variabili CSS Globali
*   **Livello di Rischio**: Basso (nessun impatto sulla logica dell'applicazione).
*   **Modello Consigliato**: Modello Veloce / Default (Gemini 3.5 Flash o equivalente).

#### Istruzioni Operative:
1.  Apri il file `index.html` del progetto V2 e inserisci l'importazione di Google Fonts all'interno del tag `<head>`:
    ```html
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800;900&family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">
    ```
2.  Apri il file CSS globale di V2 (solitamente `src/index.css` o `src/styles/global.css`) e dichiara le variabili CSS estratte:
    ```css
    :root {
      --color-bg: #121212;
      --color-surface: #1e1e1e;
      --color-surface-light: #2c2c2c;
      --color-primary: #f5a623;
      --color-accent: #ff4d00;
      --color-social: #ff007f;
      --color-text: #ffffff;
      --color-text-muted: #a0a0a0;
      
      --font-base: 'Montserrat', sans-serif;
      --font-display: 'Oswald', sans-serif;
    }
    ```
3.  Applica `font-family: var(--font-base)` come stile predefinito a tutto il corpo del documento (`*`, `body`) e `font-family: var(--font-display)` per i titoli (`h1`, `h2`, `h3`, `h4`, `h5`, `h6`) con `text-transform: uppercase`.

---

### Step 2: Trasferimento Asset Statici
*   **Livello di Rischio**: Basso (aggiunta di file multimediali).
*   **Modello Consigliato**: Modello Veloce / Default.

#### Istruzioni Operative:
1.  Copia i seguenti file immagine dalla cartella `public/` originale alla cartella `public/` del progetto V2:
    *   `walrus-logo2.png` (Logo principale)
    *   `walrus-budda-cocktail.png` (Sfondo Zen Mode)
    *   `TRICHECO.PNG` (Avatar alternativo per TV)
    *   `insegna.png` (Banner retrò)
2.  Verifica che non vi siano sovrascritture di file critici esistenti nella destinazione.

---

### Step 3: Rebranding Schermata di Login / Entry
*   **Livello di Rischio**: Medio (richiede la modifica dello stile CSS e dei componenti UI di V2).
*   **Modello Consigliato**: Modello Veloce / Default.

#### Istruzioni Operative:
1.  Mantieni la struttura della form e la logica di login esistente in V2.
2.  Applica lo sfondo gradiente cioccolato al contenitore principale della pagina:
    ```css
    background: linear-gradient(180deg, #331100 0%, #1a0800 100%);
    ```
3.  Formatta la form di login stile "bancone":
    *   Aggiungi un bordo arancione neon (`border: 2px solid rgba(255,102,0,0.6)`) con bordo superiore spesso arancione (`border-top: 5px solid #ff6600`).
    *   Aggiungi ombre piatte solide (`box-shadow: 12px 12px 0 #000` o responsive).
4.  Stilizza i campi di input: bordo arancione semitrasparente e contorno arancione neon in stato `:focus`.
5.  Stilizza il pulsante di sottomissione: arancione con ombra 3D solida inferiore `#cc5200` che si sposta di `2px` o `4px` verso il basso in stato `:active` per l'effetto cabinato.
6.  Integra il badge inclinato di 8 gradi con la scritta "**ALWAYS THE FUCKING WALRUS**" accanto al logo.

---

### Step 4: Rebranding Customer Jukebox Screen (Mobile UI)
*   **Livello di Rischio**: Medio (impatto sulle classi e sulla presentazione mobile dei brani).
*   **Modello Consigliato**: Modello Veloce / Default.

#### Istruzioni Operative:
1.  **Header**: Imposta lo sfondo nero dell'header con bordo inferiore arancione spesso (`4px solid #ff6600`) e integra il piccolo logo circolare arancione.
2.  **Lista Brani / Cards**:
    *   Riorganizza il CSS delle card delle canzoni per visualizzare il bordo arancione e l'ombra piatta nera (`box-shadow: 8px 8px 0 #000`).
    *   Posiziona il tag della playlist (es. "CLASSICI DA PUB") sopra l'immagine del brano.
    *   Aggiungi il pulsante "+" ad angolo stile 3D flat sopra l'album.
3.  **Selezione Mood**:
    *   Modifica il design dei bottoni del mood per disporli su due colonne.
    *   Nello stato selezionato, assegna lo sfondo arancione, testo nero, una cornice crema spessa e il pallino fucsia di notifica nell'angolo superiore destro.
4.  **Dedica**:
    *   Configura la textarea con font monospazio, sfondo scuro e contatore di caratteri a 80 caratteri massimi.

---

### Step 5: Ricostruzione Live TV Screen (Split Screen & Cinematic Effects)
*   **Livello di Rischio**: Alto (gestione di layout complessi, animazioni di scorrimento e rendering condizionale).
*   **Modello Consigliato**: Modello con Forte Capacità di Ragionamento (Gemini 3.5 Pro o equivalente).

#### Istruzioni Operative:
1.  **Sfondo Immersivo**: Crea un componente contenitore TV a schermo intero con sfuocatura della copertina della traccia corrente tramite CSS:
    ```css
    filter: blur(50px) saturate(1.4) brightness(0.6);
    transform: scale(1.15);
    ```
2.  **Overlay CRT**: Applica sopra l'intero schermo un div in posizionamento assoluto con background a righe (scanline) e opacità al 30%:
    ```css
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%);
    background-size: 100% 4px;
    ```
3.  **Ticker Scorrevole**: Implementa la barra superiore con animazione CSS keyframe `ticker`:
    ```css
    @keyframes ticker {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    ```
    Assicurati che il testo scorra all'infinito e contenga le tipiche frasi Walrus separate da pallini o icone.
4.  **Split Layout**: Configura la colonna sinistra (Now Playing, Cartello dediche con bordo sinistro 15px arancione, animazione neon di pulsazione sulla copertina, applausometro) e la colonna destra (Up Next, Breaking Nius rotante a tempo, Classifica Trichechi).
5.  **Copertura Errori**: Preserva la logica di fallback di V2 in caso di assenza di canzoni in riproduzione o se le API di Spotify falliscono (mostrando la schermata statica "IL WALRUS È PRONTO" con il QR code gigante).

---

### Step 6: Allineamento Copywriting e Copy-fitting
*   **Livello di Rischio**: Basso.
*   **Modello Consigliato**: Modello Veloce / Default.

#### Istruzioni Operative:
1.  Ripercorri i file di testo o i componenti UI di V2 e adatta il copy:
    *   Il modale di successo dell'invio canzone deve esclamare "**CHE CAVALLOOOO 🐴**" con il tasto "**OK, MI DISSOCIO**".
    *   Il caricamento deve citare il payoff "**Problemi fuori, birre dentro**".
    *   I messaggi di errore devono fare riferimento alla "**SALA VAR**" o a "**Rocchi**".
2.  Fai attenzione a non modificare chiavi di traduzione (i18n) se il progetto V2 le utilizza, ma modifica solo i valori delle stringhe.
