// Food Club V1 — I-4 (PWA-NOTIFICHE-spec §7): manifest con id/start_url/icone PNG + SW senza fetch.
// node --test tests/unit/food-club-pwa-assets.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
const swSrc = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

function pngInfo(publicPath) {
  const buf = readFileSync(join(ROOT, 'public', publicPath.replace(/^\//, '')));
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(sig), `${publicPath}: firma PNG non valida`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `${publicPath}: primo chunk non IHDR`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

test('manifest: id e start_url per il Food Club', () => {
  assert.equal(manifest.id, '/kitchen');
  assert.equal(manifest.start_url, '/kitchen?src=home');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
});

test('manifest: name/short_name e colori invariati (D-22 aperta)', () => {
  assert.equal(manifest.name, 'Walbox Kitchen — The Walrus Pub');
  assert.equal(manifest.short_name, 'Walbox Kitchen');
  assert.equal(manifest.background_color, '#121212');
  assert.equal(manifest.theme_color, '#121212');
});

test('manifest: SVG esistente mantenuta', () => {
  assert.ok(manifest.icons.some((i) => i.src === '/favicon.svg' && i.type === 'image/svg+xml'));
});

for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
  test(`manifest: icona PNG ${size} ${purpose} esiste con dimensioni reali corrette`, () => {
    const icon = manifest.icons.find((i) => i.type === 'image/png' && i.sizes === `${size}x${size}`
      && (i.purpose ?? 'any').split(' ').includes(purpose));
    assert.ok(icon, `manca l'icona ${size} ${purpose}`);
    assert.ok(existsSync(join(ROOT, 'public', icon.src.replace(/^\//, ''))), `${icon.src} non esiste`);
    const info = pngInfo(icon.src);
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    // Fondo pieno, niente canale alfa (color type 2 = RGB): nessuna trasparenza/scacchiera (CLAUDE.md §8).
    assert.equal(info.colorType, 2, `${icon.src}: atteso PNG RGB senza alfa`);
  });
}

test('sw.js: nessun handler fetch, nessuna Cache API', () => {
  assert.doesNotMatch(swSrc, /addEventListener\(\s*['"]fetch['"]/);
  assert.doesNotMatch(swSrc, /caches\.(open|match|addAll)/);
});

test('sw.js: notificationclick con focus/navigate e fallback openWindow', () => {
  assert.match(swSrc, /addEventListener\('notificationclick',/);
  assert.match(swSrc, /clients\.matchAll\(/);
  assert.match(swSrc, /\.focus\(\)/);
  assert.match(swSrc, /\.navigate\(targetUrl\)/);
  assert.match(swSrc, /clients\.openWindow\(targetUrl\)/);
});

test('sw.js: contratto ordine pronto invariato + tag/data.url/kind per il Club', () => {
  assert.match(swSrc, /`kitchen-order-\$\{payload\.orderId\}`/);
  assert.match(swSrc, /payload\.tag/);
  assert.match(swSrc, /payload\.url \|\| data\.url \|\| '\/kitchen\/status'/);
  assert.match(swSrc, /kind:/);
});
