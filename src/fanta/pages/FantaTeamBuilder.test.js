// FantaTeamBuilder.test.js — Team Builder cloud hydration contract.
// Stile repo: assert statiche sul sorgente, no render React.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'FantaTeamBuilder.jsx'), 'utf8');

test('FantaTeamBuilder importa loadRosterV1 dal persistence helper', () => {
  assert.match(src, /loadRosterV1/);
  assert.match(src, /fantaRosterPersistence/);
});

test('FantaTeamBuilder importa solo moduli fanta consentiti', () => {
  assert.doesNotMatch(src, /App\.jsx|App\.js/);
  assert.doesNotMatch(src, /router/);
  assert.doesNotMatch(src, /supabase/i);
});

test('FantaTeamBuilder non scrive su fanta_lineups', () => {
  assert.doesNotMatch(src, /fanta_lineups/);
});

test('FantaTeamBuilder mostra fallback cloud quando loadRosterV1 fallisce', () => {
  assert.match(src, /cloudHydrated/);
  assert.match(src, /cloudError/);
});

test('FantaTeamBuilder usa cloudHydrated come priorita nel footer', () => {
  assert.match(src, /Formazione caricata dal cloud/);
});

test('FantaTeamBuilder tratta { ok:true, roster:[] } come stato valido, non come errore cloud', () => {
  const effectStart = src.indexOf('loadRosterV1(identity.teamId)');
  const effectEnd = src.indexOf('}, [identityLoaded, identity, playersData]);', effectStart);
  const effect = src.slice(effectStart, effectEnd);
  assert.match(effect, /if \(!ok\) \{/, 'errore cloud solo quando ok e\' false, non su roster vuoto');
  assert.doesNotMatch(effect, /if \(ok && roster\.length > 0\)/, 'roster vuoto con ok:true non deve piu finire nel ramo else/errore');
  assert.match(effect, /setCloudHydrated\(true\);\s*\n\s*\}\)\s*\n\s*\.catch/, 'cloudHydrated va a true anche quando il roster cloud e\' vuoto (unico setCloudHydrated(true), fuori dal ramo roster.length > 0)');
});

console.log('FantaTeamBuilder.test.js: tutti i test passati.');
