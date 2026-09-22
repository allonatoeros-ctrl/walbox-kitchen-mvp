// kitchen_menu_items_catalog_state_cumulative.test.js — CUMULATIVE CATALOG AUTHORITY TEST.
//
// Non e' il test di una singola migration (nessun prefisso data: non descrive un file .sql, ma
// lo STATO risultante dall'applicare in sequenza due migration esistenti). Chiude il gap lasciato
// aperto dalla PRE-DEPLOY REGRESSION GATE del 2026-09-22:
// `20260916120000_kitchen_menu_items_catalog_sync_v2.test.js` confronta kitchenMockData.js
// (autorita' cliente corrente) contro l'SQL congelato di UNA SOLA migration storica — che
// contiene ancora item-057/Krombacher, rimosso dal cliente il 2026-09-22. Quel test resta rosso
// per costruzione (non va editato: le migration/i loro test storici non si toccano), perche'
// confronta una foto intermedia contro l'autorita' finale. Questo file compone invece:
//
//   §1 di 20260916120000 (40 righe, item-057 incluso)
//     → DELETE di 20260922090000 (rimuove item-057)
//     → stato finale (39 righe)
//
// e verifica che LO STATO FINALE — non la singola migration — combaci esattamente con
// kitchenMockData.js. Stile repo: assert statiche sui sorgenti SQL letti da disco, nessuna
// connessione DB, nessuna migration esistente ne' modificata ne' eseguita.
//
// Eseguire a mano: node --test supabase/migrations/kitchen_menu_items_catalog_state_cumulative.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedSql = readFileSync(join(__dirname, '20260916120000_kitchen_menu_items_catalog_sync_v2.sql'), 'utf8');
const removeSql = readFileSync(join(__dirname, '20260922090000_kitchen_menu_items_remove_krombacher_v1.sql'), 'utf8');

// §1 di 20260916120000: l'unico INSERT che popola il catalogo (name/price authority). §2/§3 di
// quella migration toccano solo righe legacy fuori catalogo e kitchen_menu_availability — nessuna
// delle due tocca item-057 ne' altre righe del catalogo corrente, quindi sono irrilevanti per lo
// stato finale che questo test verifica (name/price delle voci ordinabili).
function parseInsertRows(sql) {
  const rows = new Map();
  for (const m of sql.matchAll(/\('walrus-main',\s*'(item-\d+)',\s*'((?:[^']|'')*)',\s*(NULL|[\d.]+)\)/g)) {
    rows.set(m[1], { name: m[2].replace(/''/g, "'"), price: m[3] === 'NULL' ? null : Number(m[3]) });
  }
  return rows;
}

// L'unica istruzione eseguibile di 20260922090000 (nessun commento `--`): un DELETE puntuale.
function parseDeleteTargets(sql) {
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const targets = new Set();
  for (const m of executable.matchAll(/DELETE FROM public\.kitchen_menu_items[\s\S]*?item_id\s*=\s*'(item-\d+)'/g)) {
    targets.add(m[1]);
  }
  return targets;
}

const stateAfter0916 = parseInsertRows(seedSql);
const deletedBy0922 = parseDeleteTargets(removeSql);

function applyDelete(state, deletedIds) {
  const out = new Map(state);
  for (const id of deletedIds) out.delete(id);
  return out;
}

const finalState = applyDelete(stateAfter0916, deletedBy0922);

test('stato intermedio (solo 20260916120000): item-057/Krombacher esiste, 40 righe, price 6', () => {
  assert.equal(stateAfter0916.size, 40);
  assert.ok(stateAfter0916.has('item-057'), 'item-057 deve poter esistere nello stato storico post-0916');
  assert.deepEqual(stateAfter0916.get('item-057'), { name: 'Krombacher Pils', price: 6 });
});

test('la migration 20260922090000 rimuove esattamente e solo item-057 dallo stato', () => {
  assert.deepEqual([...deletedBy0922], ['item-057']);
});

test('stato finale (0916 → 0922 composte): item-057/Krombacher non appartiene più al catalogo corrente', () => {
  assert.equal(finalState.size, 39);
  assert.ok(!finalState.has('item-057'), 'item-057 non deve più esistere dopo aver composto 0916+0922');
});

test('stato finale composto ≡ autorità cliente corrente (kitchenMockData.js), nessuna voce in più o in meno', () => {
  const expected = new Map();
  for (const i of kitchenMenuItems) expected.set(i.id, { name: i.name, price: i.price });
  for (const combo of Object.values(kitchenPesiMassimiCombos)) expected.set(combo.id, { name: combo.name, price: combo.price });

  assert.deepEqual([...finalState.keys()].sort(), [...expected.keys()].sort());
  for (const [id, want] of expected) {
    const got = finalState.get(id);
    assert.ok(got, `${id} assente dallo stato finale composto`);
    assert.equal(got.name, want.name, `name divergente per ${id}`);
    assert.equal(got.price, want.price, `price divergente per ${id}`);
  }
});

test('nessuna migration esistente è stata modificata: 20260916120000 conserva ancora la riga item-057 originale', () => {
  // Il file storico non va mai editato: questo test lo legge, non lo tocca. Se in futuro
  // qualcuno "sistemasse" 20260916120000 rimuovendo item-057 direttamente da lì invece di
  // aggiungere una nuova migration, questa assert fallirebbe — è la garanzia che la composizione
  // sopra resti valida (stato intermedio reale, non riscritto a posteriori).
  assert.match(seedSql, /\('walrus-main',\s*'item-057',\s*'Krombacher Pils',\s*6\)/);
});

test('nessuna migration esistente è stata modificata: 20260922090000 resta un DELETE puntuale, non un\'altra forma', () => {
  assert.match(removeSql, /^DELETE FROM public\.kitchen_menu_items/m);
  assert.doesNotMatch(removeSql, /\b(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER)/i);
});
