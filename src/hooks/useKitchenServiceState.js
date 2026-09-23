import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const VENUE_ID = 'walrus-main';
const LS_KEY = 'walbox_kitchen_service_state';
const POLL_MS = 20000;

// Stesso pattern di useKitchenMenu.js: cache locale come default veloce/resiliente, override
// dalla lettura Supabase quando disponibile. Nessuna riga per il venue = APERTA (mai bloccare i
// clienti per un dato mancante — stessa regola del guard server-side in
// 20260923130000_kitchen_service_state_v1.sql).
function loadCachedOpen() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.isOpen === 'boolean') return parsed.isOpen;
    }
  } catch {}
  return true;
}

function saveCachedOpen(isOpen) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ isOpen }));
  } catch {}
}

async function fetchServiceState() {
  const { data, error } = await supabase
    .from('kitchen_service_state')
    .select('is_open')
    .eq('venue_id', VENUE_ID)
    .maybeSingle();
  if (error) throw error;
  return data ? data.is_open !== false : true;
}

/**
 * Stato APERTA/CHIUSA della cucina — condiviso da cliente (solo lettura) e staff
 * (lettura + scrittura). Persistente e server-side (tabella kitchen_service_state); questo hook
 * e' solo la superficie client, l'enforcement reale e' la RPC kitchen_customer_create_order.
 *
 * setKitchenOpen segue lo stesso principio P0-A di useKitchenOrders: nessun successo finto. Lo
 * stato locale cambia SOLO dopo che Supabase conferma la scrittura; su errore ritorna
 * { ok:false, error } e lascia isOpen invariato.
 */
export function useKitchenServiceState() {
  const [isOpen, setIsOpen] = useState(loadCachedOpen);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState(null);

  // Non memoizzata (stesso pattern di fetchSupabaseOrders in useKitchenOrders.js): ridefinita a
  // ogni render, usata dagli effect sotto con deps [] — identico compromesso gia' accettato nel
  // resto del file hooks di Kitchen.
  const refresh = async () => {
    try {
      const open = await fetchServiceState();
      setIsOpen(open);
      saveCachedOpen(open);
    } catch (err) {
      console.warn('[Walbox] kitchen_service_state read failed — uso cache locale', err);
    }
  };

  // Fetch iniziale (stesso pattern del primo effect fetchSupabaseOrders in useKitchenOrders.js).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  // Cross-tab sync + poll + refresh on focus/visibility: nessuna chiamata diretta a refresh() nel
  // corpo dell'effect, solo dentro i callback di listener/interval (stesso pattern del secondo
  // effect in useKitchenOrders.js, che usa setInterval allo stesso modo).
  useEffect(() => {
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    const onStorage = (e) => { if (e.key === LS_KEY) setIsOpen(loadCachedOpen()); };
    const interval = setInterval(refresh, POLL_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setKitchenOpen = async (nextOpen) => {
    setWriting(true);
    setWriteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.is_anonymous) {
        throw new Error('staff_session_required');
      }
      const { error } = await supabase
        .from('kitchen_service_state')
        .upsert(
          {
            venue_id: VENUE_ID,
            is_open: nextOpen,
            updated_at: new Date().toISOString(),
            updated_by: session.user.id,
          },
          { onConflict: 'venue_id' }
        );
      if (error) throw error;
      setIsOpen(nextOpen);
      saveCachedOpen(nextOpen);
      return { ok: true };
    } catch (err) {
      console.warn('[Walbox] kitchen_service_state write failed', err);
      setWriteError(err);
      return { ok: false, error: err };
    } finally {
      setWriting(false);
    }
  };

  return { isOpen, setKitchenOpen, writing, writeError, refresh };
}
