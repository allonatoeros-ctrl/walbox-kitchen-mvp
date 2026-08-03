// FantaHome.test.js — F3 Home squadra.
//
// Il repo non ha infrastruttura di render React (nessun jsdom/testing-library
// tra le devDependencies, node --test non importa .jsx). Aggiungerne una è
// modifica a package.json/deps: area protetta, fuori scope per questo task.
//
// Questi test coprono quindi ciò che è verificabile senza render:
// 1) contratto dati — FantaHome delega TUTTO il giudizio di stato a
//    buildHomeState(); replichiamo gli stessi input che la pagina legge da
//    localStorage (stessi identity/team scritti da FantaEntryTesseramento e
//    FantaTeamBuilder) e verifichiamo i tre stati che la pagina rende.
// 2) contratto sorgente — assert statici sul file FantaHome.jsx che
//    verificano i vincoli del brief Hermes (adapter obbligatorio, stesse
//    chiavi localStorage del Team Builder, nessun captain/Auth/Supabase/
//    scoring/VAR/classifica/scheduler importato o menzionato nella pagina).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeState } from '../adapters/homeTeamAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const players = JSON.parse(readFileSync(join(__dirname, '../data/players.json'), 'utf8'));
const pageSource = readFileSync(join(__dirname, 'FantaHome.jsx'), 'utf8');

function makeIdentity(overrides = {}) {
  return {
    teamId: 'team_abc123',
    teamName: 'Test Club',
    managerNickname: 'Mister',
    crest: {
      id: 'crest_01',
      preset: { id: 'preset_01', shape: 'classic', pattern: 'stripes', palette: 'p1' },
    },
    teamColor: { id: 'color_gold', value: '#E9C46A', label: 'ORO' },
    ...overrides,
  };
}

function makeTeam(roster, formation = '4-3-3') {
  return { teamId: 'team_abc123', formation, roster, updatedAt: new Date().toISOString() };
}

const FULL_STARTERS = [
  'p_001', 'p_002', 'p_003', 'p_004', 'p_005',
  'p_006', 'p_007', 'p_008', 'p_009', 'p_010', 'p_011',
].map((id) => ({ id, isStarter: true }));
const BENCH = ['p_012', 'p_013'].map((id) => ({ id, isStarter: false }));

// === CONTRATTO DATI: i 3 stati che FantaHome ramifica ===

test('nessuna identity salvata -> missing_identity (FantaHome reindirizza a /fanta/entry)', () => {
  const state = buildHomeState(null, null, players);
  assert.equal(state.status, 'missing_identity');
});

test('identity presente ma nessuna squadra -> incomplete (FantaHome mostra CTA Team Builder)', () => {
  const state = buildHomeState(makeIdentity(), null, players);
  assert.equal(state.status, 'incomplete');
  assert.ok(state.identity, 'FantaHome mostra comunque crest/nome dal identity anche se incomplete');
  assert.equal(state.starters.length, 0);
});

test('squadra con roster valido -> valid (FantaHome mostra titolari, panchina, conteggi)', () => {
  const team = makeTeam([...FULL_STARTERS, ...BENCH]);
  const state = buildHomeState(makeIdentity(), team, players);

  assert.equal(state.status, 'valid');
  assert.equal(state.starters.length, 11);
  assert.equal(state.bench.length, 2);
  assert.equal(state.totalPlayers, 13);
  assert.deepEqual(state.counts, { GK: 2, DEF: 6, MID: 2, FWD: 3 });
  // Ogni giocatore mostrato in FantaHome deve avere nome/ruolo/club arricchiti
  // dall'adapter (la pagina non fa il proprio lookup su players.json per i tile).
  for (const p of [...state.starters, ...state.bench]) {
    assert.ok(p.name && p.role && p.club, `giocatore ${p.id} privo di dati arricchiti`);
  }
});

test('roster con meno di 11 titolari -> incomplete anche con panchina piena', () => {
  const team = makeTeam([...FULL_STARTERS.slice(0, 5), ...BENCH]);
  const state = buildHomeState(makeIdentity(), team, players);
  assert.equal(state.status, 'incomplete');
});

// === CONTRATTO SORGENTE: vincoli del brief Hermes su FantaHome.jsx ===

test('FantaHome usa obbligatoriamente buildHomeState dall\'adapter dedicato', () => {
  assert.match(pageSource, /from '\.\.\/adapters\/homeTeamAdapter\.js'/);
  assert.match(pageSource, /buildHomeState\(/);
});

test('FantaHome legge le stesse chiavi localStorage scritte da entry/team builder', () => {
  assert.match(pageSource, /fanta_walrus_team_identity/);
  assert.match(pageSource, /fanta_walrus_custom_team/);
});

test('FantaHome non tocca Auth/Supabase/DB', () => {
  assert.doesNotMatch(pageSource, /supabase/i);
  assert.doesNotMatch(pageSource, /from ['"]\.\.\/\.\.\/lib\//);
});

test('FantaHome non introduce captain/scoring/VAR/classifica/scheduler', () => {
  assert.doesNotMatch(pageSource, /captain|capitano/i);
  assert.doesNotMatch(pageSource, /from ['"]\.\.\/engine\//);
  assert.doesNotMatch(pageSource, /from ['"]\.\.\/hooks\//);
});

test('FantaHome usa solo il visual system Fanta esistente (barrel ui/)', () => {
  assert.match(pageSource, /from '\.\.\/components\/ui'/);
  assert.doesNotMatch(pageSource, /<div style=\{\{/, 'niente stile inline ad-hoc fuori dal design system');
});

console.log('FantaHome.test.js: tutti i test F3 Home passati.');
