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
