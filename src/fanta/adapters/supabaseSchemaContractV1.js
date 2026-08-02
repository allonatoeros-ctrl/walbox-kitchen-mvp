// supabaseSchemaContractV1.js — FantaWalrus Supabase Schema Pack V1
// Contratto tra pipeline/engine puri (src/fanta/pipeline/**, src/fanta/engine/**) e lo schema
// Supabase locale in supabase/migrations/**. Nessuna chiamata Supabase, nessun import di client:
// solo JSDoc + costanti, come contracts.js. Vedi CLAUDE.md §STOP — nessun collegamento reale.

/**
 * Input dell'ingestion service (già prodotto da src/fanta/pipeline/ingestionService.js,
 * invariato da questo contratto) verso il layer di persistenza.
 * @typedef {object} IngestionServiceOutput
 * @property {Array<object>} players   Output normalizePlayer, shape -> fanta_player_snapshots
 * @property {Array<object>} fixtures  Output normalizeFixture, shape -> fanta_fixtures
 * @property {Array<object>} events    Output normalizeEvent, shape -> fanta_events
 * @property {Array<object>} votes     Output normalizeRating/NO_VOTE, shape -> fanta_votes
 * @property {object} skipped         Conteggi per categoria di scarto (solo osservabilità)
 * @property {IngestionMetadata} metadata
 */

/**
 * Riga da scrivere in fanta_ingestion_runs. fixtureId+idempotencyKey = unique constraint DB
 * (vedi 0001_fanta_schema_v1.sql), garantisce che un retry non duplichi la riga.
 * @typedef {object} IngestionMetadata
 * @property {string} fixtureId
 * @property {string[]} inputErrors
 * @property {"pending"|"partial"|"failed"|"completed"} status  partial se skipped non vuoto
 * @property {object} raw  playersReceived/Ingested, eventsReceived/Ingested, unknownEventsCount,
 *                         votesSummary, skippedSummary — stesso shape già prodotto oggi
 */

/**
 * Snapshot formazione per una giornata, scritto in fanta_lineups.roster_snapshot (jsonb).
 * Un solo record per (team_id, round_id) — enforced da unique constraint + trigger deadline
 * (fn_enforce_lineup_deadline, 0002_fanta_functions_v1.sql).
 * @typedef {object} RoundLineupSnapshot
 * @property {string[]} starters  playerId, corrisponde a fanta_player_snapshots.id
 * @property {string[]} bench     playerId
 * @property {string|null} captain  fuori scope motore V1 (vedi backend contract audit) — null oggi
 */

/**
 * Formazione da validare/schierare, input di scoreEngine.validateLineup/resolveLineup
 * (nessuna modifica al motore: questo è solo lo shape di lettura da fanta_lineups).
 * @typedef {object} LineupSnapshot
 * @property {string} teamId
 * @property {string} roundId
 * @property {RoundLineupSnapshot} rosterSnapshot
 * @property {string|null} lockedAt  ISO timestamp, non null dopo deadline
 */

/**
 * Output di scoreEngine.scoreTeam(), shape 1:1 con fanta_team_scores (upsert su team_id+round_id,
 * mai insert puro — vedi backend contract audit §8 rischio "doppio calcolo").
 * @typedef {object} TeamScoreResult
 * @property {string} teamId
 * @property {string} roundId
 * @property {number} total
 * @property {object} breakdown  playerBreakdown per playerId
 * @property {Array<object>=} varLog  presente solo se scoreTeam è stato invocato con retractions
 */

/**
 * Riga di classifica derivata da scoreLeague(), shape 1:1 con fanta_standings.
 * Materializzata (non vista SQL) per performance TV — ricalcolata dal job batch, mai dal client.
 * @typedef {object} StandingsRow
 * @property {string} leagueId
 * @property {string} roundId
 * @property {string} teamId
 * @property {number} position  1-based, ordinamento per total desc
 * @property {number} total
 */

/**
 * Rettifica Sala VAR, shape 1:1 con fanta_var_adjustments (append-only, nessun update/delete
 * policy lato RLS — vedi 0003_fanta_rls_v1.sql). authorId deve combaciare con auth.uid() admin.
 * @typedef {object} VarAdjustmentRecord
 * @property {string} teamId
 * @property {string} roundId
 * @property {number} beforeTotal
 * @property {number} afterTotal
 * @property {string} reason
 * @property {string} authorId
 */

/** Stati ammessi per fanta_rounds.status — gate pubblicazione classifica (§5 game flow). */
export const ROUND_STATUSES = Object.freeze(["open", "locked", "finalized"]);

/** Stati ammessi per fanta_ingestion_runs.status. */
export const INGESTION_RUN_STATUSES = Object.freeze([
  "pending",
  "partial",
  "failed",
  "completed",
]);

/** Cap squadre per lega V1, deve combaciare con fanta_leagues.max_teams e fn_enforce_max_teams(). */
export const MAX_TEAMS_PER_LEAGUE_V1 = 60;
