// Regola di servizio condivisa (BEER SPRINT V1 §3/§7-E): le birre `evening_only` diventano
// ordinabili solo dalle 18:00 locali del device. Unica fonte del gate: BirreSection.jsx e il
// selettore birra di FALLO PESANTE (PesiMassimiSection.jsx) lo importano da qui — mai duplicato.
// Dopo la rimozione di Krombacher (correzione Eros, 2026-09-22) nessuna delle 6 birre rimaste
// usa `evening_only` (tutte `all_day`): la regola resta infrastruttura viva per birre future.

export const EVENING_SERVICE_START_HOUR = 18;

export function isEveningServiceActive(date = new Date()) {
  return date.getHours() >= EVENING_SERVICE_START_HOUR;
}

// P0-2 (2026-09-16) — la birra scelta in FALLO PESANTE deve arrivare in cucina.
//
// Il payload per-item della RPC e' chiuso: `kitchen_customer_create_order` proietta
// `jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)` e riscrive `name`/`price`
// dal catalogo (20260913130000). Quindi ne' `includesBeerId` ne' il nome composito costruito da
// PesiMassimiSection sopravvivono: la comanda diceva solo "Pulled Pork - Fallo Pesante" e lo staff
// non sapeva quale birra spillare.
//
// Canale usato: `customer_note` -> `p_customer_note` -> `kitchen_orders.customer_note` -> `note`
// (useKitchenOrders.mapSupabaseOrder) -> card "MODIFICHE / NOTE" di /kitchen/solo. Tutti campi
// esistenti, nessuna migration, nessun id composito nel payload (l'allowlist promo su
// item-040/041/042 resta intatta) e nessuna riga catalogo a prezzo 0 da poter ordinare gratis.
//
// Il nome della birra e' risolto da `includesBeerId` sul catalogo, MAI ricavato dal nome della
// riga carrello: nessun parsing fragile.
export const INCLUDED_BEER_NOTE_PREFIX = 'BIRRA INCLUSA';

export function buildIncludedBeersNote(orderItems, menuItems) {
  const comboLines = (orderItems ?? []).filter((o) => o.includesBeerId);
  if (comboLines.length === 0) return '';
  // Piu' combo con la stessa birra nello stesso carrello vanno sommati, non ripetuti.
  const byBeer = new Map();
  comboLines.forEach((line) => {
    byBeer.set(line.includesBeerId, (byBeer.get(line.includesBeerId) ?? 0) + (line.qty ?? 1));
  });
  const parts = [...byBeer.entries()].map(([beerId, qty]) => {
    const beer = (menuItems ?? []).find((m) => m.id === beerId);
    const label = (beer?.name ?? beerId).toUpperCase();
    return qty > 1 ? `${qty}x ${label}` : label;
  });
  return `\u{1F37A} ${INCLUDED_BEER_NOTE_PREFIX}: ${parts.join(' \u00B7 ')}`;
}

// ============================================================================
// SERATA (giornata operativa) — fonte unica lato client.
//
// `kitchen_orders.service_day` NON e' utilizzabile come filtro della serata: il DB lo fissa a
// `timezone('Europe/Rome', now())::date`, quindi scatta a MEZZANOTTE e spacca in due una serata
// che al Walrus finisce ben dopo le 00:00 (finding live, serata del 2026-09-18). `service_day`
// resta invariato e continua a governare la numerazione ordini — fuori scope qui.
//
// Definizione adottata: la serata del giorno X va dalle 06:00 (Europe/Rome) del giorno X alle
// 05:59:59.999 del giorno X+1. Il filtro e' su `created_at` dell'ORDINE, mai su `service_day` e
// mai sul `created_at` del pagamento: cosi' un incasso registrato all'01:30 su un ordine delle
// 23:40 resta nella serata a cui appartiene, ed e' la stessa finestra per Storico e Cassa.
// ============================================================================

export const SERVICE_TIME_ZONE = 'Europe/Rome';
export const SERVICE_NIGHT_CUTOFF_HOUR = 6;

const ROME_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function romeParts(date) {
  const p = Object.fromEntries(ROME_PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  // en-GB rende mezzanotte come '24' invece di '00' in alcune versioni di ICU.
  const hour = Number(p.hour) % 24;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour };
}

// Offset di Roma (ms) nell'istante dato: differenza tra l'orologio da muro di Roma letto come
// se fosse UTC e l'istante reale. Deve essere calcolato sull'istante, non sulla data: in Italia
// vale +1h d'inverno e +2h d'estate.
function romeOffsetMs(date) {
  const p = Object.fromEntries(ROME_PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return asIfUtc - date.getTime();
}

// Istante UTC corrispondente a un orario da muro di Roma. Doppio passaggio: la prima stima usa
// l'offset nell'istante sbagliato, la seconda lo ricalcola sull'istante corretto. Il cutoff delle
// 06:00 non cade mai dentro il salto DST italiano (02:00 -> 03:00), quindi converge sempre.
function romeWallClockToInstant(year, month, day, hour) {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  let instant = wallAsUtc - romeOffsetMs(new Date(wallAsUtc));
  instant = wallAsUtc - romeOffsetMs(new Date(instant));
  return instant;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addDays(year, month, day, delta) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Finestra della serata che contiene `now` (default: adesso).
 * Ritorna { night: 'YYYY-MM-DD', start, end, startIso, endIso } dove `night` e' il giorno di
 * APERTURA della serata e [start, end) sono istanti assoluti (ms epoch), estremo destro escluso.
 */
export function serviceNightWindow(now = new Date()) {
  const p = romeParts(now instanceof Date ? now : new Date(now));
  // Prima del cutoff si e' ancora nella serata aperta il giorno precedente.
  const open = p.hour < SERVICE_NIGHT_CUTOFF_HOUR
    ? addDays(p.year, p.month, p.day, -1)
    : { year: p.year, month: p.month, day: p.day };
  const close = addDays(open.year, open.month, open.day, 1);

  const start = romeWallClockToInstant(open.year, open.month, open.day, SERVICE_NIGHT_CUTOFF_HOUR);
  const end = romeWallClockToInstant(close.year, close.month, close.day, SERVICE_NIGHT_CUTOFF_HOUR);

  return {
    night: `${open.year}-${pad2(open.month)}-${pad2(open.day)}`,
    start,
    end,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

/**
 * Finestra di una serata NOTA ('YYYY-MM-DD' = giorno di apertura). Serve a far derivare a
 * Storico e Cassa la stessa finestra da un unico valore: l'orologio sta in useKitchenPayments,
 * che lo riaggiorna a ogni poll, cosi' le due viste non possono sfasarsi nemmeno se lo Storico
 * resta aperto a cavallo delle 06:00.
 */
export function serviceNightWindowFor(night) {
  if (!night) return serviceNightWindow();
  const [year, month, day] = String(night).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return serviceNightWindow();
  const close = addDays(year, month, day, 1);
  const start = romeWallClockToInstant(year, month, day, SERVICE_NIGHT_CUTOFF_HOUR);
  const end = romeWallClockToInstant(close.year, close.month, close.day, SERVICE_NIGHT_CUTOFF_HOUR);
  return { night: `${year}-${pad2(month)}-${pad2(day)}`, start, end, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

/**
 * Sposta una serata nota di `deltaDays` giorni (interi, puo' essere negativo). Pura funzione di
 * calendario, nessuna conversione fuso orario: la serata resta identificata dal suo giorno di
 * apertura ('YYYY-MM-DD'), stesso pattern di `addDays` sopra ma esposto per il selettore UI
 * (Kitchen Analytics V1 — selettore service night, Gate 1 approvato da Eros 2026-09-21).
 */
export function shiftServiceNight(night, deltaDays) {
  const base = night ? String(night).slice(0, 10) : serviceNightWindow().night;
  const [year, month, day] = base.split('-').map(Number);
  const shifted = addDays(year, month, day, deltaDays);
  return `${shifted.year}-${pad2(shifted.month)}-${pad2(shifted.day)}`;
}

// True se il timestamp appartiene alla serata. Confronto su istanti, mai tra stringhe: Supabase
// serializza i timestamptz come '...+00:00', non come '...Z', e un confronto lessicografico
// sbaglierebbe.
export function isInServiceNight(timestamp, window) {
  if (!timestamp || !window) return false;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return false;
  return t >= window.start && t < window.end;
}

// 'YYYY-MM-DD' -> 'GG/MM' per la UI. Mai passare da new Date(): reinterpreterebbe in UTC.
export function formatServiceNightLabel(night) {
  if (!night) return '';
  const [, month, day] = String(night).slice(0, 10).split('-');
  return month && day ? `${day}/${month}` : '';
}

/**
 * Cassa della serata. UNICA sorgente del denaro: kitchen_payments.
 * - incasso   = charge succeeded
 * - rimborsato = refund succeeded
 * - netto     = incasso - rimborsato
 * Tentativi initiated/pending e failed non sono incasso: restano contatori operativi separati.
 * `order.total` non entra mai qui: e' il valore della comanda, non un incasso.
 */
export function summarizeServiceNightPayments(rows) {
  let incasso = 0;
  let rimborsato = 0;
  let inSospeso = 0;
  let falliti = 0;
  let incassiRiusciti = 0;
  (rows ?? []).forEach((r) => {
    const amount = Number(r.amount) || 0;
    if (r.direction === 'charge' && r.status === 'succeeded') {
      incasso += amount;
      incassiRiusciti += 1;
    } else if (r.direction === 'refund' && r.status === 'succeeded') {
      rimborsato += amount;
    } else if (r.status === 'initiated' || r.status === 'pending') {
      inSospeso += amount;
    } else if (r.status === 'failed') {
      falliti += 1;
    }
  });
  // Arrotondamento a 2 decimali solo sull'aggregato: sommare float e' esatto abbastanza per
  // importi in euro a 2 cifre, ma il residuo binario non deve arrivare alla UI.
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    incasso: round2(incasso),
    rimborsato: round2(rimborsato),
    netto: round2(incasso - rimborsato),
    inSospeso: round2(inSospeso),
    falliti,
    incassiRiusciti,
  };
}

const SUMUP_METHODS = new Set(['sumup_online', 'sumup_pos']);

/**
 * Cassa della serata per metodo di pagamento (kitchen_payments.method). Stesse righe e stessa
 * finestra di summarizeServiceNightPayments: la somma di incasso/rimborsato/netto su tutti i
 * metodi deve combaciare esattamente con quella funzione per le stesse righe (vincolo di
 * coerenza incrociata, Kitchen Analytics V1 AC3). Un solo posto di verita, due letture: la
 * tabella "CONTROLLO SERATA/CASSA" e il chart Mix pagamento leggono da qui.
 * `sumup` conta i tentativi (non gli importi) sui soli metodi sumup_online/sumup_pos: initiated
 * e pending sono entrambi "in corso", coerente col trattamento di inSospeso sopra.
 * `count` (Fase 7, MIX PAGAMENTI) e' il numero di pagamenti charge succeeded per metodo — stesso
 * filtro che alimenta `incasso`, nessun nuovo giro sulle righe.
 */
export function summarizePaymentsByMethod(rows) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const byMethod = {};
  const sumup = { succeeded: 0, pending: 0, failed: 0 };

  (rows ?? []).forEach((r) => {
    const method = r.method ?? 'unknown';
    const amount = Number(r.amount) || 0;
    if (!byMethod[method]) byMethod[method] = { incasso: 0, rimborsato: 0, netto: 0, count: 0 };
    if (r.direction === 'charge' && r.status === 'succeeded') {
      byMethod[method].incasso += amount;
      byMethod[method].count += 1;
    } else if (r.direction === 'refund' && r.status === 'succeeded') {
      byMethod[method].rimborsato += amount;
    }
    if (SUMUP_METHODS.has(method)) {
      if (r.status === 'succeeded') sumup.succeeded += 1;
      else if (r.status === 'initiated' || r.status === 'pending') sumup.pending += 1;
      else if (r.status === 'failed') sumup.failed += 1;
    }
  });

  Object.keys(byMethod).forEach((method) => {
    const m = byMethod[method];
    m.incasso = round2(m.incasso);
    m.rimborsato = round2(m.rimborsato);
    m.netto = round2(m.incasso - m.rimborsato);
  });

  return { byMethod, sumup };
}

/**
 * Kitchen Analytics V1 — Fase 5 (VENDITE PER FASCIA ORARIA).
 * Bucket da `bucketHours` ore sulla finestra di serata [night.start, night.end), su
 * `order.createdAt` degli ordini `delivered` (stesso filtro di `reportOggi` in StoricoView).
 * `value` e' la somma di `order.total` nel bucket: e' il "valore ordini" (valore della comanda),
 * MAI l'incasso — stessa distinzione di `summarizeServiceNightPayments` sopra, order.total non
 * entra mai come incasso. Un incasso per bucket richiederebbe una join contro kitchen_payments per
 * singolo pagamento con la sua data, dato non disponibile oggi senza una nuova query (fuori scope
 * Fase 5: "nessuna nuova query se non esplicitamente necessaria").
 * Nessun ordine perso: gli ordini fuori dai bucket attesi (notti >24h per cambio ora legale) sono
 * assorbiti nell'ultimo bucket, mai scartati.
 */
export function bucketOrdersByServiceNight(orders, night, bucketHours = 2) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const bucketMs = bucketHours * 3600000;
  const bucketCount = Math.ceil(24 / bucketHours);

  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const startMs = night.start + i * bucketMs;
    const startHour = romeParts(new Date(startMs)).hour;
    const endHour = (startHour + bucketHours) % 24;
    buckets.push({ label: `${pad2(startHour)}-${pad2(endHour)}`, count: 0, value: 0 });
  }

  (orders ?? []).forEach((o) => {
    if (o.status !== 'delivered') return;
    if (!isInServiceNight(o.createdAt, night)) return;
    const t = new Date(o.createdAt).getTime();
    let idx = Math.floor((t - night.start) / bucketMs);
    if (idx < 0) idx = 0;
    if (idx >= buckets.length) idx = buckets.length - 1;
    buckets[idx].count += 1;
    buckets[idx].value += Number(o.total) || 0;
  });

  buckets.forEach((b) => { b.value = round2(b.value); });
  return buckets;
}

/**
 * Kitchen Analytics V1 — Fase 5 follow-up v2 (VENDITE PER FASCIA ORARIA, solo visualizzazione).
 * Il Walrus opera solo a PRANZO (12-15, granularità 1h — volume basso, il dettaglio ora-per-ora è
 * più leggibile di un bucket da 2h) e SERA/NOTTE (18-02, granularità 2h, invariata dalla Fase 5).
 * Tutte le altre fasce sono chiusura e vengono escluse dal grafico per design, non azzerate: un
 * ordine `delivered` fuori da queste fasce non sparisce dagli altri totali (KPI/Top
 * prodotti-categorie/AC6 restano su `bucketOrdersByServiceNight`/`isInServiceNight` invariate),
 * semplicemente non compare in QUESTO grafico. Offset in ore rispetto a `night.start` (06:00),
 * non ore-di-parete, per rappresentare senza ambiguità le fasce a cavallo di mezzanotte (00-02).
 */
export const WALRUS_SERVICE_HOUR_RANGES = [
  { label: '12-13', offsetStart: 6, offsetEnd: 7 },
  { label: '13-14', offsetStart: 7, offsetEnd: 8 },
  { label: '14-15', offsetStart: 8, offsetEnd: 9 },
  { label: '18-20', offsetStart: 12, offsetEnd: 14 },
  { label: '20-22', offsetStart: 14, offsetEnd: 16 },
  { label: '22-00', offsetStart: 16, offsetEnd: 18 },
  { label: '00-02', offsetStart: 18, offsetEnd: 20 },
];

export function bucketOrdersByWalrusServiceHours(orders, night) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const buckets = WALRUS_SERVICE_HOUR_RANGES.map((r) => ({ label: r.label, count: 0, value: 0 }));

  (orders ?? []).forEach((o) => {
    if (o.status !== 'delivered') return;
    if (!isInServiceNight(o.createdAt, night)) return;
    const offsetHours = (new Date(o.createdAt).getTime() - night.start) / 3600000;
    const idx = WALRUS_SERVICE_HOUR_RANGES.findIndex(
      (r) => offsetHours >= r.offsetStart && offsetHours < r.offsetEnd
    );
    if (idx === -1) return; // fuori dalle fasce operative Walrus, escluso da questo grafico per design
    buckets[idx].count += 1;
    buckets[idx].value += Number(o.total) || 0;
  });

  buckets.forEach((b) => { b.value = round2(b.value); });
  return buckets;
}

/**
 * Kitchen Analytics V1 — Fase 6 (TOP PRODOTTI + TOP CATEGORIE).
 * Aggrega `order.items[].name/quantity` sui soli ordini `delivered` della finestra serata
 * corrente (stesso filtro di `bucketOrdersByServiceNight`/`reportOggi`), nessuna nuova query.
 * Prodotto -> categoria: join client-side contro `menuItems` (catalogo Kitchen esistente,
 * `kitchenMenuItems`) per `itemId` quando presente sull'item d'ordine, altrimenti per `name`
 * esatto. Un item non mappabile al catalogo finisce nel bucket esplicito `NON_MAPPED_CATEGORY`
 * — mai una categoria inventata, la quantita' resta comunque contata nel totale.
 */
export const NON_MAPPED_CATEGORY = 'non mappato';

// Mapping esplicito per item che non possono essere risolti su `kitchenMenuItems`:
// - item-040/041/042 sono i tre combo FALLO PESANTE, che vivono in `kitchenPesiMassimiCombos`
//   (mai nel catalogo standalone) e appartengono ai Pesi Massimi (`bbq`);
// - item-057 (Krombacher Pils) è stato rimosso dal catalogo cliente ma gli ordini storici
//   restano `birre`.
// `kitchenMenuItems` resta il lookup principale per tutto il resto; questa tabella copre solo
// gli ID noti e non introduce alcuna euristica sul nome.
const CATEGORY_BY_ITEM_ID = {
  'item-040': 'bbq',
  'item-041': 'bbq',
  'item-042': 'bbq',
  'item-057': 'birre',
};

export function computeTopProductsAndCategories(orders, night, menuItems = [], topN = 5) {
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const byName = new Map(menuItems.map((m) => [m.name, m]));

  const productCounts = {};
  const categoryCounts = {};

  (orders ?? []).forEach((o) => {
    if (o.status !== 'delivered') return;
    if (!isInServiceNight(o.createdAt, night)) return;
    (o.items ?? []).forEach((i) => {
      const qty = Number(i.quantity) || 0;
      if (qty <= 0 || !i.name) return;
      productCounts[i.name] = (productCounts[i.name] ?? 0) + qty;

      const menuItem = (i.itemId && byId.get(i.itemId)) || byName.get(i.name);
      const category =
        (i.itemId && CATEGORY_BY_ITEM_ID[i.itemId]) || menuItem?.category || NON_MAPPED_CATEGORY;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + qty;
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, quantity]) => ({ name, quantity }));

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, quantity]) => ({ category, quantity }));

  return { topProducts, topCategories };
}
