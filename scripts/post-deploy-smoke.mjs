#!/usr/bin/env node
// Walbox post-deploy smoke — a costo zero, nessuna scrittura, nessun checkout SumUp.
// Uso: node scripts/post-deploy-smoke.mjs https://<url-di-produzione>
// Solo GET e POST senza token o con token finto: gli handler rispondono 401 prima di toccare DB o SumUp.
// Eseguirlo contro la produzione e' una decisione di Eros (fetch esterno).
import { pathToFileURL } from 'node:url';
import { extractBundleSrc } from '../src/lib/appVersion.js';

const PAGES = ['/', '/kitchen', '/kitchen/solo', '/kitchen/cassa', '/kitchen/tv'];

// Endpoint con la stessa sequenza di auth: missing_session (nessun header) -> invalid_session (token finto).
// kitchen-sumup-refund e' solo nel primo gruppo: con un token finto chiamerebbe l'RPC, quindi non lo proviamo.
const AUTH_ENDPOINTS = [
  '/api/kitchen-sumup-create-checkout',
  '/api/kitchen-sumup-reconcile',
  '/api/kitchen-staff-sumup-reconcile',
  '/api/kitchen-cancel-with-payment-check',
  '/api/kitchen-staff-sumup-close-for-counter',
  '/api/kitchen-customer-switch-to-counter',
];
const NO_TOKEN_ONLY_ENDPOINTS = ['/api/kitchen-sumup-refund'];
// S6: sweep chiamato solo dal pg_cron con un secret dedicato. 401 unauthorized senza secret o con uno finto;
// 500 server_configuration_error = KITCHEN_ABANDON_SWEEP_SECRET non impostata su Vercel (FAIL voluto).
const SECRET_ENDPOINTS = ['/api/kitchen-online-abandon-sweep'];

const FAKE_ID = '00000000-0000-4000-8000-000000000000';
const BODY = JSON.stringify({ order_id: FAKE_ID, payment_attempt_id: FAKE_ID });

export async function runSmoke(baseUrl, fetchImpl = globalThis.fetch) {
  const base = baseUrl.replace(/\/+$/, '');
  const results = [];
  const record = (name, pass, detail = '') => results.push({ name, pass, detail });

  async function post(path, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(base + path, { method: 'POST', headers, body: BODY, cache: 'no-store' });
    let body = null;
    try { body = await res.json(); } catch { /* corpo non JSON */ }
    return { status: res.status, error: body?.error ?? null };
  }

  let indexHtml = '';
  for (const path of PAGES) {
    try {
      const res = await fetchImpl(base + path, { cache: 'no-store' });
      const text = await res.text();
      if (path === '/') indexHtml = text;
      record(`GET ${path} -> 200`, res.status === 200, `status ${res.status}`);
    } catch (err) {
      record(`GET ${path} -> 200`, false, String(err?.message || err));
    }
  }

  const bundleSrc = extractBundleSrc(indexHtml);
  if (!bundleSrc) {
    record('bundle referenziato da index.html', false, 'nessuno script /assets/index-*.js');
  } else {
    try {
      const res = await fetchImpl(base + bundleSrc, { cache: 'no-store' });
      const js = res.ok ? await res.text() : '';
      const ok = /kitchen-sumup-create-checkout[\s\S]{0,400}Authorization/.test(js);
      record(`bundle ${bundleSrc} invia Authorization a create-checkout`, ok, res.ok ? '' : `status ${res.status}`);
    } catch (err) {
      record('bundle scaricabile', false, String(err?.message || err));
    }
  }

  for (const path of [...AUTH_ENDPOINTS, ...NO_TOKEN_ONLY_ENDPOINTS]) {
    try {
      const r = await post(path, null);
      record(`POST ${path} senza token -> 401 missing_session`, r.status === 401 && r.error === 'missing_session', `${r.status} ${r.error}`);
    } catch (err) {
      record(`POST ${path} senza token`, false, String(err?.message || err));
    }
  }
  for (const path of AUTH_ENDPOINTS) {
    try {
      const r = await post(path, 'smoke.fake.token');
      record(`POST ${path} token finto -> 401 invalid_session`, r.status === 401 && r.error === 'invalid_session', `${r.status} ${r.error}`);
    } catch (err) {
      record(`POST ${path} token finto`, false, String(err?.message || err));
    }
  }

  for (const path of SECRET_ENDPOINTS) {
    for (const token of [null, 'smoke.fake.secret']) {
      const label = `POST ${path} ${token ? 'secret finto' : 'senza secret'} -> 401 unauthorized`;
      try {
        const r = await post(path, token);
        record(label, r.status === 401 && r.error === 'unauthorized', `${r.status} ${r.error}`);
      } catch (err) {
        record(label, false, String(err?.message || err));
      }
    }
  }

  return { ok: results.every((r) => r.pass), results };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const target = process.argv[2];
  if (!/^https?:\/\//.test(target ?? '')) {
    console.error('Uso: node scripts/post-deploy-smoke.mjs https://<url>');
    process.exit(2);
  }
  const { ok, results } = await runSmoke(target);
  for (const r of results) console.log(`${r.pass ? '  ✓ PASS' : '  ✗ FAIL'}  ${r.name}${r.pass || !r.detail ? '' : `  [${r.detail}]`}`);
  console.log(ok ? '\nSMOKE PASS' : '\nSMOKE FAIL');
  process.exit(ok ? 0 : 1);
}
