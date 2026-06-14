# WALBOX_PROJECT_CONTEXT.md

## 1. Identità del progetto

**Nome progetto tecnico:** Walrus Social Jukebox  
**Nome prodotto/pitch:** The Walbox / Walbox  
**Cliente/contesto:** The Walrus Pub  
**Tipo prodotto:** social experience interattiva per locali, pub e bar.

Walbox nasce come MVP React per trasformare una serata normale in una **social experience**: i clienti entrano tramite QR, interagiscono dal telefono, scelgono canzoni, mood, reaction e dediche; il locale modera tutto da dashboard e mostra il risultato su una Live TV Screen.

Il progetto non deve essere presentato solo come “jukebox”, ma come esperienza sociale del locale: musica, gioco, partecipazione, contenuti live, classifiche, meme, promo e dati leggeri sui clienti abituali.

---

## 2. Frase chiave di posizionamento

> Walbox trasforma una serata normale in una social experience interattiva: il cliente partecipa, il locale raccoglie dati leggeri, la TV crea atmosfera e il social media manager trova contenuti già pronti da pubblicare.

Questa frase è centrale. La parola **social experience** è piaciuta molto al social media manager e va usata nel pitch.

---

## 3. Obiettivo attuale

L’obiettivo non è costruire subito un’app enorme.  
L’obiettivo è arrivare a una **demo stabile, bella e mostrabile dal vivo**.

Demo target:

- accesso da telefono tramite QR;
- nickname + tavolo;
- scelta canzone da playlist pre-approvata;
- scelta mood/reaction;
- dedica breve;
- dashboard gestore per approvare/bocciare/mandare in live;
- TV screen spettacolare da mostrare su PC o TV;
- effetto wow per una possibile serata test.

Pitch corretto per il prossimo incontro:

> Non vi sto vendendo un’app enorme. Vi propongo una serata test semplice: una playlist, un QR, una TV, una dashboard e una social experience live.

---

## 4. Prima beta proposta

Nome possibile:

- Walrus Shuffle Night
- Shuffle Night powered by Walbox
- Walbox Night

Meccanica beta:

1. Il cliente scansiona il QR al tavolo.
2. Inserisce nickname e tavolo.
3. Sceglie una canzone da playlist pre-approvata.
4. Sceglie mood/reaction.
5. Scrive una dedica breve.
6. Il gestore vede la richiesta in dashboard.
7. Il gestore approva, boccia o manda in live.
8. La TV mostra canzone, tavolo, mood, reaction, dedica e classifiche.
9. Il social media manager può usare schermate, classifiche, meme e momenti della serata come contenuti social.

---

## 5. Posizionamento rispetto al social media manager

Obiezione emersa:

- “Chi approva?”
- “Chi la gestisce?”
- “Mi devi insegnare?”

Risposta strategica:

Walbox **non sostituisce** il social media manager.  
Walbox gli crea materiale vivo e già pronto:

- classifiche canzoni;
- mood della serata;
- tavoli più attivi;
- reaction più usate;
- meme;
- dediche divertenti;
- momenti live da condividere;
- contenuti per stories, reel, post e format ricorrenti.

Il social media manager non viene scavalcato: diventa la persona che valorizza la social experience.

---

## 6. Modalità di gestione

Per rispondere alle obiezioni operative, Walbox può essere presentato con tre livelli di gestione.

### Modalità manuale

Il gestore approva tutto manualmente.  
Ideale per la prima beta.

### Modalità semi-automatica

Playlist già approvata + filtro parole + dediche da controllare solo se necessario.

### Modalità automatica

Regole preimpostate: playlist chiusa, limiti richieste, filtri automatici, dediche controllate.  
Da considerare più avanti, non nella primissima demo.

---

## 7. Regola account/login

Non partire con account obbligatorio.

Accesso iniziale leggero:

- nickname;
- tavolo;
- eventuale Instagram/telefono solo opzionale.

Strategia corretta:

1. Prima fai giocare il cliente.
2. Poi proponi il profilo Walrus opzionale.
3. Solo dopo introduci punti, promo, badge e vantaggi.

Evitare la parola **profilazione**.  
Usare invece:

- memoria leggera del cliente;
- conoscere meglio i clienti abituali;
- promo in base a partecipazione, gusti e frequenza;
- esperienza personalizzata.

---

## 8. Schermate principali attuali

Struttura nota del progetto React:

```text
src/pages/CustomerEntry.jsx
src/pages/CustomerEntryClassic.jsx
src/pages/CustomerEntryOldOrange.jsx
src/pages/CustomerEntryPoster.jsx
src/pages/CustomerEntryWalrusUpgrade.jsx
src/pages/CustomerJukebox.jsx
src/pages/CustomerJukeboxCool.jsx
src/pages/CustomerJukeboxOldOrange.jsx
src/pages/CustomerJukeboxWalrusBrand.jsx
src/pages/LiveTvScreen.jsx
src/pages/LoadingScreen.jsx
src/pages/ManagerDashboard.jsx
src/components/TopBar.jsx
src/components/MoodBadge.jsx
src/components/SongRequestCard.jsx
src/components/ReactionBar.jsx
src/components/LogoPlaceholder.jsx
src/data/demoData.js
```

Nota: la struttura può cambiare. Quando cambia, aggiornare questo file.

---

## 9. Stato delle schermate

### CustomerEntryWalrusUpgrade

Questa variante è piaciuta molto ed è considerata la schermata entry migliore.  
Per ora non va modificata inutilmente.

### CustomerJukeboxOldOrange

È la schermata principale da ottimizzare lato mobile.  
Quando si lavora sulla parte cliente dove si selezionano canzone, mood, dedica e popup, usare il comando operativo:

```text
modifica solo @CustomerJukeboxOldOrange
```

### CustomerJukebox.jsx

Attualmente punta alla variante Old Orange come principale.

### LiveTvScreen.jsx

Va sistemata e resa spettacolare per presentazione da PC/TV.  
Non serve ottimizzarla per telefono.  
La TV Screen verrà mostrata da Mac, PC o collegata alla TV del locale.

### ManagerDashboard.jsx

Serve come Control Room del gestore.  
Deve restare semplice nella beta: approva, boccia, manda in live, vede coda.

### LoadingScreen.jsx

Già rifinita con immagine Budda cocktail in `/public` e stile Walrus.

---

## 10. Stile brand

Brand Walrus:

- nero / charcoal;
- giallo logo;
- arancione storico del vecchio locale;
- fucsia come accento social;
- stile bold, poster, merch, maglietta;
- tono ironico, autoironico, da pub.

Frasi e tono:

- ALWAYS THE FUCKING WALRUS;
- famiglia dei trichechi;
- Problemi fuori, birre dentro;
- CAVALLOOOO;
- OSCAR;
- Corto muso;
- Mi dissocio;
- Sta salendo male;
- CHE CAVALLOOOO 🐴.

Il tono deve essere divertente, locale, riconoscibile, ma non troppo confuso.

---

## 11. Regole di sviluppo importanti

### Non cancellare il lavoro già fatto

La versione costruita finora va mantenuta come patrimonio del progetto.  
Non eliminare varianti esistenti.  
Non riscrivere tutto da zero.

Si lavora per:

- estensione;
- miglioramento progressivo;
- nuove varianti;
- piccoli step controllati;
- commit frequenti.

### Una modifica alla volta

Ogni task deve essere piccolo e verificabile.

Workflow base:

```bash
git status
# modifica con Antigravity
git diff
npm run dev
# se funziona
git add <file>
git commit -m "messaggio chiaro"
```

### Prompt Antigravity

Usare prompt corti e specifici:

```text
Modifica solo @NomeFile.jsx.
Fai solo questa cosa.
Non modificare altri file.
```

---

## 12. Roadmap breve prima del prossimo incontro

Priorità operative:

1. Demo stabile su Vercel.
2. Flusso mobile completo.
3. Modalità Shuffle Night chiara.
4. Dashboard gestore semplice.
5. TV screen più spettacolare.
6. Mini pitch / one-page chiaro.
7. Schermata demo “Profilo Walrus / Coming soon”.

---

## 13. Roadmap futura

### Profilo Walrus / Coming soon

Schermata demo con dati finti:

- nickname;
- livello Tricheco;
- punti;
- badge;
- mood preferito;
- richieste fatte;
- promo sbloccata.

Serve per far capire il potenziale senza costruire subito backend/account reali.

### Gamification

Possibili elementi:

- punti per richieste;
- badge;
- classifica tavoli;
- classifica utenti;
- premio per tavolo più attivo;
- milestone tipo birra numero 1000;
- serate a tema;
- coupon sbloccabili.

### Promo personalizzate

Da introdurre dopo la beta:

- promo per frequenza;
- promo per mood/gusti musicali;
- promo compleanno;
- promo tavolo più attivo;
- utenti premium;
- richieste prioritarie.

### Foto opzionale su Live TV Screen

Feature futura: l’utente può scegliere/caricare una foto da mostrare al posto della cover della canzone.

Regola:

- se c’è foto, la TV mostra la foto;
- se non c’è foto, resta la cover della canzone.

Questa feature è opzionale, non obbligatoria.

### Meme Generator Walrus

Feature futura: area gioco dove utenti o staff possono scegliere template meme iconici, caricare/usare immagini e personalizzare scritte stile meme.

Da usare potenzialmente per:

- demo;
- social;
- stories;
- classifiche;
- contenuti ironici del locale.

Non è priorità ora.

### Tavoli / Conti aperti

Feature futura operativa:

- dashboard staff/proprietario;
- apertura tavolo per cliente/account;
- segnare consumazioni;
- conto accumulato su tavolo/cliente;
- stato pagato/non pagato;
- chiusura tavolo manuale o da app.

Obiettivo: risolvere il problema reale del locale nel tracciare chi ha preso cosa e chi deve ancora pagare.

---

## 14. Regola strategica finale

Walbox deve essere costruita come MVP semplice ma con una visione più grande.

Prima vendiamo/testiamo:

```text
una serata + una playlist + un QR + una TV + una dashboard
```

Poi espandiamo verso:

```text
account + punti + promo + dati leggeri + social content + operatività del locale
```

La demo deve far pensare:

> Questa cosa è già divertente adesso, ma può diventare molto più grande.

