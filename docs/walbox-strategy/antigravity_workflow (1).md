# ANTIGRAVITY_WORKFLOW.md

## 1. Scopo del file

Questo file definisce il metodo operativo da usare in Antigravity per sviluppare **Walbox / Walrus Social Jukebox** in modo ordinato, senza sprecare quota, senza modifiche casuali e senza perdere il controllo del progetto.

Obiettivo principale:

```text
modifiche piccole, controllate, verificabili e salvate con commit frequenti
```

---

## 2. Regola base

Antigravity non va usato dicendo:

```text
Migliora tutto il progetto.
Rendilo più bello.
Sistema l'app.
```

Questi prompt sono troppo larghi e rischiano di modificare troppi file.

La regola corretta è:

```text
1 task = 1 obiettivo chiaro
1 file quando possibile
prima piano se la modifica è complessa
sempre git diff dopo
commit solo quando funziona
```

---

## 3. Regola modelli

Ogni prompt per Antigravity deve indicare anche il modello da usare.

Formato standard:

```text
Modello da usare: [nome modello]

Prompt da copiare:
[istruzione]
```

---

## 4. Modelli: quando usare cosa

### Gemini Flash / Gemini 3 Flash / Gemini 3.5 Flash

Modello default.

Usarlo per circa il 75–80% del lavoro.

Da usare per:

- micro-modifiche UI;
- testi;
- colori;
- spacing;
- CSS;
- sistemare indentazione;
- fix JSX piccoli;
- modifiche a un solo componente;
- layout mobile semplice;
- popup;
- piccoli aggiustamenti grafici;
- cambio label;
- aggiunta fallback demo semplice.

Esempio:

```text
Modello da usare: Gemini Flash

Modifica solo @LiveTvScreen.jsx.
Sistema solo l'indentazione del blocco ReactionBar.
Non cambiare logica, testi, colori o altri file.
```

### Gemini Pro / Gemini 3 Pro / Gemini 3.1 Pro / Pro High

Da usare solo quando serve ragionamento più forte.

Da usare per:

- feature nuova;
- bug difficile;
- refactor;
- modifica su più file;
- analisi del flusso dati;
- dashboard gestore;
- TV Screen importante;
- collegamento tra Customer, Manager e Live TV;
- logica queue/reactions;
- errori che Flash non risolve;
- pianificazione architetturale.

Prima chiedere quasi sempre un piano, non modifiche immediate.

Esempio:

```text
Modello da usare: Gemini Pro

Analizza solo @CustomerJukeboxOldOrange.jsx @ManagerDashboard.jsx @LiveTvScreen.jsx @demoData.js.
Non modificare codice.
Dimmi come passa una richiesta canzone dal cliente alla dashboard e alla TV Screen.
Poi indicami la modifica minima per aggiungere [feature].
```

### Claude Sonnet Thinking

Backup intelligente.

Da usare quando:

- Gemini modifica troppi file;
- Gemini non capisce il bug;
- serve ragionamento più prudente;
- serve analisi prima di toccare codice;
- il progetto sembra incasinato;
- bisogna confrontare due possibili soluzioni.

Non usarlo come default se Gemini Flash/Pro funzionano bene.

### Claude Opus Thinking

Emergenza o ragionamento molto complesso.

Da usare raramente, solo se:

- c'è un bug bloccante;
- serve analizzare molti file;
- gli altri modelli non riescono;
- la modifica è critica prima di una demo.

### GPT-OSS 120B / altri modelli backup

Usarli solo se i modelli principali non sono disponibili o se serve un confronto veloce.

---

## 5. Regola consumo quota

Non ragionare solo in termini di “token”.

La finestra di contesto indica quanta roba il modello può leggere, ma in Antigravity il consumo reale dipende da:

- modello scelto;
- lunghezza prompt;
- numero di file coinvolti;
- Agent Mode;
- richieste interne generate dall’agente;
- terminale;
- browser preview;
- complessità del task;
- numero di tentativi.

Per risparmiare quota:

- usare Flash per task piccoli;
- non allegare/rileggere screenshot se non serve;
- non chiedere analisi dell'intero progetto per modifiche piccole;
- indicare sempre i file esatti;
- chiedere piano prima delle feature grandi;
- non aprire mille tab;
- non dare prompt vaghi.

---

## 6. Workflow standard prima di modificare

Prima di far lavorare Antigravity:

```bash
git status
```

Controllare:

- quali file sono modificati;
- se ci sono modifiche precedenti non salvate;
- se il branch è corretto;
- se il progetto è pulito.

Se ci sono modifiche non chiare:

```bash
git diff
```

oppure:

```bash
git diff src/pages/NomeFile.jsx
```

Non fare nuove modifiche sopra modifiche non capite.

---

## 7. Workflow standard dopo una modifica

Dopo ogni modifica di Antigravity:

```bash
git status
```

Poi:

```bash
git diff
```

oppure, meglio:

```bash
git diff src/pages/NomeFile.jsx
```

Controllare:

- se ha modificato solo i file richiesti;
- se ha cambiato logica non richiesta;
- se ha rimosso codice funzionante;
- se ha toccato testi/colori non richiesti;
- se il codice è leggibile.

Poi testare:

```bash
npm run dev
```

Aprire:

```text
http://localhost:5173
```

Solo se va bene, fare commit.

---

## 8. Commit standard

Quando la modifica è buona:

```bash
git add src/pages/NomeFile.jsx
git commit -m "Messaggio breve e chiaro"
```

Esempi messaggi commit:

```bash
git commit -m "Polish live TV reaction bar"
git commit -m "Improve customer jukebox mobile spacing"
git commit -m "Add Walrus profile coming soon screen"
git commit -m "Refine manager dashboard queue actions"
git commit -m "Fix live TV demo reactions fallback"
```

---

## 9. Se Antigravity modifica file sbagliati

Se Antigravity tocca file che non doveva toccare:

1. Non fare commit.
2. Controllare il diff.
3. Recuperare solo ciò che serve, se possibile.
4. Se la modifica è da buttare:

```bash
git restore path/del/file.jsx
```

Esempio:

```bash
git restore src/pages/LiveTvScreen.jsx
```

Se ha modificato tanti file per errore:

```bash
git restore .
```

Usare `git restore .` solo se si è sicuri di voler annullare tutte le modifiche non committate.

---

## 10. Prompt standard per micro-modifica

Usare Gemini Flash.

```text
Modello da usare: Gemini Flash

Modifica solo @NomeFile.jsx.

Fai solo questa modifica:
[descrizione precisa]

Non modificare altri file.
Non cambiare logica non richiesta.
Non cambiare testi non richiesti.
Non cambiare colori non richiesti.
Alla fine spiegami brevemente cosa hai cambiato.
```

---

## 11. Prompt standard per sistemare formattazione

Usare Gemini Flash.

```text
Modello da usare: Gemini Flash

Modifica solo @NomeFile.jsx.

Sistema solo formattazione e indentazione del blocco [nome blocco].
Non cambiare logica.
Non cambiare testi.
Non cambiare colori.
Non modificare altri file.
```

---

## 12. Prompt standard per analisi senza modificare

Usare Gemini Flash per analisi piccole.  
Usare Gemini Pro per flussi complessi.

```text
Modello da usare: Gemini Pro

Analizza solo questi file:
@File1.jsx
@File2.jsx
@File3.js

Non modificare codice.
Rispondi solo con:
1. cosa fanno questi file;
2. dove passa il dato principale;
3. quale modifica minima serve per [obiettivo];
4. quali file toccheresti.
```

---

## 13. Prompt standard per piano + applicazione

### Step 1 — Piano

```text
Modello da usare: Gemini Pro

Analizza solo @NomeFile.jsx.
Non modificare codice.
Dammi un piano breve per ottenere questo obiettivo:
[obiettivo]

Il piano deve essere minimo e deve evitare modifiche non necessarie.
```

### Step 2 — Applicazione

```text
Modello da usare: Gemini Flash oppure Gemini Pro, in base alla complessità

Applica solo il piano approvato.
Modifica solo @NomeFile.jsx.
Non modificare altri file.
Non aggiungere feature extra.
```

---

## 14. Prompt standard per creare variante senza toccare originale

Usare Gemini Pro se crea un nuovo file importante.  
Usare Gemini Flash se è una copia/variante semplice.

```text
Modello da usare: Gemini Pro

Crea una nuova variante partendo da @FileOriginale.jsx.
Nome nuovo file: @NuovaVariante.jsx.

Non modificare il file originale.
Non eliminare altre varianti.
Non cambiare routing principale finché non lo chiedo.

Obiettivo della variante:
[descrizione]
```

---

## 15. Prompt standard per CustomerJukeboxOldOrange

Questa è la schermata mobile cliente principale.

Usare quasi sempre Gemini Flash.

```text
Modello da usare: Gemini Flash

Modifica solo @CustomerJukeboxOldOrange.jsx.

Fai solo questa modifica:
[descrizione precisa]

Non modificare altri file.
Non modificare CustomerJukebox.jsx.
Non modificare le altre varianti.
Mantieni lo stile Old Orange/Walrus già approvato.
```

---

## 16. Prompt standard per LiveTvScreen

La Live TV Screen è pensata per PC/TV, non telefono.

Per modifiche piccole: Gemini Flash.  
Per redesign importante: Gemini Pro prima con piano.

```text
Modello da usare: Gemini Flash

Modifica solo @LiveTvScreen.jsx.

Fai solo questa modifica:
[descrizione precisa]

Ottimizza per visualizzazione su PC/TV, non mobile.
Non modificare altri file.
Non cambiare la logica della queue se non richiesto.
```

---

## 17. Prompt standard per ManagerDashboard

La dashboard deve restare semplice nella beta.

Per micro-modifiche: Gemini Flash.  
Per logica approva/boccia/live: Gemini Pro.

```text
Modello da usare: Gemini Pro

Analizza @ManagerDashboard.jsx e i file collegati solo se necessari.
Non modificare codice.
Dimmi qual è la modifica minima per rendere la dashboard più chiara nella beta.
Mantieni il flusso semplice: approva, boccia, manda in live.
```

---

## 18. Prompt standard per debug

Usare Gemini Pro o Claude Sonnet Thinking.

```text
Modello da usare: Gemini Pro

Ho questo errore:
[incolla errore]

Analizza solo i file strettamente necessari.
Prima spiegami la causa probabile.
Poi proponi la modifica minima.
Non modificare codice finché non confermo.
```

---

## 19. Prompt standard per Review Changes

Quando Antigravity propone modifiche, prima di accettare tutto:

```text
Controlla le modifiche proposte.
Dimmi se hai modificato solo i file richiesti.
Elenca i file toccati.
Spiega in 3 righe cosa hai cambiato.
Non fare altre modifiche.
```

---

## 20. Regola file aperti in Antigravity

Per non confondere l'agente:

- tenere aperto solo il file interessato;
- terminale con `npm run dev`;
- browser su `localhost:5173`;
- chiudere tab inutili;
- non allegare screenshot se non necessari;
- non far leggere tutto il progetto per task piccoli.

---

## 21. Regola finale

Ogni volta che ChatGPT dà un prompt per Antigravity deve includere:

1. **Modello da usare**;
2. **Prompt da copiare**;
3. **Comando terminale dopo la modifica**;
4. **Criterio per decidere se fare commit o restore**.

Formato ideale:

```text
Modello da usare: Gemini Flash

Prompt da copiare:
...

Dopo fai:
git diff src/pages/NomeFile.jsx

Se è ok:
git add src/pages/NomeFile.jsx
git commit -m "..."

Se è sbagliato:
git restore src/pages/NomeFile.jsx
```

