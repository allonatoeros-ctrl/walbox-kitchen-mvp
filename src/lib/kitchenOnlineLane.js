// Corsia online del cliente (S5, Payment Lifecycle V2) — logica pura, senza React né Supabase.
//
// Il server decide sempre: qui c'è solo ciò che serve alla UI per mostrare tempo rimasto, testi
// e per tenere stabile il client_request_id. POP = pending_online_payment, PA = payment_abandoned.

export const ONLINE_RETRY_WINDOW_MS = 270000; // 4:30 — oltre non si può più riprovare online
export const ONLINE_EXPIRY_MS = 300000; // 5:00 — da qui in poi lo sweep server chiude l'ordine

export const STATUS_POP = 'pending_online_payment';
export const STATUS_PA = 'payment_abandoned';

// Testo PA fissato da Eros: nessuna promessa di "nessun addebito" (esiste il caso raro PA + PAID
// SumUp confermato dopo, vedi docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md §2).
export const PAYMENT_ABANDONED_MESSAGE = 'Ordine annullato: il pagamento non è stato completato entro 5 minuti.';

export const POP_TITLE = 'Pagamento online in corso';
export const POP_RETRY_CLOSED_MESSAGE = 'Il tempo per pagare online è finito. Puoi pagare al banco.';
export const POP_CLOSING_MESSAGE = 'Stiamo chiudendo il pagamento online…';

const ONLINE_STATUS_LABELS = {
  [STATUS_POP]: 'PAGAMENTO ONLINE IN CORSO',
  [STATUS_PA]: 'ORDINE ANNULLATO',
};

export function isOnlineLaneStatus(status) {
  return status === STATUS_POP || status === STATUS_PA;
}

/**
 * Fase di un ordine POP dato `createdAt` e `now` (ms).
 * - active: entro 4:30, `secondsLeft` = secondi alla fine della finestra di retry
 * - retry_closed: tra 4:30 e 5:00, si può solo passare al banco
 * - closing: oltre 5:00, lo sweep server sta chiudendo (può durare ~1-2 minuti)
 * `createdAt` mancante/invalido -> active senza timer (`secondsLeft: null`), mai crash: il server
 * resta l'autorità e rifiuta comunque un tentativo fuori finestra.
 * Un `createdAt` nel futuro (orologio del telefono indietro) conta come tempo trascorso 0.
 */
export function getOnlineWindow(createdAt, now = Date.now()) {
  const created = createdAt instanceof Date ? createdAt.getTime()
    : typeof createdAt === 'number' ? createdAt
      : typeof createdAt === 'string' && createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(now)) {
    return { phase: 'active', secondsLeft: null };
  }
  const elapsed = Math.max(0, now - created);
  if (elapsed >= ONLINE_EXPIRY_MS) return { phase: 'closing', secondsLeft: 0 };
  if (elapsed >= ONLINE_RETRY_WINDOW_MS) return { phase: 'retry_closed', secondsLeft: 0 };
  return { phase: 'active', secondsLeft: Math.ceil((ONLINE_RETRY_WINDOW_MS - elapsed) / 1000) };
}

export function formatMmSs(totalSeconds) {
  const s = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Etichetta stato: POP/PA propri, altrimenti `statusMap[status].label` (kitchenOrderStatuses). */
export function getOrderStatusLabel(status, statusMap) {
  if (!status) return '';
  if (ONLINE_STATUS_LABELS[status]) return ONLINE_STATUS_LABELS[status];
  return statusMap?.[status]?.label ?? status;
}

// ─── client_request_id legato al carrello ────────────────────────────────────────────────────

export const CLIENT_REQUEST_ID_KEY = 'walbox_kitchen_client_request_id_v1';
const memoryDefault = {};

function storageOr(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function defaultGenerateId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* ripiego sotto */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Impronta del carrello: righe (itemId+qty, ordinate), ritiro, nota e orario di ritiro.
 *  Stesso carrello = stessa stringa. L'orario (RITIRO AL WALRUS, 2026-10-28) entra solo se c'e':
 *  le impronte dei carrelli senza orario restano identiche a prima, e cambiare orario genera un
 *  client_request_id nuovo (la v2/v3 "vince il primo" altrimenti restituirebbe l'ordine con
 *  l'orario vecchio). */
export function cartFingerprint({ items, fulfillmentType, note, pickupSlot } = {}) {
  const lines = (items ?? [])
    .map((i) => `${i.itemId}:${i.quantity}`)
    .sort();
  const base = [lines, fulfillmentType ?? null, (note ?? '').trim()];
  return JSON.stringify(pickupSlot ? [...base, pickupSlot] : base);
}

/**
 * Restituisce il client_request_id del carrello: lo stesso finché l'impronta non cambia (così un
 * retry dopo rete giù non crea un secondo ordine), nuovo se il carrello è cambiato. Persiste in
 * localStorage; se lo storage lancia, tiene l'id in memoria per la vita della pagina.
 */
export function getOrCreateClientRequestId(fingerprint, { storage, generateId = defaultGenerateId, memory = memoryDefault } = {}) {
  if (memory.fingerprint === fingerprint && memory.id) return memory.id;
  const store = storageOr(storage);
  try {
    const parsed = JSON.parse(store?.getItem(CLIENT_REQUEST_ID_KEY) || 'null');
    if (parsed && parsed.fingerprint === fingerprint && typeof parsed.id === 'string' && parsed.id) {
      memory.fingerprint = fingerprint;
      memory.id = parsed.id;
      return parsed.id;
    }
  } catch { /* storage assente/corrotto: si genera un id nuovo */ }
  const id = generateId();
  memory.fingerprint = fingerprint;
  memory.id = id;
  try { store?.setItem(CLIENT_REQUEST_ID_KEY, JSON.stringify({ fingerprint, id })); } catch { /* resta in memoria */ }
  return id;
}

/** Da chiamare solo a ordine creato. */
export function clearClientRequestId({ storage, memory = memoryDefault } = {}) {
  delete memory.fingerprint;
  delete memory.id;
  try { storageOr(storage)?.removeItem(CLIENT_REQUEST_ID_KEY); } catch { /* best-effort */ }
}

/**
 * Cosa fare dopo la creazione. L'esito vero è lo `status` restituito dal server (idempotenza:
 * "vince il primo"), non la corsia cliccata: si avvia SumUp solo per un POP scelto come online.
 */
export function resolveCreateOutcome(status, lane) {
  return status === STATUS_POP && lane === 'online' ? 'start_online' : 'go_status';
}

// ─── messaggi di errore per il cliente ───────────────────────────────────────────────────────

const ERROR_MESSAGES = [
  ['online_payment_expired', 'Il tempo per pagare online è finito. Puoi pagare al banco.'],
  ['order_payment_abandoned', PAYMENT_ABANDONED_MESSAGE],
  ['switch_to_counter_uncertain', 'Non riusciamo a confermare il passaggio al banco. Riprova tra qualche secondo.'],
  ['order_already_paid', 'Questo ordine risulta già pagato.'],
  ['order_cancelled', 'Questo ordine è stato annullato.'],
  ['kitchen_closed', 'LA CUCINA È CHIUSA — NON PUOI INVIARE ORDINI ORA'],
  // RITIRO AL WALRUS (RPC v3, 20261028121000).
  ['pickup_slot_in_past', "Quell'orario di ritiro è già passato: scegline un altro."],
  ['invalid_pickup_slot', 'Orario di ritiro non valido: scegline un altro tra quelli proposti.'],
];

/** true se l'errore di creazione riguarda l'orario di ritiro: la UI lo azzera e lo fa riscegliere. */
export function isPickupSlotError(err) {
  const raw = typeof err === 'string' ? err : (err?.message || err?.error || '');
  return raw.includes('pickup_slot_in_past') || raw.includes('invalid_pickup_slot');
}

/** Mappa un errore (stringa, Error, body API) in un messaggio cliente. Mai testo tecnico grezzo. */
export function onlineErrorMessage(err, fallback = 'Qualcosa non ha funzionato — riprova.') {
  const raw = typeof err === 'string' ? err : (err?.message || err?.error || '');
  const hit = ERROR_MESSAGES.find(([code]) => raw.includes(code));
  if (hit) return hit[1];
  if (err instanceof TypeError || /failed to fetch|network|load failed|offline/i.test(raw)) {
    return 'Connessione assente. Riprova tra poco.';
  }
  return fallback;
}

/**
 * Messaggio per un errore dell'endpoint PAGA AL BANCO (`body` = JSON di risposta o Error di rete).
 * `switch_to_counter_uncertain` con `retryable: false` non invita a riprovare.
 */
export function switchErrorMessage(body) {
  const code = typeof body === 'string' ? body : (body?.error || '');
  if (code === 'switch_to_counter_uncertain') {
    return body?.retryable === false
      ? 'Non riusciamo a completare il passaggio al banco. Chiedi aiuto alla cassa mostrando questa schermata.'
      : 'Non riusciamo a confermare il passaggio al banco. Riprova tra qualche secondo.';
  }
  if (code === 'missing_session' || code === 'invalid_session' || code === 'not_order_owner') {
    return 'Sessione ordine non riconosciuta su questo dispositivo. Chiedi aiuto alla cassa.';
  }
  if (code === 'order_not_pending_online_payment') {
    return 'Lo stato dell\'ordine è cambiato. Aggiorna la pagina.';
  }
  if (ERROR_MESSAGES.some(([c]) => c === code)) return onlineErrorMessage(code);
  if (body instanceof TypeError) return onlineErrorMessage(body);
  return 'Non riusciamo a passare al banco ora. Riprova tra qualche secondo.';
}

// ─── ordini PA nascosti dal cliente (solo su questo dispositivo) ─────────────────────────────

export const HIDDEN_ORDERS_KEY = 'walbox_kitchen_hidden_abandoned_ids';
const HIDDEN_MAX = 50;

export function readHiddenOrderIds(storage) {
  try {
    const parsed = JSON.parse(storageOr(storage)?.getItem(HIDDEN_ORDERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

export function hideOrderId(id, storage) {
  if (!id) return;
  try {
    const next = [id, ...readHiddenOrderIds(storage).filter((x) => x !== id)].slice(0, HIDDEN_MAX);
    storageOr(storage)?.setItem(HIDDEN_ORDERS_KEY, JSON.stringify(next));
  } catch { /* best-effort: al peggio il PA resta visibile */ }
}

/**
 * Carrello (formato saveCart) per RIFAI L'ORDINE: stessi piatti e ritiro dell'ordine PA, nota non
 * riportata. Se nel carrello c'è già qualcosa (`existingCart`, da loadCart) le quantità si sommano
 * e restano nota/ritiro già scelti: il carrello in corso non si butta.
 */
export function buildRebuildCart(order, existingCart) {
  const items = (order?.items ?? [])
    .filter((i) => typeof i?.itemId === 'string' && i.itemId && Number(i.quantity) >= 1)
    .map((i) => ({ id: i.itemId, baseId: i.itemId, qty: Math.floor(Number(i.quantity)) }));
  const existingItems = existingCart?.items ?? [];
  if (!existingItems.length) {
    // Un ritiro con orario torna come RITIRO (valore UI 'pickup'): l'orario, se ormai passato,
    // lo scarta loadCart e il cliente lo risceglie.
    if (order?.pickupSlot) return { items, note: '', fulfillmentType: 'pickup', pickupSlot: order.pickupSlot };
    return { items, note: '', fulfillmentType: order?.fulfillmentType ?? null };
  }
  const merged = existingItems.map((l) => ({ ...l }));
  for (const line of items) {
    const hit = merged.find((l) => l.id === line.id);
    if (hit) hit.qty = Math.min(99, hit.qty + line.qty);
    else merged.push(line);
  }
  return {
    items: merged,
    note: existingCart?.note ?? '',
    fulfillmentType: existingCart?.fulfillmentType ?? order?.fulfillmentType ?? null,
    pickupSlot: existingCart?.fulfillmentType ? (existingCart?.pickupSlot ?? null) : null,
  };
}
