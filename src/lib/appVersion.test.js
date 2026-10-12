// appVersion.test.js — controllo "app aggiornata" (I-6, 2026-10-12).
// Eseguire a mano: node --test src/lib/appVersion.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractBundleSrc,
  checkAppVersion,
  shouldReloadForVersion,
  markReloadedForVersion,
  VERSION_RELOAD_KEY,
} from './appVersion.js';

const PROD_HTML = '<html><head><script type="module" crossorigin src="/assets/index-hOZ6jpoP.js"></script></head></html>';
const NEW_HTML = PROD_HTML.replace('hOZ6jpoP', 'NEWHASH12');
const DEV_HTML = '<html><body><script type="module" src="/src/main.jsx"></script></body></html>';

function fakeStorage(initial = {}) {
  const d = { ...initial };
  return {
    d,
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
  };
}
const okFetch = (html) => async () => ({ ok: true, text: async () => html });

test('extractBundleSrc: trova il bundle di produzione', () => {
  assert.equal(extractBundleSrc(PROD_HTML), '/assets/index-hOZ6jpoP.js');
});

test('extractBundleSrc: ordine attributi diverso e apici singoli', () => {
  assert.equal(extractBundleSrc("<script src='/assets/index-AbC123.js' type=\"module\"></script>"), '/assets/index-AbC123.js');
});

test('extractBundleSrc: html dev / vuoto / non stringa -> null', () => {
  assert.equal(extractBundleSrc(DEV_HTML), null);
  assert.equal(extractBundleSrc(''), null);
  assert.equal(extractBundleSrc(undefined), null);
});

test('checkAppVersion: stesso bundle -> current', async () => {
  const r = await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: okFetch(PROD_HTML) });
  assert.equal(r.status, 'current');
});

test('checkAppVersion: bundle diverso -> stale con remoteSrc', async () => {
  const r = await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: okFetch(NEW_HTML) });
  assert.deepEqual(r, { status: 'stale', remoteSrc: '/assets/index-NEWHASH12.js' });
});

test('checkAppVersion: dev server (nessun bundle in esecuzione) -> disabled, nessun fetch', async () => {
  let called = false;
  const r = await checkAppVersion({ runningSrc: null, fetchImpl: async () => { called = true; return {}; } });
  assert.equal(r.status, 'disabled');
  assert.equal(called, false);
});

test('checkAppVersion: fetch offline / eccezione -> unknown, mai stale', async () => {
  const r = await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(r.status, 'unknown');
});

test('checkAppVersion: risposta non ok -> unknown', async () => {
  const r = await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: async () => ({ ok: false, text: async () => '' }) });
  assert.equal(r.status, 'unknown');
});

test('checkAppVersion: index.html senza script riconoscibile -> unknown', async () => {
  const r = await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: okFetch(DEV_HTML) });
  assert.equal(r.status, 'unknown');
});

test('checkAppVersion: chiede index.html con cache no-store', async () => {
  let seen;
  await checkAppVersion({ runningSrc: '/assets/index-hOZ6jpoP.js', fetchImpl: async (url, opts) => { seen = { url, opts }; return { ok: true, text: async () => PROD_HTML }; } });
  assert.equal(seen.opts.cache, 'no-store');
  assert.match(seen.url, /^\/(\?|$)|index\.html/);
});

test('anti-loop: al massimo 1 reload per versione', () => {
  const s = fakeStorage();
  assert.equal(shouldReloadForVersion('/assets/index-NEWHASH12.js', s), true);
  markReloadedForVersion('/assets/index-NEWHASH12.js', s);
  assert.equal(s.d[VERSION_RELOAD_KEY], '/assets/index-NEWHASH12.js');
  assert.equal(shouldReloadForVersion('/assets/index-NEWHASH12.js', s), false);
  // una versione ancora piu' nuova puo' ricaricare di nuovo
  assert.equal(shouldReloadForVersion('/assets/index-EVENNEWER.js', s), true);
});

test('anti-loop: storage non disponibile -> non ricaricare (fail-safe)', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(shouldReloadForVersion('/assets/index-X.js', broken), false);
  assert.equal(shouldReloadForVersion('/assets/index-X.js', null), false);
});
