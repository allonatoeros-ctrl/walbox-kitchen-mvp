// fantaTeamCreation.test.js — helper create_fanta_team_v1 (FantaEntryTesseramento).
//
// Stessa strategia di fantaAuth.test.js: import.meta.env non esiste sotto
// `node --test`, quindi importare supabaseClient.js (via fantaTeamCreation.js)
// fallirebbe all'eval del modulo. Test sul contratto sorgente via assert
// statici, non esecuzione delle funzioni reali.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'fantaTeamCreation.js'), 'utf8');

test('fantaTeamCreation usa il client supabase condiviso e getFantaSession da fantaAuth', () => {
  assert.match(src, /from '\.\/supabaseClient'/);
  assert.match(src, /from '\.\/fantaAuth'/);
});

test('fantaTeamCreation espone findActiveFantaLeague e createFantaTeam', () => {
  assert.match(src, /export async function findActiveFantaLeague\(/);
  assert.match(src, /export async function createFantaTeam\(/);
});

test('createFantaTeam richiede una sessione Fanta valida prima di invocare la RPC', () => {
  const fn = src.slice(src.indexOf('export async function createFantaTeam'));
  assert.match(fn, /getFantaSession\(\)/);
  assert.match(fn, /FANTA_AUTH_REQUIRED/);
});

test('createFantaTeam individua la lega attiva prima di invocare la RPC', () => {
  const fn = src.slice(src.indexOf('export async function createFantaTeam'));
  assert.match(fn, /findActiveFantaLeague\(\)/);
});

test('findActiveFantaLeague interroga fanta_leagues filtrando status=active', () => {
  const fn = src.slice(
    src.indexOf('export async function findActiveFantaLeague'),
    src.indexOf('export async function createFantaTeam')
  );
  assert.match(fn, /from\('fanta_leagues'\)/);
  assert.match(fn, /\.eq\('status', 'active'\)/);
});

test('createFantaTeam invoca create_fanta_team_v1 con p_league_id e p_team_name', () => {
  const fn = src.slice(src.indexOf('export async function createFantaTeam'));
  assert.match(fn, /supabase\.rpc\('create_fanta_team_v1', \{/);
  assert.match(fn, /p_league_id: league\.id/);
  assert.match(fn, /p_team_name: teamName/);
});

test('createFantaTeam non passa mai user_id: la RPC lo ricava da auth.uid()', () => {
  const fn = src.slice(src.indexOf('export async function createFantaTeam'));
  assert.doesNotMatch(fn, /user_id/);
});

test('createFantaTeam restituisce { teamId, error } senza lanciare eccezioni proprie', () => {
  const fn = src.slice(src.indexOf('export async function createFantaTeam'));
  assert.match(fn, /return \{ teamId: data, error: null \}/);
  assert.doesNotMatch(fn, /throw /);
});

console.log('fantaTeamCreation.test.js: tutti i test passati.');
