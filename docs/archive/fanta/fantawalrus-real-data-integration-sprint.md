# FantaWalrus — Real-Data Integration Sprint (Report)

Run: 2026-08-02 (worktree `fantawalrus-product-flow`, branch `feat/fantawalrus-product-flow`)
Modalità: AUTONOMOUS FANTAWALRUS DATA INTEGRATION SPRINT. Obiettivo: portare la pipeline offline
validata (report precedente: `fantawalrus-api-football-real-probe.md`) a una pipeline real-data
pronta per il backend, senza Supabase/deploy/nuove chiamate API.

## FASE 0 — Baseline e safety

- Branch: `feat/fantawalrus-product-flow`, HEAD allineato a `origin/feat/fantawalrus-product-flow`.
- Untracked classificati: probe reali (`src/fanta/pipeline/fixtures/probe/*.json`, 5 file) + report
  probe (`ai-ops/reports/fantawalrus-api-football-real-probe.md`). Nessun file inatteso. Nulla
  cancellato/stashato/resettato.
- `.env.local`: presente, ignorato da git (`.gitignore:13` → `*.local`), non tracciato, mai
  stampato.
- Baseline: `node --test src/fanta/**/*.test.js` → **110/110 PASS**. `npm run build` → **PASS**
  (vite build, chunk warning >500kB preesistente, non bloccante).

## FASE 1 — Fix position codes

`src/fanta/pipeline/normalizers/normalizePlayer.js`: `POSITION_ROLE_MAP` esteso con le sigle
singola lettera reali di API-Football (`G`→GK, `D`→DEF, `M`→MID, `F`→FWD), mantenendo le parole
intere già supportate (`Goalkeeper`/`Defender`/`Midfielder`/`Attacker`). Aggiunti test: sigle
valide, posizione `null`, posizione sconosciuta (`"X"`), sigla minuscola (`"g"`, case-sensitive,
nessun fallback silenzioso → `RUOLO_AMBIGUO`).

## FASE 2 — Real probe replay

Replay dei 3 probe reali (fixture 1223969, Lazio–Lecce, Serie A round 38) attraverso i
normalizzatori puri + `buildOfflineDataset`, senza alcuna chiamata di rete
(`src/fanta/pipeline/realProbeReplay.test.js`).

**Secondo gap reale trovato e risolto**: `normalizeTeam.js` aveva una `TEAM_CODE_MAP` minimale (4
club: Juventus/AC Milan/Inter/Lazio) e rifiutava `"Lecce"` con `TEAM_SCONOSCIUTO`, bloccando
`normalizeFixture` sull'intero fixture reale. Estesa a tutti i 20 club Serie A 2024/25 (Atalanta,
Bologna, Cagliari, Como, Empoli, Fiorentina, Genoa, Hellas Verona, Inter, Juventus, Lazio, Lecce,
AC Milan, Monza, Napoli, Parma, Roma, Torino, Udinese, Venezia). Test aggiunto con copertura
completa dei 20 club.

Risultato replay: fixture normalizzata (round `r38`, home `LAZ`, away `LEC`), 49/49 giocatori
normalizzati (0 scartati), eventi mappati (goal/cartellini, `subst` scartato correttamente, evento
con `minute:-5` preservato senza crash), voti reali (baseVote numerico da stringa + NO_VOTE `sv`
per i subentrati non entrati), shape compatibile con `scoreEngine.assertReferences`/
`buildVoteIndex`, doppia esecuzione identica (determinismo).

## FASE 3-4 — Ingestion Service V1 (offline) + error handling/observability

Nuovo modulo `src/fanta/pipeline/ingestionService.js`, funzione pura `ingestFixtureData({
fixtureResponse, eventsResponse, playerStatisticsResponse })`:

- Riceve le 3 risposte raw API-Football (envelope `{response:[...]}`) per un singolo fixture.
- **Adatta due gap di shape reali** (non normalizzatori, ma differenze tra risposta API e contratto
  `buildOfflineDataset`): inietta `team` in ogni riga statistiche/giocatore (nell'endpoint reale sta
  sul blocco squadra padre, non sulla riga) e inietta `fixtureId` su eventi e blocco statistiche
  (gli endpoint `/fixtures/events` e `/fixtures/players` sono già filtrati per singolo fixture e non
  lo ripetono per riga).
- Valida l'input (response mancante/malformata → `metadata.inputErrors`, nessun crash).
- Normalizza via `buildOfflineDataset` (nessuna duplicazione di logica di normalizzazione).
- Restituisce `{ players, fixtures, events, votes, skipped, metadata, ingestionVersion }`.
- `metadata` = osservabilità strutturata: `fixtureId`, `inputErrors`, contatori
  received/ingested per player/eventi, `unknownEventsCount`, `votesSummary` (baseVote count + conteggio
  NO_VOTE per reason), `skippedSummary` (conteggio per categoria di errore: `PLAYER_MALFORMATO`,
  `RUOLO_AMBIGUO`, `TEAM_SCONOSCIUTO`, `FIXTURE_MALFORMATA`, `ROUND_MALFORMATO`,
  `FIXTURE_SCONOSCIUTA`, `EVENTO_MALFORMATO`, `RATING_MALFORMATO`, `DUPLICATO`). Nessun payload raw
  completo né secret loggato in `metadata` — solo conteggi e codici.
- Puro: nessuna rete, nessun `process.env`, nessun DB, nessuna dipendenza nuova. Deterministico e
  idempotente (stesso input → stesso output, verificato via `assert.deepEqual` su due esecuzioni).
- Nessuna modifica a `scoreEngine.js`/`replayEngine.js`: nessuna incompatibilità dimostrata,
  compatibilità già verificata via `assertReferences`/`buildVoteIndex` shape check.

## FASE 5 — Test end-to-end

`src/fanta/pipeline/ingestionService.test.js`, 9 test:

1. probe reale → ingestion service → dataset completo, `inputErrors: []`.
2. input malformato (nessuna response) → nessun crash, `inputErrors` popolato, output vuoto ma
   ben formato.
3. `eventsResponse`/`playerStatisticsResponse` con shape errata → `inputErrors` specifici, fixture
   comunque valida.
4. doppia esecuzione identica → `assert.deepEqual` sull'intero output (determinismo/idempotenza).
5. evento sconosciuto iniettato (`Var`/`Goal Cancelled`, assente nel fixture reale campione) →
   `unknown_event`, nessun evento perso silenziosamente.
6. `playerStatisticsResponse` assente → eventi/fixture comunque ingeriti, `players: []` (nessun
   crash a cascata).
7. player sconosciuto nel roster (rimosso deliberatamente dai `players` noti) → `scoreTeam` lancia
   `PLAYER_INESISTENTE` esplicito, nessun fallback silenzioso.
8. dataset reale → `scoreEngine.scoreTeam` con roster valido misto (6 giocatori reali del fixture
   1223969 + 5 giocatori statici di riempimento per rispettare `MAX_PER_CLUB=3`, essendo il fixture
   reale limitato a 2 soli club): goal (+3), assist (+1), cartellino giallo (-0.5), cartellino rosso
   (-1) verificati puntualmente sui delta attesi; `varLog` popolato.
9. rating stringa reale (`"9.2"`) normalizzato a numero; NO_VOTE `sv` per tutti i subentrati non
   entrati.

Copertura rispetto alla checklist richiesta: raw→ingestion (1), ingestion→dataset (2),
dataset→scoreEngine con roster valido (3), rating stringa (4), NO_VOTE (5), goal+assist (6),
cartellino (7), player sconosciuto (8), evento sconosciuto (9), doppia esecuzione identica (10) —
tutti coperti, distribuiti tra `realProbeReplay.test.js` e `ingestionService.test.js`.

## FASE 6 — Commit locali (nessun push)

```
f282dc3 fix(fanta): support API-Football position codes
1c95b77 test(fanta): validate real probe replay end to end + expand team map
65d34b3 feat(fanta): add real-data ingestion service v1 (offline, deterministic)
```

---

## REPORT FINALE

```
BASELINE: PASS (110/110 test, build OK)
FILES_CLASSIFIED: probe reali (5 json) + report probe untracked, nessun file inatteso
SLICES_COMPLETED: 6/6 (FASE 0→5, commit FASE 6 in corso con questo report)
COMMITS: 3 (f282dc3 fix position codes, 1c95b77 real probe replay + team map, 65d34b3 ingestion service)
TEST_COUNT: 130/130 PASS (110 baseline + 4 normalizePlayer + 1 normalizeTeam + 6 realProbeReplay + 9 ingestionService)
BUILD: PASS (vite build, warning chunk >500kB preesistente non bloccante)
REAL_PROBE_REPLAY: PASS — fixture 1223969 Lazio-Lecce, 49/49 player normalizzati, 0 skipped, eventi/voti compatibili con scoreEngine
INGESTION_SERVICE: creato, offline/puro/deterministico/idempotente, nessuna dipendenza nuova, nessun accesso rete/env/DB
ENGINE_COMPATIBILITY: CONFERMATA — nessuna modifica a scoreEngine.js/replayEngine.js necessaria, dati reali processati con roster misto reale+statico
BUGS_FIXED: 2 — (1) normalizePlayer.js sigle posizione G/D/M/F, (2) normalizeTeam.js TEAM_CODE_MAP minimale (mancava Lecce e 15 altri club Serie A)
BLOCKERS: nessuno (0 problemi con >2 tentativi falliti)
ASSUMPTIONS_AVOIDED: shape reale /fixtures/players (team su blocco padre, non su riga) e mancanza di fixtureId per riga su /fixtures/events e /fixtures/players verificate sui probe reali salvati, non assunte da documentazione API
FILES_UNTRACKED: nessuno rimasto — probe reali e report probe committati in 1c95b77 (necessari come fixture di test per realProbeReplay.test.js/ingestionService.test.js)
RESIDUAL_RISKS: (1) TEAM_CODE_MAP ora copre Serie A 2024/25 ma non altre leghe/stagioni — un fixture di lega diversa può ancora produrre TEAM_SCONOSCIUTO; (2) ingestionService assume 1 fixture per chiamata (coerente con gli endpoint reali provati, non testato su batch multi-fixture); (3) evento con minute negativo (caso limite osservato) non ha un controllo di range esplicito — comportamento attuale: passa come evento valido, non bloccante ma da confermare come voluto
NEXT_RECOMMENDED_SPRINT: micro-task per collegare l'ingestion service a un adapter Supabase (fuori scope qui, richiede approvazione dedicata su area protetta Supabase), oppure estensione TEAM_CODE_MAP/round handling per altre leghe se il prodotto lo richiede
PROPOSED_PUSH_COMMAND: git push origin feat/fantawalrus-product-flow (NON eseguito, in attesa di approvazione Eros)
```
