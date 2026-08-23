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

// === GUEST MODE CONTRACT ===

test('FantaTeamBuilder e\' compatibile con guest mode: legge identity da localStorage senza auth', () => {
  assert.match(src, /fanta_walrus_team_identity/);
  assert.doesNotMatch(src, /fanta_walrus_guest_mode/);
  assert.doesNotMatch(src, /supabaseAuth|fantaAuth/);
});

test('FantaGuestPrompt.jsx esiste, imposta guest mode in localStorage e reindirizza a /fanta/entry', () => {
  const guestSrc = readFileSync(join(__dirname, 'FantaGuestPrompt.jsx'), 'utf8');
  assert.match(guestSrc, /fanta_walrus_guest_mode/);
  assert.match(guestSrc, /localStorage\.setItem\(GUEST_MODE_KEY|localStorage\.setItem\('fanta_walrus_guest_mode'/);
  assert.match(guestSrc, /navigateTo\('\/fanta\/entry'\)/);
});

console.log('FantaTeamBuilder.test.js: tutti i test passati.');
