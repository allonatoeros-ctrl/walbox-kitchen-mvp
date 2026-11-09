// WALRUS FOOD CLUB V1 — iscrizione/accesso col numero (F0 §3, PWA spec §5).
//  1. Anonimo + numero nuovo: updateUser({phone}) + OTP 'phone_change' => STESSO uid (ordini e push restano).
//  2. Numero già registrato (phone_exists) o dispositivo nuovo: biglietto di unione (se l'anonimo ha ordini),
//     signInWithOtp + OTP 'sms' => uid del membro, poi riscatto del biglietto (ordini e push dell'anonimo passano).
// Nessun SMS parte senza provider configurato in Supabase Auth (gate di Eros). Il biglietto vive solo in memoria.
import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureCustomerSession, foodClubApi } from '../lib/foodClubApi';
import { requestOtp, confirmOtp } from '../lib/foodClubOtp';

export function useFoodClubIdentity() {
  const [step, setStep] = useState('phone'); // phone | code | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(null);
  const modeRef = useRef(null); // 'phone_change' | 'sms'
  const ticketRef = useRef(null);

  // Flusso e traduzione errori in src/lib/foodClubOtp.js (testati con node --test).
  const sendCode = useCallback(async (rawPhone) => {
    setError(null);
    setBusy(true);
    ticketRef.current = null;
    try {
      const res = await requestOtp({
        rawPhone,
        auth: supabase.auth,
        ensureSession: ensureCustomerSession,
        createMergeTicket: (e164) => foodClubApi.createMergeTicket(e164),
      });
      if (!res.ok) { setError(res.error); return false; }
      modeRef.current = res.mode;
      ticketRef.current = res.ticket;
      setPhone(res.phone);
      setStep('code');
      foodClubApi.track('otp_sent', res.mode);
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  // Ritorna { ok, merged } ; dopo ok la sessione è quella del numero verificato.
  const verifyCode = useCallback(async (code) => {
    setError(null);
    setBusy(true);
    try {
      const res = await confirmOtp({
        phone, code, mode: modeRef.current, ticket: ticketRef.current,
        auth: supabase.auth,
        redeemMergeTicket: (t) => foodClubApi.redeemMergeTicket(t),
      });
      if (!res.ok) { setError(res.error); return { ok: false }; }
      ticketRef.current = null;
      setStep('done');
      foodClubApi.track('login_done', modeRef.current);
      return { ok: true, merged: res.merged, mode: modeRef.current };
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const reset = useCallback(() => { setStep('phone'); setError(null); setPhone(null); ticketRef.current = null; }, []);

  // "Esci da questo telefono": la push non arriva a chi usa il telefono dopo (spec §5.4).
  const signOutDevice = useCallback(async (deactivatePush) => {
    try { if (deactivatePush) await deactivatePush(); } catch { /* best effort */ }
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return { step, busy, error, phone, sendCode, verifyCode, reset, signOutDevice };
}
