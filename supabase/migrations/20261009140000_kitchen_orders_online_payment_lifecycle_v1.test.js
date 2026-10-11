// 20261009140000_kitchen_orders_online_payment_lifecycle_v1.test.js — Payment Lifecycle V2, S2
// "Migration A" (schema + trigger), 2026-10-09.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (migration NON applicata).
// Le guardie di transizione sono verificate sulla struttura del corpo plpgsql; il comportamento a
// runtime resta da provare su un Postgres locale/effimero prima del Gate 2 di apply.
// Eseguire a mano: node --test supabase/migrations/20261009140000_kitchen_orders_online_payment_lifecycle_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '20261009140000_kitchen_orders_online_payment_lifecycle_v1.sql'),
  'utf8'
);

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const code = sqlOnly(src);
const squash = (t) => t.replace(/\s+/g, ' ').trim();

const fnStart = code.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_orders_online_payment_lifecycle_guard');
assert.ok(fnStart > -1, 'funzione guard non trovata');
const fnEnd = code.indexOf('$function$;', fnStart);
const fn = code.slice(fnStart, fnEnd);
const body = squash(fn);

// Statement top-level (fuori dal corpo plpgsql, che contiene ';' interni).
const outside = code.slice(0, fnStart) + code.slice(fnEnd + '$function$;'.length);
const statements = outside
  .split(';')
  .map((s) => squash(s))
  .filter(Boolean);

const LEGACY = ['pending_counter_payment', 'received', 'preparing', 'ready', 'delivered', 'cancelled'];
const ONLINE = ['pending_online_payment', 'payment_abandoned'];

test('status CHECK: DROP IF EXISTS + ADD con esattamente 6 legacy + 2 online, ordine legacy preservato', () => {
  assert.ok(statements.includes('ALTER TABLE public.kitchen_orders DROP CONSTRAINT IF EXISTS kitchen_orders_status_check'));
  const add = statements.find((s) => s.includes('ADD CONSTRAINT kitchen_orders_status_check'));
  assert.ok(add, 'ADD CONSTRAINT kitchen_orders_status_check assente');
  const listed = [...add.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  assert.deepEqual(listed, [...LEGACY, ...ONLINE]);
  assert.match(add, /CHECK \( status = ANY \(ARRAY\[/);
});

test('solo il CHECK di status viene toccato: payment_status / payment_method / total intatti', () => {
  const drops = statements.filter((s) => s.includes('DROP CONSTRAINT'));
  assert.deepEqual(drops, ['ALTER TABLE public.kitchen_orders DROP CONSTRAINT IF EXISTS kitchen_orders_status_check']);
  assert.doesNotMatch(code, /kitchen_orders_payment_status_check|kitchen_orders_payment_method_check|kitchen_orders_total_check/);
});

test('client_request_id: uuid nullable senza default, aggiunto con IF NOT EXISTS', () => {
  const add = statements.find((s) => s.includes('ADD COLUMN'));
  assert.equal(add, 'ALTER TABLE public.kitchen_orders ADD COLUMN IF NOT EXISTS client_request_id uuid');
  assert.equal(statements.filter((s) => s.includes('ADD COLUMN')).length, 1);
  assert.ok(statements.some((s) => s.startsWith('COMMENT ON COLUMN public.kitchen_orders.client_request_id IS')));
});

test('idempotenza: unique index parziale (customer_id, client_request_id) con entrambi NOT NULL', () => {
  const idx = statements.find((s) => s.includes('kitchen_orders_customer_client_request_uidx'));
  assert.equal(
    idx,
    'CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_customer_client_request_uidx ' +
      'ON public.kitchen_orders (customer_id, client_request_id) ' +
      'WHERE customer_id IS NOT NULL AND client_request_id IS NOT NULL'
  );
});

test('indice parziale per gli ordini online pending', () => {
  const idx = statements.find((s) => s.includes('idx_kitchen_orders_pending_online_created'));
  assert.equal(
    idx,
    'CREATE INDEX IF NOT EXISTS idx_kitchen_orders_pending_online_created ' +
      "ON public.kitchen_orders (venue_id, created_at) WHERE status = 'pending_online_payment'"
  );
});

test('trigger: BEFORE INSERT OR UPDATE FOR EACH ROW su kitchen_orders, ricreato in modo idempotente', () => {
  assert.ok(statements.includes('DROP TRIGGER IF EXISTS kitchen_orders_online_payment_lifecycle_guard_trg ON public.kitchen_orders'));
  assert.ok(
    statements.includes(
      'CREATE TRIGGER kitchen_orders_online_payment_lifecycle_guard_trg ' +
        'BEFORE INSERT OR UPDATE ON public.kitchen_orders FOR EACH ROW ' +
        'EXECUTE FUNCTION public.kitchen_orders_online_payment_lifecycle_guard()'
    )
  );
  assert.match(body, /RETURNS trigger LANGUAGE plpgsql AS \$function\$/);
  assert.doesNotMatch(body, /SECURITY DEFINER/); // guard pura, nessun bypass RLS, come ready_event_identity
});

test('I2: paid non può restare/entrare in pending_online_payment (né payment_abandoned), su INSERT e UPDATE', () => {
  const i2 = body.indexOf("IF NEW.payment_status = 'paid' AND NEW.status IN ('pending_online_payment', 'payment_abandoned') THEN RAISE EXCEPTION 'online_order_paid_status_conflict'");
  assert.ok(i2 > -1, 'guardia I2 assente');
  // Eseguita PRIMA del return anticipato su INSERT: vale anche per le insert.
  assert.ok(i2 < body.indexOf("IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;"));
});

test('nessuna guardia quando lo status non cambia (update di note/flag/paid_at restano liberi)', () => {
  assert.match(body, /IF NEW\.status IS NOT DISTINCT FROM OLD\.status THEN RETURN NEW; END IF;/);
});

test('le guardie di transizione scattano SOLO partendo da uno stato online (flussi legacy intatti)', () => {
  assert.match(body, /IF OLD\.status IN \('pending_online_payment', 'payment_abandoned'\) THEN CASE NEW\.status/);
  // Un solo blocco condizionale su OLD.status: nessuna regola aggiunta ai percorsi legacy.
  assert.equal((body.match(/OLD\.status IN/g) || []).length, 1);
});

test('I1: online -> received richiede payment_status=paid nello stesso statement', () => {
  assert.match(body, /WHEN 'received' THEN IF NEW\.payment_status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'online_order_not_paid'/);
});

test('I3: online -> pending_counter_payment richiede online_payment_disabled=true', () => {
  assert.match(body, /WHEN 'pending_counter_payment' THEN IF NOT NEW\.online_payment_disabled THEN RAISE EXCEPTION 'online_payment_switch_requires_disabled'/);
});

test('I1: preparing/ready/delivered mai direttamente da uno stato online (ramo ELSE), abbandono/cancel/retry consentiti', () => {
  assert.match(body, /WHEN 'pending_online_payment', 'payment_abandoned', 'cancelled' THEN NULL;/);
  assert.match(body, /ELSE RAISE EXCEPTION 'online_order_invalid_transition'/);
  for (const st of ['preparing', 'ready', 'delivered']) {
    assert.doesNotMatch(body, new RegExp(`WHEN '${st}'`), `${st} non deve avere un ramo esplicito consentito`);
  }
});

test('tutte le eccezioni usano ERRCODE check_violation (stesso canale SQLSTATE 23514 dei CHECK)', () => {
  const raises = (body.match(/RAISE EXCEPTION/g) || []).length;
  const errcodes = (body.match(/USING ERRCODE = 'check_violation'/g) || []).length;
  assert.equal(raises, 4);
  assert.equal(errcodes, raises);
});

test('corpo plpgsql bilanciato: IF/END IF, CASE/END CASE, BEGIN/END, un solo $function$', () => {
  const count = (re) => (body.match(re) || []).length;
  assert.equal(count(/\bIF\b(?! EXISTS)/g) - count(/\bEND IF\b/g), count(/\bEND IF\b/g)); // ogni IF ha il suo END IF
  assert.equal(count(/\bCASE\b/g), 2 * count(/\bEND CASE\b/g));
  assert.equal(count(/\bEND CASE\b/g), 1);
  assert.equal(count(/\bELSIF\b/g), 0);
  assert.equal((src.match(/\$function\$/g) || []).length, 2);
  assert.match(body, /AS \$function\$ BEGIN\b[\s\S]*RETURN NEW; END;$/); // `body` è tagliato prima di `$function$;`
});

test('scope S2: nessuna DML sulle righe, nessuna RPC/policy/grant/altra tabella toccata', () => {
  assert.doesNotMatch(code, /^\s*(UPDATE|DELETE|INSERT)\b/im);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+POLICY|GRANT|REVOKE|ENABLE ROW LEVEL|DEFAULT PRIVILEGES/i);
  assert.doesNotMatch(code, /kitchen_payments|kitchen_action_log|kitchen_customer_create_order|kitchen_payment_confirm|kitchen_payment_attempt_start/);
  assert.equal((code.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.equal((code.match(/CREATE TRIGGER/g) || []).length, 1);
  const tables = new Set([...code.matchAll(/\bON public\.([a-z_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...tables], ['kitchen_orders']);
  assert.doesNotMatch(code, /ALTER TABLE public\.(?!kitchen_orders\b)/);
});

test('idempotenza DDL: ogni statement strutturale è re-applicabile (IF [NOT] EXISTS / OR REPLACE)', () => {
  for (const s of statements) {
    if (/^CREATE TRIGGER (\S+)/.test(s)) {
      // CREATE TRIGGER non ammette IF NOT EXISTS: idempotente tramite il DROP TRIGGER IF EXISTS che lo precede.
      const name = s.match(/^CREATE TRIGGER (\S+)/)[1];
      assert.ok(statements.indexOf(`DROP TRIGGER IF EXISTS ${name} ON public.kitchen_orders`) < statements.indexOf(s), `CREATE TRIGGER ${name} senza DROP IF EXISTS precedente`);
      continue;
    }
    if (/^(CREATE|DROP)/.test(s)) {
      assert.match(s, /IF NOT EXISTS|IF EXISTS|OR REPLACE/, `statement non idempotente: ${s}`);
    }
    if (/^ALTER TABLE .* (DROP CONSTRAINT|ADD COLUMN)/.test(s)) {
      assert.match(s, /IF (NOT )?EXISTS/, `statement non idempotente: ${s}`);
    }
  }
});
