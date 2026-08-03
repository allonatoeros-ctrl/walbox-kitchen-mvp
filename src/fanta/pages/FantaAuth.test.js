// FantaAuth.test.js — F-AUTH1 pagina di login FantaWalrus + gate route in App.jsx.
//
// Stessa strategia di FantaHome.test.js: il repo non ha jsdom/testing-library,
// quindi niente render. I test coprono il contratto sorgente della pagina
// (redirect dopo login, stato sessione valida, logout) e il gate anonimo
// definito in App.jsx (FantaRouteGuard su entry/team/home, /fanta/auth e
// /fanta/var e /fanta/matchday non gated).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(__dirname, 'FantaAuth.jsx'), 'utf8');
const appSource = readFileSync(join(__dirname, '../../App.jsx'), 'utf8');

// === CONTRATTO SORGENTE: FantaAuth.jsx ===

test('FantaAuth usa fantaAuth.js, non supabaseAuth.js', () => {
  assert.match(pageSource, /from '\.\.\/\.\.\/lib\/fantaAuth'/);
  assert.doesNotMatch(pageSource, /supabaseAuth/);
});

test('FantaAuth reindirizza a /fanta/entry dopo login riuscito', () => {
  const submitFn = pageSource.slice(
    pageSource.indexOf('async function handleSubmit'),
    pageSource.indexOf('async function handleLogout'),
  );
  assert.match(submitFn, /signInWithEmail\(/);
  assert.match(submitFn, /navigateTo\('\/fanta\/entry'\)/);
});

test('FantaAuth mostra errore leggibile se il login fallisce', () => {
  const submitFn = pageSource.slice(
    pageSource.indexOf('async function handleSubmit'),
    pageSource.indexOf('async function handleLogout'),
  );
  assert.match(submitFn, /signInError/);
  assert.match(submitFn, /setError\(/);
});

test('FantaAuth con sessione valida mostra stato loggato invece del form', () => {
  assert.match(pageSource, /session \?/);
  assert.match(pageSource, /SESSIONE ATTIVA/);
  assert.match(pageSource, /fanta-auth-session/);
});

test('FantaAuth espone logout in pagina che chiama signOut', () => {
  assert.match(pageSource, /async function handleLogout\(\)\s*\{\s*[\s\S]*?await signOut\(\);/);
  assert.match(pageSource, /fanta-auth-logout/);
});

test('FantaAuth non implementa signup', () => {
  assert.doesNotMatch(pageSource, /signUp/i);
});

// === CONTRATTO GATE: App.jsx ===

test('App.jsx registra la route /fanta/auth prima di renderizzare le route gated', () => {
  const authIdx = appSource.indexOf('case "/fanta/auth"');
  const entryIdx = appSource.indexOf('case "/fanta/entry"');
  assert.ok(authIdx > -1, '/fanta/auth non trovata');
  assert.ok(entryIdx > -1, '/fanta/entry non trovata');
  assert.ok(authIdx < entryIdx, '/fanta/auth deve precedere /fanta/entry nello switch');
});

test('App.jsx applica FantaRouteGuard a entry/team/home', () => {
  assert.match(appSource, /case "\/fanta\/entry":\s*\n\s*return <FantaRouteGuard Component=\{FantaEntryTesseramento\} \/>/);
  assert.match(appSource, /case "\/fanta\/team":\s*\n\s*return <FantaRouteGuard Component=\{FantaTeamBuilder\} \/>/);
  assert.match(appSource, /case "\/fanta\/home":\s*\n\s*return <FantaRouteGuard Component=\{FantaHome\} \/>/);
});

test('App.jsx NON applica il gate a /fanta/var e /fanta/matchday (restano pubbliche)', () => {
  assert.match(appSource, /case "\/fanta\/var":\s*\n\s*return <FantaVarRoom \/>/);
  assert.match(appSource, /case "\/fanta\/matchday":\s*\n\s*return <FantaMatchday \/>/);
});

test('FantaRouteGuard rimanda gli anonimi a /fanta/auth e blocca il render finche\' non risolto', () => {
  const guardFn = appSource.slice(
    appSource.indexOf('function FantaRouteGuard'),
    appSource.indexOf('export default function App'),
  );
  assert.match(guardFn, /getFantaSession\(/);
  assert.match(guardFn, /onFantaAuthStateChange\(/);
  assert.match(guardFn, /pushState\(\{\}, "", "\/fanta\/auth"\)/);
  assert.match(guardFn, /if \(!checked \|\| !session\) return null;/);
});

console.log('FantaAuth.test.js: tutti i test F-AUTH1 (pagina + gate) passati.');
