// Kitchen Watchdog — Incident Auto-Diagnosis V1 bridge to Hermes.
//
// Scope V1 (deliberately minimal):
// - Fires only when the Watchdog crosses its alert threshold (one new incident episode),
//   never on every run — the caller passes only `toAlert` results.
// - Hermes is invoked one-shot, read-only investigation only (--safe-mode -z), no remediation.
// - Verified invocation pattern only: `<HERMES_PYTHON_PATH> -m hermes_cli.main --safe-mode -z <prompt>`.
//   No shell=true, no generic runtime/bin-path indirection — args passed as an array.
// - Hermes path/runtime is configurable via env (not hardcoded to any VPS layout).
// - A Hermes timeout or crash never throws: callers get a result object, always.
//
// Config via env (no secrets in repo):
//   HERMES_ENABLED       optional, default false — master switch for this feature
//   HERMES_PYTHON_PATH   optional, default "python3" — interpreter used to run Hermes
//   HERMES_TIMEOUT_MS    optional, default 60000 — hard kill timeout for the Hermes process
//   HERMES_OPS_THREAD_ID optional — Telegram forum topic/thread id for "HERMES OPS" diagnosis messages

import { spawn } from 'node:child_process';

export function resolveHermesConfig(env = process.env) {
  return {
    enabled: env.HERMES_ENABLED === 'true',
    pythonPath: env.HERMES_PYTHON_PATH || 'python3',
    timeoutMs: Number(env.HERMES_TIMEOUT_MS) || 60000,
    opsThreadId: env.HERMES_OPS_THREAD_ID || null,
  };
}

export function buildHermesPrompt(result, baseUrl, checkPath) {
  const detail = result.error
    ? `error: ${result.error}`
    : `expected ${result.expectedStatus}, got ${result.actualStatus}`;
  return (
    `Kitchen Watchdog incident — read-only investigation only, no remediation.\n` +
    `Check: ${result.name}\n` +
    `Target: ${baseUrl}${checkPath || ''}\n` +
    `Detail: ${detail}\n` +
    `Respond compactly with: causa probabile, evidence, impatto, next safe check, escalation.`
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
  { baseUrl, checkPath, hermesConfig, sendMessage, spawnImpl }
) {
  try {
    if (!hermesConfig?.enabled) {
      return { skipped: true, reason: 'hermes_disabled' };
    }

    const prompt = buildHermesPrompt(result, baseUrl, checkPath);
    const hermesResult = await runHermesDiagnosis(prompt, hermesConfig, { spawnImpl });
    const message = formatDiagnosisMessage(result, hermesResult, baseUrl);

    await sendMessage(message, hermesConfig.opsThreadId);
    return { skipped: false, hermesResult, sent: true };
  } catch (err) {
    console.error('[Kitchen Watchdog] Incident Auto-Diagnosis failed (ignored)', err.message || err);
    return { skipped: false, sent: false, reason: 'incident_bridge_error' };
  }
}
