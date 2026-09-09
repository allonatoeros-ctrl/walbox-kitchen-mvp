import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const VENUE_ID = 'walrus-main';

// Emette il "Personalità Discutibile Pass" per /kitchen/promo. Riusa lo stesso
// pattern di sessione anonima già in produzione per gli ordini Kitchen
// (useKitchenOrders.js:262, CustomerOrderStatus.jsx:178): auth.uid() è
// l'unica identità cliente, il codice è generato e persistito server-side
// dall'RPC kitchen_promo_pass_issue (idempotente per venue+customer+campaign).
export default function usePromoPassIssue() {
  const [state, setState] = useState({
    code: null,
    status: null,
    issuedAt: null,
    loading: true,
    error: null,
  });
  const startedRef = useRef(false);

  const issue = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      if (!session) throw new Error('customer_session_missing');

      const { data, error } = await supabase.rpc('kitchen_promo_pass_issue', {
        p_venue_id: VENUE_ID,
      });
      if (error) throw error;
      if (!data?.code) throw new Error('promo_pass_invalid_response');

      setState({
        code: data.code,
        status: data.status,
        issuedAt: data.issued_at,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        code: null,
        status: null,
        issuedAt: null,
        loading: false,
        error: err?.message ?? 'promo_pass_issue_failed',
      });
    }
  }, []);

  // Parte al mount del componente chiamante (non al mount della scena): il
  // pass è quasi sempre pronto quando l'utente arriva alla Scena 2, nessuna
  // attesa percepita nel caso comune. Il ref evita una doppia chiamata sotto
  // React StrictMode (l'RPC è comunque idempotente, ma non serve raddoppiarla).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    issue();
  }, [issue]);

  return { ...state, retry: issue };
}
