// Kitchen V2 — Fase 2 / micro-fase B1 — dataset DEV "Serata Walrus".
//
// Genera una serata mock deterministica (seed fisso, nessun Math.random non seedato) isomorfa
// alla shape reale ordini/pagamenti (mapSupabaseOrder in useKitchenOrders.js, righe
// kitchen_payments lette da useKitchenPayments.js). Solo dati: nessun hook, nessun import di
// supabaseClient, nessuna route. Non è collegato a useKitchenOrders/useKitchenPayments — vedi
// ai-ops/reports/kitchen-v2-fase2-dev-mock-layer-audit.md (PROPOSED_MINIMAL_ARCHITECTURE punti 1-2).
//
// Finestra notte: 18:00 -> 04:30 Europe/Rome del 2026-09-20/21, quindi attraversa la mezzanotte
// di calendario ma resta nello stesso "service day" (regola 06:00 -> 06:00, vedi
// wip/kitchen-serata-operativa @ c44fa0c, Master Plan §5/§11 Fase 3): computeServiceDay() sotto
// applica lo shift di -6h prima di derivare il giorno, riusando serviceDayRome() esistente
// invece di duplicare logica timezone.
import { kitchenMenuItems } from './kitchenMockData.js';
import { serviceDayRome, formatOperationalCode } from '../lib/kitchenOrderCode.js';

export const SERATA_WALRUS_SEED = 20260920;
export const SERATA_WALRUS_VENUE_ID = 'walrus-main';
export const SERATA_WALRUS_NIGHT_START_ISO = '2026-09-20T18:00:00+02:00';

const WINDOW_MINUTES = 630; // 18:00 -> 04:30 (10h30)
const SERVICE_DAY_CUTOFF_HOURS = 6; // regola 06:00 -> 06:00 Europe/Rome

const ORDER_COUNT = 84;
const TAIL_SIZE = 25; // ultimi ordini della notte: ancora "in volo" a fine finestra
const TAIL_IN_PROGRESS = 10;
const TAIL_PENDING_NO_ATTEMPT = 8;
const TAIL_PENDING_SUMUP_STUCK = 7; // 10 + 8 + 7 = 25 = TAIL_SIZE

const HEAD_SIZE = ORDER_COUNT - TAIL_SIZE; // 59
const HEAD_CANCELLED = 8;
// HEAD_SIZE - HEAD_CANCELLED = 51 paid_delivered

// 51 (paid_delivered) + 10 (paid_in_progress) = 61 ordini pagati da ripartire sui 3 metodi.
const PAID_METHOD_SPLIT = { cash: 24, card_counter_manual: 21, sumup_online: 16 };

const IN_PROGRESS_STATUS_POOL = ['received', 'preparing', 'ready'];

const NICKNAME_POOL = [
  'Gamba Lunga', 'Sabrina87', 'IlCapo', 'MarcoCavallo', 'FuriosaDelBanco', 'SpartatoViaSubito',
  'Barbanera', 'PesoPiuma', 'CamillaWrap', 'IlGrecoDelBancone', 'NottambulaVera', 'TizioCaso',
  'RiccardoLento', 'LaBionda', 'MangioneUfficiale', 'ScorpioneRosso', 'GiuliaTardi', 'IlDuca',
  'PicchiataFinale', 'NonSoNickname', 'FrancyPub', 'ZioAlberto', 'LaRegina', 'MattoDaLegare',
  'SimoneTravel', 'CriRock', 'PaoloIlSaggio', 'ValeSenzaFretta', 'DavideVeloce', 'AnnaCiccheti',
];

const NOTE_POOL = [
  'Senza cipolla sul panino, per favore.',
  'Patatine extra croccanti se possibile.',
  'Salsa a parte, grazie.',
  'Poco piccante.',
  'Tagliato a metà per favore.',
  'Portato al tavolo fuori.',
  'Confezione separata, siamo in due gruppi.',
];

const CANCEL_REASON_POOL = [
  'Cliente se ne è andato prima di pagare.',
  'Ordine doppio per errore, annullato dallo staff.',
  'Cliente ha cambiato idea prima del pagamento.',
  'Articolo esaurito dopo l’ordine, annullato e riproposto al cliente.',
];

const ORDERABLE_ITEMS = kitchenMenuItems.filter(
  (item) => item.available !== false
    && typeof item.price === 'number'
    && item.price > 0
    && item.availability !== 'evening_only'
);

const ORDERABLE_ITEMS_BY_ID = new Map(ORDERABLE_ITEMS.map((item) => [item.id, item]));

const HEAVY_CATEGORIES = new Set(['panini', 'bbq', 'birre']);
const ITEM_BAG = ORDERABLE_ITEMS.flatMap((item) => {
  const weight = item.category === 'contorni' ? 1 : (HEAVY_CATEGORIES.has(item.category) ? 3 : 2);
  return Array(weight).fill(item);
});

// mulberry32 — PRNG deterministico, stesso seed = stessa sequenza sempre (nessuna dipendenza
// da Math.random o da Date.now: il dataset è riproducibile byte-per-byte).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeServiceDay(date) {
  const shifted = new Date(date.getTime() - SERVICE_DAY_CUTOFF_HOURS * 3600 * 1000);
  return serviceDayRome(shifted);
}

function pickOrderItems(rng) {
  const lineCount = 1 + Math.floor(rng() * 3); // 1..3 righe
  const chosen = [];
  const usedIds = new Set();
  let guard = 0;
  while (chosen.length < lineCount && guard < 20) {
    guard += 1;
    const item = ITEM_BAG[Math.floor(rng() * ITEM_BAG.length)];
    if (usedIds.has(item.id)) continue;
    usedIds.add(item.id);
    const quantity = rng() < 0.75 ? 1 : 2;
    chosen.push({ itemId: item.id, name: item.name, quantity, price: item.price });
  }
  return chosen;
}

function buildOrder({ sequence, createdAtMs, group, paymentMethod, statusOverride, rng }) {
  const createdAt = new Date(createdAtMs);
  const items = pickOrderItems(rng);
  const total = round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  const fulfillmentType = rng() < 0.65 ? 'eat_here' : 'takeaway';
  const note = rng() < 0.4 ? pick(rng, NOTE_POOL) : '';

  const allergenLine = items.find(
    (line) => (ORDERABLE_ITEMS_BY_ID.get(line.itemId)?.allergens ?? []).length > 0
  );
  const staffNote = allergenLine && rng() < 0.35
    ? `Cliente ha confermato allergia a ${ORDERABLE_ITEMS_BY_ID.get(allergenLine.itemId).allergens[0]} — preparare separato.`
    : null;

  const base = {
    id: `swn-${String(sequence).padStart(3, '0')}`,
    orderCode: formatOperationalCode(sequence),
    serviceDay: computeServiceDay(createdAt),
    serviceSequence: sequence,
    nickname: pick(rng, NICKNAME_POOL),
    items,
    total,
    fulfillmentType,
    note,
    staffNote,
    createdAt: createdAt.toISOString(),
    promoCode: null,
    discountAmount: 0,
    cancelReason: null,
    cancelledAt: null,
    actionLog: [],
  };

  if (group === 'cancelled') {
    const cancelDelayMin = 2 + rng() * 18;
    return {
      ...base,
      status: 'cancelled',
      paymentStatus: 'pending_counter_payment',
      paymentMethod: null,
      paidAt: null,
      readyAt: null,
      cancelReason: pick(rng, CANCEL_REASON_POOL),
      cancelledAt: new Date(createdAtMs + cancelDelayMin * 60000).toISOString(),
    };
  }

  if (group === 'pending_no_attempt' || group === 'pending_sumup_stuck') {
    return {
      ...base,
      status: 'pending_counter_payment',
      paymentStatus: 'pending_counter_payment',
      paymentMethod: null,
      paidAt: null,
      readyAt: null,
    };
  }

  // paid_delivered | paid_in_progress
  const payDelayMin = paymentMethod === 'sumup_online' ? 0.5 + rng() * 2 : 2 + rng() * 13;
  const paidAtMs = createdAtMs + payDelayMin * 60000;
  const status = group === 'paid_delivered' ? 'delivered' : statusOverride;
  const readyEligible = status === 'ready' || status === 'delivered';
  const readyDelayMin = 8 + rng() * 15;

  return {
    ...base,
    status,
    paymentStatus: 'paid',
    paymentMethod,
    paidAt: new Date(paidAtMs).toISOString(),
    readyAt: readyEligible ? new Date(paidAtMs + readyDelayMin * 60000).toISOString() : null,
  };
}

function paymentProviderFor(method) {
  if (method === 'cash') return 'cash';
  if (method === 'card_counter_manual') return 'manual';
  return 'sumup';
}

function makeChargePayment(order) {
  return {
    id: `${order.id}-pay-1`,
    order_id: order.id,
    order_code: order.orderCode,
    provider: paymentProviderFor(order.paymentMethod),
    method: order.paymentMethod,
    direction: 'charge',
    status: 'succeeded',
    amount: order.total,
    failure_reason: null,
    created_at: order.paidAt,
  };
}

function makeStuckSumupPayment(order, rng) {
  const attemptDelayMin = 1 + rng() * 4;
  const createdAtMs = new Date(order.createdAt).getTime() + attemptDelayMin * 60000;
  return {
    id: `${order.id}-pay-1`,
    order_id: order.id,
    order_code: order.orderCode,
    provider: 'sumup',
    method: 'sumup_online',
    direction: 'charge',
    status: 'initiated',
    amount: order.total,
    failure_reason: null,
    created_at: new Date(createdAtMs).toISOString(),
  };
}

/**
 * Genera il dataset "Serata Walrus" (ordini + pagamenti coerenti) in modo deterministico.
 * Stesso seed => stesso output, sempre: nessuna dipendenza da orologio di sistema o RNG non seedato.
 */
export function buildSerataWalrusNight(seed = SERATA_WALRUS_SEED) {
  const rng = mulberry32(seed);
  const startMs = new Date(SERATA_WALRUS_NIGHT_START_ISO).getTime();

  const offsets = Array.from({ length: ORDER_COUNT }, () => rng() * WINDOW_MINUTES).sort((a, b) => a - b);

  const headIndexes = Array.from({ length: HEAD_SIZE }, (_, i) => i);
  const shuffledHead = shuffle(rng, headIndexes);
  const cancelledSet = new Set(shuffledHead.slice(0, HEAD_CANCELLED));

  const tailIndexes = Array.from({ length: TAIL_SIZE }, (_, i) => HEAD_SIZE + i);
  const shuffledTail = shuffle(rng, tailIndexes);
  const inProgressSet = new Set(shuffledTail.slice(0, TAIL_IN_PROGRESS));
  const pendingNoAttemptSet = new Set(
    shuffledTail.slice(TAIL_IN_PROGRESS, TAIL_IN_PROGRESS + TAIL_PENDING_NO_ATTEMPT)
  );
  const pendingSumupStuckSet = new Set(shuffledTail.slice(TAIL_IN_PROGRESS + TAIL_PENDING_NO_ATTEMPT));

  const paidIndexes = [];
  headIndexes.forEach((i) => { if (!cancelledSet.has(i)) paidIndexes.push(i); });
  inProgressSet.forEach((i) => paidIndexes.push(i));
  const shuffledPaid = shuffle(rng, paidIndexes);
  const methodByIndex = new Map();
  let cursor = 0;
  Object.entries(PAID_METHOD_SPLIT).forEach(([method, count]) => {
    for (let k = 0; k < count; k += 1) {
      methodByIndex.set(shuffledPaid[cursor], method);
      cursor += 1;
    }
  });

  const statusByTailIndex = new Map();
  inProgressSet.forEach((i) => statusByTailIndex.set(i, pick(rng, IN_PROGRESS_STATUS_POOL)));

  const payments = [];
  const orders = offsets.map((offsetMin, i) => {
    const sequence = i + 1;
    const createdAtMs = startMs + offsetMin * 60000;

    let group;
    if (cancelledSet.has(i)) group = 'cancelled';
    else if (inProgressSet.has(i)) group = 'paid_in_progress';
    else if (pendingNoAttemptSet.has(i)) group = 'pending_no_attempt';
    else if (pendingSumupStuckSet.has(i)) group = 'pending_sumup_stuck';
    else group = 'paid_delivered';

    const order = buildOrder({
      sequence,
      createdAtMs,
      group,
      paymentMethod: methodByIndex.get(i) ?? null,
      statusOverride: statusByTailIndex.get(i) ?? null,
      rng,
    });

    if (order.paymentStatus === 'paid') {
      payments.push(makeChargePayment(order));
    } else if (group === 'pending_sumup_stuck') {
      payments.push(makeStuckSumupPayment(order, rng));
    }

    return order;
  });

  return { orders, payments };
}

const { orders: serataWalrusOrders, payments: serataWalrusPayments } = buildSerataWalrusNight();

export { serataWalrusOrders, serataWalrusPayments };
