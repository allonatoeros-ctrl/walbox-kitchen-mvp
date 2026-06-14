# WALBOX_PROMPT_LIBRARY.md

## 1. Scopo del file

Questa è la libreria di prompt pronti da usare in Antigravity per sviluppare **Walbox / Walrus Social Jukebox**.

Ogni prompt deve rispettare il metodo del progetto:

- modello indicato sempre;
- modifica piccola e controllata;
- file specifico;
- niente modifiche extra;
- controllo con `git diff` dopo;
- commit solo se funziona.

---

## 2. Formato standard da usare sempre

```text
Modello da usare: [Gemini Flash / Gemini Pro / Claude Sonnet Thinking]

Prompt da copiare:
[istruzione precisa]

Dopo fai:
[comando terminale]

Se è ok:
[commit]

Se è sbagliato:
[restore]
```

---

## 3. Prompt: controllo stato prima di iniziare

Da fare prima di ogni nuova modifica.

```bash
git status
```

Se ci sono file modificati:

```bash
git diff
```

Se vuoi controllare un solo file:

```bash
git diff src/pages/NomeFile.jsx
```

---

## 4. Prompt Antigravity: micro-modifica generica

**Modello da usare:** Gemini Flash

```text
Modifica solo @NomeFile.jsx.

Fai solo questa modifica:
[descrivi la modifica precisa]

Non modificare altri file.
Non cambiare logica non richiesta.
Non cambiare testi non richiesti.
Non cambiare colori non richiesti.
Non aggiungere feature extra.
Alla fine spiegami brevemente cosa hai cambiato.
```

Dopo:

```bash
git diff src/pages/NomeFile.jsx
```

Se ok:

```bash
git add src/pages/NomeFile.jsx
git commit -m "Descrizione breve modifica"
```

Se sbagliato:

```bash
git restore src/pages/NomeFile.jsx
```

---

## 5. Prompt Antigravity: solo formattazione / indentazione

**Modello da usare:** Gemini Flash

```text
Modifica solo @NomeFile.jsx.

Sistema solo formattazione e indentazione del blocco:
[nome blocco]

Non cambiare logica.
Non cambiare testi.
Non cambiare colori.
Non modificare altri file.
Non aggiungere codice nuovo.
```

Dopo:

```bash
git diff src/pages/NomeFile.jsx
```

Commit se il diff mostra solo formattazione.

---

## 6. Prompt Antigravity: analizza ma non modificare

**Modello da usare:** Gemini Pro per flussi complessi, Gemini Flash per un singolo file semplice.

```text
Analizza solo questi file:
@File1.jsx
@File2.jsx
@File3.js

Non modificare codice.
Non creare file.
Non proporre redesign totale.

Rispondi solo con:
1. cosa fanno questi file;
2. dove passa il dato principale;
3. qual è la modifica minima per ottenere questo obiettivo: [obiettivo];
4. quali file toccheresti;
5. quali rischi ci sono.
```

Dopo l’analisi, decidere se applicare con un secondo prompt.

---

## 7. Prompt Antigravity: applica piano approvato

**Modello da usare:** Gemini Flash se il piano tocca un solo file; Gemini Pro se tocca più file.

```text
Applica solo il piano approvato.

Modifica solo questi file:
@File1.jsx
@File2.jsx

Non modificare altri file.
Non aggiungere feature extra.
Non cambiare stile oltre quanto richiesto.
Non riscrivere componenti interi se non necessario.
Alla fine elenca i file modificati.
```

Dopo:

```bash
git status
git diff
```

---

## 8. Prompt: CustomerJukeboxOldOrange — micro UI

**Modello da usare:** Gemini Flash

```text
Modifica solo @CustomerJukeboxOldOrange.jsx.

Fai solo questa modifica UI:
[descrizione precisa]

Mantieni lo stile Old Orange/Walrus già approvato.
Non modificare CustomerJukebox.jsx.
Non modificare CustomerJukeboxCool.jsx.
Non modificare CustomerJukeboxWalrusBrand.jsx.
Non modificare altri file.
Non cambiare la logica della richiesta canzone.
```

Dopo:

```bash
git diff src/pages/CustomerJukeboxOldOrange.jsx
```

Commit suggerito:

```bash
git add src/pages/CustomerJukeboxOldOrange.jsx
git commit -m "Improve customer jukebox UI"
```

---

## 9. Prompt: CustomerJukeboxOldOrange — mobile spacing

**Modello da usare:** Gemini Flash

```text
Modifica solo @CustomerJukeboxOldOrange.jsx.

Ottimizza solo lo spacing mobile della schermata cliente.
Obiettivo: rendere più leggibili canzoni, mood, dedica e pulsante invio su telefono.

Non cambiare testi.
Non cambiare colori.
Non cambiare logica.
Non modificare altri file.
Non toccare le altre varianti.
```

Dopo:

```bash
git diff src/pages/CustomerJukeboxOldOrange.jsx
npm run dev
```

---

## 10. Prompt: CustomerJukeboxOldOrange — popup CHE CAVALLOOOO

**Modello da usare:** Gemini Flash

```text
Modifica solo @CustomerJukeboxOldOrange.jsx.

Lavora solo sul popup di conferma richiesta inviata.
Mantieni il tono divertente Walrus e la frase “CHE CAVALLOOOO 🐴”.
Rendilo più brandizzato e leggibile, ma senza cambiare la logica di invio richiesta.

Non modificare altri file.
Non cambiare le card canzoni.
Non cambiare mood o reactions.
```

Dopo:

```bash
git diff src/pages/CustomerJukeboxOldOrange.jsx
```

---

## 11. Prompt: CustomerJukeboxOldOrange — aggiungere canzoni demo

**Modello da usare:** Gemini Flash se le canzoni sono nello stesso file; Gemini Pro se bisogna capire `demoData.js`.

```text
Analizza dove sono definite le canzoni demo usate da @CustomerJukeboxOldOrange.jsx.
Non modificare codice.
Dimmi se devo modificare questo file o @demoData.js per aggiungere più canzoni demo.
```

Poi, se il file corretto è chiaro:

```text
Modifica solo @[file corretto].

Aggiungi alcune canzoni demo coerenti con una serata Walrus Shuffle Night.
Non cambiare la struttura dati.
Non modificare altri file.
```

Dopo:

```bash
git diff
```

---

## 12. Prompt: LiveTvScreen — micro-modifica

**Modello da usare:** Gemini Flash

```text
Modifica solo @LiveTvScreen.jsx.

Fai solo questa modifica:
[descrizione precisa]

Ottimizza per visualizzazione su PC/TV, non per telefono.
Non modificare altri file.
Non cambiare la logica della queue.
Non cambiare la logica delle reaction se non richiesto.
```

Dopo:

```bash
git diff src/pages/LiveTvScreen.jsx
```

---

## 13. Prompt: LiveTvScreen — Applausometro Tricheco

**Modello da usare:** Gemini Flash

```text
Modifica solo @LiveTvScreen.jsx.

Sistema solo formattazione e indentazione del blocco “APPLAUSOMETRO TRICHECO” e della ReactionBar.

Non cambiare logica.
Non cambiare testi.
Non cambiare colori.
Non modificare altri file.
```

Dopo:

```bash
git diff src/pages/LiveTvScreen.jsx
```

Se è ok:

```bash
git add src/pages/LiveTvScreen.jsx
git commit -m "Polish live TV reaction bar"
```

Se è sbagliato:

```bash
git restore src/pages/LiveTvScreen.jsx
```

---

## 14. Prompt: LiveTvScreen — piano redesign spettacolare

**Modello da usare:** Gemini Pro

```text
Analizza solo @LiveTvScreen.jsx e i componenti che importa direttamente.
Non modificare codice.

Obiettivo: rendere la Live TV Screen più spettacolare per presentazione su PC/TV durante una Walrus Shuffle Night.

Dammi un piano breve e minimo diviso in:
1. cosa migliorare visivamente;
2. quali blocchi del file toccheresti;
3. cosa NON toccheresti;
4. rischio modifiche;
5. proposta di primo step piccolo.

Non proporre backend.
Non proporre login.
Non modificare codice.
```

Dopo il piano, applicare solo il primo step con Gemini Flash o Pro.

---

## 15. Prompt: LiveTvScreen — demo fallback dati

**Modello da usare:** Gemini Flash

```text
Modifica solo @LiveTvScreen.jsx.

Aggiungi solo fallback demo dove necessario per evitare aree vuote nella presentazione TV.
I fallback devono essere semplici e non devono cambiare la struttura dati.

Non modificare altri file.
Non cambiare la logica principale.
Non aggiungere backend.
```

Dopo:

```bash
git diff src/pages/LiveTvScreen.jsx
```

---

## 16. Prompt: ManagerDashboard — analisi flusso

**Modello da usare:** Gemini Pro

```text
Analizza @ManagerDashboard.jsx e, solo se necessario, i file collegati alla queue e alle richieste canzoni.
Non modificare codice.

Spiegami in modo breve:
1. come arrivano le richieste alla dashboard;
2. come si approva/boccia/manda in live;
3. cosa è già pronto per una beta;
4. quale modifica minima renderebbe la dashboard più chiara per un proprietario del locale.
```

---

## 17. Prompt: ManagerDashboard — micro UI

**Modello da usare:** Gemini Flash

```text
Modifica solo @ManagerDashboard.jsx.

Fai solo questa modifica UI:
[descrizione precisa]

Mantieni la dashboard semplice per la beta.
Non aggiungere nuove feature.
Non modificare la logica approve/reject/live.
Non modificare altri file.
```

Dopo:

```bash
git diff src/pages/ManagerDashboard.jsx
```

---

## 18. Prompt: creare schermata Profilo Walrus Coming Soon

**Modello da usare:** Gemini Pro per il piano; Gemini Flash per applicare se è un solo file.

Step 1 — Piano:

```text
Analizza la struttura delle pagine esistenti.
Non modificare codice.

Voglio creare una schermata demo “Profilo Walrus / Coming soon” con dati finti:
- nickname;
- livello Tricheco;
- punti;
- badge;
- mood preferito;
- richieste;
- promo sbloccata.

Dimmi il modo più semplice per aggiungerla senza rompere il flusso attuale.
Indica i file da creare o modificare.
```

Step 2 — Applicazione:

```text
Crea solo il nuovo file necessario per la schermata “Profilo Walrus / Coming soon”.
Non modificare le schermate esistenti.
Non cambiare routing principale finché non lo chiedo.
Usa stile Walrus coerente con il progetto.
```

---

## 19. Prompt: creare nuova variante senza toccare originale

**Modello da usare:** Gemini Pro se la variante è importante; Gemini Flash se è una copia semplice.

```text
Crea una nuova variante partendo da @FileOriginale.jsx.
Nome nuovo file: @NuovaVariante.jsx.

Non modificare il file originale.
Non eliminare altre varianti.
Non cambiare routing principale.
Non modificare altri file.

Obiettivo della variante:
[descrizione]
```

Dopo:

```bash
git status
git diff
```

---

## 20. Prompt: routing / impostare variante principale

**Modello da usare:** Gemini Flash se è un cambio semplice; Gemini Pro se non è chiaro dove sia il routing.

```text
Analizza dove viene scelta la variante principale della schermata [nome schermata].
Non modificare codice.
Dimmi quale file devo modificare per puntare alla variante @NomeVariante.jsx.
```

Poi:

```text
Modifica solo @[file routing/import].
Imposta @NomeVariante.jsx come variante principale.
Non modificare altri file.
Non cambiare il contenuto della variante.
```

---

## 21. Prompt: debug errore terminale

**Modello da usare:** Gemini Pro

```text
Ho questo errore nel terminale:

[incolla errore]

Analizza solo i file strettamente necessari.
Non modificare codice subito.
Prima spiegami:
1. causa probabile;
2. file coinvolto;
3. modifica minima proposta.
```

Solo dopo conferma:

```text
Applica solo la modifica minima proposta.
Non modificare altri file.
```

---

## 22. Prompt: debug layout rotto

**Modello da usare:** Gemini Flash se è un solo file; Gemini Pro se coinvolge componenti CSS globali.

```text
La schermata [nome schermata] ha questo problema visivo:
[descrizione]

Analizza solo @NomeFile.jsx e gli eventuali CSS collegati se strettamente necessario.
Non modificare codice.
Dimmi la modifica minima per correggerlo.
```

Poi applicare con un secondo prompt.

---

## 23. Prompt: Review Changes prima di accettare

**Modello da usare:** stesso modello usato per la modifica.

```text
Prima che io accetti le modifiche, controlla il tuo lavoro.

Dimmi:
1. file modificati;
2. cosa hai cambiato;
3. se hai rispettato la richiesta di non modificare altri file;
4. se ci sono modifiche non richieste.

Non fare altre modifiche.
```

---

## 24. Prompt: annullare modifiche non volute

Questo non è un prompt per Antigravity, è comando terminale.

Per annullare un file specifico:

```bash
git restore src/pages/NomeFile.jsx
```

Per annullare tutte le modifiche non committate:

```bash
git restore .
```

Usare `git restore .` solo se si è sicuri.

---

## 25. Prompt: preparare commit message

**Modello da usare:** Gemini Flash oppure ChatGPT.

```text
Guarda questo diff e suggerisci un commit message breve in inglese.
Deve iniziare con un verbo e descrivere solo la modifica fatta.
```

Esempi:

```bash
git commit -m "Polish live TV reaction bar"
git commit -m "Improve customer jukebox mobile layout"
git commit -m "Add Walrus profile teaser screen"
git commit -m "Refine manager queue controls"
git commit -m "Fix demo reaction fallback"
```

---

## 26. Prompt: Vercel check prima deploy

**Modello da usare:** Gemini Flash se serve solo checklist; Gemini Pro se build fallisce.

Prima:

```bash
git status
npm run build
```

Se build ok:

```text
La build è ok. Prepara una mini checklist prima del deploy Vercel per questa modifica.
Non modificare codice.
```

Se build fallisce:

```text
Modello da usare: Gemini Pro

La build fallisce con questo errore:
[incolla errore]

Non modificare codice subito.
Spiegami causa probabile e modifica minima.
```

---

## 27. Prompt: one-page pitch futuro

Questo prompt è per ChatGPT o per un documento, non per Antigravity.

```text
Prepara una one-page pitch per The Walbox destinata al proprietario del Walrus Pub.
Tono: concreto, semplice, non troppo startup.
Struttura:
1. cos'è;
2. come funziona in una serata;
3. cosa vede il cliente;
4. cosa vede il gestore;
5. cosa guadagna il social media manager;
6. proposta beta: una serata test.
```

---

## 28. Prompt: regola finale per ChatGPT

Quando l’utente chiede il prossimo step operativo su Walbox, ChatGPT deve rispondere sempre con:

1. obiettivo dello step;
2. modello Antigravity da usare;
3. prompt pronto da copiare;
4. comando terminale dopo la modifica;
5. criterio commit/restore.

Esempio:

```text
Obiettivo: sistemare indentazione LiveTvScreen.

Modello da usare: Gemini Flash

Prompt da copiare:
...

Dopo fai:
git diff src/pages/LiveTvScreen.jsx

Se è ok:
git add src/pages/LiveTvScreen.jsx
git commit -m "Polish live TV reaction bar"

Se è sbagliato:
git restore src/pages/LiveTvScreen.jsx
```

