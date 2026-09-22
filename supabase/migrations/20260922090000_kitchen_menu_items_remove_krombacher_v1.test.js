// 20260922090000_kitchen_menu_items_remove_krombacher_v1.test.js — CATALOG DELETE AUTHORITY TEST.
//
// Verifica statica sul sorgente SQL (nessuna connessione DB reale, stesso stile delle altre
// migration test del repo — vedi 20260914090000/20260921100000). Copre il gap di Gate 2 lasciato
// aperto dalla PRE-DEPLOY REGRESSION GATE del 2026-09-22: questa migration non aveva un test
// dedicato, ed e' proprio la sua assenza a far divergere il test di autorita' del catalogo
// (20260916120000_kitchen_menu_items_catalog_sync_v2.test.js), che confronta kitchenMockData.js
// (autorita' cliente, dove item-057/Krombacher e' gia' stato rimosso) contro l'SQL congelato di
// UNA SOLA migration storica (che invece lo conteneva ancora). Questo file verifica la migration
// incrementale che chiude quel gap, senza toccare ne' riscrivere la migration storica.
//
// Eseguire a mano: node --test supabase/migrations/20260922090000_kitchen_menu_items_remove_krombacher_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260922090000_kitchen_menu_items_remove_krombacher_v1.sql'), 'utf8');
const historicalSeed = readFileSync(join(__dirname, '20260916120000_kitchen_menu_items_catalog_sync_v2.sql'), 'utf8');

// Le sole istruzioni SQL eseguibili della migration: esclude i commenti `--` (incluso l'intero
// blocco "VERIFICHE per il Gate 2", testo di sola consultazione manuale, mai eseguito).
function executableStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const statements = executableStatements(src);

test('migration incrementale: una sola istruzione eseguibile, nessun DDL (CREATE/ALTER/DROP)', () => {
  assert.equal(statements.length, 1, `attesa 1 istruzione eseguibile, trovate ${statements.length}`);
  assert.match(statements[0], /^DELETE FROM public\.kitchen_menu_items/i);
  assert.doesNotMatch(src, /\b(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER)/i);
});

test('target esatto: walrus-main / item-057, nessun secondo filtro nella WHERE', () => {
  const stmt = statements[0];
  const whereClause = stmt.slice(stmt.search(/WHERE/i));
  assert.match(whereClause, /venue_id\s*=\s*'walrus-main'/i);
  assert.match(whereClause, /item_id\s*=\s*'item-057'/i);
  assert.equal((whereClause.match(/venue_id/gi) || []).length, 1, 'più di un venue_id nella WHERE');
  assert.equal((whereClause.match(/item_id/gi) || []).length, 1, 'più di un item_id nella WHERE');
  assert.doesNotMatch(whereClause, /\bOR\b|\bIN\s*\(/i, 'la WHERE non deve allargare il target con OR/IN');
});

test('DELETE idempotente: nessuna precondizione che fallisca se la riga è già assente', () => {
  const stmt = statements[0];
  // Un DELETE ... WHERE puro, senza RETURNING controllato ne' RAISE EXCEPTION, cancella 0 righe
  // senza errore quando il target è già assente: rieseguibile per costruzione.
  assert.doesNotMatch(stmt, /RETURNING/i);
  assert.doesNotMatch(src, /RAISE EXCEPTION/i);
});

test('nessun\'altra riga o tabella coinvolta: unica tabella scritta è kitchen_menu_items, unico id nel corpo eseguibile è item-057', () => {
  assert.equal(statements.length, 1);
  for (const stmt of statements) assert.match(stmt, /\bpublic\.kitchen_menu_items\b/i);
  const idsInStatement = statements[0].match(/item-\d+/g) || [];
  assert.deepEqual(idsInStatement, ['item-057'], 'il corpo eseguibile deve citare solo item-057');
});

test('coerente con l\'autorità cliente: item-057 non esiste più in kitchenMenuItems (kitchenMockData.js)', () => {
  assert.ok(
    !kitchenMenuItems.some((i) => i.id === 'item-057'),
    'item-057 è ancora presente in kitchenMockData: il DELETE server-side non ha più copertura client',
  );
});

test('nessuna modifica alle migration storiche: 20260916120000 contiene ancora la riga originale item-057, invariata', () => {
  assert.match(
    historicalSeed,
    /\('walrus-main',\s*'item-057',\s*'Krombacher Pils',\s*6\)/,
    'la riga storica item-057 in 20260916120000 risulta alterata o rimossa — le migration esistenti non vanno mai editate',
  );
});

test('rollback documentato in commento: INSERT ... ON CONFLICT coerente con la riga rimossa (stesso nome/prezzo)', () => {
  assert.match(src, /INSERT INTO public\.kitchen_menu_items/i);
  assert.match(src, /'walrus-main',\s*'item-057',\s*'Krombacher Pils',\s*6/);
  assert.match(src, /ON CONFLICT \(venue_id, item_id\) DO UPDATE/i);
});

test('dichiarata non applicata al remoto: richiede Gate 2 esplicito prima di db push', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTO/);
});
