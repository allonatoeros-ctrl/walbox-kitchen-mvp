# FantaWalrus — API-Football Pro Plan Validation Report

Run: 2026-08-02T14:19Z (worktree `fantawalrus-product-flow`, branch `feat/fantawalrus-product-flow`)
Sostituisce il probe precedente (fallito con `errors.plan`: Free plan non copriva la data 2025-05-25).

## Precheck

- Branch: `feat/fantawalrus-product-flow` ✅
- Working tree: file di probe/report precedenti presenti come untracked, conservati (non toccati/cancellati) ✅
- `API_FOOTBALL_KEY`: presente in `.env.local` ✅ (valore mai stampato)
- `.env.local`: ignorato da git (`.gitignore:13` → `*.local`) ✅

## Budget

- Chiamate API eseguite: **3/3** (limite rispettato, nessun retry)
- Timeout per chiamata: 15s (tutte concluse entro il limite, HTTP 200 su tutte)
- STOP applicato prima di una quarta chiamata

## CALL 1 — `/fixtures?league=135&season=2024&date=2025-05-25&status=FT`

- HTTP 200, `errors: []`, `results: 6`
- **Il piano Pro è propagato**: nessun `errors.plan`, a differenza del tentativo precedente (Free plan bloccava la data).
- Fixture selezionato: **id 1223969** — Lazio vs Lecce, Serie A 2024/25, round "Regular Season - 38", status FT.
- Salvato in `src/fanta/pipeline/fixtures/probe/real_fixture_probe.json` (sanitizzato: solo campi `get/parameters/errors/results/response`, nessuna key).

## CALL 2 — `/fixtures/players?fixture=1223969`

- HTTP 200, `errors: []`, `results: 2` (2 squadre: Lazio, Lecce)
- Salvato in `src/fanta/pipeline/fixtures/probe/real_player_statistics_probe.json`.
- Titolari: `games.minutes` numerico, `games.rating` stringa numerica (es. `"6.9"`), `games.position` **abbreviata a singola lettera**: `"G"`, `"D"`, `"M"`, `"F"`.
- Panchinari non entrati: `games.minutes: null`, `games.rating: null`, `games.substitute: true` (18 casi osservati su 2 rose).

## CALL 3 — `/fixtures/events?fixture=1223969`

- HTTP 200, `errors: []`, `results: 18`
- Salvato in `src/fanta/pipeline/fixtures/probe/real_events_probe.json`.
- Tipi/detail osservati: `Goal|Normal Goal`, `Card|Yellow Card`, `Card|Red Card`, `subst|Substitution 1..5`.
- Nessun evento `Penalty`, `Own Goal`, `Missed Penalty` o `Var` in questa partita (fixture non li conteneva — non testato, non escluso).
- Un evento `Card|Red Card` ha `time.elapsed: -5` (cartellino "Argument" pre-partita, comments: "Argument") — valore minuto negativo, caso limite non visto nei fixture statici.
- Evento `Goal` con `assist.id`/`assist.name` valorizzati correttamente.

## Validazione contro normalizzatori

| Normalizzatore | Esito | Note |
|---|---|---|
| `normalizeFixture` | ✅ match | `fixture.id`, `fixture.date`, `teams.home/away`, `league.round` ("Regular Season - 38" → regex `\d+$` → `r38`) tutti compatibili. |
| `normalizeRound` | ✅ match | Formato round reale identico a quello atteso. |
| `normalizeEvent` | ✅ match (con nota) | `Goal/Normal Goal`, `Card/Yellow`, `Card/Red` mappati; `subst` correttamente scartato (return `[]`). Evento con `minute: -5` non causa errori (nessun controllo di range su `minute`), passa come valido — comportamento accettabile ma non esplicitamente previsto. Nessun evento VAR/Penalty osservato in questo fixture per testare quei rami. |
| `normalizeRating` | ✅ match | `minutes: null` → `NO_VOTE(SV)` corretto per tutti i panchinari; `rating: "6.9"` → parse a `6.9` corretto per i titolari. |
| **`normalizePlayer`** | ❌ **MISMATCH** | `POSITION_ROLE_MAP` in `normalizePlayer.js` si aspetta parole intere (`"Goalkeeper"`, `"Defender"`, `"Midfielder"`, `"Attacker"` — vedi anche i test in `normalizePlayer.test.js`), ma l'endpoint reale `/fixtures/players` restituisce `games.position` come **singola lettera** (`"G"`, `"D"`, `"M"`, `"F"`). Con i dati reali, `normalizePlayer` lancerebbe `RUOLO_AMBIGUO` per **ogni** giocatore, e `buildOfflineDataset` li scarterebbe tutti in `skipped.players`. |
| `buildOfflineDataset` | ⚠️ dipendente | Orchestratore corretto di per sé, ma eredita il mismatch di `normalizePlayer` sopra: con input reali da `/fixtures/players`, la lista `players` risulterebbe vuota. |

## Riepilogo strutturato

```
PLAN_STATUS: PRO_ACTIVE (propagato, nessun errors.plan su tutte e 3 le chiamate)
CALL_COUNT: 3/3
FIXTURE_USED: 1223969 (Lazio vs Lecce, Serie A 2024/25, round 38, 2025-05-25)
FIXTURE_SHAPE_MATCH: YES
PLAYER_STATS_SHAPE_MATCH: PARTIAL (minutes/rating/substitute OK; games.position è sigla singola lettera, non parola intera)
EVENTS_SHAPE_MATCH: YES (con caso limite minute negativo osservato, non gestito esplicitamente ma non bloccante)
RATING_FORMAT: stringa numerica (es. "6.9"), compatibile con normalizeRating
NULL_RATINGS: presenti e corretti per tutti i subentrati non entrati (rating:null, minutes:null)
UNKNOWN_EVENTS: nessuno in questo fixture (Goal/Card/subst tutti mappati); Penalty/OwnGoal/Var non testati (assenti nel fixture campione)
NORMALIZER_CHANGES_REQUIRED: SÌ — normalizePlayer.js: POSITION_ROLE_MAP deve accettare/mappare le sigle singola lettera reali ("G"→GK, "D"→DEF, "M"→MID, "F"→FWD) oltre (o al posto) delle parole intere attualmente testate
SECURITY_CHECK: OK — nessuna key stampata in chat, output/log, o nei file salvati; .env.local ignorato da git
NEXT_RECOMMENDED_TASK: micro-task dedicato per aggiornare POSITION_ROLE_MAP (e relativo test) in normalizePlayer.js con approvazione esplicita di Eros, prima di qualsiasi integrazione con dati reali
```

## Note

- Nessuna modifica al codice sorgente in questo run (solo probe read-only + report).
- Nessun commit, push, deploy, integrazione Supabase o UI eseguiti.
- File probe precedenti (`_probe_summary.json`, `real_league_135_probe.json`) conservati intatti.

## Aggiornamento — Real-Data Integration Sprint (2026-08-02)

Mismatch risolti nello sprint successivo (dettagli completi in
`ai-ops/reports/fantawalrus-real-data-integration-sprint.md`):

- **`normalizePlayer.js`**: `POSITION_ROLE_MAP` esteso con le sigle singola lettera reali
  (`G`→GK, `D`→DEF, `M`→MID, `F`→FWD), mantenendo le parole intere già supportate.
- **`normalizeTeam.js`**: `TEAM_CODE_MAP` era minimale (4 club) e rifiutava `"Lecce"` (presente nel
  fixture reale) con `TEAM_SCONOSCIUTO`. Esteso a tutti i 20 club Serie A 2024/25.
- **Gap di shape non normalizzatore** (bridged nel nuovo `ingestionService.js`, non nei
  normalizzatori): l'endpoint reale `/fixtures/players` riporta `team` sul blocco squadra padre, non
  su ogni riga statistiche/giocatore come si aspettano `normalizePlayer`/`normalizeRating`; gli
  endpoint `/fixtures/events` e `/fixtures/players` (query per singolo fixture) non riportano
  `fixtureId` per riga come richiesto da `buildOfflineDataset`. L'ingestion service inietta questi
  due campi dal contesto della chiamata prima di normalizzare.

`PLAYER_STATS_SHAPE_MATCH` passa da `PARTIAL` a `FULL` con questi fix; il replay del probe reale
1223969 (`realProbeReplay.test.js`, `ingestionService.test.js`) produce dataset completo, 0 player
scartati, shape compatibile con `scoreEngine`.
