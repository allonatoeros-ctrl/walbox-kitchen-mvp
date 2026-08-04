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

console.log('fantaRosterPersistence.test.js: tutti i test passati.');
