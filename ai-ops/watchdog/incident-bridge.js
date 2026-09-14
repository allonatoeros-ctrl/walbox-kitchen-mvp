// Kitchen Watchdog — Incident Auto-Diagnosis V1 bridge to Hermes.
//
// Scope V1 (deliberately minimal):
// - Fires only when the Watchdog crosses its alert threshold (one new incident episode),
//   never on every run — the caller passes only `toAlert` results.
// - Evidence-first pattern: before invoking Hermes, collect minimal deterministic LOCAL evidence
//   (see collectEvidence) and embed it as static text in the prompt. Hermes is instructed to
//   analyze ONLY that evidence — no tool calls, no commands, no remediation — which is what keeps
//   the one-shot invocation fast. Real VPS incidents showed Hermes reaching HERMES OPS but then
//   timing out at 60s; raising the timeout is not the fix (see docs/kitchen-watchdog-install.md).
// - Verified invocation pattern only: `<HERMES_PYTHON_PATH> -m hermes_cli.main --safe-mode -z <prompt>`.
//   No shell=true, no generic runtime/bin-path indirection — args passed as an array.
// - Hermes path/runtime is configurable via env (not hardcoded to any VPS layout).
// - A Hermes timeout or crash never throws: callers get a result object, always.
// - Evidence collection itself is isolated per-command with its own timeout: a missing/hanging
//   `systemctl`/`journalctl`/`git` never blocks the others or the Watchdog run, and raw command
//   output is best-effort redacted before it ever reaches a prompt or Telegram message.
//
// Config via env (no secrets in repo):
//   HERMES_ENABLED       optional, default false — master switch for this feature
//   HERMES_PYTHON_PATH   optional, default "python3" — interpreter used to run Hermes
//   HERMES_TIMEOUT_MS    optional, default 60000 — hard kill timeout for the Hermes process
//   HERMES_OPS_THREAD_ID optional — Telegram forum topic/thread id for "HERMES OPS" diagnosis messages
//   EVIDENCE_TIMEOUT_MS  optional, default 5000 — hard kill timeout for EACH evidence command

import { spawn } from 'node:child_process';

const EVIDENCE_COMMAND_TIMEOUT_MS = 5000;
const JOURNAL_LINE_COUNT = 30;
const SERVICE_NAME = 'kitchen-watchdog.service';

export function resolveHermesConfig(env = process.env) {
  return {
    enabled: env.HERMES_ENABLED === 'true',
    pythonPath: env.HERMES_PYTHON_PATH || 'python3',
    timeoutMs: Number(env.HERMES_TIMEOUT_MS) || 60000,
    opsThreadId: env.HERMES_OPS_THREAD_ID || null,
    evidenceTimeoutMs: Number(env.EVIDENCE_TIMEOUT_MS) || EVIDENCE_COMMAND_TIMEOUT_MS,
  };
}

// Best-effort redaction of secret-shaped substrings from raw command output (systemctl/journalctl
// can echo environment or request data). Not a substitute for not logging secrets in the first
// place, but a cheap belt-and-suspenders pass before evidence reaches a prompt or Telegram.
export function redactSecrets(text) {
  if (!text) return text;
  return text
    .replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '[REDACTED_TOKEN]') // Telegram bot-token shape
    .replace(/(Authorization:\s*)(Bearer|Basic)\s+\S+/gi, '$1$2 [REDACTED]')
    // Generic best-effort: "<token|key|secret|password>[_-]?...: <value>" or "...=<value>" pairs,
    // whatever the value shape — covers common env/log formats without guessing a provider.
    .replace(
      /((?:api[_-]?key|access[_-]?key|token|secret|password|passwd)\w*\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,
      '$1[REDACTED]'
    )
    .replace(/((?:Set-)?Cookie:\s*)\S+/gi, '$1[REDACTED]');
}

// Runs one read-only local command with a hard timeout. Never throws — always resolves with
// { ok, output, error }. Used only to gather diagnostic evidence, never to change any state.
function runEvidenceCommand(command, args, { timeoutMs = EVIDENCE_COMMAND_TIMEOUT_MS, cwd, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;

    try {
      child = spawnImpl(command, args, { shell: false, cwd });
    } catch (err) {
      resolve({ ok: false, output: null, error: `spawn_failed: ${err.message || err}` });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // process may already be gone — nothing to do
      }
      resolve({ ok: false, output: null, error: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: null, error: `process_error: ${err.message || err}` });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = redactSecrets(stdout.trim());
      // Exit code alone doesn't mean "no useful evidence": e.g. `systemctl status` on an idle
      // oneshot unit (its normal state between timer runs) exits non-zero (LSB "not running")
      // while still printing a perfectly good status block. Treat any actual stdout as usable
      // evidence regardless of exit code; only an empty stdout counts as unavailable.
      if (output) {
        resolve({ ok: true, output, error: null });
      } else {
        resolve({
          ok: false,
          output: null,
          error: `exit_${code}: ${redactSecrets(stderr.trim()).slice(0, 300)}`,
        });
      }
    });
  });
}

// Gathers the minimal deterministic LOCAL evidence for one incident: check/result, target,
// timestamp, runtime git SHA (if available), systemd unit status, and the service's recent
// journal. Each command is isolated behind its own timeout — a stuck or missing command never
// blocks the others or the Watchdog run, it just reports as "non disponibile". No remote calls.
export async function collectEvidence(
  result,
  baseUrl,
  checkPath,
  { cwd = process.cwd(), timeoutMs = EVIDENCE_COMMAND_TIMEOUT_MS, spawnImpl } = {}
) {
  const detail = result.error
    ? `error: ${result.error}`
    : `expected ${result.expectedStatus}, got ${result.actualStatus}`;

  const [gitSha, systemctlStatus, journalTail] = await Promise.all([
    runEvidenceCommand('git', ['rev-parse', 'HEAD'], { timeoutMs, cwd, spawnImpl }),
    runEvidenceCommand('systemctl', ['--user', 'status', SERVICE_NAME, '--no-pager', '-l'], {
      timeoutMs,
      spawnImpl,
    }),
    runEvidenceCommand(
      'journalctl',
      ['--user', '-u', SERVICE_NAME, '-n', String(JOURNAL_LINE_COUNT), '--no-pager'],
      { timeoutMs, spawnImpl }
    ),
  ]);

  return {
    check: result.name,
    target: `${baseUrl}${checkPath || ''}`,
    timestamp: new Date().toISOString(),
    detail,
    gitSha: gitSha.ok ? gitSha.output : `non disponibile (${gitSha.error})`,
    systemctlStatus: systemctlStatus.ok ? systemctlStatus.output : `non disponibile (${systemctlStatus.error})`,
    journalTail: journalTail.ok ? journalTail.output : `non disponibile (${journalTail.error})`,
  };
}

// Builds the Hermes prompt from already-collected evidence only. Hermes is explicitly instructed
// to analyze this static text and nothing else — no tool calls, no commands, no remediation —
// which is what keeps the one-shot invocation fast instead of timing out.
export function buildHermesPrompt(evidence) {
  return (
    `Kitchen Watchdog incident — analizza SOLO l'evidence qui sotto, che è testo statico già raccolto.\n` +
    `Non eseguire comandi, non usare tool/funzioni: nessuna remediation, è un'investigazione read-only.\n` +
    `\n` +
    `Check: ${evidence.check}\n` +
    `Target: ${evidence.target}\n` +
    `Timestamp: ${evidence.timestamp}\n` +
    `Detail: ${evidence.detail}\n` +
    `Runtime git SHA: ${evidence.gitSha}\n` +
    `\n` +
    `--- systemctl --user status ${SERVICE_NAME} ---\n${evidence.systemctlStatus}\n` +
    `\n` +
    `--- journalctl --user -u ${SERVICE_NAME} -n ${JOURNAL_LINE_COUNT} (ultime righe) ---\n${evidence.journalTail}\n` +
    `\n` +
    `Rispondi compattamente con: causa probabile, evidence, impatto, next safe check, escalation.`
  );
}

// Runs Hermes as a one-shot child process. Never rejects/throws — always resolves with
// { ok, output, error }. A timeout or non-zero exit is reported as ok:false, not an exception.
export function runHermesDiagnosis(prompt, { pythonPath, timeoutMs }, { spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;

    try {
      child = spawnImpl(pythonPath, ['-m', 'hermes_cli.main', '--safe-mode', '-z', prompt], {
        shell: false,
      });
    } catch (err) {
      resolve({ ok: false, output: null, error: `hermes_spawn_failed: ${err.message || err}` });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // process may already be gone — nothing to do
      }
      resolve({ ok: false, output: null, error: 'hermes_timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: null, error: `hermes_process_error: ${err.message || err}` });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, output: stdout.trim(), error: null });
      } else {
        resolve({
          ok: false,
          output: stdout.trim() || null,
          error: `hermes_exit_${code}: ${stderr.trim().slice(0, 300)}`,
        });
      }
    });
  });
}

const TELEGRAM_MAX_BODY = 3800;

export function formatDiagnosisMessage(result, hermesResult, baseUrl) {
  const header = `[Hermes OPS] Incident diagnosis — "${result.name}"\nTarget: ${baseUrl}`;
  if (!hermesResult.ok) {
    return `${header}\nHermes investigation failed: ${hermesResult.error}`;
  }
  const body = hermesResult.output || '(empty output)';
  const truncated = body.length > TELEGRAM_MAX_BODY ? `${body.slice(0, TELEGRAM_MAX_BODY)}\n…(truncated)` : body;
  return `${header}\n${truncated}`;
}

// Orchestrates one incident's diagnosis: run Hermes, format the result, hand it to the caller's
// Telegram sender on the HERMES OPS thread. Guaranteed not to throw — a failure at any step
// resolves with `{ sent: false, reason }` instead of propagating.
export async function runIncidentDiagnosis(
  result,
  { baseUrl, checkPath, hermesConfig, sendMessage, spawnImpl, evidenceSpawnImpl, cwd }
) {
  try {
    if (!hermesConfig?.enabled) {
      return { skipped: true, reason: 'hermes_disabled' };
    }

    const evidence = await collectEvidence(result, baseUrl, checkPath, {
      cwd,
      timeoutMs: hermesConfig.evidenceTimeoutMs,
      spawnImpl: evidenceSpawnImpl,
    });
    const prompt = buildHermesPrompt(evidence);
    const hermesResult = await runHermesDiagnosis(prompt, hermesConfig, { spawnImpl });
    const message = formatDiagnosisMessage(result, hermesResult, baseUrl);

    await sendMessage(message, hermesConfig.opsThreadId);
    return { skipped: false, hermesResult, sent: true };
  } catch (err) {
    console.error('[Kitchen Watchdog] Incident Auto-Diagnosis failed (ignored)', err.message || err);
    return { skipped: false, sent: false, reason: 'incident_bridge_error' };
  }
}
