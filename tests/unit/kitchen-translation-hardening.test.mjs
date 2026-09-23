// Test mirato KITCHEN_TRANSLATION_HARDENING_V1.
// Kitchen customer-facing è italiana e non deve essere alterata da Google
// Translate/browser translation: verifica statica (source-based, no browser) che le
// protezioni restino in place e che l'hero di CustomerOrderStatus non torni a un'altezza
// rigida con clipping.
//
// Eseguire a mano: node --test tests/unit/kitchen-translation-hardening.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const statusJsx = readFileSync(join(ROOT, 'src/pages/CustomerOrderStatus.jsx'), 'utf8');
const statusCss = readFileSync(join(ROOT, 'src/pages/CustomerOrderStatus.css'), 'utf8');

test('index.html dichiara lang="it" (coerente col contenuto italiano)', () => {
  assert.match(indexHtml, /<html\s+lang="it"/);
});

test('index.html blocca Google Translate a livello di documento', () => {
  assert.match(indexHtml, /<meta\s+name="google"\s+content="notranslate"\s*\/?>/);
});

test('CustomerOrderStatus root ha translate="no" + notranslate', () => {
  assert.match(statusJsx, /className="ost-page notranslate"\s+translate="no"/);
});

test('.ost-hero non usa più height rigida con overflow hidden (clipping risk)', () => {
  const heroBlockMatch = statusCss.match(/\.ost-hero\s*{[^}]*}/);
  assert.ok(heroBlockMatch, '.ost-hero rule not found');
  const heroBlock = heroBlockMatch[0];
  assert.doesNotMatch(heroBlock, /(?<!min-)height:\s*\d/, '.ost-hero must not set a fixed height');
  assert.doesNotMatch(heroBlock, /overflow:\s*hidden/, '.ost-hero must not clip overflowing text');
  assert.match(heroBlock, /min-height:\s*366px/);
});

test('.ost-hero--pending-payment usa min-height, non height fissa', () => {
  const block = statusCss.match(/\.ost-hero--pending-payment\s*{[^}]*}/)[0];
  assert.doesNotMatch(block, /(?<!min-)height:\s*\d/);
  assert.match(block, /min-height:\s*180px/);
});
