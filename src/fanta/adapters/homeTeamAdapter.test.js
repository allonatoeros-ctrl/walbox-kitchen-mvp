import assert from 'node:assert';
import { test } from 'node:test';
import { buildHomeState } from '../adapters/homeTeamAdapter.js';

const players = [
  { id: 'p_001', name: 'Portiere A', role: 'GK', club: 'A' },
  { id: 'p_002', name: 'Difensore B', role: 'DEF', club: 'B' },
  { id: 'p_003', name: 'Centrocampista C', role: 'MID', club: 'C' },
  { id: 'p_004', name: 'Attaccante D', role: 'FWD', club: 'D' },
  { id: 'p_005', name: 'Difensore E', role: 'DEF', club: 'E' },
  { id: 'p_006', name: 'Centrocampista F', role: 'MID', club: 'F' },
  { id: 'p_007', name: 'Attaccante G', role: 'FWD', club: 'G' },
  { id: 'p_008', name: 'Difensore H', role: 'DEF', club: 'H' },
  { id: 'p_009', name: 'Centrocampista I', role: 'MID', club: 'I' },
  { id: 'p_010', name: 'Attaccante L', role: 'FWD', club: 'L' },
  { id: 'p_011', name: 'Portiere M', role: 'GK', club: 'M' },
  { id: 'p_012', name: 'Difensore N', role: 'DEF', club: 'N' },
  { id: 'p_013', name: 'Centrocampista O', role: 'MID', club: 'O' },
  { id: 'p_014', name: 'Attaccante P', role: 'FWD', club: 'P' },
  { id: 'p_015', name: 'Difensore Q', role: 'DEF', club: 'Q' },
];

function startersOf(ids) {
  return ids.map((id) => ({ id, isStarter: true }));
}

function benchOf(ids) {
  return ids.map((id) => ({ id, isStarter: false }));
}

function makeIdentity(overrides = {}) {
  return {
    teamId: 'team_abc123',
    teamName: 'Test Club',
    managerNickname: 'Mister',
    crest: {
      id: 'crest_01',
      preset: {
        id: 'preset_01',
        shape: 'classic',
        pattern: 'stripes',
        palette: 'p1',
        name: 'ARDITI ADRIATICI',
        motto: 'Sul mare, avanti',
        territory: 'Costa Adriatica',
      },
    },
    teamColor: { id: 'color_gold', value: '#E9C46A', label: 'ORO' },
    ...overrides,
  };
}

function makeTeam(teamId, roster, formation = '4-3-3') {
  return { teamId, formation, roster, updatedAt: new Date().toISOString() };
}

// === MISSING IDENTITY ===
test('missing_identity quando identityRaw è null', () => {
  const state = buildHomeState(null, null, players);
  assert.equal(state.status, 'missing_identity');
  assert.equal(state.identity, null);
  assert.deepEqual(state.starters, []);
  assert.deepEqual(state.bench, []);
  assert.deepEqual(state.counts, { GK: 0, DEF: 0, MID: 0, FWD: 0 });
  assert.equal(state.totalPlayers, 0);
  assert.deepEqual(state.missingIds, []);
});

test('missing_identity quando identityRaw non è oggetto', () => {
  const state = buildHomeState('string', null, players);
  assert.equal(state.status, 'missing_identity');
});

test('missing_identity quando manca teamId', () => {
  const state = buildHomeState({}, null, players);
  assert.equal(state.status, 'missing_identity');
  assert.equal(state.identity, null);
});

// === INCOMPLETE ===
test('incomplete quando teamRaw è null ma identity esiste', () => {
  const state = buildHomeState(makeIdentity(), null, players);
  assert.equal(state.status, 'incomplete');
  assert.ok(state.identity);
  assert.equal(state.identity.teamId, 'team_abc123');
});

test('incomplete quando teamId non coerente', () => {
  const team = makeTeam('team_different', []);
  const state = buildHomeState(makeIdentity(), team, players);
  assert.equal(state.status, 'incomplete');
  assert.ok(state.identity);
});

test('incomplete quando roster vuoto', () => {
  const team = makeTeam('team_abc123', []);
  const state = buildHomeState(makeIdentity(), team, players);
  assert.equal(state.status, 'incomplete');
});

test('incomplete quando nessun titolare', () => {
  const roster = benchOf(['p_001', 'p_002']);
  const team = makeTeam('team_abc123', roster);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'incomplete');
  assert.deepEqual(state.starters, []);
  assert.deepEqual(state.bench, []);
});

// === VALID CONTRACT ===
test('valido con formazione completa e dati giocatori arricchiti', () => {
  const roster = [
    ...startersOf(['p_001', 'p_002', 'p_003', 'p_004', 'p_005', 'p_006', 'p_007', 'p_008', 'p_009', 'p_010', 'p_011']),
    ...benchOf(['p_012', 'p_013']),
  ];
  const team = makeTeam('team_abc123', roster);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'valid');
  assert.equal(state.identity.teamId, 'team_abc123');
  assert.equal(state.identity.teamName, 'Test Club');
  assert.equal(state.identity.nickname, 'Mister');
  assert.ok(state.identity.crest);
  assert.equal(state.identity.crest.id, 'crest_01');
  assert.ok(state.identity.teamColor);
  assert.equal(state.formation, '4-3-3');

  assert.equal(state.starters.length, 11);
  assert.equal(state.bench.length, 2);
  assert.equal(state.totalPlayers, 13);
  assert.deepEqual(state.counts, { GK: 2, DEF: 4, MID: 4, FWD: 3 });
  assert.deepEqual(state.missingIds, []);

  const starterNames = state.starters.map((s) => s.name);
  assert.ok(starterNames.includes('Portiere A'));
  assert.ok(starterNames.includes('Attaccante D'));

  const benchDef = state.bench.find((p) => p.role === 'DEF');
  assert.ok(benchDef);
  assert.equal(benchDef.club, 'N');
});

// === ROBUSTEZZA ===
test('gestisce dati malformati senza crash', () => {
  const state = buildHomeState({ teamId: 'team_abc123' }, { teamId: 'team_abc123', formation: '4-3-3', roster: 'not-array', updatedAt: 'x' }, players);
  assert.ok(['missing_identity', 'incomplete', 'valid'].includes(state.status));
});

test('player ID sconosciuti finiscono in missingIds e vengono esclusi', () => {
  const roster = startersOf(['p_001', 'p_999']);
  const team = makeTeam('team_abc123', roster);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'incomplete');
  assert.ok(state.missingIds.includes('p_999'));
  assert.equal(state.starters.length, 1);
  assert.equal(state.starters[0].id, 'p_001');
});

test('rimuove duplicati per id mantenendo ordine', () => {
  const roster = startersOf(['p_001', 'p_001', 'p_002']);
  const team = makeTeam('team_abc123', roster);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'incomplete');
  assert.equal(state.starters.length, 2);
  const ids = state.starters.map((s) => s.id);
  assert.deepEqual(ids, ['p_001', 'p_002']);
});

test('starters incompleti (<11) restano incomplete anche con panchina', () => {
  const roster = [
    ...startersOf(['p_001', 'p_002', 'p_003']),
    ...benchOf(['p_004', 'p_005']),
  ];
  const team = makeTeam('team_abc123', roster);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'incomplete');
  assert.equal(state.totalPlayers, 5);
  assert.deepEqual(state.counts, { GK: 1, DEF: 2, MID: 1, FWD: 1 });
});

test('accetta identity opzionali senza nickname/colore senza crash', () => {
  const identity = {
    teamId: 'team_abc123',
    teamName: 'Club',
    crest: { id: 'c1', preset: { id: 'pr1', shape: 'classic', pattern: 'stripes', palette: 'p1' } },
  };
  const team = makeTeam('team_abc123', startersOf(['p_001', 'p_002']));
  const state = buildHomeState(identity, team, players);

  assert.equal(state.status, 'incomplete');
  assert.equal(state.identity.teamName, 'Club');
  assert.equal(state.identity.nickname, '');
  assert.equal(state.identity.teamColor, null);
});

test('parsing identità preserva campi aggiuntivi non interferendo', () => {
  const identity = {
    teamId: 'team_abc123',
    teamName: 'Club',
    crest: null,
    extra: 123,
  };
  const team = makeTeam('team_abc123', startersOf(['p_001']));
  const state = buildHomeState(identity, team, players);

  assert.equal(state.status, 'incomplete');
  assert.ok(state.identity.crest === null);
});

console.log('homeTeamAdapter.test.js: tutti i test Fanta passati.');
