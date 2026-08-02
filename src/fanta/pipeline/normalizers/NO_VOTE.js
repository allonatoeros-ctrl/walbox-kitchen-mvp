// NO_VOTE.js — costruttore condiviso per voti mancanti/non affidabili (shape compatibile votes.json).

export const NO_VOTE_REASONS = Object.freeze({
  SV: "sv",
  RATING_MANCANTE: "rating_mancante",
  RATING_INVALIDO: "rating_invalido",
});

/**
 * @param {string} playerId
 * @param {string} reason uno dei NO_VOTE_REASONS
 * @returns {{playerId:string, noVote:true, reason:string}}
 */
export function noVote(playerId, reason) {
  return { playerId, noVote: true, reason };
}
