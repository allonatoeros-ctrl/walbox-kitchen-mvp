# Guida alla Demo di 5 Minuti: Walbox Social Jukebox v2
Questo script ti guiderà passo-passo nella presentazione dell'MVP di Walbox a un cliente, investitore o gestore di un locale. La demo mostra l'intero flusso integrato in tempo reale.

---

## 1. Obiettivo della Demo
Mostrare come Walbox trasforma la musica del locale in un'esperienza sociale e visiva:
1. **Per il cliente**: richiedere canzoni e mandare dediche in 3 click, senza scaricare app o registrarsi.
2. **Per lo staff**: supervisionare e riordinare la coda con un'interfaccia immediata e senza interruzioni.
3. **Per la sala**: intrattenere i clienti con un display TV cinematico e interattivo.

---

## 2. Setup Prima della Demo
Prima di iniziare la presentazione, prepara le finestre sul tuo schermo (o proiettale su schermi diversi):
*   **Finestra 1 (Smartphone Cliente)**: Apri un browser in modalità cellulare (es. tasto destro -> *Ispeziona* -> attiva la modalità mobile su Chrome) sull'URL: `http://localhost:5174/entry`
*   **Finestra 2 (Dashboard Staff)**: Apri una scheda del browser standard sull'URL: `http://localhost:5174/staff`
*   **Finestra 3 (TV del Locale)**: Apri una scheda a tutto schermo (F11 o modalità presentazione) sull'URL: `http://localhost:5174/tv`

> [!IMPORTANT]
> Nella barra di sviluppo in cima alla finestra dello **Staff** o del **Cliente**, clicca su **Reset Demo 🔄** e premi OK. Questo caricherà i dati dimostrativi di fabbrica e avvierà il player in uno stato pulito e sincronizzato.

---

## 3. Flusso Minuto per Minuto

### **Minuto 0:00 - 1:00 | Introduzione e Concetto**
*   **Azione**: Mostra la **Finestra 3 (TV)** a schermo intero e indica il codice QR.
*   **Cosa dire**: 
    > "Immagina di entrare in un locale ed essere tu a scegliere la musica, insieme agli altri clienti. Nessun DJ scortese a cui chiedere, nessuna app da scaricare o registrazione noiosa. Basta inquadrare questo QR code sul tavolo col tuo telefono."

### **Minuto 1:00 - 2:00 | L'Esperienza Cliente (Smartphone)**
*   **Azione**: Spostati sulla **Finestra 1 (Cliente)**.
*   **Passaggi**:
    1. Digita il numero di tavolo `4` e clicca su **Entra nel Jukebox ⚡**.
    2. Cerca una canzone (es. scrivi *"Dua"* per trovare *"Levitating"* o seleziona uno dei consigliati).
    3. Clicca sulla canzone. Mostra la selezione dei Mood: *"Selezioniamo il mood 'Party'!"*
    4. Scrivi una dedica simpatica: *"Tavolo 4 in festa! Offriamo da bere!"*
    5. Clicca su **Invia al Jukebox 🚀**.
*   **Cosa dire**:
    > "Inserisco il mio tavolo, cerco il brano che preferisco e scelgo il mio mood attuale. Posso anche aggiungere una dedica per i miei amici o per qualcuno in sala. Invio la richiesta... ed ecco che l'app mi rimanda alla mia lista personale, dove posso seguire lo stato di approvazione in tempo reale."

### **Minuto 2:00 - 3:00 | Controllo e Sicurezza (Staff Dashboard)**
*   **Azione**: Passa alla **Finestra 2 (Staff)**.
*   **Passaggi**:
    1. Mostra la richiesta appena inviata dal tavolo 4 in cima alla colonna **Richieste Pendenti**.
    2. Clicca su **Approva 👍**.
    3. Mostra la canzone che si sposta nella colonna **Coda di Riproduzione**.
    4. Usa le frecce per spostare la canzone su o giù nella coda per dimostrare come lo staff gestisce la priorità.
*   **Cosa dire**:
    > "Allo stesso tempo, lo staff ha il controllo totale sulla console di amministrazione. Vediamo arrivare la richiesta del tavolo 4. Possiamo approvarla o rifiutarla per evitare canzoni inappropriate. Decido di approvarla e posso anche riordinare la coda con un click se voglio dare priorità a un tavolo speciale."

### **Minuto 3:00 - 4:15 | L'Effetto Wow in Sala (Live TV Screen)**
*   **Azione**: Torna alla **Finestra 3 (TV)** e clicca su **Salta** nella dashboard dello staff (se vuoi forzare la riproduzione immediata del brano appena approvato).
*   **Passaggi**:
    1. Osserva la TV durante il cambio canzone: si attiva il **Takeover** di 4 secondi a schermo intero con la copertina gigante.
    2. Mostra lo sfondo che cambia colore e si adatta al mood *"Party"* (tonalità neon fucsia/viola).
    3. Mostra il vinile 3D che scivola fuori dalla custodia e gira a tempo, l'equalizzatore animato e il ticker scorrevole in basso con la dedica del tavolo 4.
*   **Cosa dire**:
    > "Guardate lo schermo della TV in sala: non appena la canzone precedente finisce, parte una transizione a tutto schermo che annuncia il nuovo brano e mostra chi l'ha richiesto. Lo sfondo cambia tonalità per riflettere il mood della canzone. Il vinile gira ed in basso scorre il nastro delle dediche dei clienti. Questo crea un senso di community incredibile all'interno del locale."

### **Minuto 4:15 - 5:00 | Chiusura e Opzioni Gestore**
*   **Azione**: Torna alla dashboard dello **Staff**.
*   **Passaggi**:
    1. Clicca su **Sospeso ⏸️** sotto *Blocca Richieste*.
    2. Mostra che sullo smartphone del cliente compare il banner: *"Invio richieste temporaneamente sospeso"*.
    3. Clicca di nuovo per riattivare.
*   **Cosa dire**:
    > "Se il locale si riempie troppo o c'è un evento privato, lo staff può congelare le richieste con un solo tasto. L'app del cliente si adatta subito bloccando la ricerca. Tutto è sincronizzato all'istante."

---

## 4. Fallback in Caso di Imprevisti (Troubleshooting)

*   **La canzone non avanza o il progresso si ferma sulla TV**:
    *   *Causa*: Hai chiuso la scheda della Dashboard Staff.
    *   *Soluzione*: Apri la dashboard `/staff` in un'altra scheda per riattivare il timer del progresso.
*   **Lo stato è disallineato o i dispositivi non si aggiornano**:
    *   *Causa*: Conflitto di localStorage o sessione sporca.
    *   *Soluzione*: Clicca sul pulsante **Reset Demo 🔄** nella barra di navigazione dello sviluppatore (in cima a qualsiasi finestra tranne la TV) e ricarica le pagine.

---

## 5. Cosa NON Promettere (Gestione delle Aspettative)
*   **Non promettere l'integrazione immediata con Spotify/YouTube**: Spiega che questa versione utilizza un database musicale locale ad alta fedeltà ottimizzato per la demo e che l'integrazione con Spotify/Audio fisico è prevista come integrazione tecnica futura.
*   **Non promettere l'automazione in background senza server**: Specifica che il progresso del tempo è simulato nel browser per questa demo e che in produzione ci sarà un server dedicato a far girare la musica.

---

## 6. Domande di Feedback da Fare al Cliente
Fai queste domande al gestore del locale dopo la demo per raccogliere feedback prezioso:
1. *"Pensi che il sistema di approvazione dello staff sia abbastanza rapido da usare durante un venerdì sera affollato?"*
2. *"Che tipo di musica o playlist di sottofondo vorresti che suonasse in automatico quando non ci sono richieste dei clienti?"*
3. *"La grafica della TV si adatta bene allo stile visivo del tuo locale o preferiresti temi più scuri/minimalisti?"*

---

## 7. Prossimo Step dopo la Demo
Il passo successivo sarà l'aggiunta di una **Playlist di Fallback automatica** per far sì che, quando la coda delle richieste si svuota, il Jukebox continui a riprodurre musica di sottofondo a caso senza lasciare la sala in silenzio.
