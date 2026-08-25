// FantasyPitch.test.js — contratto componente isolato (fase F3 redesign Team Builder).
// Stile repo: assert statiche sul sorgente, no render React.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'FantasyPitch.jsx'), 'utf8');

test('FantasyPitch esporta un componente default', () => {
  assert.match(src, /export default function FantasyPitch/);
});

test('FantasyPitch espone le props previste dal task', () => {
  for (const prop of ['playersById', 'selectedIds', 'onSlotClick', 'formation']) {
    assert.match(src, new RegExp(prop));
  }
});

test('FantasyPitch usa PlayerSlot per ogni posizione', () => {
  assert.match(src, /import PlayerSlot from '\.\/PlayerSlot'/);
  assert.match(src, /<PlayerSlot/);
});

test('FantasyPitch renderizza le 4 righe di formazione GK/DEF/MID/FWD', () => {
  assert.match(src, /ROW_ORDER = \['GK', 'DEF', 'MID', 'FWD'\]/);
});

test('FantasyPitch usa la formazione di default 4-3-3', () => {
  assert.match(src, /DEFAULT_FORMATION = \{ GK: 1, DEF: 4, MID: 3, FWD: 3 \}/);
});

const css = readFileSync(
  join(__dirname, '..', '..', 'styles', 'fanta-system.css'),
  'utf8'
);

test('fanta-system.css definisce le classi del campo', () => {
  assert.match(css, /\.fw-pitch\s*\{/);
  assert.match(css, /\.fw-pitch__row\s*\{/);
});

test('FantasyPitch e\' un componente isolato: nessuna dipendenza da engine/adapter/persistence/routing/FantaTeamBuilder', () => {
  assert.doesNotMatch(src, /engine\//);
  assert.doesNotMatch(src, /adapter/i);
  assert.doesNotMatch(src, /persistence/i);
  assert.doesNotMatch(src, /router/i);
  assert.doesNotMatch(src, /FantaTeamBuilder/);
  assert.doesNotMatch(src, /supabase/i);
});
