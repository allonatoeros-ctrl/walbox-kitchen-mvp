# Walbox Original Rebrand Pack - Brand Identity Guide

Questo documento contiene i dettagli del sistema di brand, la tipografia, la palette colori, le classi CSS utili e gli asset estratti dal codice sorgente originale di Walbox. È da utilizzare come riferimento visuale per la futura rebrandizzazione di **Walbox From Zero V2**.

---

## 1. Tipografia e Font

I font di Walbox trasmettono uno stile bold, pub/merchandise, di impatto e ad alta leggibilità sui monitor TV.

*   **Font di Testo/Base (Sans-serif)**: `Montserrat`
    *   *Pesi estratti*: `400` (Regular), `600` (Semi-Bold), `800` (Extra-Bold), `900` (Black).
    *   *Utilizzo*: Testo descrittivo, input utente, pulsanti, metadati, e indicazioni di sala.
*   **Font Display (Titoli)**: `Oswald`
    *   *Pesi estratti*: `400`, `600`, `700` (Bold).
    *   *Utilizzo*: Titoli di sezione, intestazioni, classifiche, pulsanti d'azione (in maiuscolo).
*   **Font di Impatto (Poster/Retro TV)**: `Impact`, `Arial Black`, `monospace`.
    *   *Utilizzo*: Dediche stile "stencil", ticker TV scorrevole e scritte prominenti nella variante poster.

### Definizione dei Font
I font di Google Fonts sono caricati direttamente in [index.html](file:///Users/erosallonato/Desktop/walrus-social-jukebox/index.html) a riga 9:
```html
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800;900&family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">
```

Nei fogli di stile ([global.css](file:///Users/erosallonato/Desktop/walrus-social-jukebox/src/styles/global.css)), le variabili CSS sono impostate come segue:
```css
--font-base: 'Montserrat', sans-serif;
--font-display: 'Oswald', sans-serif;
```

---

## 2. Palette Colori

La palette originale unisce i toni caldi e scuri di un pub d'altri tempi (legno, buio, neon) con accenti elettrici per i dettagli social e interattivi.

| Nome Colore | Variabile CSS / Codice | Ruolo e Utilizzo |
| :--- | :--- | :--- |
| **Dark Charcoal / Nero** | `--color-bg: #121212` | Colore di sfondo generale dell'applicazione. |
| **Dark Surface** | `--color-surface: #1e1e1e` | Sfondo di schede, input e pannelli semitrasparenti. |
| **Light Surface** | `--color-surface-light: #2c2c2c` | Sfondi di badge e bordi secondari. |
| **Warm Yellow (Dominante)**| `--color-primary: #f5a623` | Colore primario per evidenziare elementi attivi, punteggi e titoli. |
| **Old Orange Walrus** | `--color-accent: #ff4d00` / `#ff6600` | Colore storico e iconico del pub. Usato per bordi neon, bottoni e scritte. |
| **Social Fuchsia** | `--color-social: #ff007f` | Colore magenta per elementi social, highlight, cuori e badge speciale. |
| **Cream/Yellow Retro** | `#fffdd0` | Testo primario dei titoli ad alto impatto e sfondi alternativi. |
| **Warm Chocolate (Gradient)**| `#331100` a `#1a0800` | Gradiente di sfondo per la schermata di login e mobile. |
| **Deep Orange (Shadow)** | `#cc5200` / `#cc3300` | Ombra solida inferiore per simulare bottoni 3D stile cabinato. |
| **Spotify Green** | `#1db954` | Utilizzato per indicare il brano attualmente in riproduzione o approvato. |

---

## 3. Variabili CSS e Visual Tokens

Definite all'interno di [global.css](file:///Users/erosallonato/Desktop/walrus-social-jukebox/src/styles/global.css) e localmente all'interno delle schermate:

```css
:root {
  /* Colors */
  --color-bg: #121212;
  --color-surface: #1e1e1e;
  --color-surface-light: #2c2c2c;
  --color-primary: #f5a623;
  --color-accent: #ff4d00;
  --color-social: #ff007f;
  --color-text: #ffffff;
  --color-text-muted: #a0a0a0;
  
  /* Typography */
  --font-base: 'Montserrat', sans-serif;
  --font-display: 'Oswald', sans-serif;
}
```

### Variabili Responsive di Layout (Mobile vs Desktop)
Nelle viste mobili (es. Jukebox, Login) sono definite queste proporzioni per gestire i padding e le ombre solide:
*   **Shadows (Ombre Flat)**: `--card-shadow: 8px 8px 0 #000` (mobile) e `--card-shadow: 15px 15px 0 #000` (desktop).
*   **Input/Buttons Offset**: `6px 6px 0 #000` su mobile, `12px 12px 0 #000` su desktop.
*   **Cover Art Size**: `65px` su mobile, `90px` su desktop (Jukebox mobile).

---

## 4. Classi CSS Utili da Preservare

Queste classi definiscono il comportamento dei componenti dell'interfaccia nel file [global.css](file:///Users/erosallonato/Desktop/walrus-social-jukebox/src/styles/global.css):

```css
/* Stile dei pulsanti solidi, pesanti e maiuscoli */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 800;
  font-family: var(--font-display);
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 1px;
}

.btn-primary { background-color: var(--color-primary); color: #000; }
.btn-accent { background-color: var(--color-accent); color: #fff; }
.btn-social { background-color: var(--color-social); color: #fff; }

/* Input field con stile minimalista per tema dark */
.input-field {
  width: 100%;
  padding: 1rem;
  background-color: var(--color-surface);
  border: 2px solid var(--color-surface-light);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 1rem;
  font-family: var(--font-base);
  font-weight: 600;
  transition: border-color 0.2s ease;
}
.input-field:focus { outline: none; border-color: var(--color-primary); }

/* Pannello effetto vetro scuro */
.glass-panel {
  background: rgba(30, 30, 30, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}
```

---

## 5. Asset Grafici Rilevanti

Tutti gli asset grafici originali si trovano all'interno della cartella [public](file:///Users/erosallonato/Desktop/walrus-social-jukebox/public) o [src/assets](file:///Users/erosallonato/Desktop/walrus-social-jukebox/src/assets).

*   `public/walrus-logo2.png`: Logo principale circolare del tricheco con sfondo nero, bordato di arancione neon.
*   `public/walrus-budda-cocktail.png`: Grafica illustrata ad altissima qualità raffigurante il Tricheco in versione Buddha con cocktail, utilizzata per lo sfondo del caricamento Zen.
*   `public/TRICHECO.PNG`: Illustrazione quadrata trasparente del tricheco arrabbiato con birra (utilizzata opzionalmente per sostituire le copertine dei brani sulla TV).
*   `public/insegna.png`: Logo orizzontale in stile vintage pub "The Walrus".
*   `public/favicon.svg` e `public/icons.svg`: Icone e loghi secondari in formato vettoriale.

---

## 6. Tono del Copy ("Walrus Tone of Voice")

La personalità di Walbox è irriverente, sfacciata, legata alla cultura da pub italiano e al calcio/SALA VAR. I testi non devono mai essere formali.

### Parole Chiave e Slogan da Mantenere:
1.  **ALWAYS THE FUCKING WALRUS**: Lo slogan principale, stampato sui badge come sticker da merchandise.
2.  **SALA VAR / Lissone**: Tutta la coda delle canzoni è presentata come un processo decisionale VAR calcistico. La regia approva, Rocchi decide.
3.  **CHE CAVALLOOOO 🐴**: Esclamazione di successo/approvazione quando una richiesta viene inoltrata.
4.  **MI DISSOCIO**: Usato ironicamente per tornare indietro o chiudere modali (es. pulsante "OK, MI DISSOCIO").
5.  **STA SALENDO MALE**: Mood o notifica per canzoni malinconiche o momenti di ebbrezza pesante.
6.  **CORTO MUSO**: Riferimento ironico al calcio e alla competitività per la classifica dei clienti.
7.  **PROBLEMI FUORI, BIRRE DENTRO (o BIRRE GRANDI DENTRO)**: Il payoff filosofico del locale che compare nei caricamenti.
