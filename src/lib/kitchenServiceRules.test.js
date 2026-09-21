// kitchenServiceRules.test.js — P0-2 del failure-mode sweep pre-apertura 18/09
// (+ guardia di regressione sul gate serale Krombacher, preesistente).
//
// P0-2: la birra scelta in FALLO PESANTE deve sopravvivere a tutta la catena
// UI -> cart -> submit -> payload RPC -> ordine persistito -> /kitchen/solo.
// Il payload per-item della RPC e' chiuso (item_id + quantity, name/price riscritti dal
// catalogo), quindi il canale e' `customer_note`.
//
// Eseguire a mano: node --test src/lib/kitchenServiceRules.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import {
  buildIncludedBeersNote,
  isEveningServiceActive,
  EVENING_SERVICE_START_HOUR,
  INCLUDED_BEER_NOTE_PREFIX,
} from './kitchenServiceRules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const beers = kitchenMenuItems.filter((i) => i.category === 'birre' && i.tags?.includes('birre-v1'));

// Riga carrello come la costruisce PesiMassimiSection.jsx (id composito, baseId reale).
function comboCartLine(baseItemId, beer, qty = 1) {
  const combo = kitchenPesiMassimiCombos[baseItemId];
  return {
    id: `${combo.id}::${beer.id}`,
    baseId: combo.id,
    name: `${combo.name} · ${beer.name}`,
    price: combo.price,
    qty,
    includesBeerId: beer.id,
  };
}

test('tutte le birre selezionabili nel combo finiscono nella nota, col nome reale del catalogo', () => {
  assert.ok(beers.length >= 7, `attese >= 7 birre birre-v1, trovate ${beers.length}`);
  for (const beer of beers) {
    for (const baseItemId of Object.keys(kitchenPesiMassimiCombos)) {
      const note = buildIncludedBeersNote([comboCartLine(baseItemId, beer)], kitchenMenuItems);
      assert.match(note, new RegExp(INCLUDED_BEER_NOTE_PREFIX));
      assert.ok(note.includes(beer.name.toUpperCase()), `${beer.id} assente dalla nota: ${note}`);
    }
  }
});

test('carrello senza combo: nessuna nota (non si sporca la nota del cliente)', () => {
  assert.equal(buildIncludedBeersNote([{ id: 'item-016', name: 'Wraptor', qty: 2 }], kitchenMenuItems), '');
  assert.equal(buildIncludedBeersNote([], kitchenMenuItems), '');
  assert.equal(buildIncludedBeersNote(null, kitchenMenuItems), '');
});

test('due combo con la stessa birra: quantita sommata, non riga ripetuta', () => {
  const note = buildIncludedBeersNote([comboCartLine('item-009', beers[3], 2)], kitchenMenuItems);
  assert.ok(note.includes(`2x ${beers[3].name.toUpperCase()}`), note);
  assert.equal(note.split(beers[3].name.toUpperCase()).length - 1, 1);
});

test('due combo con birre diverse: entrambe presenti', () => {
  const note = buildIncludedBeersNote(
    [comboCartLine('item-009', beers[3]), comboCartLine('item-011', beers[6])],
    kitchenMenuItems,
  );
  assert.ok(note.includes(beers[3].name.toUpperCase()), note);
  assert.ok(note.includes(beers[6].name.toUpperCase()), note);
});

test('birra non piu in catalogo: si degrada sull id, mai una nota vuota o un crash', () => {
  const note = buildIncludedBeersNote([{ includesBeerId: 'item-099', qty: 1 }], kitchenMenuItems);
  assert.ok(note.includes('ITEM-099'), note);
});

test('il nome della birra NON viene ricavato dal nome della riga carrello', () => {
  // Stessa riga, nome composito bugiardo: la nota deve seguire includesBeerId, non il nome.
  const line = comboCartLine('item-009', beers[0]);
  line.name = 'Pulled Pork — Fallo Pesante · NOME SBAGLIATO';
  const note = buildIncludedBeersNote([line], kitchenMenuItems);
  assert.ok(note.includes(beers[0].name.toUpperCase()), note);
  assert.doesNotMatch(note, /NOME SBAGLIATO/);
});

test('handleSubmit mette la birra PRIMA della nota cliente e non cambia il payload item', () => {
  const src = readFileSync(join(__dirname, '../pages/CustomerKitchenMenu.jsx'), 'utf8');
  assert.match(src, /const noteParts = \[buildIncludedBeersNote\(orderItems, menuItems\), customerNote\.trim\(\)\]/);
  assert.match(src, /note: noteParts\.length > 0 \? noteParts\.join/);
  // Contratto invariato: l'id che va al server resta baseId (allowlist promo item-040/041/042).
  assert.match(src, /itemId: o\.baseId \|\| o\.id/);
});

test('la nota arriva davvero alla cucina: kitchen_orders.customer_note -> order.note -> focus card', () => {
  const hook = readFileSync(join(__dirname, '../hooks/useKitchenOrders.js'), 'utf8');
  assert.match(hook, /note:\s+row\.customer_note/);
  assert.match(hook, /p_customer_note: order\.note/);
  const solo = readFileSync(join(__dirname, '../pages/KitchenSoloService.jsx'), 'utf8');
  assert.match(solo, /MODIFICHE \/ NOTE/);
  assert.match(solo, /focusOrder\.note/);
});

test('regressione: gate serale invariato (Krombacher dalle 18:00)', () => {
  assert.equal(EVENING_SERVICE_START_HOUR, 18);
  assert.equal(isEveningServiceActive(new Date(2026, 8, 18, 17, 59)), false);
  assert.equal(isEveningServiceActive(new Date(2026, 8, 18, 18, 0)), true);
});

// ============================================================================
// SERATA OPERATIVA (aggiunta 2026-09-19) — cutoff 06:00 Europe/Rome.
//
// Copre il finding live della serata 18/09: `kitchen_orders.service_day` scatta a mezzanotte,
// quindi non puo' essere il filtro della serata. La serata del giorno X e' [06:00 X, 06:00 X+1).
// ============================================================================
import { existsSync } from 'node:fs';
import {
  SERVICE_NIGHT_CUTOFF_HOUR,
  serviceNightWindow,
  serviceNightWindowFor,
  isInServiceNight,
  formatServiceNightLabel,
  summarizeServiceNightPayments,
  summarizePaymentsByMethod,
  bucketOrdersByServiceNight,
  bucketOrdersByWalrusServiceHours,
  WALRUS_SERVICE_HOUR_RANGES,
  computeTopProductsAndCategories,
  NON_MAPPED_CATEGORY,
} from './kitchenServiceRules.js';

// Orario da muro di Roma -> istante. A settembre l'Italia e' in CEST (+02:00).
const cest = (s) => new Date(`${s}+02:00`);
const cet = (s) => new Date(`${s}+01:00`);

test('il cutoff della serata e le 06:00', () => {
  assert.equal(SERVICE_NIGHT_CUTOFF_HOUR, 6);
});

test('serata 18/09: la finestra va dalle 06:00 del 18 alle 06:00 del 19 (Europe/Rome)', () => {
  const w = serviceNightWindow(cest('2026-09-18T20:00:00'));
  assert.equal(w.night, '2026-09-18');
  assert.equal(w.startIso, '2026-09-18T04:00:00.000Z'); // 06:00 CEST
  assert.equal(w.endIso, '2026-09-19T04:00:00.000Z');   // 06:00 CEST del giorno dopo
  assert.equal(formatServiceNightLabel(w.night), '18/09');
});

// --- I 4 casi richiesti: 23:59, 00:01, 05:59 stessa serata; 06:00 serata nuova ---

test('23:59 del 18/09 appartiene alla serata 18/09', () => {
  const w = serviceNightWindow(cest('2026-09-18T23:59:00'));
  assert.equal(w.night, '2026-09-18');
  assert.equal(isInServiceNight(cest('2026-09-18T23:59:00').toISOString(), w), true);
});

test('00:01 del 19/09 appartiene ANCORA alla serata 18/09 (il bug di service_day)', () => {
  const w = serviceNightWindow(cest('2026-09-19T00:01:00'));
  assert.equal(w.night, '2026-09-18');
  assert.equal(isInServiceNight(cest('2026-09-19T00:01:00').toISOString(), w), true);
});

test('23:59 e 00:01 cadono nella stessa identica finestra', () => {
  const prima = serviceNightWindow(cest('2026-09-18T23:59:00'));
  const dopo = serviceNightWindow(cest('2026-09-19T00:01:00'));
  assert.deepEqual([prima.night, prima.startIso, prima.endIso], [dopo.night, dopo.startIso, dopo.endIso]);
  // E un ordine per parte e' dentro la stessa serata, visto da entrambi i momenti.
  for (const w of [prima, dopo]) {
    assert.equal(isInServiceNight(cest('2026-09-18T23:59:00').toISOString(), w), true);
    assert.equal(isInServiceNight(cest('2026-09-19T00:01:00').toISOString(), w), true);
  }
});

test('05:59 del 19/09 appartiene ancora alla serata 18/09', () => {
  const w = serviceNightWindow(cest('2026-09-19T05:59:00'));
  assert.equal(w.night, '2026-09-18');
  assert.equal(isInServiceNight(cest('2026-09-19T05:59:59').toISOString(), w), true);
});

test('06:00 del 19/09 apre la serata NUOVA: 18/09 e chiusa', () => {
  const w = serviceNightWindow(cest('2026-09-19T06:00:00'));
  assert.equal(w.night, '2026-09-19');
  assert.equal(w.startIso, '2026-09-19T04:00:00.000Z');
  // Estremo destro escluso: le 06:00 non ricadono piu' nella serata precedente.
  const serataPrecedente = serviceNightWindow(cest('2026-09-18T23:00:00'));
  assert.equal(isInServiceNight(cest('2026-09-19T06:00:00').toISOString(), serataPrecedente), false);
  assert.equal(isInServiceNight(cest('2026-09-19T05:59:59.999').toISOString(), serataPrecedente), true);
});

test('la serata dura sempre 24h anche a cavallo del cambio ora legale', () => {
  // Ultima domenica di ottobre 2026: 25/10, alle 03:00 CEST si torna alle 02:00 CET.
  const w = serviceNightWindow(cet('2026-10-25T20:00:00'));
  assert.equal(w.night, '2026-10-25');
  assert.equal(w.startIso, '2026-10-25T05:00:00.000Z'); // 06:00 CET
  assert.equal(w.endIso, '2026-10-26T05:00:00.000Z');
  // La serata 24/10 contiene invece 25 ore reali: apre in CEST e chiude in CET.
  const dst = serviceNightWindow(cest('2026-10-24T22:00:00'));
  assert.equal(dst.startIso, '2026-10-24T04:00:00.000Z'); // 06:00 CEST
  assert.equal(dst.endIso, '2026-10-25T05:00:00.000Z');   // 06:00 CET
  assert.equal((dst.end - dst.start) / 3600000, 25);
});

test('isInServiceNight confronta istanti, non stringhe: regge il formato +00:00 di Supabase', () => {
  const w = serviceNightWindow(cest('2026-09-18T20:00:00'));
  // Stesso istante, due serializzazioni diverse. Un confronto lessicografico fallirebbe.
  assert.equal(isInServiceNight('2026-09-18T22:30:00.123456+00:00', w), true);
  assert.equal(isInServiceNight('2026-09-18T22:30:00.123Z', w), true);
  assert.equal(isInServiceNight('2026-09-18T03:59:59+00:00', w), false); // 05:59 Rome, serata prima
  assert.equal(isInServiceNight(null, w), false);
  assert.equal(isInServiceNight('non-una-data', w), false);
});

// --- Cassa serata: solo kitchen_payments, solo succeeded ---

test('incasso/rimborsi/netto contano SOLO i kitchen_payments succeeded', () => {
  const s = summarizeServiceNightPayments([
    { direction: 'charge', status: 'succeeded', amount: 15 },
    { direction: 'charge', status: 'succeeded', amount: '7.50' },  // numeric -> stringa da PostgREST
    { direction: 'charge', status: 'failed', amount: 99 },
    { direction: 'charge', status: 'initiated', amount: 12 },
    { direction: 'charge', status: 'pending', amount: 8 },
    { direction: 'refund', status: 'succeeded', amount: 5 },
    { direction: 'refund', status: 'initiated', amount: 30 },
  ]);
  assert.equal(s.incasso, 22.5);       // 15 + 7.50, niente failed/initiated/pending
  assert.equal(s.incassiRiusciti, 2);
  assert.equal(s.rimborsato, 5);
  assert.equal(s.netto, 17.5);
  assert.equal(s.inSospeso, 50);       // 12 + 8 + 30, mai sommati all'incasso
  assert.equal(s.falliti, 1);
});

test('somma di importi in centesimi senza residuo binario', () => {
  const rows = [0.1, 0.2, 12.73, 1348.7].map((amount) => ({ direction: 'charge', status: 'succeeded', amount }));
  assert.equal(summarizeServiceNightPayments(rows).incasso, 1361.73);
});

test('nessuna riga = tutto a zero, mai NaN', () => {
  for (const input of [[], null, undefined]) {
    const s = summarizeServiceNightPayments(input);
    assert.deepEqual(s, { incasso: 0, rimborsato: 0, netto: 0, inSospeso: 0, falliti: 0, incassiRiusciti: 0 });
  }
});

// --- Kitchen Analytics V1 Fase 1: breakdown cassa per metodo ---

test('summarizePaymentsByMethod: incasso/rimborsato/netto per metodo, solo succeeded', () => {
  const rows = [
    { method: 'cash', direction: 'charge', status: 'succeeded', amount: 10 },
    { method: 'cash', direction: 'charge', status: 'succeeded', amount: '5.50' },
    { method: 'sumup_online', direction: 'charge', status: 'succeeded', amount: 20 },
    { method: 'sumup_online', direction: 'refund', status: 'succeeded', amount: 4 },
    { method: 'sumup_pos', direction: 'charge', status: 'failed', amount: 99 },
  ];
  const { byMethod } = summarizePaymentsByMethod(rows);
  assert.deepEqual(byMethod.cash, { incasso: 15.5, rimborsato: 0, netto: 15.5, count: 2 });
  assert.deepEqual(byMethod.sumup_online, { incasso: 20, rimborsato: 4, netto: 16, count: 1 });
  // Un tentativo fallito non produce incasso ma la riga per il metodo esiste comunque (per il badge SumUp).
  assert.deepEqual(byMethod.sumup_pos, { incasso: 0, rimborsato: 0, netto: 0, count: 0 });
});

test('summarizePaymentsByMethod: count e il numero di pagamenti charge succeeded per metodo (Fase 7)', () => {
  const rows = [
    { method: 'cash', direction: 'charge', status: 'succeeded', amount: 10 },
    { method: 'cash', direction: 'charge', status: 'succeeded', amount: 12 },
    { method: 'cash', direction: 'charge', status: 'failed', amount: 8 },
    { method: 'cash', direction: 'refund', status: 'succeeded', amount: 3 },
  ];
  const { byMethod } = summarizePaymentsByMethod(rows);
  assert.equal(byMethod.cash.count, 2);
});

test('summarizePaymentsByMethod: badge SumUp conta i tentativi, solo su sumup_online/sumup_pos', () => {
  const rows = [
    { method: 'sumup_online', direction: 'charge', status: 'succeeded', amount: 10 },
    { method: 'sumup_pos', direction: 'charge', status: 'succeeded', amount: 10 },
    { method: 'sumup_online', direction: 'charge', status: 'pending', amount: 10 },
    { method: 'sumup_pos', direction: 'charge', status: 'initiated', amount: 10 },
    { method: 'sumup_online', direction: 'charge', status: 'failed', amount: 10 },
    { method: 'cash', direction: 'charge', status: 'failed', amount: 10 }, // mai contato: non e' SumUp
  ];
  assert.deepEqual(summarizePaymentsByMethod(rows).sumup, { succeeded: 2, pending: 2, failed: 1 });
});

test('AC3: la somma per metodo coincide esattamente con summarizeServiceNightPayments sulle stesse righe', () => {
  const rows = [
    { method: 'cash', direction: 'charge', status: 'succeeded', amount: 15 },
    { method: 'sumup_online', direction: 'charge', status: 'succeeded', amount: '7.50' },
    { method: 'sumup_pos', direction: 'charge', status: 'failed', amount: 99 },
    { method: 'card_counter_manual', direction: 'charge', status: 'initiated', amount: 12 },
    { method: 'satispay_app', direction: 'refund', status: 'succeeded', amount: 5 },
    { method: 'manual_comp', direction: 'refund', status: 'initiated', amount: 30 },
  ];
  const total = summarizeServiceNightPayments(rows);
  const { byMethod } = summarizePaymentsByMethod(rows);
  const round2 = (n) => Math.round(n * 100) / 100;
  const sumIncasso = round2(Object.values(byMethod).reduce((acc, m) => acc + m.incasso, 0));
  const sumRimborsato = round2(Object.values(byMethod).reduce((acc, m) => acc + m.rimborsato, 0));
  assert.equal(sumIncasso, total.incasso);
  assert.equal(sumRimborsato, total.rimborsato);
  assert.equal(round2(sumIncasso - sumRimborsato), total.netto);
});

test('summarizePaymentsByMethod: nessuna riga = tutto a zero, mai NaN', () => {
  for (const input of [[], null, undefined]) {
    assert.deepEqual(summarizePaymentsByMethod(input), { byMethod: {}, sumup: { succeeded: 0, pending: 0, failed: 0 } });
  }
});

// --- Kitchen Analytics V1 Fase 5: vendite per fascia oraria ---

function order(id, createdAtIso, { status = 'delivered', total = 10 } = {}) {
  return { id, createdAt: createdAtIso, status, total };
}

test('bucketOrdersByServiceNight: 12 bucket da 2h, etichette da 06-08 a 04-06', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const buckets = bucketOrdersByServiceNight([], night, 2);
  assert.equal(buckets.length, 12);
  assert.equal(buckets[0].label, '06-08');
  assert.equal(buckets[6].label, '18-20');
  assert.equal(buckets[8].label, '22-00');
  assert.equal(buckets[9].label, '00-02');
  assert.equal(buckets[11].label, '04-06');
  buckets.forEach((b) => { assert.equal(b.count, 0); assert.equal(b.value, 0); });
});

test('bucketOrdersByServiceNight: conta solo i delivered dentro la serata, somma order.total nel bucket', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    order('o1', cest('2026-09-18T19:00:00').toISOString(), { total: 12 }),   // 18-20
    order('o2', cest('2026-09-18T19:30:00').toISOString(), { total: 8 }),    // 18-20
    order('o3', cest('2026-09-18T21:15:00').toISOString(), { total: 20 }),   // 20-22
    order('o4', cest('2026-09-18T19:00:00').toISOString(), { status: 'cancelled', total: 99 }), // escluso: non delivered
    order('o5', cest('2026-09-17T19:00:00').toISOString(), { total: 99 }),   // escluso: serata diversa
  ];
  const buckets = bucketOrdersByServiceNight(orders, night, 2);
  const b1820 = buckets.find((b) => b.label === '18-20');
  const b2022 = buckets.find((b) => b.label === '20-22');
  assert.deepEqual({ count: b1820.count, value: b1820.value }, { count: 2, value: 20 });
  assert.deepEqual({ count: b2022.count, value: b2022.value }, { count: 1, value: 20 });
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
  const totalValue = buckets.reduce((sum, b) => sum + b.value, 0);
  assert.equal(totalCount, 3); // AC6: nessun ordine perso ne' duplicato
  assert.equal(totalValue, 40);
});

test('bucketOrdersByServiceNight: ordine a cavallo di mezzanotte finisce nel bucket giusto (22-00 vs 00-02)', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    order('o1', cest('2026-09-18T23:30:00').toISOString()),
    order('o2', cest('2026-09-19T00:30:00').toISOString()),
  ];
  const buckets = bucketOrdersByServiceNight(orders, night, 2);
  assert.equal(buckets.find((b) => b.label === '22-00').count, 1);
  assert.equal(buckets.find((b) => b.label === '00-02').count, 1);
});

test('bucketOrdersByServiceNight: estremo di bucket incluso a sinistra, escluso a destra (come isInServiceNight)', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const bucketStart = cest('2026-09-18T20:00:00'); // inizio esatto del bucket 20-22
  const justBefore = new Date(bucketStart.getTime() - 1);
  const orders = [
    order('a', bucketStart.toISOString()),
    order('b', justBefore.toISOString()),
  ];
  const buckets = bucketOrdersByServiceNight(orders, night, 2);
  assert.equal(buckets.find((b) => b.label === '20-22').count, 1);
  assert.equal(buckets.find((b) => b.label === '18-20').count, 1);
});

test('bucketOrdersByServiceNight: nessun ordine = tutti i bucket a zero, mai NaN', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  for (const input of [[], null, undefined]) {
    const buckets = bucketOrdersByServiceNight(input, night, 2);
    assert.equal(buckets.length, 12);
    buckets.forEach((b) => { assert.equal(b.count, 0); assert.equal(b.value, 0); });
  }
});

test('bucketOrdersByWalrusServiceHours: 7 fasce, solo pranzo (1h) e sera/notte (2h), tutte a zero senza ordini', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const buckets = bucketOrdersByWalrusServiceHours([], night);
  assert.deepEqual(buckets.map((b) => b.label), ['12-13', '13-14', '14-15', '18-20', '20-22', '22-00', '00-02']);
  assert.deepEqual(WALRUS_SERVICE_HOUR_RANGES.map((r) => r.label), buckets.map((b) => b.label));
  buckets.forEach((b) => { assert.equal(b.count, 0); assert.equal(b.value, 0); });
});

test('bucketOrdersByWalrusServiceHours: conta pranzo e sera nella fascia giusta, somma order.total', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    order('o1', cest('2026-09-18T12:30:00').toISOString(), { total: 9 }),  // 12-13
    order('o2', cest('2026-09-18T13:45:00').toISOString(), { total: 11 }), // 13-14
    order('o3', cest('2026-09-18T19:00:00').toISOString(), { total: 12 }), // 18-20
    order('o4', cest('2026-09-19T01:00:00').toISOString(), { total: 7 }),  // 00-02
  ];
  const buckets = bucketOrdersByWalrusServiceHours(orders, night);
  const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]));
  assert.deepEqual({ count: byLabel['12-13'].count, value: byLabel['12-13'].value }, { count: 1, value: 9 });
  assert.deepEqual({ count: byLabel['13-14'].count, value: byLabel['13-14'].value }, { count: 1, value: 11 });
  assert.deepEqual({ count: byLabel['18-20'].count, value: byLabel['18-20'].value }, { count: 1, value: 12 });
  assert.deepEqual({ count: byLabel['00-02'].count, value: byLabel['00-02'].value }, { count: 1, value: 7 });
  assert.equal(byLabel['14-15'].count, 0);
});

test('bucketOrdersByWalrusServiceHours: ordini fuori dalle fasce operative (chiusura) sono esclusi dal grafico, non azzerano gli altri totali', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    order('o1', cest('2026-09-18T07:00:00').toISOString(), { total: 99 }), // 06-08, chiusura mattina
    order('o2', cest('2026-09-18T10:00:00').toISOString(), { total: 99 }), // 10-12, chiusura tarda mattina
    order('o3', cest('2026-09-18T16:00:00').toISOString(), { total: 99 }), // 16-18, chiusura pomeriggio
    order('o4', cest('2026-09-19T03:00:00').toISOString(), { total: 99 }), // 02-04, chiusura notte fonda
    order('o5', cest('2026-09-18T18:30:00').toISOString(), { total: 15 }), // 18-20, unico visibile
  ];
  const buckets = bucketOrdersByWalrusServiceHours(orders, night);
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
  const totalValue = buckets.reduce((sum, b) => sum + b.value, 0);
  assert.equal(totalCount, 1);
  assert.equal(totalValue, 15);
  // AC6 (totale giornata) resta intatto altrove: bucketOrdersByServiceNight non e' toccata.
  const fullNightTotal = bucketOrdersByServiceNight(orders, night, 2).reduce((sum, b) => sum + b.count, 0);
  assert.equal(fullNightTotal, 5);
});

test('bucketOrdersByWalrusServiceHours: solo delivered nella serata corrente, mai NaN senza ordini', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    order('o1', cest('2026-09-18T12:30:00').toISOString(), { status: 'cancelled', total: 9 }), // escluso: non delivered
    order('o2', cest('2026-09-17T12:30:00').toISOString(), { total: 9 }), // escluso: serata diversa
  ];
  const buckets = bucketOrdersByWalrusServiceHours(orders, night);
  buckets.forEach((b) => { assert.equal(b.count, 0); assert.equal(b.value, 0); });
  for (const input of [null, undefined, []]) {
    bucketOrdersByWalrusServiceHours(input, night).forEach((b) => {
      assert.equal(b.count, 0);
      assert.equal(b.value, 0);
    });
  }
});

// --- Verifica end-to-end su dati reali esportati (se presenti) ---
//
// Replica esattamente la pipeline di produzione: pagamento -> ordine -> finestra della serata,
// con l'aggregazione condivisa. Serve a poter verificare una serata reale senza interrogare il
// DB remoto. Il backup committato e' quello PRE go-live (18/09 15:27) e quindi NON contiene la
// serata del 18/09: il test resta verde e non asserisce importi che il dataset non contiene.
const BACKUP = join(__dirname, '../../ai-ops/runs/go-live-clean-20260918/backup');

function loadBackup(file) {
  let raw = readFileSync(join(BACKUP, file), 'utf8');
  raw = raw.slice(raw.indexOf('{'));
  return JSON.parse(raw).rows.flatMap((r) => r.data);
}

export function cassaSerata(payments, orders, when) {
  const window = serviceNightWindow(when);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const rows = payments.filter((p) => {
    const order = orderById.get(p.order_id);
    return order && isInServiceNight(order.created_at, window);
  });
  return { window, ...summarizeServiceNightPayments(rows) };
}

test('dati reali: i pagamenti seguono la serata dell ordine, non il giorno di calendario', (t) => {
  if (!existsSync(join(BACKUP, 'kitchen_payments.json'))) {
    t.skip('backup non presente in questo worktree');
    return;
  }
  const payments = loadBackup('kitchen_payments.json');
  const orders = loadBackup('kitchen_orders.json');

  // Serata 17/09 del backup: nessun pagamento orfano, e il totale della serata coincide con la
  // somma diretta dei charge succeeded dei suoi ordini.
  const serata = cassaSerata(payments, orders, cest('2026-09-17T22:00:00'));
  const idsSerata = new Set(
    orders.filter((o) => isInServiceNight(o.created_at, serata.window)).map((o) => o.id)
  );
  const atteso = payments
    .filter((p) => idsSerata.has(p.order_id) && p.direction === 'charge' && p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  assert.equal(serata.incasso, Math.round(atteso * 100) / 100);
  assert.ok(serata.incassiRiusciti > 0, 'la serata 17/09 del backup ha incassi reali');

  // Nessun pagamento del dataset resta senza ordine: la join della UI non perde righe.
  const orfani = payments.filter((p) => !orders.some((o) => o.id === p.order_id));
  assert.equal(orfani.length, 0);

  // Invariante centrale: la somma delle serate copre tutti i charge succeeded, senza doppioni.
  const nightsTotal = [...new Set(orders.map((o) => serviceNightWindow(new Date(o.created_at)).night))]
    .map((n) => cassaSerata(payments, orders, new Date(`${n}T20:00:00+02:00`)))
    .reduce((acc, s) => ({ n: acc.n + s.incassiRiusciti, eur: acc.eur + s.incasso }), { n: 0, eur: 0 });
  const tuttiSucceeded = payments.filter((p) => p.direction === 'charge' && p.status === 'succeeded');
  assert.equal(nightsTotal.n, tuttiSucceeded.length);
  assert.equal(
    Math.round(nightsTotal.eur * 100) / 100,
    Math.round(tuttiSucceeded.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100
  );
});

test('serviceNightWindowFor ricostruisce la stessa finestra a partire dalla serata', () => {
  const vissuta = serviceNightWindow(cest('2026-09-19T02:30:00')); // dopo mezzanotte
  const ricostruita = serviceNightWindowFor('2026-09-18');
  assert.deepEqual(ricostruita, vissuta);
  // Fallback difensivo: input assente o malformato non produce una finestra invalida.
  for (const bad of [null, '', 'non-una-data']) {
    const w = serviceNightWindowFor(bad);
    assert.equal(typeof w.start, 'number');
    assert.ok(w.end > w.start);
  }
});

// ============================================================================
// TOP PRODOTTI + TOP CATEGORIE (Kitchen Analytics V1 Fase 6)
// ============================================================================
function orderWithItems(id, createdAtIso, items, { status = 'delivered' } = {}) {
  return { id, createdAt: createdAtIso, status, items };
}

const menu = [
  { id: 'm1', name: 'Crudo Vero', category: 'panini' },
  { id: 'm2', name: 'Box Pulled Pork', category: 'bbq' },
  { id: 'm3', name: 'Keiler Helles', category: 'birre' },
];

test('computeTopProductsAndCategories: somma le quantita per nome prodotto, solo delivered nella serata', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    orderWithItems('o1', cest('2026-09-18T19:00:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 2 },
      { itemId: 'm2', name: 'Box Pulled Pork', quantity: 1 },
    ]),
    orderWithItems('o2', cest('2026-09-18T19:30:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 1 },
    ]),
    orderWithItems('o3', cest('2026-09-18T19:00:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 5 },
    ], { status: 'cancelled' }), // escluso: non delivered
    orderWithItems('o4', cest('2026-09-17T19:00:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 5 },
    ]), // escluso: serata diversa
  ];
  const { topProducts } = computeTopProductsAndCategories(orders, night, menu, 5);
  assert.deepEqual(topProducts, [
    { name: 'Crudo Vero', quantity: 3 },
    { name: 'Box Pulled Pork', quantity: 1 },
  ]);
});

test('computeTopProductsAndCategories: rispetta topN e ordina per quantita decrescente', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    orderWithItems('o1', cest('2026-09-18T19:00:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 1 },
      { itemId: 'm2', name: 'Box Pulled Pork', quantity: 3 },
      { itemId: 'm3', name: 'Keiler Helles', quantity: 2 },
    ]),
  ];
  const { topProducts } = computeTopProductsAndCategories(orders, night, menu, 2);
  assert.equal(topProducts.length, 2);
  assert.deepEqual(topProducts, [
    { name: 'Box Pulled Pork', quantity: 3 },
    { name: 'Keiler Helles', quantity: 2 },
  ]);
});

test('computeTopProductsAndCategories: mappa prodotto->categoria per itemId, aggrega per categoria', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    orderWithItems('o1', cest('2026-09-18T19:00:00').toISOString(), [
      { itemId: 'm1', name: 'Crudo Vero', quantity: 2 },
      { itemId: 'm2', name: 'Box Pulled Pork', quantity: 1 },
    ]),
    orderWithItems('o2', cest('2026-09-18T19:30:00').toISOString(), [
      { itemId: 'm3', name: 'Keiler Helles', quantity: 4 },
    ]),
  ];
  const { topCategories } = computeTopProductsAndCategories(orders, night, menu, 5);
  assert.deepEqual(topCategories, [
    { category: 'birre', quantity: 4 },
    { category: 'panini', quantity: 2 },
    { category: 'bbq', quantity: 1 },
  ]);
});

test('computeTopProductsAndCategories: item non mappabile al catalogo va nel bucket esplicito NON_MAPPED_CATEGORY, mai categoria inventata', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    orderWithItems('o1', cest('2026-09-18T19:00:00').toISOString(), [
      { itemId: 'item-999-ghost', name: 'Piatto Sparito Dal Menu', quantity: 3 },
      { itemId: 'm1', name: 'Crudo Vero', quantity: 1 },
    ]),
  ];
  const { topProducts, topCategories } = computeTopProductsAndCategories(orders, night, menu, 5);
  assert.deepEqual(topProducts, [
    { name: 'Piatto Sparito Dal Menu', quantity: 3 },
    { name: 'Crudo Vero', quantity: 1 },
  ]);
  assert.deepEqual(topCategories, [
    { category: NON_MAPPED_CATEGORY, quantity: 3 },
    { category: 'panini', quantity: 1 },
  ]);
});

test('computeTopProductsAndCategories: fallback su match per nome quando itemId assente', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  const orders = [
    orderWithItems('o1', cest('2026-09-18T19:00:00').toISOString(), [
      { name: 'Keiler Helles', quantity: 2 }, // nessun itemId
    ]),
  ];
  const { topCategories } = computeTopProductsAndCategories(orders, night, menu, 5);
  assert.deepEqual(topCategories, [{ category: 'birre', quantity: 2 }]);
});

test('computeTopProductsAndCategories: nessun ordine = liste vuote, mai NaN', () => {
  const night = serviceNightWindow(cest('2026-09-18T20:00:00'));
  for (const input of [[], null, undefined]) {
    const { topProducts, topCategories } = computeTopProductsAndCategories(input, night, menu, 5);
    assert.deepEqual(topProducts, []);
    assert.deepEqual(topCategories, []);
  }
});
