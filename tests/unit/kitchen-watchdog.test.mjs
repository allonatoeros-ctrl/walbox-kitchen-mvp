// Unit tests for Kitchen Watchdog V1 (ai-ops/watchdog/watchdog.js).
// Pure logic tests: fetch is mocked, state file I/O is redirected to a temp path.
// Eseguire a mano con: node --test tests/unit/kitchen-watchdog.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CHECKS,
  CONSECUTIVE_FAILURE_THRESHOLD,
  resolveConfig,
  runCheck,
  loadState,
  saveState,
  updateState,
  formatAlertMessage,
  sendTelegramAlert,
  runOnce,
} from '../../ai-ops/watchdog/watchdog.js';

function fakeFetch(statusByUrl) {
  return async (url) => {
    for (const [match, status] of Object.entries(statusByUrl)) {
      if (url.includes(match)) {
        return { ok: status >= 200 && status < 300, status };
      }
    }
    throw new Error(`unmocked url: ${url}`);
  };
}

test('resolveConfig throws without KITCHEN_WATCHDOG_BASE_URL', () => {
  assert.throws(() => resolveConfig({}), /KITCHEN_WATCHDOG_BASE_URL/);
});

test('resolveConfig strips trailing slash and reads optional Telegram env', () => {
  const config = resolveConfig({
    KITCHEN_WATCHDOG_BASE_URL: 'https://example.com/',
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: 'chat',
  });
  assert.equal(config.baseUrl, 'https://example.com');
  assert.equal(config.telegramBotToken, 'tok');
  assert.equal(config.telegramChatId, 'chat');
  assert.equal(config.telegramMessageThreadId, null);
});

test('resolveConfig reads optional TELEGRAM_MESSAGE_THREAD_ID', () => {
  const config = resolveConfig({
    KITCHEN_WATCHDOG_BASE_URL: 'https://example.com',
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: 'chat',
    TELEGRAM_MESSAGE_THREAD_ID: '42',
  });
  assert.equal(config.telegramMessageThreadId, '42');
});

test('CHECKS covers exactly the 3 V1 endpoints with their expected status', () => {
  assert.equal(CHECKS.length, 3);
  const byName = Object.fromEntries(CHECKS.map((c) => [c.name, c]));
  assert.equal(byName['create-checkout'].expectedStatus, 400);
  assert.equal(byName['create-checkout'].method, 'POST');
  assert.equal(byName['reconcile-sweep'].expectedStatus, 401);
  assert.equal(byName['reconcile-sweep'].method, 'GET');
  assert.equal(byName['webhook'].expectedStatus, 200);
  assert.equal(byName['webhook'].method, 'POST');
});

test('runCheck reports ok:true when actual status matches expected', async () => {
  const check = CHECKS.find((c) => c.name === 'create-checkout');
  const fetchImpl = fakeFetch({ 'kitchen-sumup-create-checkout': 400 });
  const result = await runCheck(check, { baseUrl: 'https://example.com', fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.actualStatus, 400);
  assert.equal(result.error, null);
});

test('runCheck reports ok:false when actual status differs from expected', async () => {
  const check = CHECKS.find((c) => c.name === 'reconcile-sweep');
  const fetchImpl = fakeFetch({ 'kitchen-sumup-reconcile-sweep': 500 });
  const result = await runCheck(check, { baseUrl: 'https://example.com', fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.expectedStatus, 401);
  assert.equal(result.actualStatus, 500);
});

test('runCheck reports ok:false with error message on network failure', async () => {
  const check = CHECKS.find((c) => c.name === 'webhook');
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const result = await runCheck(check, { baseUrl: 'https://example.com', fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.actualStatus, null);
  assert.match(result.error, /ECONNREFUSED/);
});

test('updateState resets counter on success and increments on failure', () => {
  const prevState = { 'create-checkout': { consecutiveFailures: 1 } };
  const results = [
    { name: 'create-checkout', ok: false, expectedStatus: 400, actualStatus: 500, error: null },
    { name: 'webhook', ok: true, expectedStatus: 200, actualStatus: 200, error: null },
  ];
  const { nextState, toAlert } = updateState(prevState, results);
  assert.equal(nextState['create-checkout'].consecutiveFailures, 2);
  assert.equal(nextState.webhook.consecutiveFailures, 0);
  assert.equal(toAlert.length, 1);
  assert.equal(toAlert[0].name, 'create-checkout');
});

test('updateState does not alert on the first failure, only at the threshold', () => {
  assert.equal(CONSECUTIVE_FAILURE_THRESHOLD, 2);
  const results = [{ name: 'webhook', ok: false, expectedStatus: 200, actualStatus: 500, error: null }];
  const first = updateState({}, results);
  assert.equal(first.nextState.webhook.consecutiveFailures, 1);
  assert.equal(first.toAlert.length, 0);

  const second = updateState(first.nextState, results);
  assert.equal(second.nextState.webhook.consecutiveFailures, 2);
  assert.equal(second.toAlert.length, 1);
});

test('updateState does not re-alert on a third consecutive failure (alert once per episode)', () => {
  const results = [{ name: 'webhook', ok: false, expectedStatus: 200, actualStatus: 500, error: null }];
  const after2 = { webhook: { consecutiveFailures: 2 } };
  const third = updateState(after2, results);
  assert.equal(third.nextState.webhook.consecutiveFailures, 3);
  assert.equal(third.toAlert.length, 0);
});

test('loadState returns {} when the state file does not exist', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watchdog-test-'));
  try {
    const state = await loadState(path.join(dir, 'missing.json'));
    assert.deepEqual(state, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveState then loadState round-trips the state object', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watchdog-test-'));
  try {
    const stateFile = path.join(dir, 'state.json');
    const state = { webhook: { consecutiveFailures: 1, lastStatus: 500 } };
    await saveState(stateFile, state);
    const loaded = await loadState(stateFile);
    assert.deepEqual(loaded, state);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('formatAlertMessage includes check name, threshold and status detail', () => {
  const result = { name: 'reconcile-sweep', expectedStatus: 401, actualStatus: 200, error: null };
  const message = formatAlertMessage(result, 'https://example.com');
  assert.match(message, /reconcile-sweep/);
  assert.match(message, /2x in a row/);
  assert.match(message, /expected 401, got 200/);
  assert.match(message, /https:\/\/example\.com\/api\/kitchen-sumup-reconcile-sweep/);
});

test('sendTelegramAlert logs to stderr and reports not-sent when Telegram env is missing', async () => {
  const result = await sendTelegramAlert('hello', {});
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'telegram_not_configured');
});

test('sendTelegramAlert posts to the Telegram API when configured', async () => {
  let capturedUrl = null;
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  const result = await sendTelegramAlert('hello', {
    telegramBotToken: 'tok',
    telegramChatId: 'chat',
    fetchImpl,
  });
  assert.equal(result.sent, true);
  assert.equal(capturedUrl, 'https://api.telegram.org/bottok/sendMessage');
  assert.equal(capturedBody.chat_id, 'chat');
  assert.equal(capturedBody.text, 'hello');
  assert.equal('message_thread_id' in capturedBody, false);
});

test('sendTelegramAlert includes message_thread_id when configured', async () => {
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  const result = await sendTelegramAlert('hello', {
    telegramBotToken: 'tok',
    telegramChatId: 'chat',
    telegramMessageThreadId: '42',
    fetchImpl,
  });
  assert.equal(result.sent, true);
  assert.equal(capturedBody.message_thread_id, '42');
});

test('sendTelegramAlert omits message_thread_id when not configured', async () => {
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  await sendTelegramAlert('hello', {
    telegramBotToken: 'tok',
    telegramChatId: 'chat',
    fetchImpl,
  });
  assert.equal('message_thread_id' in capturedBody, false);
});

test('runOnce persists state and only alerts once the threshold is crossed, zero DB/n8n/AI calls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watchdog-test-'));
  try {
    const stateFile = path.join(dir, 'state.json');
    // All 3 checks failing (wrong status) on every run.
    const fetchImpl = fakeFetch({
      'kitchen-sumup-create-checkout': 500,
      'kitchen-sumup-reconcile-sweep': 500,
      'kitchen-sumup-webhook': 500,
    });
    const config = { baseUrl: 'https://example.com', stateFile, fetchImpl };

    const run1 = await runOnce(config);
    assert.equal(run1.results.length, 3);
    assert.equal(run1.toAlert.length, 0);

    const run2 = await runOnce(config);
    assert.equal(run2.toAlert.length, 3);

    const run3 = await runOnce(config);
    assert.equal(run3.toAlert.length, 0);

    const finalState = await loadState(stateFile);
    assert.equal(finalState['create-checkout'].consecutiveFailures, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runOnce resets alert episode after a recovery (fail, fail, pass, fail, fail alerts again)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'watchdog-test-'));
  try {
    const stateFile = path.join(dir, 'state.json');
    const failFetch = fakeFetch({
      'kitchen-sumup-create-checkout': 400,
      'kitchen-sumup-reconcile-sweep': 500,
      'kitchen-sumup-webhook': 200,
    });
    const passFetch = fakeFetch({
      'kitchen-sumup-create-checkout': 400,
      'kitchen-sumup-reconcile-sweep': 401,
      'kitchen-sumup-webhook': 200,
    });

    await runOnce({ baseUrl: 'https://example.com', stateFile, fetchImpl: failFetch });
    const run2 = await runOnce({ baseUrl: 'https://example.com', stateFile, fetchImpl: failFetch });
    assert.equal(run2.toAlert.some((r) => r.name === 'reconcile-sweep'), true);

    await runOnce({ baseUrl: 'https://example.com', stateFile, fetchImpl: passFetch });
    const run4 = await runOnce({ baseUrl: 'https://example.com', stateFile, fetchImpl: failFetch });
    assert.equal(run4.toAlert.length, 0);
    const run5 = await runOnce({ baseUrl: 'https://example.com', stateFile, fetchImpl: failFetch });
    assert.equal(run5.toAlert.some((r) => r.name === 'reconcile-sweep'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
