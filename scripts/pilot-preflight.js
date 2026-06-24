#!/usr/bin/env node
// Walbox Pilot Preflight — read-only env + connectivity check
// Requires Node 18+ for global fetch. No service_role. No writes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓ PASS  ${label}`);
  passed++;
}

function fail(label, reason) {
  console.error(`  ✗ FAIL  ${label}${reason ? ` — ${reason}` : ''}`);
  failed++;
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ─── 1. Node version ────────────────────────────────────────────────
section('Node.js');

if (typeof fetch === 'undefined') {
  fail('Global fetch', 'Node fetch not available. Use Node 18+.');
  console.error('\nPREFLIGHT FAILED — aborting.\n');
  process.exit(1);
} else {
  const [major] = process.versions.node.split('.').map(Number);
  ok(`Node version (${process.versions.node})`);
  if (major < 18) {
    fail('Node >= 18 required', `found ${process.versions.node}`);
  }
}

// ─── 2. .env.local parsing ──────────────────────────────────────────
section('.env.local');

const envPath = path.join(ROOT, '.env.local');
let envVars = {};

if (!fs.existsSync(envPath)) {
  fail('.env.local exists', 'file not found');
} else {
  ok('.env.local exists');
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    envVars[key] = val;
  }
}

// ─── 3. Required env vars ───────────────────────────────────────────
section('Environment variables');

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

for (const key of REQUIRED) {
  const val = envVars[key] || process.env[key] || '';
  if (val && val.length > 10) {
    ok(`${key} is set`);
  } else {
    fail(`${key} is set`, 'missing or empty');
  }
}

const supabaseUrl = (envVars['VITE_SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || '').replace(/\/$/, '');
const anonKey = envVars['VITE_SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'] || '';

// ─── 4. Supabase connectivity (read-only, anon) ─────────────────────
section('Supabase connectivity');

if (!supabaseUrl || !anonKey) {
  fail('Supabase reachable', 'skipped — env vars missing');
} else {
  try {
    // GET /rest/v1/ with anon key — safe, read-only, returns 200 or 401
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    // 200, 401, 404 all mean the endpoint is reachable
    if ([200, 401, 404].includes(res.status)) {
      ok(`Supabase endpoint reachable (HTTP ${res.status})`);
    } else {
      fail('Supabase endpoint reachable', `unexpected status ${res.status}`);
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      fail('Supabase endpoint reachable', 'request timed out after 8s');
    } else {
      fail('Supabase endpoint reachable', err.message);
    }
  }
}

// ─── 5. Summary ─────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(44)}`);
console.log(`  Preflight: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('  PREFLIGHT FAILED — fix issues above before pilot night.\n');
  process.exit(1);
} else {
  console.log('  PREFLIGHT OK — proceeding to build and E2E tests.\n');
  process.exit(0);
}
