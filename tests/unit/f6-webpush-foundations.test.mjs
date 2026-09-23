// Test mirato F6 Phase 1 — Web Push foundations.
// Stile repo: assert statiche sui file sorgente (manifest/SW/index.html) + test comportamentali
// diretti sulle funzioni pure di src/lib/webPush.js (nessun mock browser necessario per queste).
// L'attivazione reale (permission/subscribe/persist) resta verifica manuale su device fisici
// (vedi ai-ops/reports/kitchen-f6-webpush-audit-20260924.md, IMPLEMENTATION_PLAN Fase 3).
//
// Eseguire a mano: node --test tests/unit/f6-webpush-foundations.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const manifestRaw = readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8');
const swSrc = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('manifest.webmanifest è JSON valido con i campi minimi PWA', () => {
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.start_url, '/kitchen');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'serve almeno un\'icona');
});

test('index.html linka il manifest', () => {
  assert.match(indexHtml, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/);
});

test('index.html dichiara i meta apple-mobile-web-app per iOS "aggiungi a Home"', () => {
  assert.match(indexHtml, /apple-mobile-web-app-capable/);
});

test('index.html linka apple-touch-icon (iOS ignora gli icons del manifest per Home Screen)', () => {
  assert.match(indexHtml, /<link\s+rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"\s*\/?>/);
});

test('apple-touch-icon.png esiste, è un PNG reale, ed è quadrata 180x180 (requisito iOS Home Screen)', () => {
  const pngPath = join(ROOT, 'public/apple-touch-icon.png');
  assert.ok(statSync(pngPath).size > 0, 'il file deve esistere e non essere vuoto');
  const buf = readFileSync(pngPath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(pngSignature), 'firma PNG non valida');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 180, 'apple-touch-icon deve essere larga 180px');
  assert.equal(height, 180, 'apple-touch-icon deve essere alta 180px (quadrata)');
});

test('sw.js gestisce push e notificationclick', () => {
  assert.match(swSrc, /addEventListener\('push',/);
  assert.match(swSrc, /addEventListener\('notificationclick',/);
});

test('sw.js NON intercetta fetch e NON usa Cache API (no offline caching, per decisione esplicita)', () => {
  assert.doesNotMatch(swSrc, /addEventListener\('fetch',/);
  assert.doesNotMatch(swSrc, /caches\.(open|match|addAll)/);
});

const {
  resolvePushStatus,
  urlBase64ToUint8Array,
  subscriptionToRow,
} = await import('../../src/lib/webPush.js');

test('resolvePushStatus: browser non supportato -> unsupported, prevale su tutto il resto', () => {
  assert.equal(
    resolvePushStatus({ supported: false, hasVapidKey: true, permission: 'granted' }),
    'unsupported'
  );
});

test('resolvePushStatus: supportato ma VAPID non configurata -> not-configured (stato di oggi)', () => {
  assert.equal(
    resolvePushStatus({ supported: true, hasVapidKey: false, permission: 'default' }),
    'not-configured'
  );
});

test('resolvePushStatus: supportato + configurato + permission denied -> denied', () => {
  assert.equal(
    resolvePushStatus({ supported: true, hasVapidKey: true, permission: 'denied' }),
    'denied'
  );
});

test('resolvePushStatus: supportato + configurato + permission default -> idle (pronto ad attivare)', () => {
  assert.equal(
    resolvePushStatus({ supported: true, hasVapidKey: true, permission: 'default' }),
    'idle'
  );
});

test('urlBase64ToUint8Array decodifica correttamente una chiave VAPID-like (round-trip base64url)', () => {
  const original = 'Hello Walbox Kitchen Push!';
  const base64url = Buffer.from(original, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const decoded = urlBase64ToUint8Array(base64url);
  assert.equal(Buffer.from(decoded).toString('utf8'), original);
});

test('subscriptionToRow estrae solo endpoint/p256dh/auth_key dal PushSubscription', () => {
  const fakeSubscription = {
    toJSON: () => ({
      endpoint: 'https://push.example/abc123',
      keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
    }),
  };
  const row = subscriptionToRow(fakeSubscription);
  assert.deepEqual(row, {
    endpoint: 'https://push.example/abc123',
    p256dh: 'fake-p256dh',
    auth_key: 'fake-auth',
  });
});
