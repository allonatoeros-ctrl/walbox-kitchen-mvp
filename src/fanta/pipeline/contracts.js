// contracts.js — FantaWalrus offline data pipeline
// Contratti raw minimi attesi da API-Football (fonte, non ancora chiamata: vedi CLAUDE.md §STOP).
// Solo JSDoc + costanti: nessuna logica, nessuna chiamata rete.

/**
 * @typedef {object} RawApiFootballPlayer
 * @property {{id:number, name:string, firstname?:string, lastname?:string, nationality?:string, photo?:string}} player
 * @property {Array<{
 *   team: {id:number, name:string, logo?:string},
 *   games: {position:string, rating?:string|null, minutes?:number|null, captain?:boolean, substitute?:boolean}
 * }>} statistics
 */

/**
 * @typedef {object} RawApiFootballFixture
 * @property {{id:number, date:string, status?:{short:string}}} fixture
 * @property {{id?:number, round:string}} league
 * @property {{home:{id:number,name:string}, away:{id:number,name:string}}} teams
 */

/**
 * @typedef {object} RawApiFootballEvent
 * @property {{elapsed:number, extra?:number|null}} time
 * @property {{id:number, name:string}} team
 * @property {{id:number|null, name?:string}} player
 * @property {{id:number|null, name?:string}=} assist
 * @property {string} type   es. "Goal" | "Card" | "subst" | "Var"
 * @property {string} detail es. "Normal Goal" | "Penalty" | "Own Goal" | "Yellow Card" | "Red Card"
 */

/**
 * @typedef {object} RawApiFootballPlayerStatistics
 * Endpoint /fixtures/players — statistiche + rating per giocatore per singola partita.
 * @property {{id:number,name:string}} team
 * @property {Array<{
 *   player: {id:number, name:string},
 *   statistics: Array<{
 *     games: {minutes:number|null, position:string, rating:string|null, captain?:boolean, substitute?:boolean},
 *     goals: {total:number|null, assists:number|null, saves?:number|null, conceded?:number|null},
 *     cards: {yellow:number|null, red:number|null},
 *     penalty: {scored:number|null, missed:number|null, saved?:number|null}
 *   }>
 * }>} players
 */

/** Ruoli interni ammessi dal motore (vedi scoreEngine.js ROLE_LIMITS). */
export const INTERNAL_ROLES = Object.freeze(["GK", "DEF", "MID", "FWD"]);

/** Range voto plausibile (scala italiana 1-10, tollerante fino 0-11 per bonus manuali). */
export const VOTE_MIN = 0;
export const VOTE_MAX = 11;
