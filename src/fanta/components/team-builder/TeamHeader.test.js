// TeamHeader.test.js — contratto componente isolato (fase F4 redesign Team Builder).
// Stile repo: assert statiche sul sorgente, no render React.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'TeamHeader.jsx'), 'utf8');

test('TeamHeader esporta un componente default', () => {
  assert.match(src, /export default function TeamHeader/);
});

test('TeamHeader espone le props previste dal task', () => {
  for (const prop of ['teamName', 'crest', 'formation', 'status']) {
    assert.match(src, new RegExp(prop));
  }
});

test('TeamHeader riusa le classi esistenti fw-band/fw-badge del design system', () => {
  assert.match(src, /fw-band/);
  assert.match(src, /fw-badge/);
});

const css = readFileSync(
  join(__dirname, '..', '..', 'styles', 'fanta-system.css'),
  'utf8'
);

test('fanta-system.css definisce le classi riusate da TeamHeader', () => {
  assert.match(css, /\.fw-band\b/);
  assert.match(css, /\.fw-badge\b/);
  assert.match(css, /\.fw-band__status/);
});

test('TeamHeader e\' un componente isolato: nessuna dipendenza da engine/adapter/persistence/routing/FantaTeamBuilder', () => {
  assert.doesNotMatch(src, /engine\//);
  assert.doesNotMatch(src, /adapter/i);
  assert.doesNotMatch(src, /persistence/i);
  assert.doesNotMatch(src, /router/i);
  assert.doesNotMatch(src, /FantaTeamBuilder/);
  assert.doesNotMatch(src, /supabase/i);
});
