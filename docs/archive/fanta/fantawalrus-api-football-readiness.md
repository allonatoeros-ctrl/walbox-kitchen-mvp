# FantaWalrus — Audit API-Football Readiness

Audit **read-only**, nessuna chiamata API reale, nessun secret usato o creato, nessuna modifica a `.env`.
Perimetro: `src/fanta/data/*.json`, `src/fanta/engine/*.js`, `src/fanta/hooks/*.js`, `src/fanta/adapters/*.js`.
Riferimento esterno noto (solo pricing, nessun contratto dati): `docs/walbox-strategy/FANTAWALRUS_PRODUCT_DIRECTION_AND_RESEARCH_BRIEF_V1.md` §21 — API-Football Free 100 req/giorno, Pro 19 USD/mese 7.500 req/giorno.

---

## MODULE: Players (anagrafica giocatori)

CURRENT_CONTRACT: `players.json` — array flat `{ id, name, role, club, price }`. `role` ∈ `{GK,DEF,MID,FWD}` (4 valori, usati direttamente da `scoreEngine.validateLineup`/`ROLE_LIMITS`). `club` è una sigla libera a 3 lettere (JUV/MIL/INT/...), usata solo per il vincolo `MAX_PER_CLUB=3`, nessuna relazione con un id squadra reale API-side. `id` formato `p_0NN`, univoco, verificato a runtime (`buildPlayerIndex` lancia `PLAYER_DUPLICATO` se duplicato).

API_FOOTBALL_SOURCE: endpoint `players` (o `players/squads` per rosa club) — restituisce id numerico API-Football, nome, `position` in inglese libero (es. "Goalkeeper", "Defender", "Midfielder", "Attacker"/"Forward"), squadra come oggetto `{id, name, logo}`.

NORMALIZATION_REQUIRED:
- `position` (stringa libera EN, non enum chiuso) → 4 ruoli fissi `GK/DEF/MID/FWD`. API-Football usa varianti ("Attacker" vs "Forward", eventuali ruoli ibridi) che vanno mappate esplicitamente, non dedotte.
- id numerico API → id stabile locale (`p_0NN` o nuovo schema); serve una tabella di mapping persistente per non rompere `votes.json`/`teams_sample.json` a ogni resync.
- `club` — oggi è una sigla arbitraria nei sample; da API-Football arriva un id/nome squadra reale, serve normalizzare a un set fisso di sigle/club coerenti con la lega scelta (Serie A presumibilmente, da confermare).

MAPPING_REQUIRED: tabella `apiFootballPlayerId → local playerId` (persistente, non rigenerabile ad ogni sync); tabella `apiFootballPosition → role` (enum chiuso a 4 valori).

TEST_FIXTURE_REQUIRED: fixture statica con un payload `players` reale (anonimizzato/troncato) che copre i casi limite noti: ruolo ambiguo, giocatore senza `club` valorizzato, nome con caratteri accentati/apostrofi (già presente nei sample: "Kenan Yıldız", "Dušan Vlahović" — utile come riferimento di encoding).

GAPS: nessun mapping id esiste oggi nel repo. Nessuna decisione su quale lega/stagione (Serie A? quale fornitore di stagione?) — bloccante per costruire la fixture reale.

NEXT_TASK: creare `role` mapping table (pura, offline) `apiFootballPosition → GK|DEF|MID|FWD` con fixture di test; NON creare ancora l'id-mapping persistente (richiede decisione su storage, fuori scope offline).

RISKS: se il mapping ruolo è sbagliato per anche un solo giocatore, `validateLineup` può rifiutare formazioni altrimenti valide (falso negativo bloccante per l'utente) — nessun rischio di crash silente, il motore già lancia errori espliciti.

---

## MODULE: Fixture / Round

CURRENT_CONTRACT: `fixtures.json` — array flat `{ fixtureId, home, away, date }`, `home`/`away` sono sigle club libere (stesse di `players.json`). Nessun concetto di "round" nel file fixtures stesso: il `round` (`"r01"`) vive solo dentro `events.json`/`votes.json`, non è collegato esplicitamente a un set di fixture — l'associazione fixture↔round è implicita/assente nei dati sample attuali (i 4 fixture sample non hanno un campo `round`).

API_FOOTBALL_SOURCE: endpoint `fixtures` — id fixture numerico, `league.round` (stringa tipo "Regular Season - 1"), squadre come oggetti con id, data/ora con timezone.

NORMALIZATION_REQUIRED:
- `league.round` (stringa descrittiva) → `roundId` locale short-form (`"r01"`). Serve una funzione di parsing/normalizzazione esplicita, non un `parseInt` ingenuo sulla stringa.
- **Gap di schema**: `fixtures.json` andrebbe esteso con un campo `round` esplicito per collegare deterministicamente fixture↔round↔eventi/voti — oggi manca. Questo è un cambio di contratto dati (additivo, non distruttivo) da fare prima di ingerire dati reali.
- Data/ora con timezone API → `date` locale (oggi solo `YYYY-MM-DD`, nessun orario/timezone). Se serve mostrare orario kickoff, va esteso il contratto.

MAPPING_REQUIRED: `apiFootballFixtureId → local fixtureId`; `league.round string → roundId`.

TEST_FIXTURE_REQUIRED: fixture statica con 1 round completo (più fixture stesso round) per validare la normalizzazione round e il nuovo campo `round` su `fixtures.json`.

GAPS: `fixtures.json` non ha `round` — bloccante strutturale per qualunque pipeline reale multi-round (oggi funziona solo perché c'è un round sample unico "r01" implicito ovunque).

NEXT_TASK: proporre (non implementare senza approvazione) l'estensione additiva `fixtures.json[i].round`, poi normalizzatore puro `league.round string → roundId`.

RISKS: senza il campo `round` esplicito, un secondo round di dati reali romperebbe silenziosamente l'associazione fixture/eventi (nessuna validazione oggi lo impedirebbe — `replayEngine.validateInputs` verifica solo che l'evento referenzi una fixture esistente, non che il round combaci).

---

## MODULE: Eventi (goal/assist/cartellini/...)

CURRENT_CONTRACT: `events.json` — array flat `{ eventId, round, fixtureId, playerId, type, minute }`. `type` è un enum aperto usato come chiave diretta in `scoring.json` (`pointsForEvent`). Tipi oggi presenti nei sample ma **non** in `scoring.json` (quindi scartati by-design, tracciati in `skippedEvents`): `cleansheet_def`, `save`. Ordinamento deterministico by `(minute, round, fixtureId, eventId)` in `scoreEngine`, by `(round, fixtureId, minute, eventId)` in `replayEngine` (due criteri di ordinamento leggermente diversi tra i due file, coerenti nei rispettivi ambiti ma da tenere a mente).

API_FOOTBALL_SOURCE: endpoint `fixtures/events` — tipo evento come coppia `{type, detail}` (es. `type:"Card", detail:"Yellow Card"`; `type:"Goal", detail:"Normal Goal"` vs `"Penalty"` vs `"Own Goal"`), non un singolo enum piatto come nel contratto locale.

NORMALIZATION_REQUIRED:
- `{type, detail}` → singolo `type` locale piatto (`goal`, `own_goal`, `penalty_scored`, `yellow_card`, `red_card`, ...). Serve una tabella di decodifica esplicita coppia→enum, con un bucket "sconosciuto" esplicito per varianti non mappate (il motore già gestisce con grazia i tipi sconosciuti via `skippedEvents`, quindi il fallback esiste lato motore — va solo garantito che l'adapter non li scarti silenziosamente prima che arrivino a `skippedEvents`, altrimenti si perde visibilità).
- Assist non è sempre un evento separato in API-Football (a volte è un sub-campo del goal) — va deciso se sintetizzare un evento `assist` derivato o cambiare formato.
- `penalty_missed` vs `penalty_saved`: API-Football distingue "Missed Penalty" ma il "salvato dal portiere" è spesso implicito nel evento del portiere avversario, non un evento diretto sul portiere — richiede join fixture-level, non solo un remap 1:1 per evento.

MAPPING_REQUIRED: tabella `(apiType, apiDetail) → localType`; regola esplicita (documentata, non assunta) per derivare `assist` e `penalty_saved` se non arrivano come eventi diretti.

TEST_FIXTURE_REQUIRED: fixture statica con almeno un caso per ciascun tipo già supportato da `scoring.json`, più un caso di tipo non mappato (per verificare che finisca in `skippedEvents` e non venga perso silenziosamente).

GAPS: nessun adapter eventi esiste oggi. `cleansheet_def`/`save` sample non hanno un punteggio in `scoring.json` — da chiarire se è un gap di V1 (dimenticanza) o scelta deliberata (regola non ancora attiva) prima di normalizzare dati reali su questi tipi.

NEXT_TASK: normalizzatore puro `(apiType, apiDetail) → localType | "unknown"` con fixture di test; nessuna decisione su assist/penalty_saved derivati senza conferma prodotto.

RISKS: se l'adapter futuro scarta silenziosamente i tipi non mappati (invece di passarli come "unknown" a `skippedEvents`), si perde la tracciabilità che il motore oggi garantisce by-design.

---

## MODULE: Voti (rating) e NO_VOTE

CURRENT_CONTRACT: `votes.json` — `{ round, votes: [{playerId, baseVote}] }` oppure `{playerId, noVote:true, reason}`. Un solo file = un solo round (nessun array di round). `baseVote` è un numero decimale libero (6.0, 6.5, 7.0...), nessun range esplicito imposto dal motore (nessuna validazione min/max in `scoreEngine`). `reason` per `noVote` è testo libero non tipizzato (sample: `"sv"`, `"infortunato"` — due valori semanticamente diversi, entrambi trattati identicamente dal motore: nessun sostituto → 0 punti).

API_FOOTBALL_SOURCE: nessun endpoint nativo di "voto fantacalcio" — API-Football non fornisce rating stile Fantacalcio (quello è un dato editoriale, tipicamente da fornitori terzi tipo Fantacalcio.it/Gazzetta, non da API-Football). Il campo più vicino disponibile è `statistics.games.rating` per-partita (voto tecnico 1-10 di stampo diverso, non calibrato per fantacalcio italiano).

NORMALIZATION_REQUIRED:
- **Decisione di prodotto bloccante**: se il rating arriva da API-Football (`games.rating`, scala/calibrazione diversa da un voto Fantacalcio tradizionale) o da una fonte editoriale separata (non ancora scelta). Non normalizzabile senza questa decisione.
- NO_VOTE: oggi `reason` è testo libero non enum — se arriva da fonte reale (es. giocatore non convocato/infortunato/squalificato), serve un enum chiuso esplicito prima di alimentare logica prodotto (oggi `reason` non è usato per nessuna decisione, solo mostrato in Sala VAR come label — quindi il rischio attuale è basso, ma cambierebbe se `reason` iniziasse a pilotare regole).

MAPPING_REQUIRED: nessuno finché la fonte del voto non è decisa (API-Football `rating` vs fonte editoriale esterna).

TEST_FIXTURE_REQUIRED: bloccato dalla decisione di fonte — non producibile ora senza assumere un formato.

GAPS: il gap più grande dell'intero modulo Fanta verso API-Football readiness. Nessuna fonte di voto fantacalcio-style è nativa in API-Football.

NEXT_TASK: nessuna implementazione — questo è esplicitamente un caso "non procedere" per la FASE 3 (richiede decisione prodotto su fonte voti, esplicitamente fuori scope offline/autonomo).

RISKS: costruire una pipeline offline che assume erroneamente `games.rating` come voto fantacalcio produrrebbe punteggi sistematicamente sbagliati e silenziosamente plausibili (nessun errore, solo numeri scorretti) — il rischio più insidioso di tutto l'audit.

---

## MODULE: Squadre utente / Roster (teams_sample.json, custom team)

CURRENT_CONTRACT: interamente locale (localStorage + `teams_sample.json` per i mock). Non ha equivalente API-Football — è dominio FantaWalrus puro (rose costruite dagli utenti). Nessuna azione richiesta verso API-Football; questo modulo resta invariato dalla pipeline esterna.

CURRENT_CONTRACT / API_FOOTBALL_SOURCE / NORMALIZATION_REQUIRED / MAPPING_REQUIRED: N/A — modulo fuori perimetro API-Football by design.

TEST_FIXTURE_REQUIRED: N/A.

GAPS: nessuno rilevante per readiness API-Football.

NEXT_TASK: nessuno in questo track.

RISKS: nessuno diretto; rischio indiretto solo se in futuro si introduce un `playerId` esterno (vedi modulo Players) senza mantenere retro-compatibilità con gli `id` già salvati nelle rose custom in localStorage degli utenti — romperebbe le rose esistenti.

---

## Punti in cui i mock entrano nel prodotto (mappa completa)

- `FantaMatchday.jsx`: `teamsData` (mock) usato sempre come base classifica; `customTeam` sostituisce un solo slot mock quando valido (vedi fix overnight per squadra incompleta). Tutti gli altri 8 team restano sempre mock.
- `FantaVarRoom.jsx`: interamente su dati mock/sample (`teams_sample.json`, `varLog_sample.json`) — nessun collegamento a squadra custom utente, by design (Sala VAR è demo).
- `FantaTeamBuilder.jsx`/`FantaEntryTesseramento.jsx`: nessun mock, solo `players.json` (che diventerà la fonte da sincronizzare con API-Football).
- Engine (`scoreEngine.js`, `replayEngine.js`): agnostico rispetto a mock vs reale, consuma solo il contratto dati — nessuna modifica richiesta qui per l'integrazione futura, a patto che gli adapter garantiscano lo stesso contratto.

## Riepilogo GAPS bloccanti (ordine di priorità)

1. **Fonte voto fantacalcio-style non nativa in API-Football** — decisione di prodotto necessaria prima di qualunque lavoro su Voti.
2. **`fixtures.json` senza campo `round` esplicito** — gap strutturale, blocca qualunque pipeline multi-round anche con dati fittizi.
3. **Mapping ruolo/tipo-evento non enum-safe** (posizione API testo libero, coppia type/detail eventi) — richiede tabelle di normalizzazione esplicite, non deducibili automaticamente.
4. **`cleansheet_def`/`save` presenti nei dati ma assenti in `scoring.json`** — chiarire se è omissione V1 o scelta deliberata prima di normalizzare quei tipi da dati reali.

## Cosa NON è stato fatto (per costruzione, come da mandato)

Nessuna chiamata API reale eseguita. Nessun secret letto, creato o modificato. Nessun file `.env`/`.env.local` toccato. Nessuna nuova dipendenza aggiunta. Nessuna decisione presa su endpoint definitivi, piano tariffario, o mapping ruoli/eventi (solo la *necessità* di tali mapping è documentata sopra, non la loro implementazione).
