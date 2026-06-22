# 25_WALBOX_NEXT_ACTION_PLAN.md

Versione: 1.0  
Data creazione: 2026-06-02  
Area: Walbox / Action Plan  
Completezza stimata: 94%

## Scopo

Piano operativo immediato per **Walbox / Walrus Social Jukebox**.

Passare da:

```text
abbiamo costruito una demo funzionante
```

a:

```text
abbiamo una proposta concreta, una demo pronta e un prossimo passo commerciale.
```

Regola centrale:

> Da ora Walbox va trattata come pilota vendibile, non come laboratorio infinito.

## Stato attuale

```text
Walbox è una demo funzionante online: clienti da telefono inviano richieste, Supabase sincronizza, Manager Dashboard gestisce, Live TV mostra l’esperienza e Spotify è integrato/testabile.
```

## Obiettivo immediato

Preparare Walbox per:

1. prossimo incontro/demo;
2. proposta Walbox Shuffle Night;
3. eventuale altro locale;
4. test reale controllato;
5. primo pacchetto vendibile.

Non costruire subito un SaaS completo.

## Principio operativo

Ogni azione Walbox deve appartenere a:

```text
1. Stabilità demo
2. Asset commerciali
3. Preparazione serata test
4. Feedback cliente
5. Replica nuovo locale
```

Se non rientra qui, probabilmente è roadmap.

## Stato tecnico

Funziona:

- Vercel deploy pubblico.
- App cliente da telefono.
- Ricerca Spotify pubblica senza login cliente.
- Invio richiesta.
- Supabase Realtime riceve.
- Manager Dashboard aggiorna.
- Live TV aggiorna.
- Spotify Test Panel funziona.
- Now Playing reale mostrabile.
- Flusso telefono → dashboard → TV confermato.
- Branding Walrus già forte.
- Live TV migliorata e funzionante.
- CustomerJukeboxOldOrange è la schermata cliente principale da rifinire solo se necessario.

## Core stabile da proteggere

```text
src/App.jsx
src/services/walboxDb.js
src/services/spotifyApi.js
api/search.js
vercel.json
package.json
Supabase schema
Spotify auth flow
ManagerDashboard.jsx
```

Regola:

```text
Se il task è commerciale/pitch/demo, non toccare codice.
Se il task è UI polish, modifica solo il file target.
Se il task tocca Supabase/Spotify, fai read-only analysis prima.
```

File UI modificabili con cautela:

```text
src/pages/CustomerJukeboxOldOrange.jsx
src/pages/LiveTvScreen.jsx
src/pages/CustomerEntryWalrusUpgrade.jsx
```

## Stato business

Feedback Walrus:

- proprietario positivo;
- stavano già pensando a una serata shuffle;
- social media manager ha chiesto: chi approva? chi gestisce? mi devi insegnare?
- la parola “social experience” è piaciuta.

Posizionamento:

```text
Walbox non è un jukebox.
Walbox non è un’app enorme.
Walbox non sostituisce il social media manager.
Walbox è una social experience interattiva per locali.
```

Frase principale:

```text
Walbox trasforma una serata normale in una social experience: i clienti partecipano dal tavolo, la TV crea atmosfera e il locale ottiene contenuti vivi da usare sui social.
```

## Risposta all’obiezione SMM

```text
Walbox non sostituisce il social media manager. Gli crea materiale vivo: dediche, reaction, classifiche, tavoli più attivi e momenti da trasformare in stories/post.
```

## Priorità immediate

### Priorità 1 — Non rompere demo stabile

```text
non toccare core.
```

### Priorità 2 — Creare asset commerciali

```text
WALBOX_ONE_PAGE.md
WALBOX_SHUFFLE_NIGHT_PROPOSAL.md
WALBOX_DEMO_SCRIPT.md
WALBOX_OBJECTION_SHEET.md
WALBOX_PRICING_NOTES.md
WALBOX_FOLLOWUP_MESSAGES.md
```

### Priorità 3 — Preparare test reale

```text
una serata
una playlist controllata
QR sui tavoli
dashboard staff
TV live
recap finale
```

Non account, loyalty, pagamenti, multi-locale.

### Priorità 4 — Nuovo locale

```text
CLIENT_CONTEXT_[NOME].md
PITCH_[NOME].md
DEMO_PLAN_[NOME].md
CLIENT_CHECKPOINT_[NOME].md
```

Prima di clonare codice.

## Now / Next / Later

Now:

```text
1. Creare one-page Walbox.
2. Creare proposta Walbox Shuffle Night.
3. Creare demo script 5 minuti.
4. Creare objection sheet.
5. Creare follow-up message.
6. Creare pricing notes base.
7. Fare test tecnico pre-demo.
```

Next:

```text
1. Preparare client context per altro locale.
2. Valutare piccolo polish mobile solo se necessario.
3. Creare template recap post-serata.
4. Preparare fallback Spotify.
5. Fare checkpoint Walbox aggiornato.
```

Later:

```text
1. Profilo Walrus fake.
2. Night Recap Agent/manual prompt.
3. Loyalty demo.
4. Tourist Mode demo.
5. Meme Generator mock.
6. Conti aperti mock.
7. Clone per altro locale.
```

Not now:

```text
multi-tenant
auth utenti
pagamenti
loyalty backend
social auto-publishing
MCP
Agent SDK
schema database nuovo
refactor App.jsx
refactor Supabase
refactor Spotify
```

## Asset da creare

### `WALBOX_ONE_PAGE.md`

```md
# WALBOX — Social Experience per Locali

## Cos’è
Una demo interattiva per trasformare una serata normale in un’esperienza live.

## Come funziona
1. QR al tavolo
2. Cliente sceglie canzone/reaction/dedica
3. Staff controlla da dashboard
4. TV mostra la serata live
5. Il locale ottiene contenuti social

## Perché serve
- più partecipazione;
- atmosfera;
- contenuti reali;
- format serata;
- dati leggeri.

## Prima prova
Una serata test con:
- playlist pre-approvata;
- QR;
- dashboard;
- TV;
- recap.

## Cosa non è
Non è un’app enorme.
Non sostituisce lo staff.
Non sostituisce il social media manager.

## CTA
Proviamola in una serata semplice.
```

### `WALBOX_SHUFFLE_NIGHT_PROPOSAL.md`

```md
# Walbox Shuffle Night — Proposta Serata Test

## Obiettivo
Testare una serata interattiva semplice.

## Setup
- QR sui tavoli;
- playlist controllata;
- dashboard staff;
- TV live;
- Spotify locale;
- recap finale.

## Cosa fa il cliente
- entra col QR;
- sceglie canzone;
- aggiunge mood/dedica;
- vede la serata in TV.

## Cosa fa lo staff
- controlla richieste;
- approva/rifiuta;
- mantiene controllo.

## Cosa ottiene il locale
- partecipazione;
- atmosfera;
- contenuti social;
- feedback clienti.

## Durata test
1 serata.

## Dopo il test
Decidiamo se continuare, modificare o fermarci.
```

### `WALBOX_DEMO_SCRIPT.md`

```text
1. Introduzione: non è app enorme, è serata test.
2. Telefono cliente: QR → richiesta.
3. Dashboard: controllo staff.
4. TV: atmosfera live.
5. Social: contenuti post-serata.
6. CTA: proviamola in una serata.
```

### Objection Sheet

Chi la gestisce?

```text
In beta partiamo semplice: playlist pre-approvata, dashboard facile e approvazione manuale/semi-automatica.
```

Il social media manager?

```text
Non viene sostituito. Riceve materiale vivo da trasformare in stories/post.
```

E se mettono canzoni brutte?

```text
Playlist controllata, moderazione o auto-approve solo su brani consentiti.
```

È complicato?

```text
Cliente: QR e invio. Staff: dashboard semplice. La prima prova serve proprio a testare fluidità.
```

## Linguaggio

Dire:

```text
format personalizzabile
social experience
serata test
contenuti live
prova a basso rischio
```

Evitare:

```text
profilazione
software enterprise
automazione totale
sostituisce il social media manager
aumenta sicuramente il fatturato
app enorme
```

## Task Antigravity eventuali

### Polish mobile CustomerJukeboxOldOrange

```text
Modifica solo @CustomerJukeboxOldOrange.

Obiettivo:
migliorare leggibilità e spacing mobile della sezione [specifica].

Contesto:
Walbox è stabile su Vercel con Supabase Realtime e Spotify funzionanti.

Non toccare:
- App.jsx
- walboxDb.js
- spotifyApi.js
- api/search.js
- routing
- Supabase
- Spotify
- ManagerDashboard
- LiveTvScreen

Fai solo patch UI minima.
Dopo dimmi come testare su mobile.
```

### Polish LiveTvScreen

```text
Modifica solo @LiveTvScreen.

Obiettivo:
migliorare leggibilità TV della sezione [specifica].

Non toccare:
- App.jsx
- walboxDb.js
- spotifyApi.js
- api/search.js
- ManagerDashboard
- CustomerJukebox

Fai solo patch UI.
Mantieni palette Walrus.
Dopo dimmi come testare su desktop/TV.
```

### Read-only Spotify/Supabase

```text
Modalità read-only.
Non modificare file.

Problema:
[PROBLEMA]

Analizza solo:
- src/App.jsx
- src/services/walboxDb.js
- src/services/spotifyApi.js
- api/search.js

Output:
1. causa probabile;
2. file coinvolti;
3. patch minima proposta;
4. rischio;
5. test.
```

## Checkpoint

### Walbox business checkpoint

```text
Agisci come Checkpoint Writer.

Materiale:
[APPUNTI]

Tipo:
Walbox business/client/demo

Crea checkpoint con:
1. data;
2. stato;
3. cosa è stato fatto;
4. feedback;
5. obiezioni;
6. decisioni;
7. cosa non promettere;
8. prossimo step singolo;
9. follow-up.
```

### Walbox technical checkpoint

```text
Agisci come Checkpoint Writer.

Materiale:
[APPUNTI TECNICI]

Tipo:
Walbox technical

Crea checkpoint con:
1. data;
2. file modificati;
3. test;
4. cosa funziona;
5. cosa non toccare;
6. problemi aperti;
7. prossimo step singolo;
8. prompt per ripartire.
```

## Decisione finale

Non aprire Antigravity per Walbox finché non hai almeno:

```text
WALBOX_ONE_PAGE.md
WALBOX_SHUFFLE_NIGHT_PROPOSAL.md
WALBOX_DEMO_SCRIPT.md
FOLLOWUP MESSAGE
```

Perché ora il collo di bottiglia è:

```text
commerciale / presentazione / test
```

non:

```text
codice.
```

## Checklist finale prima di pitch

```text
[ ] One-page pronta
[ ] Demo script pronto
[ ] Proposta Shuffle Night pronta
[ ] Follow-up pronto
[ ] Obiezioni pronte
[ ] Pricing notes pronte
[ ] Vercel testato
[ ] Telefono testato
[ ] Dashboard testata
[ ] TV testata
[ ] Spotify fallback pronto
[ ] Next step chiaro
```
