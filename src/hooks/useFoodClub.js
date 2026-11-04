// WALRUS FOOD CLUB V1 — stato del Club per il cliente corrente.
// Si ricarica a ogni cambio di sessione (iscrizione, accesso da altro dispositivo, uscita) e al ritorno in primo piano.
// Se il Club è spento (flag build) o le RPC non esistono ancora (migration non applicate): available=false.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { FOOD_CLUB_ENABLED } from '../lib/foodClubConfig';
import { foodClubApi } from '../lib/foodClubApi';

export function useFoodClub({ enabled = FOOD_CLUB_ENABLED } = {}) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const uidRef = useRef(null);
  const reqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const req = ++reqRef.current;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      uidRef.current = session?.user?.id ?? null;
      const next = session ? await foodClubApi.myState() : { session: false, member: false, campaign: await foodClubApi.publicCampaign() };
      if (req === reqRef.current) { setState(next); setError(null); }
      return next;
    } catch (err) {
      if (req === reqRef.current) { setError(err); setState(null); }
      return null;
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const first = setTimeout(refresh, 0);
    const sub = supabase.auth.onAuthStateChange?.((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      // P5 (F0): cambio utente => ricarica tessera e buoni del nuovo uid.
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || (session?.user?.id ?? null) !== uidRef.current) {
        setTimeout(refresh, 0);
      }
    });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      sub?.data?.subscription?.unsubscribe?.();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  const campaignActive = !!state?.campaign?.active;
  const hasRewards = (state?.vouchers ?? []).some((v) => v.status === 'available' || v.status === 'reserved');
  return {
    enabled,
    available: enabled && !error && !!state && (campaignActive || (state.member && hasRewards)),
    loading,
    error,
    state,
    member: !!state?.member,
    refresh,
  };
}
