// Unit tests for Kitchen Watchdog Incident Auto-Diagnosis V1 (ai-ops/watchdog/incident-bridge.js).
// Pure logic + mocked child_process/Telegram sender — zero real Hermes/Telegram calls.
// Eseguire a mano con: node --test tests/unit/kitchen-incident-bridge.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  resolveHermesConfig,
  buildHermesPrompt,
  runHermesDiagnosis,
  formatDiagnosisMessage,
  runIncidentDiagnosis,
} from '../../ai-ops/watchdog/incident-bridge.js';

function fakeChild({ exitCode = 0, stdout = '', stderr = '', crashError = null, hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
  };

  if (!hang) {
    queueMicrotask(() => {
      if (crashError) {
        child.emit('error', crashError);
        return;
      }
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', exitCode);
    });
  }

  return child;
}

test('resolveHermesConfig defaults to disabled with python3 and 60s timeout', () => {
  const config = resolveHermesConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.pythonPath, 'python3');
  assert.equal(config.timeoutMs, 60000);
  assert.equal(config.opsThreadId, null);
});

test('resolveHermesConfig reads HERMES_ENABLED=true and custom python path/timeout/thread', () => {
  const config = resolveHermesConfig({
    HERMES_ENABLED: 'true',
    HERMES_PYTHON_PATH: '/opt/hermes/venv/bin/python',
    HERMES_TIMEOUT_MS: '15000',
    HERMES_OPS_THREAD_ID: '99',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.pythonPath, '/opt/hermes/venv/bin/python');
  assert.equal(config.timeoutMs, 15000);
  assert.equal(config.opsThreadId, '99');
});

test('buildHermesPrompt includes check name, target and read-only/no-remediation constraint', () => {
  const result = { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null };
  const prompt = buildHermesPrompt(result, 'https://example.com', '/api/kitchen-sumup-webhook');
  assert.match(prompt, /webhook/);
  assert.match(prompt, /https:\/\/example\.com\/api\/kitchen-sumup-webhook/);
  assert.match(prompt, /expected 200, got 500/);
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /no remediation/i);
});

test('runHermesDiagnosis invokes python -m hermes_cli.main --safe-mode -z <prompt> with shell:false', async () => {
  let capturedCmd = null;
  let capturedArgs = null;
  let capturedOpts = null;
  const spawnImpl = (cmd, args, opts) => {
    capturedCmd = cmd;
    capturedArgs = args;
    capturedOpts = opts;
    return fakeChild({ exitCode: 0, stdout: 'causa probabile: ...' });
  };

  const result = await runHermesDiagnosis(
    'incident prompt',
    { pythonPath: '/usr/bin/python3', timeoutMs: 5000 },
    { spawnImpl }
  );

  assert.equal(capturedCmd, '/usr/bin/python3');
  assert.deepEqual(capturedArgs, ['-m', 'hermes_cli.main', '--safe-mode', '-z', 'incident prompt']);
  assert.equal(capturedOpts.shell, false);
  assert.equal(result.ok, true);
  assert.equal(result.output, 'causa probabile: ...');
});

test('runHermesDiagnosis reports ok:false with stderr detail on non-zero exit', async () => {
  const spawnImpl = () => fakeChild({ exitCode: 1, stderr: 'ModuleNotFoundError: hermes_cli' });
  const result = await runHermesDiagnosis('p', { pythonPath: 'python3', timeoutMs: 5000 }, { spawnImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /hermes_exit_1/);
  assert.match(result.error, /ModuleNotFoundError/);
});

test('runHermesDiagnosis reports ok:false when the process object throws (spawn failed)', async () => {
  const spawnImpl = () => {
    throw new Error('ENOENT: python3 not found');
  };
  const result = await runHermesDiagnosis('p', { pythonPath: 'python3', timeoutMs: 5000 }, { spawnImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /hermes_spawn_failed/);
});

test('runHermesDiagnosis reports ok:false on process error event (e.g. EACCES)', async () => {
  const spawnImpl = () => fakeChild({ crashError: new Error('EACCES') });
  const result = await runHermesDiagnosis('p', { pythonPath: 'python3', timeoutMs: 5000 }, { spawnImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /hermes_process_error/);
});

test('runHermesDiagnosis times out and kills the process instead of hanging forever', async () => {
  let killed = false;
  const spawnImpl = () => {
    const child = fakeChild({ hang: true });
    const originalKill = child.kill;
    child.kill = () => {
      killed = true;
      originalKill();
    };
    return child;
  };

  const result = await runHermesDiagnosis('p', { pythonPath: 'python3', timeoutMs: 30 }, { spawnImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'hermes_timeout');
  assert.equal(killed, true);
});

test('formatDiagnosisMessage renders header + Hermes output on success', () => {
  const message = formatDiagnosisMessage(
    { name: 'webhook' },
    { ok: true, output: 'causa probabile: rate limit SumUp\nevidence: 3x 429' },
    'https://example.com'
  );
  assert.match(message, /\[Hermes OPS\]/);
  assert.match(message, /webhook/);
  assert.match(message, /rate limit SumUp/);
});

test('formatDiagnosisMessage renders failure reason when Hermes did not run successfully', () => {
  const message = formatDiagnosisMessage({ name: 'webhook' }, { ok: false, error: 'hermes_timeout' }, 'https://example.com');
  assert.match(message, /investigation failed/);
  assert.match(message, /hermes_timeout/);
});

test('formatDiagnosisMessage truncates very long Hermes output for Telegram', () => {
  const longOutput = 'x'.repeat(5000);
  const message = formatDiagnosisMessage({ name: 'webhook' }, { ok: true, output: longOutput }, 'https://example.com');
  assert.ok(message.length < 4096);
  assert.match(message, /truncated/);
});

test('runIncidentDiagnosis skips entirely when Hermes is disabled (HERMES_ENABLED=false behavior)', async () => {
  let sendCalled = false;
  const outcome = await runIncidentDiagnosis(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    {
      baseUrl: 'https://example.com',
      checkPath: '/api/kitchen-sumup-webhook',
      hermesConfig: { enabled: false },
      sendMessage: async () => {
        sendCalled = true;
      },
    }
  );
  assert.equal(outcome.skipped, true);
  assert.equal(outcome.reason, 'hermes_disabled');
  assert.equal(sendCalled, false);
});

test('runIncidentDiagnosis sends the diagnosis to the configured HERMES OPS thread id', async () => {
  let capturedMessage = null;
  let capturedThreadId = null;
  const spawnImpl = () => fakeChild({ exitCode: 0, stdout: 'causa probabile: SumUp API degraded' });

  const outcome = await runIncidentDiagnosis(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    {
      baseUrl: 'https://example.com',
      checkPath: '/api/kitchen-sumup-webhook',
      hermesConfig: { enabled: true, pythonPath: 'python3', timeoutMs: 5000, opsThreadId: '777' },
      sendMessage: async (message, threadId) => {
        capturedMessage = message;
        capturedThreadId = threadId;
      },
      spawnImpl,
    }
  );

  assert.equal(outcome.skipped, false);
  assert.equal(outcome.sent, true);
  assert.equal(capturedThreadId, '777');
  assert.match(capturedMessage, /SumUp API degraded/);
});

test('runIncidentDiagnosis never throws when Hermes crashes/times out — resolves with sent:false instead', async () => {
  const spawnImpl = () => fakeChild({ crashError: new Error('ENOENT') });
  const outcome = await runIncidentDiagnosis(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    {
      baseUrl: 'https://example.com',
      checkPath: '/api/kitchen-sumup-webhook',
      hermesConfig: { enabled: true, pythonPath: 'python3', timeoutMs: 5000, opsThreadId: '777' },
      sendMessage: async () => {
        throw new Error('telegram down too');
      },
      spawnImpl,
    }
  );
  // The combination of a Hermes crash AND a Telegram send failure must still resolve, not throw.
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, 'incident_bridge_error');
});
