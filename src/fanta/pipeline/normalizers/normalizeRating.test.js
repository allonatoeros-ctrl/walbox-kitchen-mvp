import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRating } from "./normalizeRating.js";

test("normalizeRating: rating valido -> baseVote", () => {
  const p = { player: { id: 1001 }, statistics: [{ games: { minutes: 90, rating: "7.200000" } }] };
  assert.deepEqual(normalizeRating(p), { playerId: "p_1001", baseVote: 7.2 });
});

test("normalizeRating: rating nullo con minuti giocati -> NO_VOTE rating_mancante", () => {
  const p = { player: { id: 1003 }, statistics: [{ games: { minutes: 67, rating: null } }] };
  assert.deepEqual(normalizeRating(p), { playerId: "p_1003", noVote: true, reason: "rating_mancante" });
});

test("normalizeRating: 0 minuti giocati (sv) -> NO_VOTE sv", () => {
  const p = { player: { id: 1007 }, statistics: [{ games: { minutes: 0, rating: null } }] };
  assert.deepEqual(normalizeRating(p), { playerId: "p_1007", noVote: true, reason: "sv" });
});

test("normalizeRating: rating non numerico -> NO_VOTE rating_invalido", () => {
  const p = { player: { id: 1008 }, statistics: [{ games: { minutes: 90, rating: "-" } }] };
  assert.deepEqual(normalizeRating(p), { playerId: "p_1008", noVote: true, reason: "rating_invalido" });
});

test("normalizeRating: rating fuori range -> NO_VOTE rating_invalido", () => {
  const p = { player: { id: 1009 }, statistics: [{ games: { minutes: 90, rating: "99" } }] };
  assert.deepEqual(normalizeRating(p), { playerId: "p_1009", noVote: true, reason: "rating_invalido" });
});

test("normalizeRating: playerId mancante -> throw esplicito", () => {
  assert.throws(() => normalizeRating({ player: { id: null }, statistics: [{ games: { minutes: 90, rating: "6.0" } }] }), /RATING_MALFORMATO/);
});
