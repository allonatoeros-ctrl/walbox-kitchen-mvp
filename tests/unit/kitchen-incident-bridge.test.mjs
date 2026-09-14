// Unit tests for Kitchen Watchdog Incident Auto-Diagnosis V1 (ai-ops/watchdog/incident-bridge.js).
// Pure logic + mocked child_process/Telegram sender — zero real Hermes/Telegram calls.
// Eseguire a mano con: node --test tests/unit/kitchen-incident-bridge.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import {
  resolveHermesConfig,
  redactSecrets,
  collectEvidence,
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

test('resolveHermesConfig reads HERMES_ENABLED=true and custom python path/timeout/thread/evidence timeout', () => {
  const config = resolveHermesConfig({
    HERMES_ENABLED: 'true',
    HERMES_PYTHON_PATH: '/opt/hermes/venv/bin/python',
    HERMES_TIMEOUT_MS: '15000',
    HERMES_OPS_THREAD_ID: '99',
    EVIDENCE_TIMEOUT_MS: '2000',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.pythonPath, '/opt/hermes/venv/bin/python');
  assert.equal(config.timeoutMs, 15000);
  assert.equal(config.opsThreadId, '99');
  assert.equal(config.evidenceTimeoutMs, 2000);
});

test('resolveHermesConfig defaults evidenceTimeoutMs to 5000', () => {
  assert.equal(resolveHermesConfig({}).evidenceTimeoutMs, 5000);
});

test('redactSecrets masks a Telegram-bot-token-shaped string', () => {
  const text = 'sendMessage failed for bot123456789:AAHexampleTokenValue1234567890abc';
  assert.doesNotMatch(redactSecrets(text), /AAHexampleTokenValue/);
  assert.match(redactSecrets(text), /\[REDACTED_TOKEN\]/);
});

test('redactSecrets masks an Authorization header value but keeps the scheme', () => {
  const text = 'curl -H "Authorization: Bearer sk-real-secret-value" ...';
  const redacted = redactSecrets(text);
  assert.doesNotMatch(redacted, /sk-real-secret-value/);
  assert.match(redacted, /Authorization: Bearer \[REDACTED\]/);
});

test('redactSecrets passes through text with no secret-shaped substrings unchanged', () => {
  assert.equal(redactSecrets('Active: active (running) since ...'), 'Active: active (running) since ...');
});

test('redactSecrets masks common token/key/secret/password key=value and key: value pairs', () => {
  const cases = [
    'API_KEY=sk_live_abcdef123456',
    'access_key: AKIA1234567890EXAMPLE',
    'token="eyJhbGciOiJIUzI1NiJ9.example"',
    "secret='super-secret-value'",
    'password=hunter2',
  ];
  for (const line of cases) {
    const redacted = redactSecrets(line);
    assert.match(redacted, /\[REDACTED\]/, `expected redaction in: ${line}`);
    assert.doesNotMatch(redacted, /sk_live|AKIA1234567890EXAMPLE|eyJhbGciOiJIUzI1NiJ9|super-secret-value|hunter2/);
  }
});

test('redactSecrets masks Cookie and Set-Cookie header values', () => {
  const redacted = redactSecrets('Set-Cookie: session=abc123; Path=/\nCookie: session=abc123');
  assert.doesNotMatch(redacted, /abc123/);
  assert.match(redacted, /Set-Cookie: \[REDACTED\]/);
  assert.match(redacted, /Cookie: \[REDACTED\]/);
});

function fakeEvidenceSpawn(byCommand) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.killed = true;
    };
    const spec = byCommand[command] || { exitCode: 1, stderr: `unmocked command: ${command}` };
    queueMicrotask(() => {
      if (spec.hang) return;
      if (spec.stdout) child.stdout.emit('data', Buffer.from(spec.stdout));
      if (spec.stderr) child.stderr.emit('data', Buffer.from(spec.stderr));
      child.emit('close', spec.exitCode ?? 0);
    });
    return child;
  };
}

test('collectEvidence gathers check/target/timestamp plus git SHA, systemctl status and journal tail', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234\n' },
    systemctl: { exitCode: 0, stdout: 'Active: active (running)' },
    journalctl: { exitCode: 0, stdout: 'line1\nline2' },
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl, cwd: '/repo' }
  );

  assert.equal(evidence.check, 'webhook');
  assert.equal(evidence.target, 'https://example.com/api/kitchen-sumup-webhook');
  assert.match(evidence.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(evidence.detail, 'expected 200, got 500');
  assert.equal(evidence.gitSha, 'abc1234');
  assert.equal(evidence.systemctlStatus, 'Active: active (running)');
  assert.equal(evidence.journalTail, 'line1\nline2');
});

test('collectEvidence preserves systemctl stdout even when the command exits non-zero (oneshot inactive/dead, exit code 3)', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234' },
    // Type=oneshot units report LSB "not running" (exit 3) once idle between timer runs, while
    // still printing a perfectly good status block — that output must not be discarded.
    systemctl: {
      exitCode: 3,
      stdout: '● kitchen-watchdog.service\n   Loaded: loaded\n   Active: inactive (dead) since ...',
    },
    journalctl: { exitCode: 0, stdout: 'line1' },
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl }
  );

  assert.match(evidence.systemctlStatus, /Active: inactive \(dead\)/);
  assert.doesNotMatch(evidence.systemctlStatus, /non disponibile/);
});

test('collectEvidence still reports "non disponibile" when a non-zero exit produces no stdout at all', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234' },
    systemctl: { exitCode: 1, stderr: 'Unit kitchen-watchdog.service could not be found.' },
    journalctl: { exitCode: 1, stderr: 'No journal files were found.' },
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl }
  );

  assert.match(evidence.systemctlStatus, /non disponibile \(exit_1/);
  assert.match(evidence.journalTail, /non disponibile \(exit_1/);
});

test('collectEvidence isolates a failing/missing command instead of failing the whole evidence set', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234' },
    systemctl: { exitCode: 1, stderr: 'Unit kitchen-watchdog.service could not be found.' },
    // journalctl deliberately unmocked -> ENOENT-style failure via the default branch
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl }
  );

  assert.equal(evidence.gitSha, 'abc1234');
  assert.match(evidence.systemctlStatus, /non disponibile/);
  assert.match(evidence.journalTail, /non disponibile/);
});

test('collectEvidence times out a hanging command instead of blocking forever', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { hang: true },
    systemctl: { exitCode: 0, stdout: 'Active: active (running)' },
    journalctl: { exitCode: 0, stdout: 'line1' },
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl, timeoutMs: 20 }
  );

  assert.match(evidence.gitSha, /non disponibile \(timeout\)/);
});

test('collectEvidence redacts secret-shaped output before returning it', async () => {
  const spawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234' },
    systemctl: { exitCode: 0, stdout: 'Active: active (running)' },
    journalctl: {
      exitCode: 0,
      stdout: 'Authorization: Bearer sk-should-not-leak\nGET /api/x 500',
    },
  });

  const evidence = await collectEvidence(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    'https://example.com',
    '/api/kitchen-sumup-webhook',
    { spawnImpl }
  );

  assert.doesNotMatch(evidence.journalTail, /sk-should-not-leak/);
  assert.match(evidence.journalTail, /\[REDACTED\]/);
});

test('buildHermesPrompt embeds the evidence fields and forbids tools/commands/remediation', () => {
  const evidence = {
    check: 'webhook',
    target: 'https://example.com/api/kitchen-sumup-webhook',
    timestamp: '2026-09-14T10:00:00.000Z',
    detail: 'expected 200, got 500',
    gitSha: 'abc1234',
    systemctlStatus: 'Active: active (running)',
    journalTail: 'line1\nline2',
  };
  const prompt = buildHermesPrompt(evidence);
  assert.match(prompt, /webhook/);
  assert.match(prompt, /https:\/\/example\.com\/api\/kitchen-sumup-webhook/);
  assert.match(prompt, /expected 200, got 500/);
  assert.match(prompt, /abc1234/);
  assert.match(prompt, /Active: active \(running\)/);
  assert.match(prompt, /line1\nline2/);
  assert.match(prompt, /SOLO la sezione CURRENT INCIDENT/);
  assert.match(prompt, /Non eseguire comandi, non usare tool/i);
  assert.match(prompt, /nessuna remediation/i);
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /COSA HO TROVATO/);
  assert.match(prompt, /ESCALATION → NONE \/ HUMAN \/ CLAUDE/);
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
  let capturedPrompt = null;
  const spawnImpl = (cmd, args) => {
    capturedPrompt = args[args.length - 1];
    return fakeChild({ exitCode: 0, stdout: 'causa probabile: SumUp API degraded' });
  };
  const evidenceSpawnImpl = fakeEvidenceSpawn({
    git: { exitCode: 0, stdout: 'abc1234' },
    systemctl: { exitCode: 0, stdout: 'Active: active (running)' },
    journalctl: { exitCode: 0, stdout: 'line1' },
  });

  const outcome = await runIncidentDiagnosis(
    { name: 'webhook', expectedStatus: 200, actualStatus: 500, error: null },
    {
      baseUrl: 'https://example.com',
      checkPath: '/api/kitchen-sumup-webhook',
      hermesConfig: {
        enabled: true,
        pythonPath: 'python3',
        timeoutMs: 5000,
        opsThreadId: '777',
        evidenceTimeoutMs: 2000,
      },
      sendMessage: async (message, threadId) => {
        capturedMessage = message;
        capturedThreadId = threadId;
      },
      spawnImpl,
      evidenceSpawnImpl,
    }
  );

  assert.equal(outcome.skipped, false);
  assert.equal(outcome.sent, true);
  assert.equal(capturedThreadId, '777');
  assert.match(capturedMessage, /SumUp API degraded/);
  // The prompt Hermes actually received must be evidence-only, no tool/command instruction absent.
  assert.match(capturedPrompt, /abc1234/);
  assert.match(capturedPrompt, /Active: active \(running\)/);
  assert.match(capturedPrompt, /Non eseguire comandi/i);
});

test('runIncidentDiagnosis never throws when Hermes crashes/times out — resolves with sent:false instead', async () => {
  const spawnImpl = () => fakeChild({ crashError: new Error('ENOENT') });
  const evidenceSpawnImpl = fakeEvidenceSpawn({});
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
      evidenceSpawnImpl,
    }
  );
  // The combination of a Hermes crash AND a Telegram send failure must still resolve, not throw.
  assert.equal(outcome.sent, false);
  assert.equal(outcome.reason, 'incident_bridge_error');
});
