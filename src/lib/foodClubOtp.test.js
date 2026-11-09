// node --test src/lib/foodClubOtp.test.js — flusso OTP con Supabase Auth finto (nessuna rete, nessun SMS).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { otpErrorCode, requestOtp, confirmOtp, formatCountdown } from './foodClubOtp.js';
import { normalizeItalianPhone, clubErrorMessage } from './foodClubRules.js';

// Supabase Auth finto: registra le chiamate, risponde con gli errori configurati.
function fakeAuth({ updateErr = null, otpErr = null, verifyErr = null } = {}) {
  const calls = [];
  return {
    calls,
    updateUser: async (a) => { calls.push(['updateUser', a]); return { error: updateErr }; },
    signInWithOtp: async (a) => { calls.push(['signInWithOtp', a]); return { error: otpErr }; },
    verifyOtp: async (a) => { calls.push(['verifyOtp', a]); return { error: verifyErr }; },
  };
}
const anon = async () => ({ user: { id: 'anon-1', is_anonymous: true } });
const known = async () => ({ user: { id: 'u-1', is_anonymous: false } });
// Errori nella forma di supabase-js AuthApiError (code, status, message) per i casi documentati di GoTrue.
const E = {
  phoneExists: { code: 'phone_exists', status: 422, message: 'Phone number already registered by another user' },
  smsRate: { code: 'over_sms_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 37 seconds.' },
  reqRate: { code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' },
  expired: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' },
  badPhone: { code: 'validation_failed', status: 400, message: 'Invalid phone number format (E.164 required)' },
  sendFail: { code: 'sms_send_failed', status: 500, message: 'Error sending sms OTP: provider error' },
  noProvider: { code: 'phone_provider_disabled', status: 400, message: 'Unsupported phone provider' },
  offline: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
};

test('normalizzazione E.164: solo cellulari italiani', () => {
  for (const [input, out] of [
    ['347 555 0001', '+393475550001'], ['+39 347-555-0001', '+393475550001'], ['0039 3475550001', '+393475550001'],
    ['(+39) 347.555.0001', '+393475550001'], ['3475550001', '+393475550001'], ['339 123 456', '+39339123456'],
    ['+39 02 1234567', null], ['06 12345678', null], ['+39 0612345678', null], ['+44 7700 900123', null],
    ['347', null], ['', null], [null, null], ['34755500011234', null], ['abc', null],
  ]) assert.equal(normalizeItalianPhone(input), out, String(input));
});

test('errori GoTrue tradotti nel codice giusto (429 e numero non valido non diventano "codice sbagliato")', () => {
  assert.equal(otpErrorCode(E.phoneExists), 'phone_exists');
  assert.equal(otpErrorCode(E.smsRate), 'sms_rate_limited');
  assert.equal(otpErrorCode(E.reqRate), 'sms_rate_limited');
  assert.equal(otpErrorCode({ status: 429, message: 'x' }), 'sms_rate_limited');
  assert.equal(otpErrorCode(E.expired), 'otp_invalid');
  assert.equal(otpErrorCode(E.badPhone), 'invalid_phone');
  assert.equal(otpErrorCode(E.sendFail), 'sms_send_failed');
  assert.equal(otpErrorCode(E.noProvider), 'sms_unavailable');
  assert.equal(otpErrorCode(E.offline), 'network_error');
  assert.equal(otpErrorCode({ message: 'qualcosa di strano' }), 'unknown_error');
  assert.equal(otpErrorCode(null), 'unknown_error');
});

test('ogni codice OTP ha un messaggio cliente specifico (non il generico "Riprova")', () => {
  const generic = clubErrorMessage('boh');
  for (const c of ['phone_exists', 'sms_rate_limited', 'otp_invalid', 'invalid_phone', 'sms_send_failed', 'sms_unavailable', 'network_error']) {
    if (c === 'phone_exists') continue; // gestito dal flusso (unione), non mostrato
    assert.notEqual(clubErrorMessage(c), generic, c);
  }
  assert.match(clubErrorMessage('invalid_phone'), /cellulare/);
  assert.match(clubErrorMessage('sms_rate_limited'), /qualche minuto/);
});

test('invio: numero non valido -> nessuna chiamata ad Auth', async () => {
  const auth = fakeAuth();
  const res = await requestOtp({ rawPhone: '02 1234567', auth, ensureSession: anon, createMergeTicket: async () => 't' });
  assert.deepEqual(res, { ok: false, error: 'invalid_phone' });
  assert.equal(auth.calls.length, 0);
});

test('invio: anonimo + numero nuovo -> updateUser (stesso uid), mode phone_change, nessun biglietto', async () => {
  const auth = fakeAuth();
  const res = await requestOtp({ rawPhone: '347 555 0001', auth, ensureSession: anon, createMergeTicket: async () => { throw new Error('no'); } });
  assert.deepEqual(res, { ok: true, phone: '+393475550001', mode: 'phone_change', ticket: null });
  assert.deepEqual(auth.calls, [['updateUser', { phone: '+393475550001' }]]);
});

test('invio: anonimo + numero già registrato -> biglietto di unione + signInWithOtp, mode sms', async () => {
  const auth = fakeAuth({ updateErr: E.phoneExists });
  const tickets = [];
  const res = await requestOtp({ rawPhone: '+393475550001', auth, ensureSession: anon,
    createMergeTicket: async (p) => { tickets.push(p); return 'TICKET-1'; } });
  assert.deepEqual(res, { ok: true, phone: '+393475550001', mode: 'sms', ticket: 'TICKET-1' });
  assert.deepEqual(tickets, ['+393475550001']);
  assert.deepEqual(auth.calls.map((c) => c[0]), ['updateUser', 'signInWithOtp']);
});

test('invio: biglietto non creato (errore) -> accesso comunque possibile, senza unione', async () => {
  const auth = fakeAuth({ updateErr: E.phoneExists });
  const res = await requestOtp({ rawPhone: '3475550001', auth, ensureSession: anon, createMergeTicket: async () => { throw new Error('merge_ticket_rate_limited'); } });
  assert.equal(res.ok, true);
  assert.equal(res.ticket, null);
});

test('invio: sessione non anonima -> signInWithOtp diretto', async () => {
  const auth = fakeAuth();
  const res = await requestOtp({ rawPhone: '3475550001', auth, ensureSession: known, createMergeTicket: async () => 't' });
  assert.equal(res.mode, 'sms');
  assert.deepEqual(auth.calls.map((c) => c[0]), ['signInWithOtp']);
});

test('invio: errori provider/limiti/rete propagati con il codice giusto', async () => {
  for (const [opts, session, expected] of [
    [{ updateErr: E.smsRate }, anon, 'sms_rate_limited'],
    [{ updateErr: E.badPhone }, anon, 'invalid_phone'],
    [{ updateErr: E.phoneExists, otpErr: E.smsRate }, anon, 'sms_rate_limited'],
    [{ otpErr: E.sendFail }, known, 'sms_send_failed'],
    [{ otpErr: E.noProvider }, known, 'sms_unavailable'],
  ]) {
    const res = await requestOtp({ rawPhone: '3475550001', auth: fakeAuth(opts), ensureSession: session, createMergeTicket: async () => null });
    assert.deepEqual(res, { ok: false, error: expected }, JSON.stringify(opts));
  }
  const offline = await requestOtp({ rawPhone: '3475550001', auth: fakeAuth(), ensureSession: async () => { throw E.offline; }, createMergeTicket: async () => null });
  assert.deepEqual(offline, { ok: false, error: 'network_error' });
});

test('verifica: codice corto o con lettere -> nessuna chiamata; tipo OTP coerente col modo di invio', async () => {
  const auth = fakeAuth();
  assert.deepEqual(await confirmOtp({ phone: '+393475550001', code: '12345', mode: 'sms', auth, redeemMergeTicket: async () => null }), { ok: false, error: 'otp_invalid' });
  assert.deepEqual(await confirmOtp({ phone: '+393475550001', code: '1234567', mode: 'sms', auth, redeemMergeTicket: async () => null }), { ok: false, error: 'otp_invalid' });
  assert.equal(auth.calls.length, 0);
  await confirmOtp({ phone: '+393475550001', code: '12 34 56', mode: 'phone_change', auth, redeemMergeTicket: async () => null });
  await confirmOtp({ phone: '+393475550001', code: '654321', mode: 'sms', auth, redeemMergeTicket: async () => null });
  assert.deepEqual(auth.calls, [
    ['verifyOtp', { phone: '+393475550001', token: '123456', type: 'phone_change' }],
    ['verifyOtp', { phone: '+393475550001', token: '654321', type: 'sms' }],
  ]);
});

test('verifica: codice scaduto/errato -> otp_invalid, biglietto NON riscattato', async () => {
  const redeemed = [];
  const res = await confirmOtp({ phone: '+393475550001', code: '000000', mode: 'sms', ticket: 'T', auth: fakeAuth({ verifyErr: E.expired }),
    redeemMergeTicket: async (t) => { redeemed.push(t); return {}; } });
  assert.deepEqual(res, { ok: false, error: 'otp_invalid' });
  assert.deepEqual(redeemed, []);
});

test('verifica ok: biglietto riscattato una volta; errore di riscatto non blocca l accesso', async () => {
  const redeemed = [];
  const ok = await confirmOtp({ phone: '+393475550001', code: '123456', mode: 'sms', ticket: 'T1', auth: fakeAuth(),
    redeemMergeTicket: async (t) => { redeemed.push(t); return { merged: true, orders: 2 }; } });
  assert.deepEqual(ok, { ok: true, merged: { merged: true, orders: 2 } });
  assert.deepEqual(redeemed, ['T1']);
  const ko = await confirmOtp({ phone: '+393475550001', code: '123456', mode: 'sms', ticket: 'T2', auth: fakeAuth(),
    redeemMergeTicket: async () => { throw new Error('ticket_phone_mismatch'); } });
  assert.deepEqual(ko, { ok: true, merged: null });
});

test('conto alla rovescia del reinvio', () => {
  assert.equal(formatCountdown(60), '1:00');
  assert.equal(formatCountdown(59), '0:59');
  assert.equal(formatCountdown(9), '0:09');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-3), '0:00');
  assert.equal(formatCountdown(8.2), '0:09');
});
