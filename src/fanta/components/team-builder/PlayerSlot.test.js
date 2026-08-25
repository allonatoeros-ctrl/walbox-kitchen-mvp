// PlayerSlot.test.js — contratto componente isolato (fase F2 redesign Team Builder).
// Stile repo: assert statiche sul sorgente, no render React.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'PlayerSlot.jsx'), 'utf8');

test('PlayerSlot esporta un componente default', () => {
  assert.match(src, /export default function PlayerSlot/);
});

test('PlayerSlot espone le props previste dal task', () => {
  for (const prop of ['role', 'state', 'initials', 'name', 'clubTag', 'onClick', 'size']) {
    assert.match(src, new RegExp(prop));
  }
});

test('PlayerSlot deriva la classe di stato dalla prop state (empty/filled/gk)', () => {
  assert.match(src, /fw-slot--\$\{state\}/);
});

const css = readFileSync(
  join(__dirname, '..', '..', 'styles', 'fanta-system.css'),
  'utf8'
);

test('fanta-system.css definisce le classi per i tre stati della pedina', () => {
  assert.match(css, /\.fw-slot--empty/);
  assert.match(css, /\.fw-slot--filled/);
  assert.match(css, /\.fw-slot--gk/);
});

test('PlayerSlot supporta la variante bench (size) e fanta-system.css la stila', () => {
  assert.match(src, /fw-slot--bench/);
  assert.match(css, /\.fw-slot--bench/);
});

test('PlayerSlot e\' un componente isolato: nessuna dipendenza da engine/adapter/persistence/routing/FantaTeamBuilder', () => {
  assert.doesNotMatch(src, /engine\//);
  assert.doesNotMatch(src, /adapter/i);
  assert.doesNotMatch(src, /persistence/i);
  assert.doesNotMatch(src, /router/i);
  assert.doesNotMatch(src, /FantaTeamBuilder/);
  assert.doesNotMatch(src, /supabase/i);
});
