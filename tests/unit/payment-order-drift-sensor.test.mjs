// Unit tests for the Payment / Order Drift Sensor V1 (api/_lib/paymentOrderDriftSensor.js) and its
// integration into the Watchdog's 2-episode state machine (ai-ops/watchdog/watchdog.js).
// Eseguire a mano con: node --test tests/unit/payment-order-drift-sensor.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPaymentOrderDrift, PAYMENT_HUB_BASELINE_V1, MAX_RECORDS } from '../../api/_lib/paymentOrderDriftSensor.js';
import {
  runCheck,
  updateState,
  DRIFT_SENSOR_CHECK_NAME,
  DRIFT_SENSOR_ERROR_CHECK_NAME,
} from '../../ai-ops/watchdog/watchdog.js';

// Mocks the exact chain used by the sensor:
// .from().select({count:'exact'}).eq().gte().order().limit()
function makeAdmin({ data = [], count = 0, error = null } = {}) {
  const calls = { eq: [], gte: [] };
  const builder = {
    select: () => builder,
    eq: (col, val) => {
      calls.eq.push([col, val]);
      return builder;
    },
    gte: (col, val) => {
      calls.gte.push([col, val]);
      return builder;
    },
    order: () => builder,
    limit: async () => ({ data, error, count }),
  };
  return {
    from: (table) => {
      assert.equal(table, 'kitchen_payments_order_reconciliation');
      return builder;
    },
    __calls: calls,
  };
}

function driftRow(overrides = {}) {
  return { order_id: 'ord-1', total: 12.51, order_created_at: '2026-09-01T10:00:00.000Z', ...overrides };
}

test('checkPaymentOrderDrift: zero rows -> healthy, drift_count 0', async () => {
  const admin = makeAdmin({ data: [], count: 0 });
  const result = await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.equal(result.status, 'healthy');
  assert.equal(result.drift_count, 0);
  assert.deepEqual(result.records, []);
  assert.equal(result.error, null);
});

test('checkPaymentOrderDrift: rows present -> drift, drift_count reflects exact count (not capped)', async () => {
  const rows = [driftRow({ order_id: 'ord-1' })];
  const admin = makeAdmin({ data: rows, count: 17 }); // more drifting orders than MAX_RECORDS
  const result = await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.equal(result.status, 'drift');
  assert.equal(result.drift_count, 17);
  assert.equal(result.records.length, 1);
  assert.ok(MAX_RECORDS >= 1);
});

test('checkPaymentOrderDrift: filters by venue_id and the V1 baseline by default', async () => {
  const admin = makeAdmin({ data: [], count: 0 });
  await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.deepEqual(admin.__calls.eq, [['venue_id', 'walrus-main']]);
  assert.deepEqual(admin.__calls.gte, [['order_created_at', PAYMENT_HUB_BASELINE_V1]]);
});

test('checkPaymentOrderDrift: baseline constant is the exact V1 timestamp', () => {
  assert.equal(PAYMENT_HUB_BASELINE_V1, '2026-08-28T15:53:58.298771Z');
});

test('checkPaymentOrderDrift: legacy order (before baseline) is excluded by the query filter, not post-filtered', async () => {
  // The sensor delegates the baseline cut to the query itself (gte on order_created_at) — a mock
  // whose builder ignores gte and returns a pre-baseline row anyway would still come back as "drift"
  // if the sensor did no client-side filtering, so this test only asserts the filter is sent, per the
  // above baseline test. Here we assert an admin that WOULD honor the filter (empty legacy result).
  const admin = makeAdmin({ data: [], count: 0 });
  const result = await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.equal(result.status, 'healthy');
});

test('checkPaymentOrderDrift: Supabase query error -> sensor_error, never healthy', async () => {
  const admin = makeAdmin({ data: null, count: null, error: { message: 'connection refused' } });
  const result = await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.equal(result.status, 'sensor_error');
  assert.equal(result.drift_count, null);
  assert.deepEqual(result.records, []);
  assert.match(result.error, /connection refused/);
});

test('checkPaymentOrderDrift: thrown exception (network/auth) -> sensor_error, never healthy', async () => {
  const admin = {
    from: () => {
      throw new Error('network unreachable');
    },
  };
  const result = await checkPaymentOrderDrift(admin, { venueId: 'walrus-main' });
  assert.equal(result.status, 'sensor_error');
  assert.match(result.error, /network unreachable/);
});

// --- Watchdog integration: runCheck (json-status mode) + the 2-episode state machine ---

function fakeJsonFetch(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test('runCheck (json-status): healthy body -> ok true, status healthy', async () => {
  const check = { name: 'payment-order-drift', path: '/api/kitchen-ops/payment-order-drift', method: 'GET', body: null, mode: 'json-status', requiresAuth: true };
  const result = await runCheck(check, {
    baseUrl: 'https://example.com',
    watchdogApiToken: 'tok',
    fetchImpl: fakeJsonFetch(200, { status: 'healthy', drift_count: 0, records: [] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'healthy');
  assert.equal(result.mode, 'json-status');
});

test('runCheck (json-status): drift body -> ok false, status drift, driftCount/records carried', async () => {
  const check = { name: 'payment-order-drift', path: '/x', method: 'GET', body: null, mode: 'json-status', requiresAuth: true };
  const rows = [driftRow()];
  const result = await runCheck(check, {
    baseUrl: 'https://example.com',
    watchdogApiToken: 'tok',
    fetchImpl: fakeJsonFetch(200, { status: 'drift', drift_count: 3, records: rows }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'drift');
  assert.equal(result.driftCount, 3);
  assert.deepEqual(result.records, rows);
});

test('runCheck (json-status): missing watchdog token -> sensor_error without a network call', async () => {
  const check = { name: 'payment-order-drift', path: '/x', method: 'GET', body: null, mode: 'json-status', requiresAuth: true };
  const result = await runCheck(check, {
    baseUrl: 'https://example.com',
    watchdogApiToken: null,
    fetchImpl: async () => {
      throw new Error('must not be called');
    },
  });
  assert.equal(result.status, 'sensor_error');
  assert.equal(result.ok, false);
});

test('runCheck (json-status): HTTP error / malformed body -> sensor_error, never healthy', async () => {
  const check = { name: 'payment-order-drift', path: '/x', method: 'GET', body: null, mode: 'json-status', requiresAuth: true };
  const result = await runCheck(check, {
    baseUrl: 'https://example.com',
    watchdogApiToken: 'tok',
    fetchImpl: fakeJsonFetch(401, { error: 'unauthorized' }),
  });
  assert.equal(result.status, 'sensor_error');
  assert.equal(result.ok, false);
});

test('runCheck (json-status): fetch throws (network) -> sensor_error', async () => {
  const check = { name: 'payment-order-drift', path: '/x', method: 'GET', body: null, mode: 'json-status', requiresAuth: true };
  const result = await runCheck(check, {
    baseUrl: 'https://example.com',
    watchdogApiToken: 'tok',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(result.status, 'sensor_error');
  assert.match(result.error, /ECONNREFUSED/);
});

function driftResult(overrides = {}) {
  return { name: DRIFT_SENSOR_CHECK_NAME, ok: false, mode: 'json-status', status: 'drift', driftCount: 1, records: [driftRow()], error: null, ...overrides };
}
function healthyResult() {
  return { name: DRIFT_SENSOR_CHECK_NAME, ok: true, mode: 'json-status', status: 'healthy', driftCount: 0, records: [], error: null };
}
function sensorErrorResult() {
  return { name: DRIFT_SENSOR_CHECK_NAME, ok: false, mode: 'json-status', status: 'sensor_error', driftCount: null, records: [], error: 'boom' };
}

test('updateState: 2 consecutive drift -> business incident alerts, sensor incident stays at 0 (never fires)', () => {
  let state = {};
  ({ nextState: state } = updateState(state, [driftResult()]));
  assert.equal(state[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 1);
  // 'drift' proves the sensor itself works, so its counter is initialized/kept at 0 — never undefined
  // in a way that would misrepresent "never alerted" as "unknown".
  assert.equal(state[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 0);

  const { nextState, toAlert } = updateState(state, [driftResult()]);
  assert.equal(nextState[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 2);
  assert.equal(toAlert.length, 1);
  assert.equal(toAlert[0].name, DRIFT_SENSOR_CHECK_NAME);
  // sensor incident never crosses its own threshold from drift results alone
  assert.equal(nextState[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 0);
});

test('updateState: healthy after drift resets the business incident to 0 (recovery)', () => {
  let state = updateState({}, [driftResult()]).nextState;
  state = updateState(state, [driftResult()]).nextState;
  assert.equal(state[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 2);

  const { nextState } = updateState(state, [healthyResult()]);
  assert.equal(nextState[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 0);
});

test('updateState: sensor_error does NOT reset nor close an open business incident', () => {
  let state = updateState({}, [driftResult()]).nextState;
  state = updateState(state, [driftResult()]).nextState;
  assert.equal(state[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 2);

  const { nextState, toAlert } = updateState(state, [sensorErrorResult()]);
  // business incident counter is exactly preserved, not incremented, not reset
  assert.equal(nextState[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 2);
  // no new business alert re-fired
  assert.equal(toAlert.some((r) => r.name === DRIFT_SENSOR_CHECK_NAME), false);
});

test('updateState: 2 consecutive sensor_error -> sensor incident alerts independently of business state', () => {
  let state = updateState({}, [driftResult()]).nextState; // open business incident, count 1
  state = updateState(state, [sensorErrorResult()]).nextState;
  assert.equal(state[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 1);
  assert.equal(state[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 1); // untouched by sensor_error

  const { nextState, toAlert } = updateState(state, [sensorErrorResult()]);
  assert.equal(nextState[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 2);
  assert.equal(toAlert.length, 1);
  assert.equal(toAlert[0].name, DRIFT_SENSOR_ERROR_CHECK_NAME);
  // business incident still untouched
  assert.equal(nextState[DRIFT_SENSOR_CHECK_NAME].consecutiveFailures, 1);
});

test('updateState: drift resets an in-progress sensor incident (sensor proven to work)', () => {
  let state = updateState({}, [sensorErrorResult()]).nextState;
  assert.equal(state[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 1);

  const { nextState } = updateState(state, [driftResult()]);
  assert.equal(nextState[DRIFT_SENSOR_ERROR_CHECK_NAME].consecutiveFailures, 0);
});
