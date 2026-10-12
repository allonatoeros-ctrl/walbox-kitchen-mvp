// 20261012100000_kitchen_online_payment_lifecycle_rpc_v1.test.js — Payment Lifecycle V2, S3 (2026-10-12).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime (matrice C1-C43) va provato su Postgres locale effimero prima dell'apply.
// Eseguire a mano: node --test supabase/migrations/20261012100000_kitchen_online_payment_lifecycle_rpc_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const src = read('20261012100000_kitchen_online_payment_lifecycle_rpc_v1.sql');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const code = sqlOnly(src);

// Corpo di una funzione: tra `CREATE OR REPLACE FUNCTION public.<nome>(` e `$function$;`.
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$function$;', start);
  assert.ok(end > start, `fine di ${name} non trovata`);
  return squash(text.slice(start, end));
};

const NAMES = [
  'kitchen_customer_create_order_v2',
  'kitchen_payment_confirm',
  'kitchen_payment_attempt_start',
  'kitchen_payment_attempt_claim_checkout',
  'kitchen_order_switch_to_counter_system',
  'kitchen_order_mark_payment_abandoned',
];
const bodies = Object.fromEntries(NAMES.map((n) => [n, fnBody(code, n)]));
const sq = squash(code);

const idx = (s, needle, from = 0) => {
  const i = s.indexOf(needle, from);
  assert.ok(i > -1, `non trovato: ${needle}`);
  return i;
};

test('header: LOCAL BUILD ONLY / NOT APPLIED e dipendenza da 20261009140000', () => {
  const head = src.split('\n').slice(0, 12).join('\n');
  assert.match(head, /LOCAL BUILD ONLY/);
  assert.match(head, /NOT APPLIED/);
  assert.match(src, /20261009140000/);
});

test('scope: 6 funzioni nuove/sostituite, ognuna SECURITY DEFINER + search_path fissato', () => {
  assert.equal((code.match(/CREATE OR REPLACE FUNCTION/g) || []).length, NAMES.length);
  for (const n of NAMES) {
    assert.match(bodies[n], /SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS \$function\$/, n);
  }
});

test('nessun DROP, ALTER TABLE, DELETE, TRUNCATE nella migration', () => {
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(code, /\bDELETE\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
});

// ---------- v2 ----------
test('v2: firma a 7 argomenti con p_client_request_id uuid DEFAULT NULL, ritorna kitchen_orders', () => {
  const b = bodies.kitchen_customer_create_order_v2;
  assert.match(
    b,
    /kitchen_customer_create_order_v2\( p_venue_id text, p_nickname text, p_customer_note text, p_items jsonb, p_fulfillment_type text, p_payment_lane text, p_client_request_id uuid DEFAULT NULL \) RETURNS public\.kitchen_orders/
  );
});

test('v2: sessione richiesta, lane check, replay PRIMA di kitchen_closed e delle guardie catalogo', () => {
  const b = bodies.kitchen_customer_create_order_v2;
  const session = idx(b, "RAISE EXCEPTION 'customer_session_required'");
  const lane = idx(b, "RAISE EXCEPTION 'invalid_payment_lane'");
  assert.match(b, /p_payment_lane IS NULL OR p_payment_lane NOT IN \('counter', 'online'\)/);
  const replay = idx(b, 'WHERE customer_id = auth.uid() AND client_request_id = p_client_request_id');
  const conflict = idx(b, "RAISE EXCEPTION 'client_request_id_conflict'");
  const closed = idx(b, "RAISE EXCEPTION 'kitchen_closed'");
  assert.ok(session < lane && lane < replay && replay < conflict && conflict < closed);
  for (const e of ['unknown_menu_item', 'item_not_orderable', 'invalid_order_items', 'nickname_required', 'order_items_required']) {
    assert.ok(replay < idx(b, `RAISE EXCEPTION '${e}'`), `replay deve precedere ${e}`);
  }
});

test('v2: mapping corsia -> stato (online = POP con payment_status NULL, counter = PCP/PCP)', () => {
  const b = bodies.kitchen_customer_create_order_v2;
  assert.match(
    b,
    /IF p_payment_lane = 'online' THEN v_status := 'pending_online_payment'; v_payment_status := NULL; ELSE v_status := 'pending_counter_payment'; v_payment_status := 'pending_counter_payment'; END IF;/
  );
});

test('v2: insert con client_request_id, totale e righe da catalogo, contatore nel sotto-blocco', () => {
  const b = bodies.kitchen_customer_create_order_v2;
  assert.match(b, /fulfillment_type, client_request_id \) VALUES/);
  assert.match(b, /p_fulfillment_type, p_client_request_id \) RETURNING \* INTO v_order/);
  assert.match(b, /sum\(line\.quantity::numeric \* m\.price\)/);
  assert.match(b, /INSERT INTO public\.kitchen_order_items \(order_id, venue_id, item_id, name, quantity, price\) SELECT v_order\.id, v_order\.venue_id, line\.item_id, m\.name, line\.quantity, m\.price/);
  const begin = idx(b, 'BEGIN INSERT INTO public.kitchen_service_order_counters');
  assert.ok(begin < idx(b, 'INSERT INTO public.kitchen_orders ('));
  assert.ok(idx(b, 'INSERT INTO public.kitchen_orders (') < idx(b, 'EXCEPTION WHEN unique_violation THEN'));
});

test('v2: handler unique_violation, RAISE; per id NULL e per riga non trovata, conflitto venue', () => {
  const b = bodies.kitchen_customer_create_order_v2;
  const h = b.slice(idx(b, 'EXCEPTION WHEN unique_violation THEN'));
  assert.match(h, /IF p_client_request_id IS NULL THEN RAISE; END IF;/);
  assert.match(h, /IF NOT FOUND THEN RAISE;/);
  assert.match(h, /client_request_id_conflict/);
  assert.match(h, /END; RETURN v_order; END;$/);
});

test('v2: grant authenticated, revoke PUBLIC e anon, nessun grant ad anon/PUBLIC', () => {
  const sig = 'public.kitchen_customer_create_order_v2(text, text, text, jsonb, text, text, uuid)';
  assert.ok(sq.includes(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`));
  assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon;`));
  assert.ok(sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`));
  assert.doesNotMatch(sq, /GRANT [A-Z ]+ ON FUNCTION [^;]* TO (anon|PUBLIC)\b/i);
});

test('la v1 kitchen_customer_create_order NON è ridefinita qui', () => {
  assert.doesNotMatch(code, /FUNCTION public\.kitchen_customer_create_order\s*\(/);
  assert.doesNotMatch(code, /kitchen_customer_create_order\(/);
});

// ---------- confirm ----------
test('confirm: guard service_role invariato, accetta abandoned_timeout oltre a sumup_failed', () => {
  const b = bodies.kitchen_payment_confirm;
  assert.match(b, /IF auth\.role\(\) <> 'service_role' THEN RAISE EXCEPTION 'service_role_only'/);
  assert.match(b, /failure_reason = 'sumup_failed'\)/);
  assert.match(b, /NOT \(v_payment\.status = 'failed' AND v_payment\.provider = 'sumup' AND v_payment\.failure_reason = 'abandoned_timeout'\) THEN RAISE EXCEPTION 'invalid_attempt_status'/);
  assert.match(b, /IF v_payment\.status = 'succeeded' THEN RETURN v_payment;/);
});

test('confirm: ramo POP -> received + paid nello STESSO UPDATE', () => {
  const b = bodies.kitchen_payment_confirm;
  assert.match(
    b,
    /IF v_order_status IN \('pending_counter_payment', 'pending_online_payment'\) THEN UPDATE public\.kitchen_orders SET payment_status = 'paid', payment_method = v_payment\.method, paid_at = now\(\), status = 'received' WHERE id = v_payment\.order_id;/
  );
});

test('confirm: ramo PA non fa UPDATE di kitchen_orders e logga payment_confirmed_after_abandon', () => {
  const b = bodies.kitchen_payment_confirm;
  const from = idx(b, "ELSIF v_order_status = 'payment_abandoned' THEN");
  const to = idx(b, "ELSIF v_order_status = 'cancelled' THEN");
  const branch = b.slice(from, to).trim();
  assert.doesNotMatch(branch, /UPDATE/);
  assert.match(branch, /'payment_confirmed_after_abandon'/);
  assert.match(branch, /RETURN v_payment;$/);
});

test('confirm: rami cancelled, amount mismatch, lost race ancora presenti; ordine lock dopo charge', () => {
  const b = bodies.kitchen_payment_confirm;
  assert.match(b, /ELSIF v_order_status = 'cancelled' THEN[\s\S]*'payment_confirmed_after_cancel'/);
  assert.match(b, /IF v_payment\.amount IS DISTINCT FROM v_order_total THEN[\s\S]*'payment_confirmed_amount_mismatch'/);
  assert.match(b, /EXCEPTION WHEN unique_violation THEN[\s\S]*'payment_confirm_lost_race'/);
  assert.match(b, /ELSE UPDATE public\.kitchen_orders SET payment_status = 'paid', payment_method = v_payment\.method, paid_at = now\(\) WHERE id = v_payment\.order_id; END IF;/);
  assert.ok(idx(b, 'FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE') < idx(b, 'FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE'));
});

test('confirm: grant solo service_role (revoke PUBLIC/anon/authenticated)', () => {
  const sig = 'public.kitchen_payment_confirm(uuid, text, jsonb)';
  for (const r of ['PUBLIC', 'anon', 'authenticated']) {
    assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM ${r};`), r);
  }
  assert.ok(sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`));
  assert.ok(!sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`));
});

// ---------- attempt_start ----------
test('attempt_start: guardie PA e POP scaduto PRIMA del SELECT dell attempt vivo, soglia 4:30', () => {
  const b = bodies.kitchen_payment_attempt_start;
  const pa = idx(b, "RAISE EXCEPTION 'order_payment_abandoned'");
  const exp = idx(b, "RAISE EXCEPTION 'online_payment_expired'");
  const live = idx(b, 'SELECT * INTO v_existing FROM public.kitchen_payments');
  assert.ok(pa < live && exp < live);
  assert.ok(idx(b, "RAISE EXCEPTION 'order_cancelled'") < pa);
  assert.match(b, /v_order\.status = 'pending_online_payment' AND now\(\) >= v_order\.created_at \+ interval '4 minutes 30 seconds'/);
});

test('attempt_start: grant come 20261009130000 (revoke PUBLIC/anon, grant authenticated + service_role)', () => {
  const sig = 'public.kitchen_payment_attempt_start(text, text, text, text, numeric, text)';
  assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC;`));
  assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon;`));
  assert.ok(sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`));
  assert.ok(sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`));
});

// ---------- claim ----------
test('claim: guardie prima dell UPDATE di claim; UPDATE identico a 20260830143353', () => {
  const b = bodies.kitchen_payment_attempt_claim_checkout;
  const upd = idx(b, 'UPDATE public.kitchen_payments');
  assert.ok(idx(b, "RAISE EXCEPTION 'order_payment_abandoned'") < upd);
  assert.ok(idx(b, "RAISE EXCEPTION 'online_payment_expired'") < upd);
  assert.match(b, /interval '4 minutes 30 seconds'/);
  // Guardia NULL-safe (claims vuoti -> auth.role() NULL): emersa dal runtime check S3.
  assert.match(b, /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'/);
  assert.doesNotMatch(b, /auth\.role\(\) <> 'service_role'/);

  const orig = squash(sqlOnly(read('20260830143353_kitchen_payment_attempt_claim_checkout_v1.sql')));
  const pick = (s) => s.slice(s.indexOf('UPDATE public.kitchen_payments'), s.indexOf('RETURNING * INTO v_payment;') + 'RETURNING * INTO v_payment;'.length);
  const o = pick(orig);
  assert.ok(o.startsWith('UPDATE public.kitchen_payments SET checkout_claim_at = now()'), 'estrazione originale fallita');
  assert.equal(pick(b), o);
  assert.ok(sq.includes('GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_claim_checkout(uuid) TO service_role;'));
});

// ---------- switch / abandon ----------
for (const name of ['kitchen_order_switch_to_counter_system', 'kitchen_order_mark_payment_abandoned']) {
  test(`${name}: guard service_role_only, lock su kitchen_payments PRIMA di kitchen_orders`, () => {
    const b = bodies[name];
    assert.match(b, /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'/);
    const lockPay = idx(b, 'PERFORM 1 FROM public.kitchen_payments WHERE order_id = p_order_id AND direction = \'charge\' ORDER BY id FOR UPDATE');
    const lockOrd = idx(b, 'SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE');
    assert.ok(lockPay < lockOrd);
    assert.ok(lockOrd < idx(b, "RAISE EXCEPTION 'order_not_found'"));
  });

  test(`${name}: grant solo service_role, revoke PUBLIC/anon/authenticated`, () => {
    const sig = name === 'kitchen_order_switch_to_counter_system'
      ? `public.${name}(text, uuid)`
      : `public.${name}(text)`;
    assert.ok(sq.includes(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`));
    assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon;`));
    assert.ok(sq.includes(`REVOKE EXECUTE ON FUNCTION ${sig} FROM authenticated;`));
    assert.ok(sq.includes(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`));
    assert.ok(!sq.includes(`${sig} TO authenticated`));
    assert.ok(!sq.includes(`${sig} TO anon`));
  });
}

test('switch: errori in ordine, attempt vivi -> failed/customer_switched_to_counter, ordine PCP + flag, log', () => {
  const b = bodies.kitchen_order_switch_to_counter_system;
  const order = [
    "RAISE EXCEPTION 'order_not_found'",
    "RAISE EXCEPTION 'not_order_owner'",
    "IF v_order.status = 'pending_counter_payment' AND v_order.online_payment_disabled THEN RETURN v_order;",
    "RAISE EXCEPTION 'order_not_pending_online_payment'",
    "RAISE EXCEPTION 'order_has_succeeded_charge'",
    "RAISE EXCEPTION 'checkout_claim_in_progress'",
    "SET status = 'failed', failure_reason = 'customer_switched_to_counter'",
    "SET status = 'pending_counter_payment', payment_status = 'pending_counter_payment', online_payment_disabled = true",
    "'online_payment_switched_to_counter'",
  ];
  let pos = -1;
  for (const n of order) {
    const i = idx(b, n);
    assert.ok(i > pos, `ordine errato per: ${n}`);
    pos = i;
  }
  assert.match(b, /p_actor_customer_id IS NULL OR v_order\.customer_id IS DISTINCT FROM p_actor_customer_id/);
  assert.match(b, /checkout_claim_at > now\(\) - interval '20 seconds'/);
  assert.match(b, /status IN \('initiated', 'pending'\) OR \(status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed'\)/);
  assert.match(b, /'pending_online_payment', 'pending_counter_payment', 'customer'/);
});

test('abandon: errori in ordine, soglia 5 minuti, attempt vivi -> failed/abandoned_timeout, ordine PA, log', () => {
  const b = bodies.kitchen_order_mark_payment_abandoned;
  const order = [
    "RAISE EXCEPTION 'order_not_found'",
    "IF v_order.status = 'payment_abandoned' THEN RETURN v_order;",
    "RAISE EXCEPTION 'order_not_pending_online_payment'",
    "RAISE EXCEPTION 'online_payment_not_expired'",
    "RAISE EXCEPTION 'order_has_succeeded_charge'",
    "RAISE EXCEPTION 'checkout_claim_in_progress'",
    "SET status = 'failed', failure_reason = 'abandoned_timeout'",
    "SET status = 'payment_abandoned'",
    "'online_payment_abandoned'",
  ];
  let pos = -1;
  for (const n of order) {
    const i = idx(b, n);
    assert.ok(i > pos, `ordine errato per: ${n}`);
    pos = i;
  }
  assert.match(b, /IF now\(\) < v_order\.created_at \+ interval '5 minutes' THEN/);
  assert.match(b, /checkout_claim_at > now\(\) - interval '20 seconds'/);
  assert.match(b, /status IN \('initiated', 'pending'\) OR \(status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed'\)/);
  assert.match(b, /'pending_online_payment', 'payment_abandoned', 'system', 'abandoned_timeout'/);
});

// ---------- view ----------
test('view drift: ultimo ramo esclude cancelled, POP e PA; primi 3 rami + ramo (fino a payment_status) identici a 20261006124448', () => {
  const start = idx(sq, 'CREATE OR REPLACE VIEW public.kitchen_payments_provider_drift_candidates AS');
  const viewNew = sq.slice(start, idx(sq, 'GRANT SELECT ON public.kitchen_payments_provider_drift_candidates', start)).trim();
  assert.match(viewNew, /AND o\.payment_status <> 'paid' AND o\.status NOT IN \('cancelled', 'pending_online_payment', 'payment_abandoned'\);$/);

  const origSq = squash(sqlOnly(read('20261006124448_kitchen_payment_drift_exclude_cancelled_retry_v1.sql')));
  const os = idx(origSq, 'CREATE OR REPLACE VIEW');
  const cut = "AND o.payment_status <> 'paid'";
  const oldHead = origSq.slice(os, idx(origSq, cut, os));
  const newHead = viewNew.slice(0, idx(viewNew, cut));
  assert.equal(newHead, oldHead);
  // 4 rami UNION ALL: 3 separatori.
  assert.equal((viewNew.match(/UNION ALL/g) || []).length, 3);
  assert.ok(sq.includes('GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated;'));
});

test('corpi plpgsql bilanciati: IF/END IF, un solo $function$ aperto/chiuso per funzione', () => {
  assert.equal((src.match(/\$function\$/g) || []).length, NAMES.length * 2);
  for (const n of NAMES) {
    const b = bodies[n].replace(/\bEND IF\b/g, '@E');
    const ifs = (b.match(/\bIF\b/g) || []).length;
    const ends = (b.match(/@E/g) || []).length;
    assert.equal(ifs, ends, `${n}: IF (${ifs}) != END IF (${ends})`);
  }
});
