# WALBOX V2: FACTORY LESSONS & PLAYBOOK
**Data di Redazione**: 2026-06-03
**Autore**: Documentation / Factory Lessons Agent

---

## 1. Obiettivo dell'Esperimento
L'obiettivo di questo esperimento era verificare la fattibilità di ricostruire da zero un MVP ad alta fedeltà di una Web App interattiva (Walbox Social Jukebox v2) in circa un'ora. 
L'esperimento mirava a validare un modello di sviluppo basato su **AI Business Factory** (con ChatGPT nel ruolo di Project Manager e Coordinatore) e **Antigravity** (come Agent di sviluppo frontend), mantenendo l'infrastruttura client-only (senza database centralizzato o backend fisico) ma simulando un comportamento multi-utente e in tempo reale.

---

## 2. Cosa abbiamo creato in circa 1 ora
In circa 60 minuti di esecuzione sequenziale, la Factory ha prodotto un'applicazione React/Vite stabile, performante e compilabile in produzione, strutturata come segue:
*   **Routing Custom & Leggero**: Gestito interamente in `App.jsx` basandosi sullo stato del path, azzerando le dipendenze da router esterni e azzerando i rischi di disallineamento delle rotte statiche della build.
*   **Logica e Data Layer Dedicati (`mockData.js`)**: Una simulazione completa di database in-memory con persistenza e sincronizzazione incrociata tramite `localStorage` ed eventi `storage`.
*   **Interfaccia Mobile per il Cliente (`/entry` e `/request`)**: Layout responsive a prova di pixel per smartphone, con gestione dell'immissione del tavolo, ricerca canzoni per titolo/artista/mood, inserimento di dediche con limiti di caratteri e feedback visivo sullo stato delle proprie richieste.
*   **Dashboard di Controllo Staff (`/staff`)**: Console desktop a tre colonne (Richieste Pendenti, Player Attivo, Coda di Riproduzione) con controlli completi di approvazione, rifiuto, riordinamento manuale via swap, simulazione del timer di riproduzione e blocco temporaneo del jukebox.
*   **Cinematic Live TV Screen (`/tv`)**: Schermata da sala ottimizzata in 16:9 con transizioni di takeover automatico al cambio traccia, disco in vinile 3D che gira a tempo, visualizzatore grafico dell'equalizzatore e ticker marquee inferiore con le dediche.

---

## 3. Sequenza esatta dei task completati
Il progetto è avanzato secondo una roadmap incrementale e senza regressioni:
1.  **Fase di Setup Context (Task 0)**: Scrittura dei file di allineamento e specifica: `PROJECT_CONTEXT.md`, `MVP_SCOPE.md`, `CREATIVE_DIRECTOR_BRIEF.md`, `BUILD_PLAN.md`, `ANTIGRAVITY_WORKFLOW.md`.
2.  **Scaffolding & Routing (Task 1)**: Inizializzazione del progetto React/Vite e configurazione del router condizionale.
3.  **Data Layer & Sync (Task 2)**: Creazione del file `mockData.js` con i brani di partenza e la logica di update/sync via `localStorage`.
4.  **Sviluppo Schermate Cliente (Task 3)**: Implementazione di `CustomerEntry.jsx` e `CustomerRequest.jsx` con controlli mobile-first.
5.  **Sviluppo Dashboard Staff (Task 4)**: Creazione di `StaffDashboard.jsx` con le tre colonne operative e i controlli amministrativi.
6.  **Sviluppo TV Display (Task 5)**: Creazione di `LiveTvScreen.jsx` con animazioni CSS complesse e layout 16:9 pulito.
7.  **Mobile & Visual Polish (Task 6)**: Ottimizzazioni per iPhone (evitato l'auto-zoom degli input modificando il viewport meta, rimossa la barra di debug sulle viste TV).
8.  **QA Read-Only & Demo Script (Task 7)**: Revisione del codice per rilevare bug latenti e stesura di `DEMO_SCRIPT_V2.md` e `CHECKPOINT_BUILD_1_4.md`.

---

## 4. Agenti usati e Matrice delle Responsabilità
Il successo del workflow dipende dalla netta separazione dei ruoli all'interno della Factory:
*   **CEO / Founder (Utente Umano)**: Definisce la visione di business, esegue i test manuali sui dispositivi reali (es. iPhone) e coordina il passaggio delle consegne tra gli agenti AI.
*   **Orchestrator / Project Manager (ChatGPT)**: Analizza lo stato, scompone i requisiti del business in sotto-task elementari per lo sviluppatore, previene il "scope creep" e prepara i prompt operativi per l'agent di sviluppo.
*   **Frontend Agent (Antigravity)**: Esegue materialmente il codice. Modifica i file in modo chirurgico usando strumenti di rimpiazzo mirati, compila le build per verificare gli errori e documenta le modifiche.
*   **Creative Director (AI Briefing)**: Controlla la coerenza del design system (glassmorphism, animazioni, contrasti HSL, assenza di colori primari puri, tipografia raffinata).
*   **QA Agent (AI Code Reviewer)**: Analizza il codice finale in modalità read-only per segnalare limiti architetturali e preparare gli script di demo.

---

## 5. Ruolo del CEO/Founder
Il CEO/Founder non scrive codice, ma agisce come supervisore di qualità e validatore sul campo:
*   **Testing Reale**: Testa l'interfaccia mobile su un vero smartphone scannerizzando il QR per scovare problemi di allineamento che l'emulatore del browser non mostra.
*   **Direzione delle Priorità**: Approva o rifiuta le modifiche architetturali (es. decidere se usare o meno un database reale fin dal giorno 1).
*   **Valutazione UX**: Valuta se l'effetto wow in sala (takeover, vinile) è abbastanza impattante per attirare l'attenzione dell'utente finale.

---

## 6. Ruolo di ChatGPT come Orchestratore
ChatGPT funge da "ponte" logico e gestore del backlog:
*   **Traduzione Strategia-Codice**: Prende le decisioni del founder e le traduce in istruzioni specifiche, frammentate e lineari per l'agente di sviluppo.
*   **Gestione dello Stato**: Mantiene la cronologia dei progressi ed evita che l'agente di sviluppo si perda in sotto-task secondari o in refactoring massivi non necessari.
*   **Isolamento dei Contesti**: Fornisce ad Antigravity solo le informazioni strettamente necessarie alla compilazione del task corrente.

---

## 7. Ruolo di Antigravity come Frontend Agent
Antigravity è l'esecutore tecnico:
*   **Editing Chirurgico**: Evita di riscrivere interi file. Usa `replace_file_content` o `multi_replace_file_content` per agire solo sulle righe interessate, salvaguardando il codice circostante.
*   **Verifica Continua**: Esegue `npm run build` dopo ogni task per assicurarsi che non vengano introdotte regressioni di compilazione.
*   **Zero Placeholders**: Popola l'applicazione fin da subito con copertine reali, canzoni famose e dati realistici, rendendo l'MVP immediatamente presentabile.

---

## 8. Ruolo del Creative Director
Il Creative Director (formalizzato nel documento `CREATIVE_DIRECTOR_BRIEF.md`) impone le linee guida estetiche:
*   **Palette ed Effetti**: Utilizzo di tonalità scure (sfondo mesh animato con sfumature fucsia, viola e blu notte) combinate con filtri `backdrop-filter: blur` per l'effetto glassmorphism.
*   **Micro-animazioni**: Equalizzatore CSS dinamico alimentato da durate di animazione casuali su ogni barra, rotazione fluida del vinile e scorrimento continuo del ticker delle dediche.
*   **Gerarchia Visiva**: Testi grandi e leggibili per lo schermo TV, ottimizzati per la visualizzazione da distanza, e layout compatti ma ariosi per i dispositivi mobili.

---

## 9. Ruolo del QA Agent
Il QA Agent effettua un'analisi fredda e critica del codice:
*   **Identificazione di Limitazioni**: Rileva accoppiamenti forti (es. il fatto che il tempo scorra solo se la dashboard Staff è aperta).
*   **Prevenzione di Race Conditions**: Identifica bug dovuti a istanze multiple aperte (es. timer concorrenti se ci sono più tab Staff attivi).
*   **Scrittura del Demo Script**: Crea una guida passo-passo che permette a chiunque di testare l'applicazione senza riscontrare bug o disallineamenti di stato.

---

## 10. Prompt Pattern che hanno funzionato
Durante lo sviluppo sono emersi alcuni pattern di prompt estremamente efficaci:
*   **Pattern "Allineamento Contesto"**: Prima di scrivere codice, far leggere all'agente i file `PROJECT_CONTEXT.md` e `MVP_SCOPE.md` con l'istruzione di non deviare per nessun motivo dall'ambito dell'MVP.
*   **Pattern "Surgical Replacement"**: Chiedere esplicitamente all'agente di "modificare solo la funzione X lasciando inalterato il resto" per evitare che riscriva interi file con logiche differenti.
*   **Pattern "Mock-Data-Driven Setup"**: Includere un database di mock-data strutturato (`mockData.js`) fin dall'inizio, così l'agente non deve inventare dati finti all'interno dei singoli componenti visivi.

---

## 11. Regole che hanno evitato il caos
*   **No Dependency Creep**: Nessuna installazione di librerie esterne per icone o animazioni. Tutto il design è stato gestito con Vanilla CSS e icone SVG inline o emoji testuali stilizzate.
*   **Sincronizzazione Unificata**: Nessun meccanismo complesso di WebSockets o server transitori. L'uso di `window.addEventListener('storage', ...)` ha permesso di avere un comportamento real-time istantaneo a costo zero.
*   **Router Centralizzato Statico**: Evitare React Router o simili ha protetto il progetto da errori di configurazione del server in produzione e problemi di build.

---

## 12. Errori e Rischi evitati
*   **Viewport Zoom su iOS**: Evitato l'inconveniente dei browser mobile che zoomano automaticamente sugli input di testo impostando `maximum-scale=1` nei metadati della pagina.
*   **Overwriting del codice**: L'uso rigoroso di strumenti di replace mirati ha impedito che l'agente sovrascrivesse le funzioni di sincronizzazione di localStorage mentre implementava nuove grafiche.
*   **Visualizzazione TV Inquinata**: Nascosta la barra di navigazione dello sviluppatore (`.dev-navigation`) sulla rotta `/tv` tramite controllo condizionale, preservando l'effetto pulito ed estetico dello schermo in sala.

---

## 13. Cosa ha funzionato meglio rispetto alla prima Walbox
*   **Velocità di Sincronizzazione**: L'integrazione di `localStorage` multipiattaforma ha reso la simulazione cross-tab immediata, simulando perfettamente un'architettura client-server.
*   **Qualità Grafica Superiore**: L'adozione immediata del brief del Creative Director ha evitato refactoring grafici successivi. Il layout TV ha un impatto visivo cinematico fin dalla prima build.
*   **Stabilità della Coda**: La logica di riordinamento dei brani tramite swap di indici nell'array in `mockData.js` si è rivelata robusta e priva di bug di duplicazione.

---

## 14. Cosa NON fare nel prossimo MVP (Anti-patterns da evitare)
*   **Non delegare lo Stato Globale a una rotta Specifica**: Il timer del player e l'avanzamento automatico non devono risiedere all'interno del componente `/staff`. Se lo Staff chiude la pagina, il tempo si ferma. Nel prossimo MVP, la logica temporale va centralizzata in un worker comune o delegata a un orchestratore condiviso.
*   **Non lasciare la Coda Vuota**: Evitare lo scenario in cui, finiti i brani degli utenti, il jukebox va in silenzio totale. È indispensabile progettare una playlist di fallback automatica fin dall'inizio.
*   **Non confondere "Eliminazione" con "Rifiuto"**: Rimuovere una canzone dalla coda non deve impostare lo stato su "rifiutato" se in precedenza era stata approvata, per evitare di disorientare il cliente sul suo smartphone.

---

## 15. Workflow replicabile per nuovi progetti (The Factory Method)
Per creare un nuovo MVP in 1 ora, segui questo schema standardizzato:
1.  **Fase 1: Allineamento Documentale (10 min)**
    *   Crea `PROJECT_CONTEXT.md` (visione e limiti).
    *   Crea `MVP_SCOPE.md` (cosa fa e cosa NON fa l'app).
    *   Crea `CREATIVE_DIRECTOR_BRIEF.md` (regole di design, colori, font).
2.  **Fase 2: Scaffolding e Base Dati (15 min)**
    *   Genera lo scaffold React/Vite.
    *   Crea un file `mockData.js` o simile che gestisce lo stato e la persistenza locale (`localStorage`).
    *   Implementa il router personalizzato statico in `App.jsx`.
3.  **Fase 3: Sviluppo delle Viste (25 min)**
    *   Implementa prima la vista d'ingresso o di acquisizione dati.
    *   Implementa la vista operativa principale (lato utente/cliente).
    *   Implementa la vista amministrativa o di dashboard.
    *   Implementa la vista di visualizzazione pubblica o TV (se presente).
4.  **Fase 4: Polishing, QA e Compilazione (10 min)**
    *   Risolvi i problemi di responsive design e viewport mobile.
    *   Nascondi i controlli di sviluppo dalle viste pubbliche.
    *   Genera la build di produzione (`npm run build`) per testare la compilazione.
    *   Crea un `DEMO_SCRIPT.md` per guidare la presentazione del prodotto.

---

## 16. Prossimo Step Consigliato per Walbox v2
*   **Playlist di Fallback Automatica**: Modificare `mockData.js` per far sì che, quando la coda delle richieste approvate si svuota, il sistema peschi automaticamente brani casuali o sequenziali da `MOCK_SONGS` riproducendoli come sottofondo, evitando che il jukebox vada in pausa e garantendo continuità visiva ed sonora sulla TV.
