// Food Club V1 Passo 3D — test statici sulla migration 20261109106000 (buoni in verifica: vista staff + rilascio manuale > 24 h).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/80_held_staff.sql.
// Eseguire: node --test supabase/migrations/20261109106000_food_club_v1_held_vouchers_staff.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261109106000_food_club_v1_held_vouchers_staff.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));

const fnBody = (name) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = code.indexOf('$$;', code.indexOf('AS $$', start));
  assert.ok(end > start, `fine di ${name} non trovata`);
  return code.slice(start, end + 3);
};

test('definisce esattamente le due funzioni attese, nessuna kitchen_*, nessuna tabella/trigger/cron', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...defined].sort(), ['food_club_manager_resolve_held_voucher', 'food_club_staff_held_vouchers']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(TABLE|TRIGGER)\b|cron\.|ALTER\s+TABLE|DROP\s+/i);
});

test('vista: STABLE SECURITY DEFINER, search_path, require_staff (non manager), solo sola lettura', () => {
  const b = fnBody('food_club_staff_held_vouchers');
  assert.match(b, /\bSTABLE\b/);
  assert.match(b, /SECURITY DEFINER/);
  assert.match(b, /SET search_path = public, pg_temp/);
  assert.match(b, /PERFORM public\.food_club_require_staff\(p_venue_id\);/);
  assert.doesNotMatch(b, /\b(INSERT|UPDATE|DELETE)\b/);
  assert.match(b, /v\.status = 'reserved'/);
  assert.match(b, /o\.status IN \('cancelled', 'payment_abandoned'\)/);
  assert.match(b, /o\.payment_status IS DISTINCT FROM 'paid'/);
  assert.match(b, /COALESCE\(s\.sealed_at, o\.created_at \+ interval '17 minutes'\)/);
  assert.match(b, /<= now\(\) - interval '24 hours'/);
  assert.match(b, /p\.status = 'succeeded'/);
});

test('rilascio: solo manager (require_staff con true), prima di ogni scrittura', () => {
  const b = fnBody('food_club_manager_resolve_held_voucher');
  assert.match(b, /SECURITY DEFINER/);
  assert.match(b, /SET search_path = public, pg_temp/);
  const iMgr = b.indexOf('food_club_require_staff(v_venue, true)');
  assert.ok(iMgr > -1, 'manager-only');
  for (const w of ['UPDATE public.food_club_vouchers', 'food_club_log_voucher', 'FOR UPDATE']) {
    assert.ok(iMgr < b.indexOf(w), `${w} dopo il controllo manager`);
  }
});

test('rilascio: nota obbligatoria (trim, >= 10 caratteri)', () => {
  const b = fnBody('food_club_manager_resolve_held_voucher');
  assert.match(b, /btrim\(COALESCE\(p_note, ''\)\)/);
  assert.match(b, /char_length\(v_note\) < 10/);
  assert.match(b, /'note_too_short'/);
});

test('rilascio: lock K4 (charge ORDER BY id -> ordine -> buono -> sigillo), lock_timeout', () => {
  const b = fnBody('food_club_manager_resolve_held_voucher');
  const iPay = b.indexOf('ORDER BY p.id FOR UPDATE');
  const iOrd = b.indexOf('FROM public.kitchen_orders WHERE id = v_order_id FOR UPDATE');
  const iVou = b.indexOf('FROM public.food_club_vouchers WHERE id = p_voucher_id FOR UPDATE');
  const iSeal = b.indexOf('FROM public.food_club_release_seals WHERE order_id = v_order_id FOR UPDATE');
  assert.ok(iPay > -1 && iOrd > iPay && iVou > iOrd && iSeal > iVou, 'ordine dei lock');
  assert.match(b, /SET lock_timeout = '2s'/);
  // la lettura iniziale del buono (per trovare l'ordine) non prende lock
  assert.ok(b.indexOf('WHERE v.id = p_voucher_id;') > -1);
  assert.ok(b.indexOf('WHERE v.id = p_voucher_id;') < iPay);
});

test('rilascio: 24 h dal riferimento COALESCE(sealed_at, created_at + 17 min), ricontrolli sotto lock, nessuna scrittura prima', () => {
  const b = fnBody('food_club_manager_resolve_held_voucher');
  assert.match(b, /COALESCE\(v_seal\.sealed_at, v_order\.created_at \+ interval '17 minutes'\)/);
  assert.match(b, /v_ref > now\(\) - interval '24 hours'/);
  for (const r of ['not_reserved', 'order_not_closed', 'order_paid', 'charge_succeeded', 'paid_evidence', 'too_early']) {
    assert.ok(b.includes(`'${r}'`), r);
  }
  assert.match(b, /upper\(e\.sumup_status\) = 'PAID'/);
  const iWrite = b.indexOf('UPDATE public.food_club_vouchers');
  assert.ok(b.indexOf("'too_early'") < iWrite && b.indexOf("'charge_succeeded'") < iWrite && b.indexOf("'paid_evidence'") < iWrite);
});

test('rilascio: transizione identica al rilascio automatico + evento manual_release_after_24h con dettagli', () => {
  const b = fnBody('food_club_manager_resolve_held_voucher');
  assert.match(b, /CASE WHEN v_voucher\.expires_at > now\(\) THEN 'available' ELSE 'expired' END/);
  assert.match(b, /SET status = v_to, reserved_order_id = NULL, reserved_at = NULL/);
  assert.match(b, /AND status = 'reserved' AND reserved_order_id = v_order_id/);
  assert.match(b, /'manual_release_after_24h'/);
  assert.match(b, /'staff_user_id', auth\.uid\(\), 'note', v_note, 'reference_at', v_ref/);
  assert.equal([...b.matchAll(/food_club_log_voucher\(/g)].length, 1, 'un solo evento');
  assert.doesNotMatch(b, /food_club_consume_on_charge/);
});

test('permessi: REVOKE da PUBLIC/anon, GRANT solo a authenticated, mai service_role/anon', () => {
  for (const s of ['food_club_staff_held_vouchers(text)', 'food_club_manager_resolve_held_voucher(uuid, text)']) {
    assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${s} FROM PUBLIC, anon;`), s);
    assert.ok(code.includes(`public.${s}`), s);
  }
  const grant = code.slice(code.indexOf('GRANT EXECUTE'));
  assert.match(grant, /TO authenticated;/);
  assert.doesNotMatch(grant, /\banon\b|service_role/);
});
