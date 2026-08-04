// FantaEntryTesseramento.test.js — integrazione con la RPC Supabase create_fanta_team_v1().
//
// Stessa strategia di FantaHome.test.js/FantaAuth.test.js: il repo non ha
// jsdom/testing-library, quindi niente render. I test coprono il contratto
// sorgente di handleTessera: sessione/RPC via helper dedicato, niente doppio
// submit, localStorage scritto e navigazione eseguita solo dopo successo,
// nessuna scrittura/navigazione su errore.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'FantaEntryTesseramento.jsx'), 'utf8');

function handleTesseraSource() {
  const start = src.indexOf('async function handleTessera');
  assert.ok(start > -1, 'handleTessera non trovata');
  const end = src.indexOf('\n  const accentStyle');
  assert.ok(end > start, 'fine di handleTessera non trovata');
  return src.slice(start, end);
}

test('FantaEntryTesseramento usa il nuovo helper createFantaTeam, non piu\' simpleHash', () => {
  assert.match(src, /from '\.\.\/\.\.\/lib\/fantaTeamCreation'/);
  assert.match(src, /createFantaTeam\(/);
  assert.doesNotMatch(src, /simpleHash/);
});

test('FantaEntryTesseramento mantiene stato submitting e submitError', () => {
  assert.match(src, /const \[submitting, setSubmitting\] = useState\(false\)/);
  assert.match(src, /const \[submitError, setSubmitError\] = useState\(null\)/);
});

test('handleTessera e\' asincrona e blocca il doppio submit', () => {
  const fn = handleTesseraSource();
  assert.match(src, /async function handleTessera\(\)/);
  assert.match(fn, /if \(ctaDisabled \|\| submitting\) return;/);
  assert.match(fn, /setSubmitting\(true\);/);
});

test('handleTessera invoca createFantaTeam con il nome squadra prima di scrivere identity', () => {
  const fn = handleTesseraSource();
  const rpcIdx = fn.indexOf('createFantaTeam(trimmedName)');
  const localStorageIdx = fn.indexOf('localStorage.setItem');
  assert.ok(rpcIdx > -1, 'createFantaTeam(trimmedName) non invocata');
  assert.ok(localStorageIdx > rpcIdx, 'localStorage scritto prima della RPC');
});

test('handleTessera su errore mostra messaggio, non scrive localStorage, non naviga', () => {
  const fn = handleTesseraSource();
  const errorBlockStart = fn.indexOf('if (error || !teamId)');
  const errorBlockEnd = fn.indexOf('}', errorBlockStart);
  assert.ok(errorBlockStart > -1, 'branch di errore non trovato');
  const errorBlock = fn.slice(errorBlockStart, errorBlockEnd);
  assert.match(errorBlock, /setSubmitError\(mapFantaTeamError\(error\)\)/);
  assert.match(errorBlock, /setSubmitting\(false\)/);
  assert.match(errorBlock, /return;/);
  assert.doesNotMatch(errorBlock, /localStorage\.setItem/);
  assert.doesNotMatch(errorBlock, /pushState/);
});

test('handleTessera su successo usa lo UUID della RPC come teamId e naviga a /fanta/team', () => {
  const fn = handleTesseraSource();
  const afterError = fn.slice(fn.indexOf('if (error || !teamId)'));
  assert.match(afterError, /const identity = \{\s*\n\s*teamId,/);
  assert.match(afterError, /teamName: trimmedName,/);
  assert.match(afterError, /crest: \{ id: selectedCrestId, preset: selectedPreset \},/);
  assert.match(afterError, /createdAt,/);
  assert.match(afterError, /localStorage\.setItem\(LOCAL_STORAGE_KEY, JSON\.stringify\(identity\)\)/);
  assert.match(afterError, /pushState\(\{\}, '', '\/fanta\/team'\)/);
  assert.match(afterError, /dispatchEvent\(new PopStateEvent\('popstate'\)\)/);
});

test('handleTessera conserva nickname e colore sociale come campi opzionali', () => {
  const fn = handleTesseraSource();
  assert.match(fn, /if \(trimmedNick\.length > 0\) identity\.managerNickname = trimmedNick;/);
  assert.match(fn, /if \(selectedColor\) identity\.teamColor = \{ id: selectedColor\.id, value: selectedColor\.value, label: selectedColor\.label \};/);
});

test('il bottone CTA resta disabilitato durante il submit', () => {
  assert.match(src, /disabled=\{ctaDisabled \|\| submitting\}/);
});

test('mapFantaTeamError copre i codici FANTA_* della RPC create_fanta_team_v1', () => {
  assert.match(src, /FANTA_AUTH_REQUIRED/);
  assert.match(src, /FANTA_USER_ALREADY_HAS_TEAM/);
  assert.match(src, /FANTA_LEAGUE_FULL/);
  assert.match(src, /FANTA_LEAGUE_NOT_FOUND/);
  assert.match(src, /FANTA_LEAGUE_NOT_ACTIVE/);
  assert.match(src, /FANTA_TEAM_CREATE_CONFLICT/);
});

console.log('FantaEntryTesseramento.test.js: tutti i test passati.');
