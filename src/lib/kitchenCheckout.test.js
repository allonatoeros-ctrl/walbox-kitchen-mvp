import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_NAME_MAX,
  KITCHEN_NOTE_MAX,
  NICKNAME_SUGGESTIONS,
  NICKNAME_QUICK_PICKS,
  appendNotePrefix,
  checkoutMissing,
  isValidCustomerName,
  normalizeCustomerName,
  pickNickname,
} from './kitchenCheckout.js';

test('normalizeCustomerName: spazi compattati, trim, tetto di lunghezza', () => {
  assert.equal(normalizeCustomerName('  Marco   Rossi '), 'Marco Rossi');
  assert.equal(normalizeCustomerName(null), '');
  assert.equal(normalizeCustomerName('x'.repeat(50)).length, CUSTOMER_NAME_MAX);
});

test('isValidCustomerName: minimo 2 caratteri e mai il nome ospite di default', () => {
  assert.equal(isValidCustomerName('M'), false);
  assert.equal(isValidCustomerName('  '), false);
  assert.equal(isValidCustomerName('Ospite Walrus'), false);
  assert.equal(isValidCustomerName('Mo'), true);
});

test('i suggerimenti sono tutti nomi validi e dentro il limite', () => {
  for (const n of NICKNAME_SUGGESTIONS) {
    assert.equal(isValidCustomerName(n), true, n);
    assert.ok(n.length <= CUSTOMER_NAME_MAX, n);
  }
  assert.deepEqual(NICKNAME_QUICK_PICKS, NICKNAME_SUGGESTIONS.slice(0, 3));
});

test('pickNickname: mai lo stesso nome già nel campo, anche con random al limite', () => {
  assert.notEqual(pickNickname('Baffo', () => 0), 'Baffo');
  assert.notEqual(pickNickname('baffo', () => 0), 'Baffo');
  const last = pickNickname('', () => 0.9999999);
  assert.equal(last, NICKNAME_SUGGESTIONS[NICKNAME_SUGGESTIONS.length - 1]);
  assert.ok(NICKNAME_SUGGESTIONS.includes(pickNickname('Marco')));
});

test('checkoutMissing: nome prima, poi dove lo mangia', () => {
  assert.deepEqual(checkoutMissing({ name: '', fulfillmentType: null }), ['name', 'fulfillment']);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: null }), ['fulfillment']);
  assert.deepEqual(checkoutMissing({ name: 'M', fulfillmentType: 'eat_here' }), ['name']);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'takeaway' }), []);
});

test('checkoutMissing: RITIRO AL WALRUS senza orario (o con orario scaduto) = manca l orario', () => {
  // 28/10/2026 ore 12:30 a Roma (UTC+1).
  const now = Date.UTC(2026, 9, 28, 11, 30);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'pickup', pickupSlot: null }), ['pickup_slot']);
  assert.deepEqual(checkoutMissing({ name: '', fulfillmentType: 'pickup' }), ['name', 'pickup_slot']);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'pickup', pickupSlot: '13:10' }), ['pickup_slot']);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'pickup', pickupSlot: '13:15' }), []);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'pickup', pickupSlot: '13:00', now }), []);
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'pickup', pickupSlot: '12:30', now }), ['pickup_slot']);
  // PORTO VIA non chiede mai un orario, anche se ne resta uno in memoria.
  assert.deepEqual(checkoutMissing({ name: 'Marco', fulfillmentType: 'takeaway', pickupSlot: null, now }), []);
});

test('appendNotePrefix: nota vuota, nota esistente, prefisso già presente, limite', () => {
  assert.equal(appendNotePrefix('', 'ALLERGIA: '), 'ALLERGIA: ');
  assert.equal(appendNotePrefix('ben cotto', 'ALLERGIA: '), 'ben cotto · ALLERGIA: ');
  assert.equal(appendNotePrefix('allergia: glutine', 'ALLERGIA: '), 'allergia: glutine');
  assert.equal(appendNotePrefix('a'.repeat(KITCHEN_NOTE_MAX), 'SENZA ').length, KITCHEN_NOTE_MAX);
  assert.equal(appendNotePrefix(undefined, 'SENZA '), 'SENZA ');
});

// ── Blocklist nickname (privacy/GDPR Fase 1, 2026-10-30) ──
test('blocklist nickname: parolacce bloccate anche con maiuscole, spazi, accenti e lettere ripetute', async () => {
  const { isBlockedNickname } = await import('./kitchenCheckout.js');
  for (const bad of ['puttana', 'PUTTANA', '  Puttana  ', 'p u t t a n a', 'PUTTTANA', 'pùttana', 'Che Merda', 'm.e.r.d.a', 'FUCK', 'Fuck You', 'Cazzo', 'che cazzo', 'Vaffanculo', 'Hitler']) {
    assert.equal(isBlockedNickname(bad), true, bad);
    assert.equal(isValidCustomerName(bad), false, bad);
  }
});

test('blocklist nickname: nomi normali, cognomi e parole innocue restano accettati', async () => {
  const { isBlockedNickname } = await import('./kitchenCheckout.js');
  for (const ok of ['Marco', 'Giulia Rossi', 'Zanna', 'Baffo Unto', 'Àngela', 'Cazzola', 'Troiani', 'Negroni', 'Figaro', 'Nazionale', 'Produce', 'Bocchini', 'Claudio Cane', 'Ospite', '']) {
    assert.equal(isBlockedNickname(ok), false, ok);
  }
  for (const ok of ['Marco', 'Giulia Rossi', 'Cazzola', 'Negroni']) assert.equal(isValidCustomerName(ok), true, ok);
});

test('blocklist nickname: i suggerimenti del pub non sono bloccati', async () => {
  const { isBlockedNickname } = await import('./kitchenCheckout.js');
  for (const n of NICKNAME_SUGGESTIONS) assert.equal(isBlockedNickname(n), false, n);
});
