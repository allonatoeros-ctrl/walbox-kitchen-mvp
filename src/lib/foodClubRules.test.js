import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cartFoodAmount, itemFoodUnitAmount, voucherCartStatus, stampForecast, effectiveVoucherStatus,
  pickVoucherForCart, normalizeItalianPhone, cardProgress, clubErrorMessage, daysLeft,
} from './foodClubRules.js';

test('food: bevande escluse, MENU con quota prudente come il server', () => {
  assert.equal(itemFoodUnitAmount('item-051', 6), 0, 'birra');
  assert.equal(itemFoodUnitAmount('item-012', 8), 8, 'panino');
  assert.equal(itemFoodUnitAmount('item-040', 19), 13, 'MENU birra 19-6');
  assert.equal(itemFoodUnitAmount('item-060', 19), 15, 'MENU bibita 19-4');
  assert.equal(itemFoodUnitAmount('item-sconosciuto', 9), 0, 'non classificato = 0');
  assert.equal(cartFoodAmount([{ itemId: 'item-012', quantity: 1, price: 8 }, { itemId: 'item-051', quantity: 2, price: 6 }]), 8);
});

test('buono nel carrello: 12 € di food minimo, sconto 5 €, totale scontato', () => {
  const v = { value: 5, min_food: 12 };
  assert.deepEqual(voucherCartStatus({ voucher: v, foodAmount: 8, total: 20 }), { usable: false, reason: 'food_below_minimum', missingFood: 4 });
  const ok = voucherCartStatus({ voucher: v, foodAmount: 13.9, total: 13.9 });
  assert.equal(ok.usable, true);
  assert.equal(ok.discount, 5);
  assert.equal(ok.newTotal, 8.9);
  assert.equal(voucherCartStatus({ voucher: null, foodAmount: 20, total: 20 }).reason, 'no_voucher');
});

test('previsione timbro: non iscritto, soglia, già timbrato stasera, completa tessera', () => {
  const campaign = { active: true, stamp_min_food: 10, stamps_required: 2, stamp_on_voucher_order: true };
  assert.equal(stampForecast({ state: { member: false, campaign }, foodAmount: 20 }).reason, 'not_member');
  assert.deepEqual(stampForecast({ state: { member: true, campaign }, foodAmount: 8 }), { willStamp: false, reason: 'food_below_threshold', missingFood: 2 });
  assert.equal(stampForecast({ state: { member: true, campaign, stamped_tonight: true }, foodAmount: 20 }).reason, 'already_tonight');
  const f = stampForecast({ state: { member: true, campaign, card: { stamps: [{ kind: 'order' }] } }, foodAmount: 10 });
  assert.equal(f.willStamp, true);
  assert.equal(f.completesCard, true);
  assert.equal(stampForecast({ state: { member: true, campaign: { ...campaign, stamp_on_voucher_order: false } }, foodAmount: 20, withVoucher: true }).reason, 'voucher_order');
});

test('stato effettivo e scelta del buono: disponibile scaduto = scaduto, si propone quello che scade prima', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  assert.equal(effectiveVoucherStatus({ status: 'available', expires_at: '2026-11-09T00:00:00Z' }, now), 'expired');
  assert.equal(effectiveVoucherStatus({ status: 'reserved', expires_at: '2026-11-09T00:00:00Z' }, now), 'reserved');
  const st = { vouchers: [
    { id: 'a', status: 'available', expires_at: '2026-12-01T00:00:00Z' },
    { id: 'b', status: 'available', expires_at: '2026-11-20T00:00:00Z' },
    { id: 'c', status: 'used', expires_at: '2026-11-11T00:00:00Z' },
  ] };
  assert.equal(pickVoucherForCart(st, now).id, 'b');
  assert.equal(daysLeft('2026-11-12T12:00:00Z', now), 2);
});

test('tessera: tessera scaduta non mostra timbri', () => {
  const p = cardProgress({ campaign: { stamps_required: 2 }, card: { expired: true, stamps: [{ kind: 'order' }] } });
  assert.equal(p.count, 0);
  const q = cardProgress({ campaign: { stamps_required: 2 }, card: { expired: false, expires_at: '2099-01-01', stamps: [{ kind: 'welcome' }] } });
  assert.equal(q.count, 1);
  assert.equal(q.hasWelcome, true);
});

test('telefono: normalizzazione E.164 italiana', () => {
  assert.equal(normalizeItalianPhone('347 555 0001'), '+393475550001');
  assert.equal(normalizeItalianPhone('+39 347-555-0001'), '+393475550001');
  assert.equal(normalizeItalianPhone('0039 3475550001'), '+393475550001');
  assert.equal(normalizeItalianPhone('02 1234567'), null);
  assert.equal(normalizeItalianPhone('+44 7700 900123'), null);
});

test('errori server tradotti', () => {
  assert.match(clubErrorMessage('P0001: voucher_food_below_minimum'), /12 €/);
  assert.match(clubErrorMessage('boh'), /Riprova/);
});
