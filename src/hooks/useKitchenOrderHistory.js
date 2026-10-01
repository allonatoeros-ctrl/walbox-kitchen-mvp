import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { serviceNightWindowFor } from '../lib/kitchenServiceRules';
import { mapSupabaseOrder } from './useKitchenOrders';
import { isLiveServiceNight } from './useKitchenPayments';

// P2 — storico ordini on-demand, separato dalla lista LIVE di useKitchenOrders.
//
// Lo Storico (overlay di Solo) legge gli ordini chiusi di UNA serata. La serata corrente e'
// gia' dentro la lista live (finestra 06:00 -> 06:00 + ordini aperti): zero fetch aggiuntive.
// Una serata passata si legge qui, one-shot, con la STESSA finestra (kitchenServiceRules) usata
// da Storico e Cassa: filtro su kitchen_orders.created_at, mai su service_day.
//
// Niente poll e niente Realtime sulle notti passate (dati chiusi, stessa scelta di
// useKitchenPayments); cache per serata nella sessione; la risposta di una richiesta non piu'
// l'ultima viene scartata (stesso principio di fetchSeqRef in useKitchenOrders).

const VENUE_ID = 'walrus-main';
const CLOSED_STATUSES = ['delivered', 'cancelled'];
// Uguale a max_rows di PostgREST: una serata reale e' molto sotto, ma il limite e' esplicito
// cosi' un eventuale troncamento non e' silenzioso (vedi warn sotto).
export const HISTORY_FETCH_LIMIT = 1000;

const EMPTY = [];

// Fetch one-shot degli ordini chiusi di una serata. Esportata per il test mirato P2.
// Ritorna { ok: true, orders } | { ok: true, noSession: true } | { ok: false, error }.
export async function fetchClosedOrdersForNight(night) {
  const win = serviceNightWindowFor(night);

  // Sessione non disponibile = nessuna sessione staff, come per fetchSupabaseOrders: anche un
  // client Supabase non configurato (env mancanti: Preview/Demo/E2E mockati) lancia qui, e in quel
  // caso lo Storico deve restare sul ripiego locale, non mostrare un errore di caricamento.
  let session = null;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch (err) {
    console.warn('[Walbox] Storico ordini: sessione non disponibile — ripiego locale', err);
  }
  if (!session) return { ok: true, noSession: true };

  try {
    const { data, error } = await supabase
      .from('kitchen_orders')
      .select('*, kitchen_order_items(*)')
      .eq('venue_id', VENUE_ID)
      .in('status', CLOSED_STATUSES)
      .gte('created_at', win.startIso)
      .lt('created_at', win.endIso)
      .order('created_at', { ascending: false })
      .limit(HISTORY_FETCH_LIMIT);
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length >= HISTORY_FETCH_LIMIT) {
      console.warn(`[Walbox] Storico ${win.night}: raggiunto il limite di ${HISTORY_FETCH_LIMIT} righe, elenco possibilmente troncato`);
    }
    return { ok: true, orders: rows.map(mapSupabaseOrder) };
  } catch (err) {
    console.warn('[Walbox] Storico ordini read failed', err);
    return { ok: false, error: err };
  }
}

// Loader puro (nessun React): cache per serata, richieste in volo deduplicate e "ultima richiesta
// vince". Estratto dall'hook per poterlo testare senza renderer. `fetchNight` e' iniettabile.
export function createNightHistoryLoader(fetchNight = fetchClosedOrdersForNight) {
  const cache = new Map();     // night -> orders[] (solo successi con dati; mai errori/noSession)
  const inflight = new Map();  // night -> Promise del risultato (StrictMode / stessa notte ripetuta)
  let seq = 0;
  return {
    has: (night) => cache.has(night),
    get: (night) => cache.get(night),
    // Risolve { stale: true } se, mentre la fetch era in volo, e' partita (o e' stata invalidata
    // con cancel()) una richiesta piu' recente: il chiamante NON deve applicare quel risultato.
    async load(night) {
      const mySeq = ++seq;
      let request = inflight.get(night);
      if (!request) {
        request = fetchNight(night).finally(() => inflight.delete(night));
        inflight.set(night, request);
      }
      const result = await request;
      if (mySeq !== seq) return { stale: true };
      if (result.ok && result.orders) cache.set(night, result.orders);
      return result;
    },
    cancel() { seq += 1; },
  };
}

/**
 * `night`: 'YYYY-MM-DD' | null (= serata corrente, segue il rollover 06:00), tipicamente
 * `selectedServiceNight` di useSelectedServiceNight. `liveOrders`: la lista di useKitchenOrders.
 *
 * Ritorna { orders, status } con status 'ready' | 'loading' | 'error':
 *  - serata corrente (anche se scelta esplicitamente): liveOrders, 'ready', nessuna rete;
 *  - serata passata: ordini chiusi di quella finestra, 'loading' finche' la fetch non risponde,
 *    'error' se fallisce (mai dati finti: lista vuota);
 *  - nessuna sessione staff (Preview/Demo/E2E mockati): ripiego locale su liveOrders, 'ready' —
 *    il consumer filtra comunque per finestra, come faceva prima di P2.
 */
export function useKitchenOrderHistory({ night = null, liveOrders } = {}) {
  const live = isLiveServiceNight(night);
  const resolvedNight = live ? null : serviceNightWindowFor(night).night;

  const [loader] = useState(() => createNightHistoryLoader());
  const [cache, setCache] = useState({});                // night -> orders[] (solo successi)
  const [fallback, setFallback] = useState(null);        // { night, kind: 'error' | 'local' }

  useEffect(() => {
    if (resolvedNight === null || loader.has(resolvedNight)) return undefined;

    let active = true;
    // Nuovo tentativo per questa notte: un errore precedente non deve restare a schermo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFallback(null);
    loader.load(resolvedNight).then((result) => {
      // Stale (altra notte richiesta nel frattempo) o effect gia' ripulito: non toccare lo stato.
      if (!active || result.stale) return;
      if (!result.ok) { setFallback({ night: resolvedNight, kind: 'error' }); return; }
      if (result.noSession) { setFallback({ night: resolvedNight, kind: 'local' }); return; }
      setCache((prev) => ({ ...prev, [resolvedNight]: result.orders }));
    });

    return () => {
      // Cambio notte/unmount: invalida la richiesta in volo.
      active = false;
      loader.cancel();
    };
  }, [loader, resolvedNight]);

  if (live) return { orders: liveOrders ?? EMPTY, status: 'ready' };
  if (cache[resolvedNight]) return { orders: cache[resolvedNight], status: 'ready' };
  if (fallback?.night === resolvedNight) {
    return fallback.kind === 'local'
      ? { orders: liveOrders ?? EMPTY, status: 'ready' }
      : { orders: EMPTY, status: 'error' };
  }
  return { orders: EMPTY, status: 'loading' };
}
