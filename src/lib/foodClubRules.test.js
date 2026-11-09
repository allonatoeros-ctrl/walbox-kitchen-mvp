import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cartFoodAmount, itemFoodUnitAmount, voucherCartStatus, stampForecast, effectiveVoucherStatus,
  pickVoucherForCart, availableVouchers, normalizeItalianPhone, cardProgress, clubErrorMessage, daysLeft,
  cardView, rewardHistory, staffCycleLabel, staffTotalVisits,
  celebrationKey, shouldCelebrate, markCelebrated,
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
  // campagna spenta: nessun buono nel carrello, ma il buono resta tra quelli disponibili (pagina Club)
  const off = { ...st, campaign: { active: false } };
  assert.equal(pickVoucherForCart(off, now), null);
  assert.equal(availableVouchers(off, now).length, 2);
  // campagna attiva o stato senza campagna (DB vecchio): comportamento invariato
  assert.equal(pickVoucherForCart({ ...st, campaign: { active: true } }, now).id, 'b');
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
  assert.match(clubErrorMessage('voucher_campaign_inactive'), /in pausa/);
});

const FUT = '2099-01-01T00:00:00Z';
const st2 = [{ kind: 'order', created_at: '2026-11-01T20:00:00Z' }, { kind: 'order', created_at: '2026-11-03T20:00:00Z' }];
const mkLc = (voucher) => ({ id: 'c1', stamps: st2, voucher });

test('tessera: senza i campi nuovi (DB vecchio) nessun cambio e nessun crash', () => {
  const v = cardView({ card: null, vouchers: [] });
  assert.equal(v.mode, 'plain'); assert.equal(v.count, 0);
  assert.equal(cardView(null).mode, 'plain');
  const one = cardView({ card: { stamps: [{ kind: 'order' }], expires_at: FUT } });
  assert.equal(one.mode, 'plain'); assert.equal(one.count, 1);
  assert.deepEqual(rewardHistory({ vouchers: [{ id: 'a', status: 'available', expires_at: FUT }] }), []);
});

test('tessera: 2/2 con premio spendibile (card null + last_completed_card)', () => {
  for (const status of ['available', 'reserved']) {
    const v = cardView({ card: null, last_completed_card: mkLc({ id: 'v1', status, value: 5, min_food: 12, expires_at: FUT }) });
    assert.equal(v.mode, 'reward'); assert.equal(v.count, 2); assert.equal(v.reward.id, 'v1');
  }
  // card open vuota appena creata: stesso risultato
  assert.equal(cardView({ card: { stamps: [], expires_at: FUT }, last_completed_card: mkLc({ id: 'v1', status: 'available', expires_at: FUT }) }).mode, 'reward');
});

test('tessera: premio usato = storico, nuovo giro da aprire; scaduto = come oggi', () => {
  const used = { id: 'v1', status: 'used', value: 5, used_at: '2026-11-04T20:00:00Z', used_order_code: 'AB12' };
  const v = cardView({ card: null, last_completed_card: mkLc(used) });
  assert.equal(v.mode, 'restart'); assert.equal(v.count, 0); assert.equal(v.reward, null);
  assert.deepEqual(rewardHistory({ vouchers: [used], last_completed_card: mkLc(used) }).map((x) => x.id), ['v1']);
  const exp = cardView({ card: null, last_completed_card: mkLc({ id: 'v2', status: 'available', expires_at: '2020-01-01T00:00:00Z' }) });
  assert.equal(exp.mode, 'plain');
});

test('tessera: nuovo giro 1/2 separato dai premi già conquistati', () => {
  const used = { id: 'v1', status: 'used' };
  const v = cardView({ card: { stamps: [{ kind: 'order' }], expires_at: FUT }, last_completed_card: mkLc(used) });
  assert.equal(v.mode, 'newCycle'); assert.equal(v.count, 1); assert.equal(v.reward, null);
  const withReward = cardView({ card: { stamps: [{ kind: 'order' }], expires_at: FUT }, last_completed_card: mkLc({ id: 'v3', status: 'available', expires_at: FUT }) });
  assert.equal(withReward.mode, 'newCycle'); assert.equal(withReward.reward.id, 'v3');
});

test('staff ISCRITTI: giro attuale e visite totali, con fallback', () => {
  assert.equal(staffCycleLabel({ cycle_stamps: 1, cycle_completed: false }), '1/2');
  assert.equal(staffCycleLabel({ cycle_stamps: 0, cycle_completed: true }), 'completato');
  assert.equal(staffCycleLabel({ stamps_open: 1 }), '1/2');
  assert.equal(staffCycleLabel({}), '0/2');
  assert.equal(staffTotalVisits({ total_visits: 3 }), 3);
  assert.equal(staffTotalVisits({}), '—');
});

test('celebrazione premio: una sola volta per buono, mai errori', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
  const st = mem();
  assert.equal(shouldCelebrate(st, 'v1'), true, 'prima volta');
  assert.equal(markCelebrated(st, 'v1'), true);
  assert.equal(shouldCelebrate(st, 'v1'), false, 'seconda volta no');
  assert.equal(shouldCelebrate(st, 'v2'), true, 'altro buono sì');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(shouldCelebrate(broken, 'v1'), false, 'storage bloccato: niente animazione');
  assert.equal(markCelebrated(broken, 'v1'), false, 'storage bloccato: nessun crash');
  assert.equal(shouldCelebrate(st, null), false, 'id mancante');
  assert.equal(shouldCelebrate(null, 'v1'), false, 'storage assente');
  assert.equal(markCelebrated(st, undefined), false);
  assert.equal(celebrationKey(''), null);
});
