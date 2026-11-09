// Food Club V1 fase C — test statici sulla migration 20261109109000 (food_club_my_state + last_completed_card).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/96_my_state.sql.
// Eseguire: node --test supabase/migrations/20261109109000_food_club_v1_my_state_last_completed_card.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261109109000_food_club_v1_my_state_last_completed_card.sql';
const ORIGINAL = '20261109102000_food_club_v1_identity_api.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));
const orig = sqlOnly(readFileSync(join(__dirname, ORIGINAL), 'utf8'));
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$$;', text.indexOf('AS $$', start));
  return text.slice(start, end + 3);
};
const clean = (t) => t.split('\n').filter((l) => l.trim() !== '').join('\n');
const body = clean(fnBody(code, 'food_club_my_state'));
const origBody = clean(fnBody(orig, 'food_club_my_state'));

test('ridefinisce SOLO food_club_my_state: nessuna kitchen_*, nessuna tabella/trigger/cron/scrittura', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, ['food_club_my_state']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(TABLE|TRIGGER)\b|DROP\s|cron\.|ALTER\s+(TABLE|FUNCTION)|\bDELETE\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\b/i);
});

test('stessa firma, LANGUAGE, STABLE, SECURITY DEFINER e search_path dell originale', () => {
  const head = (b) => b.slice(0, b.indexOf('AS $$'));
  assert.equal(head(body), head(origBody));
  assert.match(head(body), /STABLE\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
});

test('REVOKE/GRANT identici all originale (authenticated si, anon/PUBLIC no)', () => {
  assert.ok(orig.includes('REVOKE ALL ON FUNCTION public.food_club_my_state() FROM PUBLIC, anon;'));
  assert.ok(code.includes('REVOKE ALL ON FUNCTION public.food_club_my_state() FROM PUBLIC, anon;'));
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.food_club_my_state\(\) TO authenticated;/);
  assert.doesNotMatch(code, /TO[^;]*\b(anon|PUBLIC|service_role)\b/);
});

test('rispetto all originale aggiunge SOLO v_last e il campo last_completed_card (nient altro cambia)', () => {
  // togliendo dalla nuova versione la variabile, il blocco SELECT ... INTO v_last e la riga del campo, si ottiene l originale
  let stripped = body.replace('  v_last jsonb;\n', '');
  const a = stripped.indexOf('  SELECT jsonb_build_object(\'id\', c.id, \'completed_at\'');
  const b = stripped.indexOf('INTO v_last');
  assert.ok(a > -1 && b > a, 'blocco v_last presente');
  const endBlock = stripped.indexOf('LIMIT 1;', b) + 'LIMIT 1;\n'.length;
  stripped = stripped.slice(0, a) + stripped.slice(endBlock);
  stripped = stripped.replace("    'last_completed_card', v_last,\n", '');
  assert.equal(stripped, origBody);
});

test('last_completed_card: solo tessere dell utente (auth.uid), status completed, piu recente, solo timbri non revocati', () => {
  assert.match(body, /WHERE c\.user_id = v_uid AND c\.status = 'completed'\s+ORDER BY c\.completed_at DESC NULLS LAST, c\.opened_at DESC LIMIT 1/);
  assert.match(body, /s\.card_id = c\.id AND s\.revoked_at IS NULL/);
  assert.match(body, /WHERE v\.id = c\.voucher_id/);
  assert.match(body, /'last_completed_card', v_last/);
  assert.doesNotMatch(body, /'totals'/);
});
