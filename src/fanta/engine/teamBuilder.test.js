import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidLineup, buildPlayerIndex } from '../engine/scoreEngine.js';

const players = [
  { id: 'p_gk', role: 'GK', club: 'A' },
  { id: 'p_gk2', role: 'GK', club: 'H' },
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

// --- Panchina V1: max 4 riserve, max 1 GK ---
// Mirror di FantaTeamBuilder.jsx toggleBench(): stessa logica di cap usata dal componente.
const MAX_BENCH_GK = 1;
const playersById = Object.fromEntries(players.map((p) => [p.id, p]));

function toggleBenchPure(prev, id) {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  if (prev.length >= MAX_BENCH) return prev;
  const isGk = playersById[id]?.role === 'GK';
  if (isGk && prev.some((x) => playersById[x]?.role === 'GK')) return prev;
  return [...prev, id];
}

// Mirror di FantaTeamBuilder.jsx benchValidation: stessa definizione di "panchina completa".
function benchStatus(benchIds) {
  const gkCount = benchIds.filter((id) => playersById[id]?.role === 'GK').length;
  const errors = [];
  if (benchIds.length > MAX_BENCH) errors.push('troppe riserve');
  if (gkCount > MAX_BENCH_GK) errors.push('troppi GK');
  return { valid: errors.length === 0, complete: errors.length === 0 && gkCount >= 1, gkCount };
}

test('panchina: un GK può essere aggiunto in panchina', () => {
  const bench = toggleBenchPure(['p_d5'], 'p_gk2');
  assert.deepEqual(bench, ['p_d5', 'p_gk2']);
});

test('panchina: un secondo GK non viene aggiunto (max 1 GK)', () => {
  const bench = toggleBenchPure(['p_d5', 'p_gk2'], 'p_gk');
  assert.deepEqual(bench, ['p_d5', 'p_gk2'], 'il secondo GK candidato viene ignorato, bench invariata');
});

test('panchina: il GK già in panchina può essere rimosso (toggle off)', () => {
  const bench = toggleBenchPure(['p_d5', 'p_gk2'], 'p_gk2');
  assert.deepEqual(bench, ['p_d5']);
});

test('panchina: dopo la rimozione del GK, un altro GK può essere aggiunto', () => {
  const afterRemove = toggleBenchPure(['p_d5', 'p_gk2'], 'p_gk2');
  const afterAdd = toggleBenchPure(afterRemove, 'p_gk');
  assert.deepEqual(afterAdd, ['p_d5', 'p_gk']);
});

test('panchina: cap a MAX_BENCH (4) resta invariato con o senza GK', () => {
  const full = ['p_d5', 'p_m4', 'p_m5', 'p_gk2'];
  const bench = toggleBenchPure(full, 'p_f4');
  assert.deepEqual(bench, full, 'panchina piena, nuovo candidato ignorato');
});

test('panchina: incompleta senza GK, completa con esattamente 1 GK', () => {
  assert.equal(benchStatus(['p_d5', 'p_m4']).complete, false);
  assert.equal(benchStatus(['p_d5', 'p_m4', 'p_gk2']).complete, true);
});

test('panchina: con 2 GK è invalida (non completa) anche se il conteggio slot lo permetterebbe', () => {
  // stato raggiungibile solo bypassando toggleBenchPure (es. dato salvato manualmente);
  // benchStatus deve comunque segnalarlo come invalido, mai "completo".
  const status = benchStatus(['p_gk', 'p_gk2']);
  assert.equal(status.valid, false);
  assert.equal(status.complete, false);
});
