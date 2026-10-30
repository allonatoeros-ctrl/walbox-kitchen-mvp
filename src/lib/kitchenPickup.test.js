import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKUP_FULFILLMENT,
  PICKUP_LEAD_MINUTES,
  bookablePickupSlotGroups,
  formatPickupBadge,
  formatPickupSentence,
  hasBookablePickupSlot,
  isPickupSlotBookable,
  isValidPickupSlot,
  pickupSlotGroups,
  romeMinutesOfDay,
  sanitizePickupSlot,
  toServerFulfillment,
} from './kitchenPickup.js';

// 28/10/2026: ora solare, Roma = UTC+1. 01/07/2026: ora legale, Roma = UTC+2.
const rome = (hhmm, day = '2026-10-28') => {
  const offset = day === '2026-07-01' ? 2 : 1;
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h - offset, m);
};

test('fasce: pranzo 12:00-14:30 e sera 18:00-22:30 ogni 15 minuti, estremi inclusi', () => {
  const [lunch, dinner] = pickupSlotGroups();
  assert.equal(lunch.id, 'lunch');
  assert.equal(lunch.slots[0], '12:00');
  assert.equal(lunch.slots.at(-1), '14:30');
  assert.equal(lunch.slots.length, 11);
  assert.equal(dinner.slots[0], '18:00');
  assert.equal(dinner.slots.at(-1), '22:30');
  assert.equal(dinner.slots.length, 19);
});

test('isValidPickupSlot: solo fasce esistenti (stesso perimetro del CHECK SQL)', () => {
  for (const ok of ['12:00', '13:15', '14:30', '18:00', '21:45', '22:30']) assert.equal(isValidPickupSlot(ok), true, ok);
  for (const ko of ['11:45', '14:45', '13:10', '17:45', '22:45', '9:00', '', null, undefined, 1315, '13:15:00']) {
    assert.equal(isValidPickupSlot(ko), false, String(ko));
  }
});

test('romeMinutesOfDay usa l ora di Roma (solare e legale), non quella del device', () => {
  assert.equal(romeMinutesOfDay(rome('12:44')), 12 * 60 + 44);
  assert.equal(romeMinutesOfDay(rome('12:44', '2026-07-01')), 12 * 60 + 44);
  assert.equal(romeMinutesOfDay(new Date(rome('00:05'))), 5);
});

test(`anticipo minimo ${PICKUP_LEAD_MINUTES} minuti: 12:45 -> 13:00 ok, 12:46 -> 13:00 no`, () => {
  assert.equal(PICKUP_LEAD_MINUTES, 15);
  assert.equal(isPickupSlotBookable('13:00', rome('12:45')), true);
  assert.equal(isPickupSlotBookable('13:00', rome('12:46')), false);
  assert.equal(isPickupSlotBookable('13:15', rome('12:46')), true);
  assert.equal(isPickupSlotBookable('13:10', rome('09:00')), false, 'fascia inesistente');
});

test('bookablePickupSlotGroups: mattina tutto aperto, pomeriggio solo sera, notte niente', () => {
  const morning = bookablePickupSlotGroups(rome('10:00'));
  assert.equal(morning[0].slots.length, 11);
  assert.equal(morning[1].slots.length, 19);

  const lunchTime = bookablePickupSlotGroups(rome('13:20'));
  assert.deepEqual(lunchTime[0].slots, ['13:45', '14:00', '14:15', '14:30']);

  const afternoon = bookablePickupSlotGroups(rome('16:00'));
  assert.deepEqual(afternoon[0].slots, []);
  assert.equal(afternoon[1].slots[0], '18:00');

  assert.equal(hasBookablePickupSlot(rome('22:15')), true, '22:30 ancora valida alle 22:15');
  assert.equal(hasBookablePickupSlot(rome('22:16')), false);
  assert.equal(hasBookablePickupSlot(rome('23:30')), false);
});

test('sanitizePickupSlot: un orario salvato ormai passato non sopravvive', () => {
  assert.equal(sanitizePickupSlot('13:00', rome('12:30')), '13:00');
  assert.equal(sanitizePickupSlot('13:00', rome('13:30')), null);
  assert.equal(sanitizePickupSlot('pippo', rome('10:00')), null);
  assert.equal(sanitizePickupSlot(null, rome('10:00')), null);
});

test('toServerFulfillment: pickup -> takeaway + orario; le altre scelte non portano mai orario', () => {
  assert.deepEqual(toServerFulfillment(PICKUP_FULFILLMENT, '13:15'), { fulfillmentType: 'takeaway', pickupSlot: '13:15' });
  assert.deepEqual(toServerFulfillment(PICKUP_FULFILLMENT, '13:10'), { fulfillmentType: 'takeaway', pickupSlot: null });
  assert.deepEqual(toServerFulfillment('takeaway', '13:15'), { fulfillmentType: 'takeaway', pickupSlot: null });
  assert.deepEqual(toServerFulfillment('eat_here', '13:15'), { fulfillmentType: 'eat_here', pickupSlot: null });
  assert.deepEqual(toServerFulfillment(null, null), { fulfillmentType: null, pickupSlot: null });
});

test('etichette: badge staff e frase cliente', () => {
  assert.equal(formatPickupBadge('13:15'), 'RITIRO 13:15');
  assert.equal(formatPickupBadge(null), '');
  assert.equal(formatPickupSentence('19:30'), 'Ritiro alle 19:30');
  assert.equal(formatPickupSentence('xx'), '');
});
