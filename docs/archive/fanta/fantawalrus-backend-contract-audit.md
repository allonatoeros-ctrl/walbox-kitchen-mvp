# FantaWalrus — Backend Contract Audit (Read-Only)

Data: 2026-08-02
Tipo: Read-only backend contract audit (CLAUDE.md §3 — nessuna modifica file, nessuna migration, nessuna chiamata Supabase/API, nessun commit/push)
Branch/worktree: `feat/fantawalrus-product-flow` (`/Users/erosallonato/Documents/Codex/2026-08-02/ou/work/fantawalrus-product-flow`)
Obiettivo: architettura minima per lanciare FantaWalrus con 60 squadre reali, partendo dallo stato attuale del codice (engine V1 stabile, pipeline offline pronta, UI in localStorage, zero backend).

Letti: `src/fanta/pipeline/**` (contracts.js, ingestionService.js, buildOfflineDataset.js, normalizers/*), `src/fanta/engine/scoreEngine.js`, `src/fanta/pages/{FantaEntryTesseramento,FantaTeamBuilder,FantaMatchday,FantaVarRoom}.jsx`, `src/fanta/adapters/customTeamAdapter.js`, `App.jsx` (righe route fanta, solo lettura), `CHECKPOINT.md`, `ai-ops/SECURITY_POLICY.md`, `ai-ops/reports/fantawalrus-offline-data-pipeline-report.md`, `ai-ops/reports/fantawalrus-product-engine-roadmap.md` (2026-08-01), `docs/walbox-strategy/FANTAWALRUS_PRODUCT_DIRECTION_AND_RESEARCH_BRIEF_V1.md`.

---

## 0. Stato di fatto (baseline per tutto il documento)

- **Zero backend oggi.** Ogni pagina Fanta (`FantaEntryTesseramento`, `FantaTeamBuilder`, `FantaMatchday`) legge/scrive solo `localStorage` (`fanta_walrus_team_identity`, `fanta_walrus_custom_team`) e JSON statici in `src/fanta/data/`. Nessun Supabase, nessuna auth, nessun multi-device.
- **`teamId` generato client-side** (`FantaEntryTesseramento.jsx:38`, `simpleHash(nome+crestId+timestamp)`), **senza verifica di unicità**: due utenti con stesso nome+stemma+istante teorico avrebbero collisione; più realisticamente, senza un registro condiviso, non c'è modo di impedire due squadre con lo stesso nome nella stessa lega.
- **Engine (`scoreEngine.js`) è puro e stabile**: `scoreTeam`/`scoreLeague`/`recalcWithRetraction`/`validateLineup`/`resolveLineup`. Non tocca I/O, non serve modificarlo per andare a 60 squadre — riceve già `teams[]`, `events[]`, `players[]`, `scoring`, `votes`, `retractions[]` come argomenti puri.
- **Pipeline offline (`src/fanta/pipeline/**`) già pronta e testata (85 test)**: normalizza risposte raw API-Football in `players/fixtures/events/votes` compatibili col motore. Non collegata a nessuna UI/route/hook oggi (per scelta, task precedente era solo data-pipeline).
- **Nessuna persistenza server-side per rosa/formazione/classifica**: la "classifica" oggi è ricalcolata a runtime da `teams_sample.json` + eventuale team custom in localStorage — non esiste alcuna fonte condivisa tra dispositivi.
- Conclusione baseline: **60 squadre reali sono impossibili nello stato attuale** — richiedono minimo un registro utenti/squadre condiviso (Supabase), perché localStorage è per-browser.

---

## 1. ENTITIES

| Entità | Descrizione | Esiste oggi? |
|---|---|---|
| **users** | Persona/dispositivo che partecipa alla lega (non necessariamente "account" in senso classico — vedi §6) | No (implicito: 1 browser = 1 "utente" via localStorage) |
| **leagues** | Contenitore stagionale/evento (1 lega Walrus, non multi-tenant al lancio) | No (implicito: singolo hardcoded "the league") |
| **teams** | Squadra fantasy iscritta a una lega (nome, stemma, owner) | Parziale: `identity` in localStorage (`teamId`, `teamName`, `crest`), nessun registro condiviso |
| **rosters** | Rosa completa posseduta da una squadra (15: 11+4, vincoli budget/club) | Parziale: `FantaTeamBuilder` salva roster in localStorage, nessun concetto di budget/prezzo collegato (pricing.json esiste ma non è usato) |
| **lineups** | Formazione schierata per una specifica giornata (sottoinsieme del roster, titolari/panchina, capitano) | Parziale: un solo roster "attivo" per team in localStorage, nessuna storicizzazione per giornata, nessun capitano/vice (dichiarato V1 out-of-scope nel motore) |
| **rounds** | Giornata di campionato reale (identificatore normalizzato `r0N`) | Sì: `normalizeRound.js`, usato da fixtures/events/votes |
| **fixtures** | Partita reale (home/away/date/round) | Sì: shape normalizzata (`normalizeFixture.js`), dati statici in `fixtures.json` |
| **player snapshots** | Anagrafica giocatore normalizzata (id/nome/ruolo/club) per una versione dei dati | Sì: `players.json` + `normalizePlayer.js`; nessun concetto di versione/valid_from-valid_to |
| **events** | Evento di gioco normalizzato (gol, cartellino, ecc.) legato a `playerId/fixtureId/round/minute` | Sì: shape stabile, consumata da `scoreEngine`/`replayEngine` |
| **votes** | Voto base (baseVote o NO_VOTE+reason) per giocatore/round | Sì: `normalizeRating.js` + `NO_VOTE.js`, shape XOR verificata dai test |
| **ingestion runs** | Un'esecuzione della pipeline di ingest per un fixture/round (metadata, skipped, versione) | Sì lato logica pura (`ingestionService.js` produce `metadata`), **non persistita** da nessuna parte (nessuna tabella "run") |
| **team scores** | Punteggio calcolato per una squadra/round (playerBreakdown + total + varLog + skippedEvents) | Sì come **output puro** di `scoreTeam()`, non persistito |
| **standings** | Classifica ordinata (teamId, total) per round/lega | Sì come output puro di `scoreLeague()`, non persistito, ricalcolata ad ogni render |

---

## 2. DATA OWNERSHIP

| Entità | Source of truth (V1 proposto) | Chi scrive | Chi legge | Frequenza update |
|---|---|---|---|---|
| users | Supabase `auth.users` (o tabella `fanta_users` se si evita auth completa — vedi §9 D1) | sistema (signup/login) | utente stesso, staff | on signup, raro |
| leagues | Supabase `leagues` | admin/staff (manuale, 1 riga per stagione) | tutti | quasi mai (setup iniziale) |
| teams | Supabase `fanta_teams` | utente (creazione/rinomina), admin (blocco/squalifica) | utente, staff, TV/classifica | on iscrizione, raro dopo |
| rosters | Supabase `fanta_rosters` (righe player_id + team_id, no concetto giornata) | utente (mercato/tesseramento iniziale) | utente, engine (scoring), staff | poche volte a stagione (mercato) |
| lineups | Supabase `fanta_lineups` (1 riga per team+round, snapshot titolari/panchina/capitano) | utente (entro deadline), poi immutabile | engine (scoring), staff, TV | 1x per round per team, entro deadline |
| rounds | JSON statico o tabella `rounds` minimale (num, deadline, stato open/locked/finalized) | admin/pipeline (apertura/chiusura giornata) | tutti | 1x per giornata |
| fixtures | Pipeline offline (oggi) → in futuro cache da API-Football, tabella `fixtures` | ingestion job (server-side, mai client) | engine, UI | 1x per giornata (o mai, se resta Fase 0 locale) |
| player snapshots | Tabella `players` (o JSON statico se si resta Fase 0) | ingestion job / admin (import manuale prezzi/ruoli) | engine, UI team builder | rara (variazioni ruolo rarissime in stagione) |
| events | Tabella `football_events`, scritta **solo** da ingestion job (mai da client) | ingestion job / admin (import manuale in Fase 1) | engine (scoring), Sala VAR, TV | per round, batch dopo fine partite |
| votes | Tabella `ratings` o riuso `football_events`-adjacent, scritta da ingestion job | ingestion job / admin | engine | per round, batch dopo fine partite |
| ingestion runs | Tabella `ingestion_runs` (fixtureId, idempotency_key, status, metadata, timestamp) | ingestion job (service role) | admin/staff (osservabilità), mai utente finale | 1x per tentativo di ingest |
| team scores | Tabella `scores` (team_id, round, total, breakdown jsonb) o **ricalcolo on-read** senza persistenza | engine (batch, dopo eventi finalizzati) | utente, TV, staff | 1x per round dopo finalizzazione (+ eventuali rettifiche) |
| standings | Vista derivata da `scores` (o tabella `standings` materializzata per performance TV) | engine (batch) o vista SQL | tutti (TV, utente, staff) | 1x per round, ricalcolata ad ogni rettifica |

Principio guida: **solo l'ingestion job (service role) scrive eventi/voti/fixtures**; l'utente non scrive mai dati "oggettivi" (eventi/punteggi), solo la propria rosa/formazione entro deadline.

---

## 3. MINIMUM TABLES V1

Vincoli: 1 lega, max 60 squadre, 1 formazione per giornata, punteggio, classifica. Minimalismo massimo — niente multi-lega, niente mercato/trasferimenti, niente capitano (già fuori scope motore V1).

```
leagues            (id, name, season, status)                         -- 1 riga
fanta_teams        (id, league_id, owner_user_id, name, crest, created_at)  -- ≤60 righe
fanta_rosters      (id, team_id, player_id)                            -- 15 righe × team
fanta_lineups      (id, team_id, round, roster_snapshot jsonb, locked_at)  -- 1 riga × team × round
players            (id, name, role, club)                              -- statico o cache ingest
fixtures           (id, round, home, away, date)                       -- statico o cache ingest
football_events    (id, fixture_id, round, player_id, type, minute)    -- da ingestion
ratings            (id, round, player_id, base_vote, no_vote, reason)  -- da ingestion
scores             (id, team_id, round, total, breakdown jsonb, computed_at)  -- da engine batch
ingestion_runs     (id, fixture_id, idempotency_key, status, metadata jsonb, created_at)
```

`fanta_teams.owner_user_id` presuppone una tabella `users` minima (anche solo `auth.users` di Supabase, senza tabella custom). `standings` **non è una tabella separata**: è `SELECT team_id, total FROM scores WHERE round = X ORDER BY total DESC` — evita doppia scrittura/drift.

Esplicitamente **non** in V1: `pricing`/budget (pricing.json non è collegato al motore oggi — nessuna tabella prezzi finché non è deciso se il budget è vincolo reale), `audit_log` dedicato (le rettifiche restano dentro `scores`/`ingestion_runs`+ log applicativo finché non serve un log immutabile separato), tabelle multi-lega.

---

## 4. INGESTION FLOW

- **Trigger**: manuale (Fase 1, "import manuale eventi" da brief §8) — un admin/staff avvia l'ingest per un fixture dopo fine partita. Nessun polling automatico in V1 (Fase 2 non autorizzata).
- **Idempotency key**: `fixture_id` (già disponibile via `ingestFixtureData()` → `metadata.fixtureId = "fix_<id>"`). Stesso fixture_id in input → stesso output deterministico (già garantito dalla pipeline pura esistente); a livello DB, `ingestion_runs` dovrebbe avere `UNIQUE(fixture_id, idempotency_key)` per bloccare doppio insert accidentale.
- **Snapshot strategy**: la risposta raw (o almeno l'hash + i 3 payload API-Football grezzi) va conservata **prima** della normalizzazione (in storage, non necessariamente DB) — permette replay/debug senza richiamare l'API a pagamento in caso di bug nel normalizzatore.
- **Retry policy**: idempotente per costruzione (funzioni pure, nessun side-effect nella pipeline stessa) → un retry ripete lo stesso ingest senza duplicare eventi, **a patto che** l'insert finale in `football_events`/`ratings` sia anch'esso idempotente (`ON CONFLICT DO NOTHING` su una chiave naturale evento, non solo un id auto-incrementale).
- **Evidence**: `metadata` già prodotta da `ingestFixtureData()` (playersReceived/Ingested, eventsReceived/Ingested, unknownEventsCount, votesSummary, skippedSummary) è esattamente l'evidence da salvare in `ingestion_runs.metadata` — nessuna nuova logica da scrivere, solo persistere l'output esistente.
- **Failure states**: `inputErrors` (già presente: `FIXTURE_RESPONSE_VUOTA_O_MALFORMATA`, `EVENTS_RESPONSE_MALFORMATA`, `PLAYER_STATISTICS_RESPONSE_MALFORMATA`) → stato `failed` in `ingestion_runs.status`; righe scartate (`skipped.*`) → stato `partial` (ingest riuscito ma con scarti, richiede occhio umano prima di finalizzare il round).

---

## 5. GAME FLOW

1. **Iscrizione**: utente crea account (o identità minima), sceglie nome+stemma → riga in `fanta_teams` (server-side, con controllo unicità nome nella lega — oggi assente).
2. **Creazione squadra**: selezione roster (15 giocatori, vincoli club/ruolo/budget se attivato) → `fanta_rosters`. Oggi: `FantaTeamBuilder` valida solo formazione titolare (`isValidLineup`), non l'intero roster da 15 con budget.
3. **Deadline**: apertura/chiusura round (`rounds`/`leagues.status` o campo dedicato) — prima della deadline l'utente può modificare `fanta_lineups`, dopo la riga è "locked" (immutabile lato utente). **Non esiste oggi nessun concetto di deadline** — `FantaTeamBuilder` permette salvataggio in qualunque momento.
4. **Calcolo**: dopo fine giornata reale, ingestion (manuale) popola `football_events`/`ratings`, poi un job batch chiama `scoreLeague()` (già pronto, puro) su tutti i `fanta_lineups` del round → scrive `scores`.
5. **Rettifiche**: Sala VAR (`recalcWithRetraction`, già pronto e testato) ricalcola `scores` per un team dopo una ritrattazione — oggi vive solo in `useState` locale di `FantaVarRoom.jsx` (reset a refresh, nessuna persistenza, nessun `audit_log`). Per 60 squadre reali questo **deve** persistere (altrimenti una rettifica fatta da staff sparisce al refresh e la classifica torna sbagliata per tutti).
6. **Pubblicazione classifica**: `scores`/`standings` derivati diventano visibili (TV/utente) solo dopo un flag esplicito "finalizzato" per il round — evita di mostrare classifiche provvisorie come definitive durante l'ingest.

---

## 6. SECURITY

- **RLS minima**:
  - `fanta_teams`/`fanta_rosters`/`fanta_lineups`: utente può leggere/scrivere **solo le proprie righe** (`owner_user_id = auth.uid()`), sempre in lettura le altre squadre della stessa lega (per classifica/derby).
  - `football_events`/`ratings`/`fixtures`/`players`: **read-only per tutti gli utenti**, scrittura riservata al service role (ingestion job) — mai al client.
  - `scores`/`standings`: read-only per utenti; scrittura solo da job batch (service role) o da azione admin esplicita (rettifica).
  - `ingestion_runs`: **nessun accesso utente finale**, solo staff/admin (dashboard interna) e service role.
- **Admin actions**: apertura/chiusura round, blocco formazioni, rettifica (Sala VAR), finalizzazione classifica → richiedono un ruolo `admin`/`staff` verificato (claim JWT o tabella ruoli), non solo "utente loggato". Oggi zero distinzione ruoli (nessuna auth).
- **Utenti**: dato che il brief esclude pagamenti/premi economici in V1 (§9 brief, "NON approvato"), l'auth potrebbe restare leggera (es. magic link/email, no verifica identità pesante) — ma deve comunque **esistere** per impedire una squadra "posseduta" da chiunque abbia il link (rischio reale con 60 squadre reali e classifica pubblica in TV).
- **Service role**: usato solo dal job di ingestion/scoring batch (server-side, mai esposto al client/browser). Le chiavi service role non vanno mai nel bundle frontend — coerente con CLAUDE.md §5 (secrets protetti).
- **Secret boundaries**: chiave API-Football (quando si passerà a Fase 1/2) va conservata **solo** lato server/edge function, mai in `.env` esposto al client Vite (che finirebbe nel bundle pubblico) — richiede un endpoint/edge function dedicato, non fetch diretto dal browser.

---

## 7. MIGRATION PLAN (micro-fasi)

1. **Schema**: creare le tabelle di §3 in Supabase (migration dedicata, area protetta — richiede task e approvazione esplicita separati da questo audit).
2. **Seed**: caricare `players.json`/`fixtures.json`/`scoring.json` esistenti come seed iniziale (dati già puliti e testati, zero rischio nuovo).
3. **Adapter**: collegare `ingestionService.js` (già pronto, puro) a un client Supabase che scrive `football_events`/`ratings`/`ingestion_runs` — nessuna modifica alla logica di normalizzazione, solo un layer di persistenza attorno.
4. **Ingestion**: primo run manuale reale su 1 fixture di test, verifica idempotenza (stesso fixture_id due volte → nessun duplicato).
5. **Scoring**: job batch che legge `fanta_lineups` + dati round-chiusi, chiama `scoreLeague()` (già pronto), scrive `scores`.
6. **UI**: collegare `FantaTeamBuilder`/`FantaMatchday`/`FantaVarRoom` a Supabase al posto di localStorage (swap hook, pattern già usato altrove nel repo per Jukebox — vedi `project_jukebox_supabase_connect` in memoria) + aggiungere auth minima + pagina iscrizione/registro squadre.
7. **QA**: test end-to-end con ≥2 dispositivi concorrenti (staff che rettifica mentre utente guarda classifica), verifica RLS con utente non-owner che tenta di scrivere roster altrui.

Ogni fase = task separato con Gate 1 dedicato (CLAUDE.md §3); Supabase resta area protetta (§5) per tutta la durata.

---

## 8. RISKS

- **Doppio calcolo**: se il job di scoring non è idempotente per round, una rettifica o un retry può sommare punti due volte — mitigare con `UPSERT` su `(team_id, round)` in `scores`, mai `INSERT` puro.
- **Dati parziali**: ingest con `skippedSummary` non vuoto (giocatori/eventi scartati) non dovrebbe finalizzare automaticamente il round — serve un gate umano esplicito prima di rendere pubblica la classifica.
- **Fixture rinviate**: `rounds`/`fixtures` devono supportare uno stato "rinviata"/non giocata, altrimenti l'assenza di eventi per una partita rinviata è indistinguibile da "0 eventi reali" — rischio di penalizzare ingiustamente giocatori di quella partita.
- **Rating tardivi**: se i voti (`ratings`) arrivano dopo il calcolo iniziale, serve un ricalcolo esplicito tracciato (stesso meccanismo di `recalcWithRetraction`, ma per rating mancante non per rettifica arbitrale) — oggi il motore distingue solo NO_VOTE vs baseVote, non "voto arrivato in ritardo".
- **Costi API**: Fase 1/2 (API-Football) hanno rate limit (100 req/giorno free) — con 60 squadre e una lega reale, il volume di richieste per round va stimato prima di autorizzare Fase 1 (non oggetto di questo audit, ma blocca la roadmap).
- **Permessi troppo larghi**: rischio concreto se si riusa una policy RLS "authenticated can read/write all" per velocità — con classifica pubblica e 60 utenti reali, una policy troppo permissiva permette a un utente di modificare la rosa di un altro o di leggere `ingestion_runs`/dati interni.
- **Dipendenza dal provider**: il brief (§12) impone "motore punteggio indipendente da provider" — rispettato oggi (scoreEngine non conosce API-Football), ma va mantenuto anche nello schema DB (non modellare tabelle sullo shape esatto di un singolo provider, restare sullo shape interno `{eventId, round, fixtureId, playerId, type, minute}` già stabile).

---

## 9. DECISIONS_REQUIRED_FROM_EROS

Solo le decisioni realmente bloccanti per iniziare lo schema:

- **D1 — Modello utenti**: auth Supabase completa (email/password o magic link) vs. identità leggera senza password (es. codice squadra + PIN)? Impatta direttamente lo schema `users`/RLS e il flusso di iscrizione (oggi zero auth).
- **D2 — Budget/prezzi**: `pricing.json` diventa un vincolo reale del roster (budget squadra) in V1, o resta fuori scope come oggi (roster libero, solo vincoli ruolo/club)? Impatta se serve o meno una colonna `price`/`budget_spent` in `fanta_rosters`/`fanta_teams`.
- **D3 — Deadline/lock formazione**: la deadline per giornata è una regola di prodotto già decisa (orario fisso? X ore prima del primo fixture?) o va progettata ora? Serve per decidere se `fanta_lineups.locked_at` è calcolato automaticamente o settato manualmente da staff.
- **D4 — Persistenza rettifiche (Sala VAR)**: le rettifiche devono avere un `audit_log` immutabile e pubblico (come da brief, "Sala VAR mostra... rettifica, timestamp") già in V1, o basta che `scores` rifletta il valore finale senza storico visibile? Impatta se `ingestion_runs`/una tabella `var_log` dedicata è nel primo schema o rimandabile.
- **D5 — Fase 1 (import manuale dati reali) è autorizzata ora**, o questo audit resta puramente preparatorio in attesa che la Fase 0 (replay locale, `teams_sample.json`) venga prima validata come da brief ("Fase 0... prima di comprare dati")? Determina se si procede subito a schema+seed o si resta su carta.

---

## STOP

Fermato al gate finale come richiesto: nessuna modifica a file applicativi, nessuna migration creata, nessuna chiamata Supabase/API, nessun commit/push. Report salvato in `ai-ops/reports/fantawalrus-backend-contract-audit.md` nel worktree indicato.
