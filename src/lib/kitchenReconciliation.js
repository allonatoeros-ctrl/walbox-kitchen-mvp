// K6 — "Da riconciliare" (ai-ops/current/KITCHEN_K6_PIANO.md). Regole pure, nessun accesso a rete/DB.
//
// Fonti: righe di kitchen_action_log con metadata.needs_manual_reconciliation = true scritte dalle RPC
// di pagamento (K2) e dalla sweep (K6-b). Chiusure: righe della tabella append-only proposta
// `kitchen_reconciliation_resolutions` (solo manager, controllo lato server nella RPC).
//
// Decisioni di Eros (2026-11-08): nessun rimborso automatico; una notifica ripetuta NON e' mai un doppio
// incasso; chiudere una segnalazione e' un'azione del manager con autore, data, esito e motivazione.

export const RECONCILIATION_ACTIONS = Object.freeze([
  'payment_confirm_lost_race',
  'payment_confirmed_after_cancel',
  'payment_confirmed_after_abandon',
  'payment_confirmed_amount_mismatch',
  'payment_late_unverified',
]);

export const CATEGORY = Object.freeze({
  DOUBLE_CHARGE: 'double_charge',
  TO_VERIFY: 'to_verify',
  PAID_AFTER_CLOSE: 'paid_after_close',
  REPEATED_NOTIFICATION: 'repeated_notification',
});

export const CATEGORY_INFO = Object.freeze({
  [CATEGORY.DOUBLE_CHARGE]: {
    label: 'Doppio incasso',
    tone: 'red',
    instruction: "Rimborsa il pagamento online dall'app SumUp (cerca il riferimento). Non usare \"Rimborsa\" di Walbox.",
  },
  [CATEGORY.TO_VERIFY]: {
    label: 'Pagamento da verificare',
    tone: 'amber',
    instruction: "Controlla sull'app SumUp se il pagamento esiste, poi il manager chiude con l'esito.",
  },
  [CATEGORY.PAID_AFTER_CLOSE]: {
    label: 'Pagato dopo annullo / abbandono',
    tone: 'amber',
    instruction: 'Rimborsa con "Rimborsa" di Walbox: la segnalazione si chiude da sola quando il rimborso è registrato.',
  },
  [CATEGORY.REPEATED_NOTIFICATION]: {
    label: 'Notifica ripetuta',
    tone: 'grey',
    instruction: 'Solo informativo: nessun soldo da muovere.',
  },
});

export const RESOLUTION_OUTCOMES = Object.freeze({
  refunded_on_sumup: 'Rimborsato su SumUp',
  verified_not_charged: 'Verificato: nessun addebito',
  refunded_in_walbox: 'Rimborsato in Walbox',
  seen: 'Visto, nessuna azione',
});

export const NOTE_MAX_LENGTH = 140;

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v) => (v == null || v === '' ? null : String(v));
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ultime 6 cifre di un riferimento: mai il riferimento completo in pagina. */
export function refTail(ref) {
  const s = str(ref);
  if (!s) return null;
  return s.length <= 6 ? s : s.slice(-6);
}

/** Categoria di una riga di log. Righe sconosciute/malformate -> "da verificare", mai crash. */
export function categorize(log) {
  const meta = asObject(log?.metadata);
  switch (log?.action) {
    case 'payment_confirm_lost_race':
      if (meta.classification === 'double_charge') return CATEGORY.DOUBLE_CHARGE;
      if (meta.classification === 'duplicate_notification') return CATEGORY.REPEATED_NOTIFICATION;
      return CATEGORY.TO_VERIFY; // unverified_collection o righe pre-K2 senza classification
    case 'payment_confirmed_after_cancel':
    case 'payment_confirmed_after_abandon':
      return CATEGORY.PAID_AFTER_CLOSE;
    default:
      return CATEGORY.TO_VERIFY; // amount_mismatch, late_unverified, sconosciuto
  }
}

/** Chiave dell'incasso a cui la segnalazione si riferisce (per il dedup). */
export function paymentKey(log) {
  const meta = asObject(log?.metadata);
  const ref = str(meta.losing_attempt_id) ?? str(meta.payment_id) ?? str(meta.attempt_id);
  return `${str(log?.order_id) ?? '?'}:${ref ?? `log:${str(log?.id) ?? '?'}`}`;
}

function channelLabel(provider, method) {
  if (provider === 'sumup' || method === 'sumup_online') return 'Online · SumUp';
  if (method === 'cash' || provider === 'cash') return 'Banco · contanti';
  if (method === 'card_counter_manual' || method === 'sumup_pos') return 'Banco · carta/POS';
  return 'Altro';
}

/** Campi mostrabili allo staff: niente UUID completi, payload, actor_id o campi tecnici. */
export function describe(log, { charge = null } = {}) {
  const meta = asObject(log?.metadata);
  const lines = [];
  if (log?.action === 'payment_confirm_lost_race') {
    lines.push({ label: channelLabel(meta.losing_provider, null), amount: num(meta.losing_amount), ref: refTail(meta.losing_provider_ref) });
    lines.push({ label: channelLabel(meta.winning_provider, meta.winning_method), amount: num(meta.winning_amount), ref: null });
  } else if (log?.action === 'payment_confirmed_amount_mismatch') {
    lines.push({ label: 'Online · SumUp', amount: num(meta.payment_amount), ref: refTail(meta.provider_ref) });
    lines.push({ label: 'Totale ordine', amount: num(meta.order_total), ref: null });
  } else if (log?.action === 'payment_late_unverified') {
    lines.push({ label: 'Online · SumUp', amount: num(meta.amount), ref: refTail(meta.provider_ref) });
  } else {
    lines.push({ label: 'Online · SumUp', amount: num(charge?.amount), ref: refTail(meta.provider_ref) });
  }
  return lines;
}

/**
 * Costruisce le segnalazioni per la UI.
 * @param {object} p
 * @param {Array} p.logs righe di kitchen_action_log flaggate
 * @param {Array} [p.resolutions] righe di kitchen_reconciliation_resolutions { source_log_id, outcome, note, resolved_by_label, created_at }
 * @param {Array} [p.payments] righe kitchen_payments degli ordini coinvolti { id, order_id, direction, status, amount }
 * @param {object} [p.orderInfoById] { [order_id]: { order_code, nickname } }
 * @param {number} [p.limit]
 * @returns {{ open: Array, closed: Array, hiddenOpen: number }}
 */
export function buildReconciliationItems({ logs = [], resolutions = [], payments = [], orderInfoById = {}, limit = 50 } = {}) {
  // Prima chiusura valida per log: vale la prima (righe doppie -> card chiusa una volta).
  const resolutionByLog = new Map();
  for (const r of [...resolutions].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const key = str(r?.source_log_id);
    if (key && !resolutionByLog.has(key)) resolutionByLog.set(key, r);
  }

  const chargeById = new Map();
  const refundedByOrder = new Map();
  for (const p of payments) {
    if (p?.direction === 'charge') chargeById.set(str(p.id), p);
    if (p?.direction === 'refund' && p.status === 'succeeded') {
      refundedByOrder.set(str(p.order_id), (refundedByOrder.get(str(p.order_id)) ?? 0) + (num(p.amount) ?? 0));
    }
  }

  // Dedup: una card per incasso. Tra righe dello stesso incasso vince la piu' vecchia (la prima segnalazione),
  // ma una chiusura su una qualunque delle righe chiude la card.
  const groups = new Map();
  for (const log of [...logs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!log || !RECONCILIATION_ACTIONS.includes(log.action)) continue;
    if (asObject(log.metadata).needs_manual_reconciliation !== true && asObject(log.metadata).needs_manual_reconciliation !== 'true') continue;
    const key = paymentKey(log);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  const items = [];
  for (const [key, rows] of groups) {
    const log = rows[0];
    const meta = asObject(log.metadata);
    const category = categorize(log);
    const charge = chargeById.get(str(meta.payment_id)) ?? null;
    const resolution = rows.map((r) => resolutionByLog.get(str(r.id))).find(Boolean) ?? null;

    let closedBy = null;
    if (resolution) {
      closedBy = { kind: 'manager', outcome: resolution.outcome, outcomeLabel: RESOLUTION_OUTCOMES[resolution.outcome] ?? 'Chiusa', note: str(resolution.note), who: str(resolution.resolved_by_label) ?? 'Manager', at: resolution.created_at, verifiedOnSumup: false };
    } else if (category === CATEGORY.PAID_AFTER_CLOSE && charge && num(charge.amount) != null) {
      const refunded = refundedByOrder.get(str(log.order_id)) ?? 0;
      if (refunded >= num(charge.amount)) closedBy = { kind: 'auto', outcomeLabel: 'Rimborso registrato ✓', at: null, verifiedOnSumup: true };
    }

    const info = orderInfoById[str(log.order_id)] ?? {};
    items.push({
      key,
      logId: str(log.id),
      orderId: str(log.order_id),
      orderCode: str(info.order_code),
      nickname: str(info.nickname),
      createdAt: log.created_at,
      category,
      ...CATEGORY_INFO[category],
      lines: describe(log, { charge }),
      closedBy,
    });
  }

  const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));
  const openAll = items.filter((i) => !i.closedBy).sort(byNewest);
  const closed = items.filter((i) => i.closedBy).sort(byNewest);
  return { open: openAll.slice(0, limit), closed, hiddenOpen: Math.max(0, openAll.length - limit) };
}

/** Ordini con una card K6 aperta: la drift "DA CONTROLLARE" dello stesso ordine si nasconde. */
export function orderIdsWithOpenItems(items) {
  return new Set((items ?? []).map((i) => i.orderId).filter(Boolean));
}

/** Validazione lato client della chiusura (il server la ripete nella RPC). */
export function validateResolution({ outcome, note } = {}) {
  if (!Object.hasOwn(RESOLUTION_OUTCOMES, outcome ?? '')) return { ok: false, error: 'Scegli un esito.' };
  const n = (note ?? '').trim();
  if (n.length === 0) return { ok: false, error: 'Scrivi una motivazione.' };
  if (n.length > NOTE_MAX_LENGTH) return { ok: false, error: `Motivazione troppo lunga (max ${NOTE_MAX_LENGTH}).` };
  return { ok: true, outcome, note: n };
}

// Errori della RPC kitchen_reconciliation_resolve (testo esatto del RAISE) -> messaggio semplice per lo staff.
export const RESOLVE_ERROR_MESSAGES = Object.freeze({
  not_authenticated: 'Sessione scaduta — rientra e riprova.',
  not_manager_for_venue: 'Solo il manager può chiudere.',
  already_resolved: 'Questa segnalazione è già stata chiusa da un altro manager o con un altro esito. Aggiorna la pagina.',
  legacy_item_not_verifiable: 'Segnalazione vecchia (prima del nuovo controllo): non si può chiudere da qui.',
  not_a_reconciliation_item: 'Questa riga non è una segnalazione da chiudere.',
  source_log_not_found: 'Segnalazione non trovata — aggiorna la pagina.',
  no_walbox_refund_found: 'Nessun rimborso Walbox registrato per questo ordine.',
  invalid_outcome: 'Scegli un esito.',
  invalid_note: `Scrivi una motivazione (max ${NOTE_MAX_LENGTH} caratteri).`,
  invalid_refund_ref: 'Riferimento SumUp: solo lettere e numeri, massimo 6.',
});

/** Messaggio italiano per un errore della chiusura; sconosciuto -> generico (mai il testo tecnico). */
export function resolveErrorMessage(message) {
  const msg = String(message ?? '');
  const known = Object.keys(RESOLVE_ERROR_MESSAGES).find((k) => msg.includes(k));
  return known ? RESOLVE_ERROR_MESSAGES[known] : 'Chiusura non riuscita — riprova.';
}

export const ALREADY_PAID_ONLINE_MESSAGE = 'Già pagato online con SumUp — NON incassare. Se hai già preso i soldi, restituiscili al cliente.';

/**
 * Vero se INCASSA al banco ha ricevuto indietro un charge online gia' riuscito (K2 D1: record_counter
 * restituisce il charge esistente invece di incassare di nuovo).
 */
export function isAlreadyPaidOnline(returnedCharge, requestedMethod) {
  const row = asObject(returnedCharge);
  const counterRequested = requestedMethod === 'cash' || requestedMethod === 'card_counter_manual';
  // Solo l'online: un charge SumUp POS al banco (channel 'counter') non e' "gia' pagato online".
  const online = row.channel === 'app' || row.method === 'sumup_online';
  return counterRequested && online && row.status === 'succeeded' && row.direction !== 'refund';
}
