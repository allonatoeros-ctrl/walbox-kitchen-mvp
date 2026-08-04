// fantaRosterPersistence.test.js — Fase 1 persistenza roster.
// Stile repo: assert statiche sul sorgente, no import runtime di moduli
// che richiedono import.meta.env o rete.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'fantaRosterPersistence.js'), 'utf8');

test('fantaRosterPersistence espone saveRosterV1', () => {
  assert.match(src, /export async function saveRosterV1\(/);
});

test('saveRosterV1 usa resolveSnapshotUUID per ogni id frontend', () => {
  assert.match(src, /resolveSnapshotUUID\(/);
});

test('saveRosterV1 opera su fanta_rosters con delete+insert', () => {
  assert.match(src, /from\('fanta_rosters'\)/);
  assert.match(src, /\.delete\(\)/);
  assert.match(src, /\.insert\(/);
});

test('saveRosterV1 filtra per team_id', () => {
  assert.match(src, /\.eq\('team_id', teamId\)/);
});

test('saveRosterV1 restituisce { ok, saved, error } senza lanciare eccezioni', () => {
  assert.match(src, /return \{ ok: false, saved: 0, error:/);
  assert.match(src, /return \{ ok: true, saved:/);
  assert.doesNotMatch(src, /throw /);
});

test('fantaRosterPersistence non importa routing/App/fanta_leagues', () => {
  assert.doesNotMatch(src, /fanta_leagues/);
  assert.doesNotMatch(src, /create_fanta_team_v1/);
  assert.doesNotMatch(src, /App\.jsx|App\.js|router/);
});

const loadSrc = readFileSync(join(__dirname, 'fantaRosterPersistence.js'), 'utf8');

test('fantaRosterPersistence espone loadRosterV1', () => {
  assert.match(loadSrc, /export async function loadRosterV1\(/);
});

test('loadRosterV1 usa fanta_rosters join fanta_player_snapshots senza toccare fanta_lineups', () => {
  assert.match(loadSrc, /from\('fanta_rosters'\)/);
  assert.match(loadSrc, /fanta_player_snapshots/);
  const loadFnStart = loadSrc.indexOf('export async function loadRosterV1');
  const loadFnEnd = loadSrc.indexOf('}\n', loadFnStart) + 1;
  const loadFn = loadSrc.slice(loadFnStart, loadFnEnd);
  assert.doesNotMatch(loadFn, /fanta_lineups/);
});

test('loadRosterV1 filtra per team_id e restituisce { ok, roster }', () => {
  assert.match(loadSrc, /\.eq\('team_id', teamId\)/);
  assert.match(loadSrc, /return \{ ok: false, roster: \[\], error:/);
  assert.match(loadSrc, /return \{ ok: true, roster \}/);
});

test('loadRosterV1 non lancia eccezioni e non scrive su Supabase', () => {
  const loadFnStart = loadSrc.indexOf('export async function loadRosterV1');
  const loadFnEnd = loadSrc.indexOf('}\n', loadFnStart) + 1;
  const loadFn = loadSrc.slice(loadFnStart, loadFnEnd);
  assert.doesNotMatch(loadFn, /throw /);
  assert.doesNotMatch(loadFn, /\.insert\(|\.delete\(/);
});

console.log('fantaRosterPersistence.test.js: tutti i test passati.');
