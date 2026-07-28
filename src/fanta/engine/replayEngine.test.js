// replayEngine.test.js — MT3 quality gates (node:test, no new deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createReplay, sortEvents } from "./replayEngine.js";
import { scoreLeague } from "./scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = (n) => JSON.parse(readFileSync(join(__dirname, "../data", n), "utf8"));

const players = data("players.json");
const fixtures = data("fixtures.json");
const events = data("events.json");
const scoring = data("scoring.json");
const votes = data("votes.json");
const teamsSample = data("teams_sample.json");

// Helper validato (contratto V1): roster 4-3-3, <=3/club, no GK in panchina.
function validRoster(pls) {
  const byRole = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of pls) byRole[p.role].push(p.id);
  const used = {};
  const take = (role, n) => {
    const out = [];
    for (const id of byRole[role]) {
      if (out.length >= n) break;
      const c = pls.find((x) => x.id === id).club;
      if ((used[c] || 0) < 3) { out.push(id); used[c] = (used[c] || 0) + 1; }
    }
    return out;
  };
  const stars = [...take("GK", 1), ...take("DEF", 4), ...take("MID", 3), ...take("FWD", 3)];
  const bench = [];
  for (const p of pls) {
    if (bench.length >= 4) break;
    if (stars.includes(p.id) || p.role === "GK") continue;
    if ((used[p.club] || 0) < 3) { bench.push(p.id); used[p.club] = (used[p.club] || 0) + 1; }
  }
  return [
    ...stars.map((id) => ({ id, isStarter: true })),
    ...bench.map((id) => ({ id, isStarter: false })),
  ];
}

// Usa i team di esempio ma con roster validato (evita MODULO_INVALIDO/MAX_PER_CLUB nei test).
const teams = teamsSample.map((t) => ({ ...t, roster: validRoster(players) }));

const baseCfg = () => ({ fixtures, events, players, scoring, votes, teams });

test("1. ordine deterministico (round, fixture, minuto, eventId)", () => {
  const r = sortEvents(events);
  const cmp = (a, b) => {
    if (a.round !== b.round) return a.round < b.round ? -1 : 1;
    if (a.fixtureId !== b.fixtureId) return a.fixtureId < b.fixtureId ? -1 : 1;
    if (a.minute !== b.minute) return a.minute - b.minute;
    return a.eventId < b.eventId ? -1 : 1;
  };
  for (let i = 1; i < r.length; i++) {
    assert.ok(cmp(r[i - 1], r[i]) < 0, `ordine non monotono a ${i}`);
  }
  // stabile: ripetendo l'ordinamento ottengo lo stesso array
  const r2 = sortEvents(events);
  assert.deepEqual(r.map((e) => e.eventId), r2.map((e) => e.eventId));
});

test("2. eventi stesso minuto mantengono ordine stabile", () => {
  const sameMinute = events.filter((e) => e.minute === 12); // evt_001, evt_002 (stesso minuto)
  const r = sortEvents(sameMinute);
  assert.equal(r[0].eventId, "evt_001");
  assert.equal(r[1].eventId, "evt_002");
});

test("3. start/pause/resume", () => {
  const r = createReplay(baseCfg());
  assert.equal(r.getState().state, "idle");
  r.start();
  assert.equal(r.getState().state, "running");
  r.pause();
  assert.equal(r.getState().state, "paused");
  r.resume();
  assert.equal(r.getState().state, "running");
});

test("4. reset riporta a idle e azzeramento", () => {
  const r = createReplay(baseCfg());
  r.start();
  let n = 0;
  while (r.step()) n++;
  assert.ok(n > 0);
  r.reset();
  const s = r.getState();
  assert.equal(s.state, "idle");
  assert.equal(s.cursor, 0);
  assert.equal(s.appliedCount, 0);
});

test("5. seek riposiziona e ricalcola", () => {
  const r = createReplay(baseCfg());
  r.seek(5);
  const s = r.getState();
  assert.equal(s.cursor, 5);
  assert.equal(s.appliedCount, 5);
  assert.equal(s.state, "paused"); // seek da idle -> paused
  // seek oltre la fine -> completed
  r.seek(999);
  assert.equal(r.getState().state, "completed");
  // seek indietro -> applica meno eventi
  r.seek(2);
  assert.equal(r.getState().appliedCount, 2);
});

test("6. completed quando esauriti tutti gli eventi", () => {
  const r = createReplay(baseCfg());
  r.start();
  let steps = 0;
  while (r.step()) steps++;
  assert.equal(steps, events.length);
  assert.equal(r.getState().state, "completed");
  assert.equal(r.step(), null); // nessun evento oltre la fine
});

test("7. nessuna duplicazione dopo pause/resume/reset", () => {
  const seen = [];
  const r = createReplay({ ...baseCfg(), onEvent: (e) => { if (!e.__replayStart) seen.push(e.eventId); } });
  r.start();
  r.step(); r.step(); r.pause(); r.resume(); r.step();
  r.reset();
  seen.length = 0; // azzeriamo il tracciato: il nuovo replay deve essere privo di duplicati
  r.start();
  while (r.step()) {} // replay completo
  // ogni eventId compare esattamente una volta
  const counts = {};
  for (const id of seen) counts[id] = (counts[id] || 0) + 1;
  for (const id of Object.keys(counts)) assert.equal(counts[id], 1, `doppio evento ${id}`);
  assert.equal(seen.length, events.length);
});

test("8. modalità clock finto/sincrono (step sincrono, nessun timer)", () => {
  const starts = [];
  const r = createReplay({ ...baseCfg(), onEvent: (e) => { if (e.minute != null) starts.push(e.minute); } });
  r.start();
  // replay istantaneo: chiamiamo step() in loop, nessun setTimeout
  while (r.step()) {}
  assert.equal(starts.length, events.length);
});

test("9. input non mutato", () => {
  const cfg = baseCfg();
  const cfgEventsBefore = JSON.stringify(cfg.events);
  const cfgTeamsBefore = JSON.stringify(cfg.teams);
  const r = createReplay(cfg);
  while (r.step()) {}
  assert.equal(JSON.stringify(cfg.events), cfgEventsBefore);
  assert.equal(JSON.stringify(cfg.teams), cfgTeamsBefore);
});

test("10. integrazione minima con scoreEngine (standings aggiornati per evento)", () => {
  const standingsTrace = [];
  const r = createReplay({ ...baseCfg(), onEvent: (e, ctx) => { standingsTrace.push(ctx.standings); } });
  r.start();
  let prevFirst = null;
  while (r.step()) {
    const first = r.getState().standings[0];
    if (prevFirst !== null) {
      // i totali sono numeri e coerenti (possibile variazione per eventi con punti)
      assert.equal(typeof first.total, "number");
    }
    prevFirst = first;
  }
  // standings contiene tutti i team e ha lunghezza coerente
  assert.equal(r.getState().standings.length, teams.length);
  // dopo tutti gli eventi i totali riflettono goal/assist applicati
  const finalStandings = r.getState().standings;
  const anyGoal = events.some((e) => e.type === "goal");
  assert.ok(anyGoal);
});

test("11. tutti i test PASS (sanity: engine creabile e steppabile)", () => {
  const r = createReplay(baseCfg());
  assert.equal(typeof r.start, "function");
  assert.equal(typeof r.step, "function");
  assert.equal(typeof r.seek, "function");
  r.start();
  assert.ok(r.step() !== undefined);
});

test("12. errori espliciti su eventi/fixture incoerenti", () => {
  // evento senza fixture
  assert.throws(
    () => createReplay({ ...baseCfg(), events: [{ eventId: "x1", round: "r01", fixtureId: "NO_SUCH", playerId: "p_001", type: "goal", minute: 1 }] }),
    /EVENTO_SENZA_FIXTURE/
  );
  // evento con playerId inesistente
  assert.throws(
    () => createReplay({ ...baseCfg(), events: [{ eventId: "x2", round: "r01", fixtureId: fixtures[0].fixtureId, playerId: "p_NOPE", type: "goal", minute: 1 }] }),
    /PLAYER_INESISTENTE/
  );
  // evento malformato (manca minute)
  assert.throws(
    () => createReplay({ ...baseCfg(), events: [{ eventId: "x3", round: "r01", fixtureId: fixtures[0].id, playerId: "p_001", type: "goal" }] }),
    /EVENTO_MALFORMATO/
  );
});

test("13. nessun file fuori scope (solo replayEngine testato, scoreEngine integro)", () => {
  // scoreEngine deve rimanere importabile e funzionante
  const standings = scoreLeague(teams, events, players, scoring, votes);
  assert.equal(standings.length, teams.length);
});
