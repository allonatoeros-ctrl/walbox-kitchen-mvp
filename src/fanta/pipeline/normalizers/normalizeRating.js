// normalizeRating.js — rating raw API-Football -> voto base (shape compatibile votes.json).
// rating API-Football = voto base V1 (decisione approvata). cleansheet_def/save restano DEFERRED altrove,
// non toccati qui: questo normalizzatore produce solo {playerId, baseVote} oppure NO_VOTE.
// Funzione pura.

import { VOTE_MIN, VOTE_MAX } from "../contracts.js";
import { noVote, NO_VOTE_REASONS } from "./NO_VOTE.js";

/**
 * @param {{player:{id:number,name?:string}, statistics:Array<{games:{minutes:number|null, rating:string|null}}>}} rawPlayerStat
 * @returns {{playerId:string, baseVote:number} | {playerId:string, noVote:true, reason:string}}
 */
export function normalizeRating(rawPlayerStat) {
  const rawId = rawPlayerStat?.player?.id;
  if (rawId === null || rawId === undefined) {
    throw new Error("RATING_MALFORMATO: playerId mancante");
  }
  const playerId = `p_${rawId}`;
  const games = rawPlayerStat?.statistics?.[0]?.games;
  const minutes = games?.minutes;

  if (minutes === null || minutes === undefined || minutes === 0) {
    return noVote(playerId, NO_VOTE_REASONS.SV);
  }

  const ratingRaw = games?.rating;
  if (ratingRaw === null || ratingRaw === undefined) {
    return noVote(playerId, NO_VOTE_REASONS.RATING_MANCANTE);
  }

  const parsed = Number(ratingRaw);
  if (Number.isNaN(parsed) || parsed < VOTE_MIN || parsed > VOTE_MAX) {
    return noVote(playerId, NO_VOTE_REASONS.RATING_INVALIDO);
  }

  return { playerId, baseVote: Math.round(parsed * 10) / 10 };
}
