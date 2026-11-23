// Food Club V1 — test statici sulla migration 20261123100000 (identità via email accanto al telefono).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/97_email_identity.sql.
// Eseguire: node --test supabase/migrations/20261123100000_food_club_v1_email_identity.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(read('20261123100000_food_club_v1_email_identity.sql'));
const fnBody = (text, name) => {
  const m = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`).exec(text);
  assert.ok(m, `funzione ${name} non trovata`);
  const end = text.indexOf('$$;', text.indexOf('AS $$', m.index));
  return text.slice(m.index, end + 3);
};

test('ridefinisce/crea solo le funzioni attese; nessuna kitchen_*, nessun cron, nessun dato modificato', () => {
  const defined = [...code.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, [
    'food_club_email_hash', 'food_club_verified_email', 'food_club_verified_identity', 'food_club_mask_email',
    'food_club_join', 'food_club_my_state', 'food_club_create_merge_ticket_email', 'food_club_redeem_merge_ticket',
    'food_club_staff_members', 'food_club_staff_vouchers', 'food_club_staff_referrals',
  ]);
  assert.doesNotMatch(code, /kitchen_\w+\(\s*(?:[^)]*)\)\s*(RETURNS|LANGUAGE)/i);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /cron\.|CREATE\s+TRIGGER|\bDELETE\b|\bCREATE\s+TABLE\b/i);
  // nessun dato modificato: l'unico UPDATE e' il rientro di un ex iscritto dentro food_club_join (UPDATE su members con WHERE user_id)
  const updates = [...code.matchAll(/\bUPDATE\s+public\.(\w+)/g)].map((m) => m[1]);
  assert.ok(updates.every((u) => ['food_club_members', 'kitchen_orders', 'kitchen_push_subscriptions', 'kitchen_promo_passes', 'food_club_merge_tickets'].includes(u)), updates.join());
  assert.doesNotMatch(code, /\bUPDATE\s+public\.\w+[^;]*\bWHERE\s+true\b/i);
});

test('la create_merge_ticket(p_phone) e la phone_hash/verified_phone originali NON sono toccate', () => {
  assert.doesNotMatch(code, /FUNCTION public\.food_club_create_merge_ticket\(/);
  assert.doesNotMatch(code, /FUNCTION public\.food_club_phone_hash|FUNCTION public\.food_club_verified_phone|FUNCTION public\.food_club_mask_phone/);
  assert.doesNotMatch(code, /DROP FUNCTION IF EXISTS public\.food_club_create_merge_ticket\(/);
});

test('colonna email_hash + indice UNIQUE parziale come il telefono', () => {
  assert.match(code, /ALTER TABLE public\.food_club_members ADD COLUMN IF NOT EXISTS email_hash text/);
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS food_club_members_email_hash_unique\s+ON public\.food_club_members \(email_hash\) WHERE email_hash IS NOT NULL/);
});

test('merge ticket: email_hash, phone_hash nullable, CHECK almeno un hash', () => {
  assert.match(code, /food_club_merge_tickets ADD COLUMN IF NOT EXISTS email_hash text/);
  assert.match(code, /food_club_merge_tickets ALTER COLUMN phone_hash DROP NOT NULL/);
  assert.match(code, /ADD CONSTRAINT food_club_merge_tickets_identity_hash_check\s+CHECK \(phone_hash IS NOT NULL OR email_hash IS NOT NULL\)/);
});

test('hash email: trim+minuscole, gmail/googlemail senza punti e +alias, altri domini nessun altro cambio, sale proprio', () => {
  const b = fnBody(code, 'food_club_email_hash');
  assert.match(b, /lower\(btrim\(/);
  assert.match(b, /IN \('gmail\.com', 'googlemail\.com'\)/);
  assert.match(b, /replace\(split_part\(n\.l, '\+', 1\), '\.', ''\) \|\| '@gmail\.com'/);
  assert.match(b, /ELSE n\.e END/);
  assert.match(b, /'food-club-v1-email:'/);
  assert.match(b, /extensions\.digest\(.*'sha256'\)/s);
  assert.match(b, /IMMUTABLE/);
  assert.match(b, /SET search_path = public, extensions, pg_temp/);
  assert.match(read('20261123100000_food_club_v1_email_identity.sql'), /altri domini NIENTE altro|Per gli altri domini NIENTE/);
});

test('identita verificata: email confermata non anonima, poi telefono; verified_phone non ridefinita', () => {
  const e = fnBody(code, 'food_club_verified_email');
  assert.match(e, /email_confirmed_at IS NOT NULL/);
  assert.match(e, /NOT COALESCE\(u\.is_anonymous, false\)/);
  assert.match(e, /btrim\(u\.email\) <> ''/);
  assert.match(e, /SECURITY DEFINER[\s\S]*SET search_path = public, pg_temp/);
  const i = fnBody(code, 'food_club_verified_identity');
  assert.match(i, /1 AS o, 'email'/);
  assert.match(i, /SELECT 2, 'phone'/);
  assert.match(i, /food_club_verified_phone/);
  assert.match(i, /ORDER BY t\.o\s+LIMIT 1/);
  assert.match(i, /SECURITY DEFINER/);
});

test('join: identita email o telefono, nuovo errore email_already_member, anti auto-invito anche per email', () => {
  const b = fnBody(code, 'food_club_join');
  assert.match(b, /food_club_verified_identity\(v_uid\)/);
  assert.match(b, /RAISE EXCEPTION 'verified_identity_required'/);
  assert.doesNotMatch(b, /verified_phone_required/);
  assert.match(b, /RAISE EXCEPTION 'email_already_member'/);
  assert.match(b, /RAISE EXCEPTION 'phone_already_member'/);
  assert.match(b, /v_kind = 'email' AND v_inviter\.email_hash = v_hash/);
  assert.match(b, /v_kind = 'phone' AND v_inviter\.phone_hash = v_hash/);
  assert.match(b, /CASE WHEN v_kind = 'phone' THEN v_hash END, CASE WHEN v_kind = 'email' THEN v_hash END/);
  assert.match(b, /SECURITY DEFINER\s+SET search_path = public, pg_temp/);
});

test('my_state: parte da 20261109109000 (last_completed_card) e aggiunge i campi identita, phone_* restano', () => {
  const b = fnBody(code, 'food_club_my_state');
  const prev = fnBody(sqlOnly(read('20261109109000_food_club_v1_my_state_last_completed_card.sql')), 'food_club_my_state');
  assert.match(b, /'last_completed_card', v_last/);
  for (const k of ["'phone_verified'", "'phone_masked'", "'email_verified'", "'email_masked'", "'identity_verified'", "'identity_kind'"]) {
    assert.ok(b.includes(k), `my_state deve restituire ${k}`);
  }
  // il corpo e' quello precedente piu' le aggiunte: ogni chiave della versione precedente e' ancora presente
  for (const k of [...prev.matchAll(/'(\w+)',/g)].map((m) => m[1])) assert.ok(b.includes(`'${k}'`), `chiave persa: ${k}`);
  assert.match(b, /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  // FOUND serve dopo la SELECT INTO v_m: nessun SELECT ... INTO tra questa e l'IF
  const afterM = b.slice(b.indexOf('SELECT * INTO v_m'), b.indexOf('IF NOT FOUND'));
  assert.doesNotMatch(afterM.split('\n').slice(1).join('\n'), /SELECT[^;]*INTO/);
});

test('biglietti: RPC email nuova, vecchia firma telefono intatta; redeem confronta l hash giusto e gestisce i NULL', () => {
  const c = fnBody(code, 'food_club_create_merge_ticket_email');
  assert.match(c, /anonymous_session_required/);
  assert.match(c, /RAISE EXCEPTION 'invalid_email'/);
  assert.match(c, /INSERT INTO public\.food_club_merge_tickets \(token_hash, source_user_id, email_hash\)/);
  assert.match(c, /merge_ticket_rate_limited/);
  assert.match(c, /SECURITY DEFINER\s+SET search_path = public, extensions, pg_temp/);
  const r = fnBody(code, 'food_club_redeem_merge_ticket');
  assert.match(r, /RAISE EXCEPTION 'verified_identity_required'/);
  assert.match(r, /COALESCE\(v_t\.email_hash = v_email_hash, false\) OR COALESCE\(v_t\.phone_hash = v_phone_hash, false\)/);
  for (const e of ['ticket_phone_mismatch', 'ticket_email_mismatch', 'ticket_identity_mismatch', 'ticket_already_used', 'ticket_expired', 'ticket_same_user']) {
    assert.ok(r.includes(e), `manca ${e}`);
  }
  assert.match(r, /SECURITY DEFINER\s+SET search_path = public, extensions, pg_temp/);
});

test('analytics staff: email mascherata (2 lettere + ***), ricerca per prefisso, min 3 caratteri, escape LIKE', () => {
  const m = fnBody(code, 'food_club_mask_email');
  assert.match(m, /left\(split_part\(btrim\(p_email\), '@', 1\), 2\) \|\| '\*\*\*@'/);
  const s = fnBody(code, 'food_club_staff_members');
  assert.match(s, /email_masked text\)/);
  assert.match(s, /char_length\(btrim\(p_search\)\) >= 3/);
  assert.match(s, /lower\(u\.email\) LIKE .*\|\| '%' ESCAPE '\\'/);
  assert.match(s, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(s, /regexp_replace\(p_search, '\\D', '', 'g'\) <> ''/);
  assert.match(s, /right\(regexp_replace\(COALESCE\(u\.phone, ''\)/);
  assert.match(fnBody(code, 'food_club_staff_vouchers'), /email_masked text\)/);
  assert.match(fnBody(code, 'food_club_staff_referrals'), /inviter_email text, invitee_email text\)/);
  assert.doesNotMatch(code, /ADD COLUMN[^;]*\bemail\b\s+text/, 'nessuna email in chiaro in nuove colonne');
  for (const f of ['staff_members', 'staff_vouchers', 'staff_referrals']) {
    assert.match(fnBody(code, `food_club_${f}`), /SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  }
});

test('grant: helper interni chiusi, RPC authenticated senza anon', () => {
  for (const f of ['food_club_email_hash(text)', 'food_club_verified_email(uuid)', 'food_club_verified_identity(uuid)', 'food_club_mask_email(text)']) {
    assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), `REVOKE interno ${f}`);
  }
  for (const f of ['food_club_join(text, boolean, boolean, text, text)', 'food_club_my_state()', 'food_club_create_merge_ticket_email(text)',
    'food_club_redeem_merge_ticket(text)', 'food_club_staff_members(text, text, integer)', 'food_club_staff_vouchers(text, text, integer)',
    'food_club_staff_referrals(text, integer)']) {
    assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon;`), `REVOKE ${f}`);
    assert.ok(code.includes(`public.${f}`), `GRANT ${f}`);
  }
  assert.match(code, /GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated;/);
  assert.doesNotMatch(code, /TO anon/);
});

test('le DROP di firme cambiate sono solo le tre staff (RETURNS TABLE nuova) e hanno la firma esatta', () => {
  const drops = [...code.matchAll(/DROP FUNCTION IF EXISTS public\.(\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`);
  assert.deepEqual(drops, ['food_club_staff_members(text, text, integer)', 'food_club_staff_vouchers(text, text, integer)', 'food_club_staff_referrals(text, integer)']);
});
