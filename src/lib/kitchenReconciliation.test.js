import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY, categorize, refTail, buildReconciliationItems, orderIdsWithOpenItems,
  validateResolution, isAlreadyPaidOnline, NOTE_MAX_LENGTH, resolveErrorMessage,
} from './kitchenReconciliation.js';

const flag = { needs_manual_reconciliation: true };
const lostRace = (id, cls, extra = {}) => ({
  id, order_id: 'ord-1', action: 'payment_confirm_lost_race', created_at: `2026-11-08T20:0${id.slice(-1)}:00Z`,
  metadata: { ...flag, classification: cls, losing_attempt_id: 'att-1', losing_provider: 'sumup', losing_provider_ref: 'chk_ABCDEF123456', losing_amount: 12, winning_provider: 'cash', winning_method: 'cash', winning_amount: 12, ...extra },
});

test('categorie: doppio incasso solo con classification double_charge', () => {
  assert.equal(categorize(lostRace('l1', 'double_charge')), CATEGORY.DOUBLE_CHARGE);
  assert.equal(categorize(lostRace('l1', 'duplicate_notification')), CATEGORY.REPEATED_NOTIFICATION);
  assert.equal(categorize(lostRace('l1', 'unverified_collection')), CATEGORY.TO_VERIFY);
});

test('notifica ripetuta non diventa mai doppio incasso', () => {
  const log = lostRace('l1', 'duplicate_notification', { double_charge: true });
  assert.equal(categorize(log), CATEGORY.REPEATED_NOTIFICATION);
});

test('lost_race pre-K2 senza classification -> da verificare', () => {
  const log = lostRace('l1', undefined);
  delete log.metadata.classification;
  assert.equal(categorize(log), CATEGORY.TO_VERIFY);
});

test('metadata mancante o malformato: nessun crash, card generica', () => {
  const logs = [
    { id: 'x1', order_id: 'o9', action: 'payment_late_unverified', metadata: null, created_at: '2026-11-08T20:00:00Z' },
    { id: 'x2', order_id: 'o8', action: 'payment_confirmed_amount_mismatch', metadata: 'boh', created_at: '2026-11-08T20:00:00Z' },
  ];
  // senza flag non entrano; con flag in metadata assente non devono comunque esplodere
  assert.doesNotThrow(() => buildReconciliationItems({ logs }));
  const r = buildReconciliationItems({ logs: [{ id: 'x3', order_id: 'o7', action: 'payment_late_unverified', metadata: { ...flag }, created_at: 'z' }] });
  assert.equal(r.open.length, 1);
  assert.equal(r.open[0].category, CATEGORY.TO_VERIFY);
});

test('righe non flaggate o di azioni estranee sono ignorate', () => {
  const r = buildReconciliationItems({ logs: [
    { id: 'a', order_id: 'o', action: 'payment_confirmed', metadata: flag },
    { id: 'b', order_id: 'o', action: 'payment_confirm_lost_race', metadata: { classification: 'double_charge' } },
  ] });
  assert.equal(r.open.length, 0);
});

test('stesso incasso segnalato due volte -> una card', () => {
  const r = buildReconciliationItems({ logs: [lostRace('l1', 'double_charge'), lostRace('l2', 'double_charge')] });
  assert.equal(r.open.length, 1);
  assert.equal(r.open[0].logId, 'l1');
});

test('nessun UUID completo in pagina: riferimento a 6 cifre', () => {
  assert.equal(refTail('chk_ABCDEF123456'), '123456');
  assert.equal(refTail(null), null);
  const [item] = buildReconciliationItems({ logs: [lostRace('l1', 'double_charge')] }).open;
  const json = JSON.stringify(item.lines);
  assert.ok(!json.includes('chk_ABCDEF123456'));
  assert.ok(json.includes('123456'));
  assert.ok(!('metadata' in item));
});

test('pagato dopo annullo con rimborso succeeded >= charge -> chiusa da sola', () => {
  const log = { id: 'c1', order_id: 'ord-2', action: 'payment_confirmed_after_cancel', created_at: '2026-11-08T20:00:00Z', metadata: { ...flag, payment_id: 'pay-2', provider_ref: 'chk_1' } };
  const payments = [
    { id: 'pay-2', order_id: 'ord-2', direction: 'charge', status: 'succeeded', amount: 10 },
    { id: 'ref-1', order_id: 'ord-2', direction: 'refund', status: 'succeeded', amount: 10 },
  ];
  const r = buildReconciliationItems({ logs: [log], payments });
  assert.equal(r.open.length, 0);
  assert.equal(r.closed[0].closedBy.kind, 'auto');
});

test('rimborso initiated bloccato -> resta aperta', () => {
  const log = { id: 'c1', order_id: 'ord-2', action: 'payment_confirmed_after_cancel', created_at: 'a', metadata: { ...flag, payment_id: 'pay-2' } };
  const payments = [
    { id: 'pay-2', order_id: 'ord-2', direction: 'charge', status: 'succeeded', amount: 10 },
    { id: 'ref-1', order_id: 'ord-2', direction: 'refund', status: 'initiated', amount: 10 },
  ];
  assert.equal(buildReconciliationItems({ logs: [log], payments }).open.length, 1);
});

test('doppio incasso non si chiude mai da solo, anche con rimborso Walbox', () => {
  const payments = [{ id: 'r', order_id: 'ord-1', direction: 'refund', status: 'succeeded', amount: 99 }];
  assert.equal(buildReconciliationItems({ logs: [lostRace('l1', 'double_charge')], payments }).open.length, 1);
});

test('chiusura manager: vale la prima, con autore/data/esito/nota', () => {
  const resolutions = [
    { source_log_id: 'l1', outcome: 'seen', note: 'seconda', resolved_by_label: 'B', created_at: '2026-11-08T21:05:00Z' },
    { source_log_id: 'l1', outcome: 'refunded_on_sumup', note: 'rimborsato 123456', resolved_by_label: 'A', created_at: '2026-11-08T21:00:00Z' },
  ];
  const r = buildReconciliationItems({ logs: [lostRace('l1', 'double_charge')], resolutions });
  assert.equal(r.open.length, 0);
  assert.equal(r.closed[0].closedBy.who, 'A');
  assert.equal(r.closed[0].closedBy.outcome, 'refunded_on_sumup');
  assert.equal(r.closed[0].closedBy.verifiedOnSumup, false);
});

test('chiusura su una riga duplicata chiude la card unica', () => {
  const r = buildReconciliationItems({ logs: [lostRace('l1', 'x'), lostRace('l2', 'x')], resolutions: [{ source_log_id: 'l2', outcome: 'seen', note: 'ok', created_at: 'a' }] });
  assert.equal(r.open.length, 0);
  assert.equal(r.closed.length, 1);
});

test('oltre il limite: le piu recenti + conteggio nascoste', () => {
  const logs = Array.from({ length: 55 }, (_, i) => ({ id: `l${i}`, order_id: `o${i}`, action: 'payment_late_unverified', created_at: `2026-11-08T20:${String(i).padStart(2, '0')}:00Z`, metadata: { ...flag, attempt_id: `a${i}` } }));
  const r = buildReconciliationItems({ logs, limit: 50 });
  assert.equal(r.open.length, 50);
  assert.equal(r.hiddenOpen, 5);
  assert.equal(r.open[0].logId, 'l54');
});

test('ordini con card aperta (per nascondere la drift)', () => {
  const r = buildReconciliationItems({ logs: [lostRace('l1', 'double_charge')] });
  assert.ok(orderIdsWithOpenItems(r.open).has('ord-1'));
});

test('validazione chiusura', () => {
  assert.equal(validateResolution({ outcome: 'boh', note: 'x' }).ok, false);
  assert.equal(validateResolution({ outcome: 'seen', note: '  ' }).ok, false);
  assert.equal(validateResolution({ outcome: 'seen', note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }).ok, false);
  assert.deepEqual(validateResolution({ outcome: 'seen', note: ' ok ' }), { ok: true, outcome: 'seen', note: 'ok' });
});

test('avviso gia pagato online', () => {
  const online = { channel: 'app', provider: 'sumup', method: 'sumup_online', direction: 'charge', status: 'succeeded' };
  assert.equal(isAlreadyPaidOnline(online, 'cash'), true);
  assert.equal(isAlreadyPaidOnline(online, 'card_counter_manual'), true);
  assert.equal(isAlreadyPaidOnline({ channel: 'counter', provider: 'cash', method: 'cash', direction: 'charge', status: 'succeeded' }, 'cash'), false);
  assert.equal(isAlreadyPaidOnline({ channel: 'counter', provider: 'sumup', method: 'sumup_pos', direction: 'charge', status: 'succeeded' }, 'cash'), false);
  assert.equal(isAlreadyPaidOnline(null, 'cash'), false);
  assert.equal(isAlreadyPaidOnline([online], 'cash'), false);
});

test('chiusura senza nome impostato lato server: mostra "Manager", mai altro', () => {
  const r = buildReconciliationItems({ logs: [lostRace('l1', 'double_charge')], resolutions: [{ source_log_id: 'l1', outcome: 'seen', note: 'ok', resolved_by_label: null, created_at: 'a' }] });
  assert.equal(r.closed[0].closedBy.who, 'Manager');
});

test('errori della RPC di chiusura: messaggi italiani, mai il codice tecnico', () => {
  const codes = ['not_authenticated', 'not_manager_for_venue', 'already_resolved', 'legacy_item_not_verifiable',
    'not_a_reconciliation_item', 'source_log_not_found', 'no_walbox_refund_found', 'invalid_outcome', 'invalid_note', 'invalid_refund_ref'];
  for (const c of codes) {
    const m = resolveErrorMessage(c);
    assert.notEqual(m, 'Chiusura non riuscita — riprova.', c);
    assert.ok(!m.includes('_'), `codice tecnico in pagina: ${m}`);
  }
  assert.equal(resolveErrorMessage('already_resolved'), resolveErrorMessage('ERROR: already_resolved (P0001)'));
  assert.equal(resolveErrorMessage('Could not find the function public.kitchen_reconciliation_resolve'), 'Chiusura non riuscita — riprova.');
  assert.equal(resolveErrorMessage(undefined), 'Chiusura non riuscita — riprova.');
});
