// fantaAuth.test.js — F-AUTH1 layer Auth dedicato FantaWalrus.
//
// Il repo non ha infrastruttura di render/DOM ne' env Vite disponibile sotto
// `node --test` (import.meta.env non esiste fuori da Vite, quindi importare
// supabaseClient.js qui fallirebbe all'eval del modulo). Stessa strategia di
// FantaHome.test.js: contratto sorgente via assert statici sul file, non
// esecuzione delle funzioni reali.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'fantaAuth.js'), 'utf8');

test('fantaAuth usa il client supabase condiviso, non importa supabaseAuth.js', () => {
  assert.match(src, /from '\.\/supabaseClient'/);
  assert.doesNotMatch(src, /from ['"]\.\/supabaseAuth['"]/);
});

test('fantaAuth espone getFantaSession, signInWithEmail, signOut', () => {
  assert.match(src, /export async function getFantaSession\(/);
  assert.match(src, /export async function signInWithEmail\(/);
  assert.match(src, /export async function signOut\(/);
});

test('signInWithEmail delega a supabase.auth.signInWithPassword', () => {
  assert.match(src, /signInWithPassword\(\{ email, password \}\)/);
});

test('signOut delega a supabase.auth.signOut', () => {
  assert.match(src, /supabase\.auth\.signOut\(\)/);
});

test('getFantaSession tratta le sessioni anonime (Jukebox) come nessuna sessione', () => {
  const fn = src.slice(src.indexOf('export async function getFantaSession'));
  assert.match(fn, /is_anonymous/);
  assert.match(fn, /return null/);
});

test('fantaAuth non implementa signup (fuori scope per decisione esplicita)', () => {
  assert.doesNotMatch(src, /signUp\(/);
});

console.log('fantaAuth.test.js: tutti i test F-AUTH1 (lib) passati.');
