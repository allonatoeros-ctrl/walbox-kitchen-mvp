import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent } from "./normalizeEvent.js";

const ctx = { fixtureId: "fix_592871", round: "r01" };

test("normalizeEvent: goal normale con assist -> 2 eventi (goal + assist)", () => {
  const raw = {
    time: { elapsed: 12, extra: null },
    team: { id: 496, name: "Juventus" },
    player: { id: 1001, name: "D. Vlahović" },
    assist: { id: 1002, name: "W. McKennie" },
    type: "Goal",
    detail: "Normal Goal",
  };
  const events = normalizeEvent(raw, ctx);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "goal");
  assert.equal(events[0].playerId, "p_1001");
  assert.equal(events[1].type, "assist");
  assert.equal(events[1].playerId, "p_1002");
  for (const e of events) {
    assert.equal(e.round, "r01");
    assert.equal(e.fixtureId, "fix_592871");
    assert.equal(e.minute, 12);
  }
});

test("normalizeEvent: cartellino giallo/rosso mappati correttamente", () => {
  const yellow = normalizeEvent({ time: { elapsed: 45 }, player: { id: 1002 }, type: "Card", detail: "Yellow Card" }, ctx);
  const red = normalizeEvent({ time: { elapsed: 67 }, player: { id: 1003 }, type: "Card", detail: "Red Card" }, ctx);
  assert.equal(yellow[0].type, "yellow_card");
  assert.equal(red[0].type, "red_card");
});

test("normalizeEvent: subst ignorato (nessun evento fantacalcistico)", () => {
  const events = normalizeEvent({ time: { elapsed: 55 }, player: { id: 1006 }, type: "subst", detail: "Substitution 1" }, ctx);
  assert.deepEqual(events, []);
});

test("normalizeEvent: tipo sconosciuto -> unknown_event, nessun crash, replay resta deterministico", () => {
  const events = normalizeEvent({ time: { elapsed: 90 }, player: { id: 1005 }, type: "Var", detail: "Goal Disallowed - offside" }, ctx);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "unknown_event");
});

test("normalizeEvent: playerId mancante -> throw esplicito (campo mancante)", () => {
  assert.throws(() => normalizeEvent({ time: { elapsed: 90 }, player: { id: null }, type: "Card", detail: "Yellow Card" }, ctx), /EVENTO_MALFORMATO/);
});

test("normalizeEvent: minuto mancante -> throw esplicito", () => {
  assert.throws(() => normalizeEvent({ time: {}, player: { id: 1001 }, type: "Goal", detail: "Normal Goal" }, ctx), /EVENTO_MALFORMATO/);
});
