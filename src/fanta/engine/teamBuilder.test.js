import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidLineup, buildPlayerIndex } from '../engine/scoreEngine.js';

const players = [
  { id: 'p_gk', role: 'GK', club: 'A' },
  { id: 'p_d1', role: 'DEF', club: 'A' },
  { id: 'p_d2', role: 'DEF', club: 'B' },
  { id: 'p_d3', role: 'DEF', club: 'C' },
  { id: 'p_d4', role: 'DEF', club: 'D' },
  { id: 'p_d5', role: 'DEF', club: 'E' },
  { id: 'p_m1', role: 'MID', club: 'B' },
  { id: 'p_m2', role: 'MID', club: 'C' },
  { id: 'p_m3', role: 'MID', club: 'D' },
  { id: 'p_m4', role: 'MID', club: 'E' },
  { id: 'p_m5', role: 'MID', club: 'F' },
  { id: 'p_f1', role: 'FWD', club: 'C' },
  { id: 'p_f2', role: 'FWD', club: 'D' },
  { id: 'p_f3', role: 'FWD', club: 'E' },
  { id: 'p_f4', role: 'FWD', club: 'F' },
  { id: 'p_f5', role: 'FWD', club: 'G' },
];

const MAX_BENCH = 4;

function restoreStarters(teamRaw, identityTeamId, validPlayerIds) {
  try {
    const team = JSON.parse(teamRaw);
    if (!team || team.teamId !== identityTeamId) return null;
    const roster = Array.isArray(team.roster) ? team.roster : [];
    const starters = roster.filter((r) => r && typeof r.id === 'string' && validPlayerIds.has(r.id) && r.isStarter);
    if (starters.length === 0) return null;
    const playerIndex = buildPlayerIndex(players);
    const validation = isValidLineup(starters, playerIndex);
    if (!validation.valid) return null;
    return starters.map((r) => r.id);
  } catch (e) {
    return null;
  }
}

// Mirror della logica di restore panchina in FantaTeamBuilder.jsx: stessa firma/ordine
// di filtri (id valido, isStarter === false, non già titolare, cap a MAX_BENCH).
function restoreBench(teamRaw, identityTeamId, validPlayerIds) {
  try {
    const team = JSON.parse(teamRaw);
    if (!team || team.teamId !== identityTeamId) return null;
    const roster = Array.isArray(team.roster) ? team.roster : [];
    const starters = roster.filter((r) => r && typeof r.id === 'string' && validPlayerIds.has(r.id) && r.isStarter);
    if (starters.length === 0) return null;
    const playerIndex = buildPlayerIndex(players);
    const validation = isValidLineup(starters, playerIndex);
    if (!validation.valid) return null;
    const starterIdSet = new Set(starters.map((r) => r.id));
    return roster
      .filter((r) => r && typeof r.id === 'string' && validPlayerIds.has(r.id) && r.isStarter === false && !starterIdSet.has(r.id))
      .slice(0, MAX_BENCH)
      .map((r) => r.id);
  } catch (e) {
    return null;
  }
}

test('team builder: restore roster compatibile', () => {
  const teamRaw = JSON.stringify({
    teamId: 'team_abc',
    formation: '4-3-3',
    roster: [
      { id: 'p_gk', isStarter: true },
      { id: 'p_d1', isStarter: true },
      { id: 'p_m1', isStarter: true },
      { id: 'p_f1', isStarter: true },
      { id: 'p_d2', isStarter: true },
      { id: 'p_m2', isStarter: true },
      { id: 'p_f2', isStarter: true },
      { id: 'p_d3', isStarter: true },
      { id: 'p_m3', isStarter: true },
      { id: 'p_f3', isStarter: true },
      { id: 'p_d4', isStarter: true },
    ],
  });
  const ids = new Set(players.map((p) => p.id));
  const res = restoreStarters(teamRaw, 'team_abc', ids);
  assert.ok(Array.isArray(res));
  assert.equal(res.length, 11);
});

test('team builder: mancato ripristino con teamId differente', () => {
  const teamRaw = JSON.stringify({
    teamId: 'team_other',
    roster: [{ id: 'p_gk', isStarter: true }],
  });
  const ids = new Set(players.map((p) => p.id));
  const res = restoreStarters(teamRaw, 'team_abc', ids);
  assert.equal(res, null);
});

test('team builder: dati storage malformati ignorati senza crash', () => {
  const ids = new Set(players.map((p) => p.id));
  assert.equal(restoreStarters('', 'team_abc', ids), null);
  assert.equal(restoreStarters('{}', 'team_abc', ids), null);
  assert.equal(restoreStarters('"string"', 'team_abc', ids), null);
  assert.equal(restoreStarters(JSON.stringify({ teamId: 'team_abc', roster: 'bad' }), 'team_abc', ids), null);
});

function starterRoster(benchEntries = []) {
  return [
    { id: 'p_gk', isStarter: true },
    { id: 'p_d1', isStarter: true },
    { id: 'p_m1', isStarter: true },
    { id: 'p_f1', isStarter: true },
    { id: 'p_d2', isStarter: true },
    { id: 'p_m2', isStarter: true },
    { id: 'p_f2', isStarter: true },
    { id: 'p_d3', isStarter: true },
    { id: 'p_m3', isStarter: true },
    { id: 'p_f3', isStarter: true },
    { id: 'p_d4', isStarter: true },
    ...benchEntries,
  ];
}

test('team builder: restore panchina compatibile (titolari + bench)', () => {
  const teamRaw = JSON.stringify({
    teamId: 'team_abc',
    formation: '4-3-3',
    roster: starterRoster([
      { id: 'p_d5', isStarter: false },
      { id: 'p_m4', isStarter: false },
    ]),
  });
  const ids = new Set(players.map((p) => p.id));
  const starters = restoreStarters(teamRaw, 'team_abc', ids);
  const bench = restoreBench(teamRaw, 'team_abc', ids);
  assert.equal(starters.length, 11);
  assert.deepEqual(bench, ['p_d5', 'p_m4']);
});

test('team builder: restore panchina troncata a MAX_BENCH (4)', () => {
  const teamRaw = JSON.stringify({
    teamId: 'team_abc',
    formation: '4-3-3',
    roster: starterRoster([
      { id: 'p_d5', isStarter: false },
      { id: 'p_m4', isStarter: false },
      { id: 'p_m5', isStarter: false },
      { id: 'p_f4', isStarter: false },
      { id: 'p_f5', isStarter: false },
    ]),
  });
  const ids = new Set(players.map((p) => p.id));
  const bench = restoreBench(teamRaw, 'team_abc', ids);
  assert.equal(bench.length, 4);
});

test('team builder: restore panchina ignora id duplicati con i titolari', () => {
  const teamRaw = JSON.stringify({
    teamId: 'team_abc',
    formation: '4-3-3',
    roster: [
      ...starterRoster([{ id: 'p_d5', isStarter: false }]),
      { id: 'p_d1', isStarter: false }, // già titolare, non deve comparire in bench
    ],
  });
  const ids = new Set(players.map((p) => p.id));
  const bench = restoreBench(teamRaw, 'team_abc', ids);
  assert.deepEqual(bench, ['p_d5']);
});

test('team builder: restore panchina con storage malformato -> null, no crash', () => {
  const ids = new Set(players.map((p) => p.id));
  assert.equal(restoreBench('', 'team_abc', ids), null);
  assert.equal(restoreBench('{}', 'team_abc', ids), null);
});
