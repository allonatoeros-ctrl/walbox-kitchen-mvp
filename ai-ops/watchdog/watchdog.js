#!/usr/bin/env node
// Kitchen Watchdog V1 — HTTP-only synthetic check for the SumUp Kitchen Payment Hub.
//
// Scope V1 (deliberately minimal, see docs/kitchen-watchdog-install.md):
// - 3 HTTP checks against known Vercel endpoints, each with a fixed expected status:
//     create-checkout  (POST, empty body)        -> expect 400
//     reconcile-sweep  (GET, no Authorization)    -> expect 401
//     webhook          (POST, empty JSON body)    -> expect 200
// - Runs once per invocation; process exit code reflects overall result (for cron/systemd).
// - Interval (5 min) is owned by the systemd timer, not by this script (no internal setInterval).
// - Alert only after 2 consecutive failures of the SAME check (state persisted to a local file).
// - Zero DB access, zero n8n, zero AI. Pure HTTP GET/POST + optional Telegram notification.
//
// Config via env (no secrets in repo):
//   KITCHEN_WATCHDOG_BASE_URL   required, e.g. https://kitchen.example.com
//   WATCHDOG_STATE_FILE         optional, default ai-ops/watchdog/.watchdog-state.json
//   TELEGRAM_BOT_TOKEN          optional — if unset, alerts are only printed to stdout/stderr
//   TELEGRAM_CHAT_ID            optional — required together with TELEGRAM_BOT_TOKEN to actually send
//   TELEGRAM_MESSAGE_THREAD_ID  optional — if set, alerts are sent into this forum topic/thread
//
// Incident Auto-Diagnosis V1 (see incident-bridge.js) — fires only on a new alert episode,
// read-only Hermes investigation, no remediation. Config: HERMES_ENABLED, HERMES_PYTHON_PATH,
// HERMES_TIMEOUT_MS, HERMES_OPS_THREAD_ID.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHermesConfig, runIncidentDiagnosis } from './incident-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CHECKS = [
  {
    name: 'create-checkout',
    path: '/api/kitchen-sumup-create-checkout',
    method: 'POST',
    body: {},
    expectedStatus: 400,
  },
  {
    name: 'reconcile-sweep',
    path: '/api/kitchen-sumup-reconcile-sweep',
    method: 'GET',
    body: null,
    expectedStatus: 401,
  },
  {
    name: 'webhook',
    path: '/api/kitchen-sumup-webhook',
    method: 'POST',
    body: {},
    expectedStatus: 200,
  },
];

export const CONSECUTIVE_FAILURE_THRESHOLD = 2;

export function resolveConfig(env = process.env) {
  const baseUrl = env.KITCHEN_WATCHDOG_BASE_URL;
  if (!baseUrl) {
    throw new Error('KITCHEN_WATCHDOG_BASE_URL env var is required');
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    stateFile: env.WATCHDOG_STATE_FILE || path.join(__dirname, '.watchdog-state.json'),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: env.TELEGRAM_CHAT_ID || null,
    telegramMessageThreadId: env.TELEGRAM_MESSAGE_THREAD_ID || null,
    hermes: resolveHermesConfig(env),
  };
}

export async function runCheck(check, { baseUrl, fetchImpl = fetch } = {}) {
  const url = `${baseUrl}${check.path}`;
  const init = { method: check.method, headers: {} };
  if (check.body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(check.body);
  }

  try {
    const res = await fetchImpl(url, init);
    const ok = res.status === check.expectedStatus;
    return {
      name: check.name,
      ok,
      expectedStatus: check.expectedStatus,
      actualStatus: res.status,
      error: null,
    };
  } catch (err) {
    return {
      name: check.name,
      ok: false,
      expectedStatus: check.expectedStatus,
      actualStatus: null,
      error: err.message || String(err),
    };
  }
}

export async function loadState(stateFile) {
  try {
    const raw = await readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveState(stateFile, state) {
  await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

// Applies one run's results to the persisted per-check consecutive-failure counters.
// Returns { nextState, toAlert } where toAlert lists checks that just crossed the threshold
// (i.e. alert exactly once per failure episode, not on every subsequent failing run).
export function updateState(prevState, results) {
  const nextState = { ...prevState };
  const toAlert = [];

  for (const result of results) {
    const prevCount = prevState[result.name]?.consecutiveFailures || 0;
    const nextCount = result.ok ? 0 : prevCount + 1;

    nextState[result.name] = {
      consecutiveFailures: nextCount,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: result.actualStatus,
    };

    if (!result.ok && nextCount === CONSECUTIVE_FAILURE_THRESHOLD) {
      toAlert.push(result);
    }
  }

  return { nextState, toAlert };
}

export function formatAlertMessage(result, baseUrl) {
  const detail = result.error
    ? `error: ${result.error}`
    : `expected ${result.expectedStatus}, got ${result.actualStatus}`;
  return (
    `[Kitchen Watchdog] ALERT — "${result.name}" failed ${CONSECUTIVE_FAILURE_THRESHOLD}x in a row\n` +
    `Target: ${baseUrl}${CHECKS.find((c) => c.name === result.name)?.path || ''}\n` +
    `Detail: ${detail}`
  );
}

export async function sendTelegramAlert(
  message,
  { telegramBotToken, telegramChatId, telegramMessageThreadId, fetchImpl = fetch }
) {
  if (!telegramBotToken || !telegramChatId) {
    console.error(message);
    return { sent: false, reason: 'telegram_not_configured' };
  }

  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  const payload = { chat_id: telegramChatId, text: message };
  if (telegramMessageThreadId) {
    payload.message_thread_id = telegramMessageThreadId;
  }
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[Kitchen Watchdog] Telegram send failed with status ${res.status}`);
      console.error(message);
      return { sent: false, reason: `telegram_http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[Kitchen Watchdog] Telegram send threw', err.message || err);
    console.error(message);
    return { sent: false, reason: 'telegram_fetch_error' };
  }
}

export async function runOnce(config) {
  const results = [];
  for (const check of CHECKS) {
    results.push(await runCheck(check, config));
  }

  const prevState = await loadState(config.stateFile);
  const { nextState, toAlert } = updateState(prevState, results);
  // State is persisted BEFORE any Telegram/Hermes side effect: a Hermes timeout or crash below
  // must never cause the same episode to be (mis)counted or re-alerted on the next run.
  await saveState(config.stateFile, nextState);

  for (const result of toAlert) {
    const message = formatAlertMessage(result, config.baseUrl);
    await sendTelegramAlert(message, config);

    if (config.hermes?.enabled) {
      const checkPath = CHECKS.find((c) => c.name === result.name)?.path;
      try {
        await runIncidentDiagnosis(result, {
          baseUrl: config.baseUrl,
          checkPath,
          hermesConfig: config.hermes,
          sendMessage: (opsMessage, threadId) =>
            sendTelegramAlert(opsMessage, { ...config, telegramMessageThreadId: threadId }),
          spawnImpl: config.hermesSpawnImpl,
        });
      } catch (err) {
        // Belt-and-suspenders: runIncidentDiagnosis already catches internally, but the
        // Watchdog's own run must never fail because of Hermes regardless.
        console.error('[Kitchen Watchdog] Incident Auto-Diagnosis failed (ignored)', err.message || err);
      }
    }
  }

  return { results, toAlert };
}

async function main() {
  const config = resolveConfig();
  const { results, toAlert } = await runOnce(config);

  for (const result of results) {
    const label = result.ok ? 'PASS' : 'FAIL';
    console.log(
      `[Kitchen Watchdog] ${label} ${result.name} — expected ${result.expectedStatus}, got ${result.actualStatus ?? 'n/a'}${result.error ? ` (${result.error})` : ''}`
    );
  }

  const anyFailed = results.some((r) => !r.ok);
  if (toAlert.length > 0) {
    console.error(`[Kitchen Watchdog] ${toAlert.length} check(s) crossed the alert threshold`);
  }

  process.exit(anyFailed ? 1 : 0);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('[Kitchen Watchdog] fatal error', err);
    process.exit(2);
  });
}
