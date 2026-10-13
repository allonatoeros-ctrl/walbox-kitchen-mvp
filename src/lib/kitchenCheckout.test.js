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

test('appendNotePrefix: nota vuota, nota esistente, prefisso già presente, limite', () => {
  assert.equal(appendNotePrefix('', 'ALLERGIA: '), 'ALLERGIA: ');
  assert.equal(appendNotePrefix('ben cotto', 'ALLERGIA: '), 'ben cotto · ALLERGIA: ');
  assert.equal(appendNotePrefix('allergia: glutine', 'ALLERGIA: '), 'allergia: glutine');
  assert.equal(appendNotePrefix('a'.repeat(KITCHEN_NOTE_MAX), 'SENZA ').length, KITCHEN_NOTE_MAX);
  assert.equal(appendNotePrefix(undefined, 'SENZA '), 'SENZA ');
});
