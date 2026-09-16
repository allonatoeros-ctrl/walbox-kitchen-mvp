// kitchenMenuCopy.test.js — fix UX 2/3/4 del 2026-09-16.
//   2) immagini birra: mai croppate, contain, centrate
//   3) niente prezzo di listino nel dettaglio birra dentro il combo
//   4) niente grammature/pesi carne, customer-facing e staff-facing
// Eseguire a mano: node --test src/lib/kitchenMenuCopy.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

function ruleBody(css, selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i > -1, `selettore mancante: ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}

function allSourceFiles(dir = SRC, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) allSourceFiles(p, acc);
    else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.js$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// ── 2. IMMAGINI BIRRA ────────────────────────────────────────────────────────
test('ogni frame immagine birra usa contain: con cover di una bottiglia 1:2 se ne vedeva meta', () => {
  const pm = read('components/kitchen/PesiMassimiSection.css');
  for (const sel of ['.pm-beer-pill-photo', '.pm-beer-chosen-photo', '.pm-beer-detail-photo']) {
    const body = ruleBody(pm, sel);
    assert.match(body, /object-fit:\s*contain/, `${sel} deve essere contain`);
    assert.doesNotMatch(body, /object-fit:\s*cover/, `${sel} non deve croppare`);
    assert.match(body, /object-position:\s*center/, `${sel} deve essere centrato`);
  }
  const br = read('components/kitchen/BirreSection.css');
  for (const sel of ['.br-card-photo', '.br-card-body-photo']) {
    const body = ruleBody(br, sel);
    assert.match(body, /object-fit:\s*contain/, `${sel} deve essere contain`);
    assert.match(body, /object-position:\s*center/, `${sel} deve essere centrato`);
  }
});

test('i frame birra sono piu piccoli di prima (card compatte su telefono)', () => {
  const pm = read('components/kitchen/PesiMassimiSection.css');
  assert.match(ruleBody(pm, '.pm-beer-pill-photo'), /width:\s*22px/);   // era 24
  assert.match(ruleBody(pm, '.pm-beer-chosen-photo'), /width:\s*24px/); // era 26
  const br = read('components/kitchen/BirreSection.css');
  assert.match(ruleBody(br, '.br-card-photo-wrap'), /width:\s*72px/);       // era 96
  assert.match(ruleBody(br, '.br-card-photo'), /max-height:\s*132px/);      // era 192 pieni
  assert.match(ruleBody(br, '.br-card-body-photo-wrap'), /height:\s*168px/); // era 220
});

test('tutte e 7 le birre hanno un asset: nessuna cade sul placeholder', () => {
  const beers = kitchenMenuItems.filter((i) => i.category === 'birre' && i.tags?.includes('birre-v1'));
  assert.equal(beers.length, 7);
  for (const b of beers) assert.match(b.image ?? '', /^\/assets\/kitchen\/beers\/.+\.png$/, `${b.id} senza asset`);
});

// ── 3. PREZZO DI LISTINO ─────────────────────────────────────────────────────
test('il dettaglio birra nel combo non mostra piu il prezzo di listino', () => {
  const jsx = read('components/kitchen/PesiMassimiSection.jsx');
  assert.doesNotMatch(jsx, /a listino/);
  assert.doesNotMatch(jsx, /pm-beer-detail-listino/);
  // resta formato + INCLUSA NEL COMBO
  assert.match(jsx, /previewBeer\.format \? `\$\{previewBeer\.format\.toUpperCase\(\)\} · ` : ''/);
  assert.match(jsx, /INCLUSA NEL COMBO/);
  // niente CSS orfano
  assert.doesNotMatch(read('components/kitchen/PesiMassimiSection.css'), /pm-beer-detail-listino/);
});

test('il prezzo della birra resta nel catalogo e nella sezione BIRRE (rimosso solo dentro il combo)', () => {
  for (const b of kitchenMenuItems.filter((i) => i.category === 'birre')) {
    assert.equal(typeof b.price, 'number', `${b.id} ha perso il prezzo`);
  }
  assert.match(read('components/kitchen/BirreSection.jsx'), /price/);
});

// ── 4. GRAMMATURE / PESI CARNE ───────────────────────────────────────────────
const WEIGHT = /\b\d+\s?(g|gr|grammi|kg|hg)\b/i;

test('nessuna grammatura nei dati di menu che arrivano al cliente', () => {
  for (const item of kitchenMenuItems) {
    for (const field of ['name', 'description', 'ingredients', 'priceNote', 'detailCtaLabel']) {
      const v = item[field];
      if (typeof v !== 'string') continue;
      assert.doesNotMatch(v, WEIGHT, `${item.id}.${field} contiene una grammatura: "${v}"`);
    }
  }
});

test('nessuna grammatura nei combo FALLO PESANTE (nome/sottotitolo arrivano a cliente e comanda)', () => {
  for (const c of Object.values(kitchenPesiMassimiCombos)) {
    for (const field of ['name', 'subtitle']) {
      assert.doesNotMatch(c[field] ?? '', WEIGHT, `${c.id}.${field}: "${c[field]}"`);
    }
  }
});

test('le ricette non sono state cambiate: solo il peso e sparito', () => {
  const byId = new Map(kitchenMenuItems.map((i) => [i.id, i]));
  assert.equal(byId.get('item-009').ingredients, 'Carne · coleslaw · anelli di cipolla · salsa cheddar · maionese al pepe');
  assert.equal(byId.get('item-010').ingredients, 'Carne · cetriolo sott’aceto · cheddar · honey mustard');
  assert.equal(byId.get('item-011').ingredients, 'Brisket · provola affumicata · coleslaw · cetrioli sott’aceto · salsa BBQ');
  // prezzi invariati
  assert.equal(byId.get('item-009').price, 13.9);
  assert.equal(byId.get('item-010').price, 14.5);
  assert.equal(byId.get('item-011').price, 15);
});

test('nessuna grammatura hardcoded nelle UI, ne customer ne staff', () => {
  const offenders = [];
  for (const file of allSourceFiles()) {
    const src = readFileSync(file, 'utf8');
    for (const line of src.split('\n')) {
      const clean = line.replace(/^\s*(\/\/|\*).*$/, '');   // via i commenti
      if (!clean.trim()) continue;
      const m = clean.match(/['"`][^'"`]*\b\d+\s?(g|gr|grammi|kg|hg)\b[^'"`]*['"`]/i);
      if (m) offenders.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
