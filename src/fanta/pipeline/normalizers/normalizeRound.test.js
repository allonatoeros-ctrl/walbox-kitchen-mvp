import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRound } from "./normalizeRound.js";

test("normalizeRound: testo grezzo valido -> round interno r0N", () => {
  assert.equal(normalizeRound("Regular Season - 1"), "r01");
  assert.equal(normalizeRound("Regular Season - 12"), "r12");
});

test("normalizeRound: formati alternativi con numero finale sono comunque normalizzati", () => {
  assert.equal(normalizeRound("Round 3"), "r03");
});

test("normalizeRound: round malformato (nessun numero) -> throw esplicito", () => {
  assert.throws(() => normalizeRound("Giornata non valida"), /ROUND_MALFORMATO/);
});

test("normalizeRound: input mancante/vuoto -> throw esplicito", () => {
  assert.throws(() => normalizeRound(""), /ROUND_MALFORMATO/);
  assert.throws(() => normalizeRound(undefined), /ROUND_MALFORMATO/);
  assert.throws(() => normalizeRound(null), /ROUND_MALFORMATO/);
});
