# 17_WALBOX_CASE_STUDY.md

Versione: 1.0  
Data creazione: 2026-06-02  
Area: AI Business Factory / Case Study  
Completezza stimata: 92%

## Scopo

Documentare **Walbox / Walrus Social Jukebox** come primo vero caso studio della AI Business Factory.

È il documento che dimostra:

- cosa hai costruito;
- perché ha senso;
- problema risolto;
- stack tecnico;
- feedback reale;
- valore per il locale;
- MVP vs roadmap;
- cosa non promettere;
- come replicarlo per altri locali;
- come può diventare primo caso pilota/business.

Regola centrale:

> Walbox non è solo un’app: è la prova reale che puoi trasformare un’idea in una demo funzionante, presentabile e potenzialmente vendibile.

## Sintesi brutale

Walbox è il tuo primo MVP reale.

È:

- costruita;
- online;
- provata da telefono;
- collegata a Supabase;
- collegata a Spotify;
- visibile su dashboard;
- visibile su TV screen;
- presentata a un locale reale;
- capita come “social experience”;
- interessante anche per altri locali.

## One-liner

```text
Walbox trasforma una serata normale in una social experience interattiva: i clienti partecipano dal tavolo, la TV crea atmosfera e il locale ottiene contenuti vivi da usare sui social.
```

## Naming

```text
Walrus Social Jukebox
Walbox
The Walbox
Walbox Social Experience
Walbox Shuffle Night
Walbox TV
Walbox Night
```

## Problema

Nei locali spesso:

- i clienti vivono la serata in modo passivo;
- lo staff non ha strumenti semplici per creare momenti interattivi;
- il social media manager deve inventarsi contenuti dopo;
- la TV non è usata come parte della serata;
- le richieste musicali sono caotiche;
- manca un format facile per far partecipare i tavoli.

Walbox crea:

```text
QR al tavolo
↓
canzone / mood / dedica
↓
staff controlla
↓
TV live
↓
contenuti social / atmosfera / engagement
```

## Posizionamento

Walbox non è:

```text
un jukebox libero
un gestionale
un SaaS enterprise
un social network
un sostituto dello staff
un sostituto del social media manager
```

Walbox è:

```text
una social experience interattiva per locali.
```

## Target

- pub;
- bar con community;
- cocktail bar;
- locali con TV/schermo;
- locali con serate a tema;
- locali con presenza social;
- posti dove il pubblico può divertirsi con mood, dediche e reaction.

Primo caso pilota:

```text
The Walrus Pub
```

## Stack tecnico

- React + Vite;
- Vercel deploy;
- Supabase Realtime;
- Spotify API;
- customer flow mobile;
- manager dashboard;
- live TV screen;
- Spotify Test Panel;
- QR/table flow;
- mood/reaction/dedica.

## Flusso utente

Cliente:

```text
1. scansiona QR;
2. inserisce nickname / tavolo;
3. cerca una canzone;
4. sceglie mood/reaction;
5. scrive dedica;
6. invia richiesta;
7. vede la richiesta entrare nella serata.
```

Staff:

```text
1. apre dashboard;
2. vede richieste;
3. approva/rifiuta/gestisce;
4. mantiene controllo;
5. può mandare in live o gestire coda.
```

TV:

```text
1. mostra brano live;
2. mostra tavolo/nickname;
3. mostra mood/reaction;
4. mostra dedica;
5. crea atmosfera;
6. rende il locale partecipativo.
```

## Tono Walrus

- ironico;
- autoironico;
- diretto;
- un po’ sporco ma simpatico;
- da pub/serata;
- non corporate;
- non freddo;
- non gestionale.

Frasi/elementi:

```text
ALWAYS THE FUCKING WALRUS
Problemi fuori, birre dentro
CAVALLOOOO
OSCAR
Corto muso
Mi dissocio
Sta salendo male
Breaking Nius
```

Queste frasi possono diventare mood, reaction, badge, overlay TV, microcopy e momenti social.

## Feedback reale

Presenti alla presentazione:

- uno dei due proprietari;
- social media manager.

Reazione proprietario:

- positiva;
- stavano già pensando a una “serata shuffle”;
- l’idea di format interattivo ha senso.

Obiezioni SMM:

```text
Chi approva?
Chi la gestisce?
Mi devi insegnare?
```

Insight:

```text
social experience
```

La parola è piaciuta molto.

Posizionamento corretto:

```text
Walbox non sostituisce il social media manager.
Walbox crea materiale vivo per il social media manager.
```

## Valore business

1. Engagement: i clienti non sono passivi.
2. Atmosfera: la TV rende la serata visibile.
3. Social content: materiale da stories/post.
4. Dati leggeri: gusti, mood, partecipazione.
5. Format replicabile: Walrus Shuffle Night / Walbox Night / Social Jukebox Night.

## Cosa vendere

Non vendere:

```text
un’app enorme
un gestionale
un software enterprise
un sistema AI complesso
un jukebox libero
un prodotto definitivo
```

Vendi:

```text
una serata test interattiva
una social experience
un format per coinvolgere clienti
una TV live del locale
contenuti social pronti
una demo personalizzata
```

## MVP attuale

```text
QR/customer flow
Spotify search
mood/dedication
Supabase Realtime queue
Manager Dashboard
Live TV
Spotify playback/status
Vercel deploy
```

Sufficiente per demo, serata test, feedback, pitch e pilota.

## Non-MVP / roadmap

Non costruire ora:

```text
account utenti veri
login Instagram
loyalty backend
punti reali
pagamenti
multi-tenant
CRM
GDPR completo
automazioni social
meme generator completo
tourist mode completo
conti aperti reali
analytics avanzate
```

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

Regole:

```text
Se il task è commerciale/pitch/demo: non toccare codice.
Se il task è UI polish: modifica solo il file target.
Se il task tocca Supabase/Spotify: read-only analysis prima.
```

## Proposta serata test

```md
# Walbox Shuffle Night — Serata Test

## Obiettivo
Testare una social experience interattiva durante una serata reale.

## Include
- QR tavoli;
- richiesta canzoni;
- mood/dediche;
- dashboard staff;
- TV live;
- playlist controllata;
- mini recap post-serata.

## Cosa serve
- TV/schermo;
- PC/Mac collegato;
- account Spotify Premium locale;
- Wi-Fi stabile;
- una persona staff per controllo.

## Cosa misuriamo
- quante richieste;
- tavoli attivi;
- canzoni più richieste;
- mood;
- reazioni;
- contenuti social utili.

## Dopo
Decidiamo se usarla ancora, modificarla o lasciarla come test.
```

## Replicabilità

Cosa cambia per altro locale:

- logo;
- colori;
- testi;
- tono;
- mood/reaction;
- nome format;
- playlist;
- pitch.

Cosa resta:

- QR flow;
- queue;
- dashboard;
- TV;
- Supabase/Spotify logic;
- social experience concept.

## Clone workflow

```text
1. CLIENT_CONTEXT.md
2. Brand/copy analysis
3. Demo scope
4. UI adaptation
5. Test
6. Pitch
7. Serata test
8. Feedback
9. Package
```

## Prompt master Walbox next step

```text
Agisci come Walbox Specialist Agent.

Stato attuale:
[STATO]

Obiettivo:
preparare prossimo passo vendibile.

Output:
1. priorità;
2. cosa non fare;
3. task tecnico se serve;
4. task commerciale;
5. prompt per Antigravity/Claude;
6. pitch/follow-up;
7. checkpoint.
```

## Prompt engagement / mood

```text
Agisci come Walbox Specialist Agent + Product Experience Strategist.

Modalità read-only.
Non modificare file.
Non scrivere codice.

Obiettivo:
analizzare la sezione mood/reaction della schermata cliente e proporre un miglioramento più coerente con Walrus, più divertente e più utile alla Live TV.

Output:
1. diagnosi breve;
2. cosa non funziona nei mood attuali;
3. nuova lista mood/reaction Walrus;
4. label, emoji e tono consigliati;
5. quali mood devono apparire bene anche su Live TV;
6. rischi da evitare;
7. micro-task per Frontend Agent;
8. prompt finale per modificare solo il file necessario.

Vincoli:
- non toccare App.jsx;
- non toccare state/localStorage;
- non toccare dashboard;
- non toccare Live TV;
- non aggiungere backend;
- non aggiungere feature;
- non aggiungere stepper;
- solo proposta read-only.
```
