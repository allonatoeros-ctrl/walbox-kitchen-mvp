// scoreEngine.test.js — FantaWalrus V1 (MT2-RESET) Classic italiano
// Esegui con: node --test src/fanta/engine/scoreEngine.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreTeam, scoreLeague, recalcWithRetraction } from "./scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function load(name) {
  return JSON.parse(readFileSync(join(dataDir, name), "utf8"));
}

const players = load("players.json");
const scoring = load("scoring.json");
const events = load("events.json");
const votes = load("votes.json");
const teams = load("teams_sample.json");

const ROLE_OF = {};
for (const p of players) ROLE_OF[p.id] = p.role;
const VOTE_OF = {};
for (const v of votes.votes) VOTE_OF[v.playerId] = v.noVote ? { noVote: true } : { baseVote: v.baseVote };

// --- Helpers ---
function makeTeam(id, roster, formation = "4-3-3") {
  return { teamId: id, formation, roster };
}

// roster valido deterministico (1 GK, 4 DEF, 3 MID, 3 FWD + 4 panchina outfield)
function validRoster() {
  const byRole = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) byRole[p.role].push(p.id);
  const used = {};
  const take = (role, n) => {
    const out = [];
    for (const id of byRole[role]) {
      if (out.length >= n) break;
      const c = players.find((x) => x.id === id).club;
      if ((used[c] || 0) < 3) { out.push(id); used[c] = (used[c] || 0) + 1; }
    }
    return out;
  };
  const starters = [...take("GK", 1), ...take("DEF", 4), ...take("MID", 3), ...take("FWD", 3)];
  const bench = [];
  for (const p of players) {
    if (bench.length >= 4) break;
    if (starters.includes(p.id)) continue;
    if (p.role === "GK") continue; // panchina solo outfield
    if ((used[p.club] || 0) < 3) { bench.push(p.id); used[p.club] = (used[p.club] || 0) + 1; }
  }
  return [
    ...starters.map((id) => ({ id, isStarter: true })),
    ...bench.map((id) => ({ id, isStarter: false })),
  ];
}

function startersOf(roster) {
  return roster.filter((r) => r.isStarter).map((r) => r.id);
}


// titolari con voto base (esclude chi e' sv nei votes.json -> sostituito)
function votedStarters(roster) {
  return startersOf(roster).filter((id) => !VOTE_OF[id].noVote);
}

// ============ QUALITY GATES ============

// 1. fantavoto individuale = base + bonus
test("fantavoto = voto base + bonus/malus", () => {
  const roster = validRoster();
  const fwds = startersOf(roster).filter((id) => ROLE_OF[id] === "FWD");
  const target = fwds[0];
  const base = VOTE_OF[target].baseVote;
  const ev = [{ eventId: "e1", round: "r01", fixtureId: "fix_001", playerId: target, type: "goal", minute: 10 }];
  const r = scoreTeam(makeTeam("t_x", roster), ev, players, scoring, votes);
  const pt = r.playerPoints.find((p) => p.id === target).points;
  assert.equal(pt, Math.round((base + 3) * 100) / 100, `${base} + 3 gol`);
});

// 2. tutti i bonus/malus
test("tutti i bonus/malus classici applicati", () => {
  const roster = validRoster();
  const st = votedStarters(roster);
  const gk = st.find((id) => ROLE_OF[id] === "GK");
  const defs = st.filter((id) => ROLE_OF[id] === "DEF");
  const mids = st.filter((id) => ROLE_OF[id] === "MID");
  const fwds = st.filter((id) => ROLE_OF[id] === "FWD");
  const ev = [
    { eventId: "a", round: "r01", fixtureId: "f1", playerId: fwds[0], type: "goal", minute: 10 },        // +3
    { eventId: "b", round: "r01", fixtureId: "f1", playerId: mids[0], type: "assist", minute: 11 },       // +1
    { eventId: "c", round: "r01", fixtureId: "f1", playerId: defs[0], type: "yellow_card", minute: 12 },  // -0.5
    { eventId: "d", round: "r01", fixtureId: "f1", playerId: defs[1], type: "red_card", minute: 13 },     // -1
    { eventId: "e", round: "r01", fixtureId: "f1", playerId: gk, type: "penalty_saved", minute: 14 },     // +3
    { eventId: "f", round: "r01", fixtureId: "f1", playerId: defs[2], type: "own_goal", minute: 15 },     // -2
    { eventId: "g", round: "r01", fixtureId: "f1", playerId: gk, type: "cleansheet_gk", minute: 90 },     // +1
    { eventId: "h", round: "r01", fixtureId: "f1", playerId: gk, type: "goal_conceded", minute: 16 },     // -1
    { eventId: "i", round: "r01", fixtureId: "f1", playerId: fwds[1], type: "penalty_missed", minute: 17 },// -3
  ];
  const r = scoreTeam(makeTeam("t_b", roster), ev, players, scoring, votes);
  const pts = (id) => r.playerPoints.find((p) => p.id === id).points;
  assert.equal(pts(fwds[0]), Math.round((VOTE_OF[fwds[0]].baseVote + 3) * 100) / 100);
  assert.equal(pts(mids[0]), Math.round((VOTE_OF[mids[0]].baseVote + 1) * 100) / 100);
  assert.equal(pts(defs[0]), Math.round((VOTE_OF[defs[0]].baseVote - 0.5) * 100) / 100);
  assert.equal(pts(defs[1]), Math.round((VOTE_OF[defs[1]].baseVote - 1) * 100) / 100);
  assert.equal(pts(gk), Math.round((VOTE_OF[gk].baseVote + 3 + 1 - 1) * 100) / 100);
  assert.equal(pts(defs[2]), Math.round((VOTE_OF[defs[2]].baseVote - 2) * 100) / 100);
  assert.equal(pts(fwds[1]), Math.round((VOTE_OF[fwds[1]].baseVote - 3) * 100) / 100);
});

// 3. decimali
test("gestisce decimali (6.5, -0.5)", () => {
  const roster = validRoster();
  const defs = votedStarters(roster).filter((id) => ROLE_OF[id] === "DEF");
  const base = VOTE_OF[defs[0]].baseVote;
  const ev = [{ eventId: "y", round: "r01", fixtureId: "f1", playerId: defs[0], type: "yellow_card", minute: 1 }];
  const r = scoreTeam(makeTeam("t_d", roster), ev, players, scoring, votes);
  const pt = r.playerPoints.find((p) => p.id === defs[0]).points;
  assert.equal(pt, Math.round((base - 0.5) * 100) / 100);
});

// roster esplicito valido (1 GK, 4 DEF, 3 MID, 3 FWD) con panchina DEF nota
function explicitRoster(starterIds, benchIds) {
  return [
    ...starterIds.map((id) => ({ id, isStarter: true })),
    ...benchIds.map((id) => ({ id, isStarter: false })),
  ];
}

// 4. SV con sostituto (p_002 DEF sv nei votes.json -> panchina p_003 DEF)
test("SV sostituito dalla panchina (stesso ruolo)", () => {
  const roster = explicitRoster(
    // 1 GK + 4 DEF + 3 MID + 3 FWD, max 3 per club
    ["p_011", "p_002", "p_022", "p_032", "p_046", "p_035", "p_048", "p_054", "p_055", "p_061", "p_067"],
    ["p_003", "p_012", "p_016", "p_019"]
  );
  const r = scoreTeam(makeTeam("t_sv1", roster), [], players, scoring, votes);
  const sub = r.playerPoints.find((p) => p.substituted);
  assert.ok(sub, "un subentro deve avvenire");
  assert.equal(sub.id, "p_003", "subentra il DEF di panchina p_003");
  assert.equal(r.playerPoints.find((p) => p.id === "p_002"), undefined, "p_002 sostituito non conteggiato");
  assert.equal(sub.points, VOTE_OF[sub.id].baseVote, "subentra con suo voto base");
});

// 5. SV senza sostituto valido (GK sv p_031, panchina senza GK)
test("SV senza sostituto valido = non conteggiato (0)", () => {
  const roster = explicitRoster(
    // GK p_031 sv; panchina senza GK; max 3 per club
    ["p_031", "p_022", "p_032", "p_046", "p_052", "p_025", "p_048", "p_054", "p_036", "p_061", "p_067"],
    ["p_058", "p_064", "p_066", "p_068"]
  );
  const r = scoreTeam(makeTeam("t_sv0", roster), [], players, scoring, votes);
  const gk = r.playerPoints.find((p) => p.id === "p_031");
  assert.equal(gk.points, 0, "GK sv senza sostituto = 0");
  assert.equal(gk.noVote, true);
});

// 6. limite 3 sostituzioni (4 titolari sv, solo 3 sostituzioni possibili)
test("massimo 3 sostituzioni: il 4° SV resta a 0", () => {
  const votesOverride = {
    round: "r01",
    votes: [...votes.votes, { playerId: "p_004", noVote: true, reason: "sv" }, { playerId: "p_005", noVote: true, reason: "sv" }],
  };
  // titolari sv: p_002 (sv), p_004 (sv), p_005 (sv), p_031 (sv GK) = 4 sv
  // panchina DEF: p_003, p_012, p_023, p_033 -> 4 DEF disponibili (3 sub max); nessun GK
  const roster = explicitRoster(
    ["p_031", "p_002", "p_004", "p_005", "p_022", "p_025", "p_048", "p_054", "p_036", "p_061", "p_067"],
    ["p_003", "p_012", "p_023", "p_033"]
  );
  const r = scoreTeam(makeTeam("t_3sub", roster), [], players, scoring, votesOverride);
  const subs = r.playerPoints.filter((p) => p.substituted).length;
  assert.ok(subs <= 3, `sostituzioni = ${subs}, devono essere <= 3`);
  // uno dei 4 sv (p_031 GK, o un DEF) resta a 0 per limite
  const zeroSv = r.playerPoints.filter((p) => p.noVote && p.points === 0);
  assert.ok(zeroSv.length >= 1, "almeno un SV oltre il limite resta a 0");
});

// 7. ordine panchina rispettato (p_002 sv, panchina DEF ordine p_003,p_012,...)
test("ordine panchina rispettato nelle sostituzioni", () => {
  const roster = explicitRoster(
    ["p_011", "p_002", "p_022", "p_032", "p_046", "p_035", "p_048", "p_054", "p_055", "p_061", "p_067"],
    ["p_003", "p_012", "p_016", "p_019"]
  );
  const r = scoreTeam(makeTeam("t_ord", roster), [], players, scoring, votes);
  const sub = r.playerPoints.find((p) => p.substituted);
  assert.equal(sub.id, "p_003", "subentra il 1° DEF in panchina (p_003)");
});

// 8. modulo valido / invalido
test("modulo valido accettato, invalido rifiutato", () => {
  const good = validRoster();
  assert.doesNotThrow(() => scoreTeam(makeTeam("t_ok", good), [], players, scoring, votes));

  const bad = [...good, { id: "p_003", isStarter: true }]; // 12 titolari
  assert.throws(() => scoreTeam(makeTeam("t_bad", bad), [], players, scoring, votes), /MODULO_INVALIDO/);

  const noGk = good.map((r) => (ROLE_OF[r.id] === "GK" ? { ...r, isStarter: false } : r));
  assert.throws(() => scoreTeam(makeTeam("t_nogk", noGk), [], players, scoring, votes), /MODULO_INVALIDO/);
});

// 9. nessun capitano/vice residuo
test("nessun capitano/vice nel motore V1", () => {
  const roster = validRoster().map((r) => ({ ...r, isCaptain: r.id === "p_001", isVice: r.id === "p_018" }));
  const r = scoreTeam(makeTeam("t_nocap", roster), [], players, scoring, votes);
  const gk = r.playerPoints.find((p) => p.id === "p_001");
  assert.equal(gk.points, VOTE_OF["p_001"].baseVote, "nessun raddoppio capitano in V1");
});

// 10. rettifica senza duplicati
test("recalcWithRetraction sottrae l'evento senza duplicare", () => {
  const roster = validRoster();
  const fwds = votedStarters(roster).filter((id) => ROLE_OF[id] === "FWD");
  const target = fwds[0];
  const base = VOTE_OF[target].baseVote;
  const ev = [{ eventId: "e1", round: "r01", fixtureId: "f1", playerId: target, type: "goal", minute: 10 }];
  const full = scoreTeam(makeTeam("t_rec", roster), ev, players, scoring, votes);
  const rec = recalcWithRetraction(makeTeam("t_rec", roster), ev, players, scoring, votes, { ...ev[0] });
  const pRec = rec.playerPoints.find((p) => p.id === target).points;
  assert.equal(pRec, base, "dopo rettifica torna al voto base");
  assert.equal(rec.total, Math.round((full.total - 3) * 100) / 100);
});

// 11. input non mutato
test("input non mutato dopo l'esecuzione", () => {
  const snapEvents = JSON.stringify(events);
  const snapVotes = JSON.stringify(votes);
  const snapTeams = JSON.stringify(teams);
  scoreLeague(teams, events, players, scoring, votes);
  assert.equal(JSON.stringify(events), snapEvents, "events mutati!");
  assert.equal(JSON.stringify(votes), snapVotes, "votes mutati!");
  assert.equal(JSON.stringify(teams), snapTeams, "teams mutati!");
});

// 12. errore esplicito su player inesistente
test("errore esplicito su player inesistente", () => {
  const roster = validRoster();
  const bad = [{ eventId: "eX", round: "r01", fixtureId: "f1", playerId: "p_NONEXIST", type: "goal", minute: 1 }];
  assert.throws(() => scoreTeam(makeTeam("t_err", roster), bad, players, scoring, votes), /PLAYER_INESISTENTE/);
});

// 13. errore su evento malformato (senza round)
test("errore su evento malformato (senza round)", () => {
  const roster = validRoster();
  const bad = [{ eventId: "eY", fixtureId: "f1", playerId: "p_001", type: "goal", minute: 1 }];
  assert.throws(() => scoreTeam(makeTeam("t_err2", roster), bad, players, scoring, votes), /EVENTO_MALFORMATO/);
});

// 14. lega ordinata (somma punti)
test("scoreLeague produce classifica ordinata 1-vs-tutti", () => {
  const standings = scoreLeague(teams, events, players, scoring, votes);
  assert.equal(standings.length, teams.length);
  for (let i = 1; i < standings.length; i++) {
    assert.ok(standings[i - 1].total >= standings[i].total, "non ordinata");
  }
});
