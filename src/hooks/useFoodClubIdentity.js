// WALRUS FOOD CLUB V1 — iscrizione/accesso col numero (SMS) o con l'email (codice a 6 cifre), canale da
// FOOD_CLUB_OTP_CHANNEL (F0 §3, PWA spec §5). Sotto si parla di 'numero'; per l'email vale lo stesso con
// updateUser({email}) + 'email_change' / signInWithOtp({email}) + 'email'.
//  1. Anonimo + numero nuovo: updateUser({phone}) + OTP 'phone_change' => STESSO uid (ordini e push restano).
//  2. Numero già registrato (phone_exists) o dispositivo nuovo: biglietto di unione (se l'anonimo ha ordini),
//     signInWithOtp + OTP 'sms' => uid del membro, poi riscatto del biglietto (ordini e push dell'anonimo passano).
// Nessun SMS parte senza provider configurato in Supabase Auth (gate di Eros). Il biglietto vive solo in memoria.
import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureCustomerSession, foodClubApi } from '../lib/foodClubApi';
import { requestOtp, confirmOtp } from '../lib/foodClubOtp';
import { FOOD_CLUB_OTP_CHANNEL } from '../lib/foodClubConfig';

export function useFoodClubIdentity(channel = FOOD_CLUB_OTP_CHANNEL) {
  const isEmail = channel === 'email';
  const [step, setStep] = useState('phone'); // phone (= inserimento numero/email) | code | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(null);
  const [email, setEmail] = useState(null);
  const modeRef = useRef(null); // 'phone_change' | 'sms' | 'email_change' | 'email'
  const ticketRef = useRef(null);

  // Flusso e traduzione errori in src/lib/foodClubOtp.js (testati con node --test).
  const sendCode = useCallback(async (raw) => {
    setError(null);
    setBusy(true);
    ticketRef.current = null;
    try {
      const res = await requestOtp({
        channel,
        rawPhone: isEmail ? undefined : raw,
        rawEmail: isEmail ? raw : undefined,
        auth: supabase.auth,
        ensureSession: ensureCustomerSession,
        // Biglietto di unione (creato da requestOtp finché l'utente è ancora anonimo, riscattato dopo la verifica):
        // RPC per email o per telefono a seconda del canale.
        createMergeTicket: isEmail
          ? (addr) => foodClubApi.createMergeTicketEmail(addr)
          : (e164) => foodClubApi.createMergeTicket(e164),
      });
      if (!res.ok) { setError(res.error); return false; }
      modeRef.current = res.mode;
      ticketRef.current = res.ticket;
      if (isEmail) setEmail(res.email); else setPhone(res.phone);
      setStep('code');
      foodClubApi.track('otp_sent', res.mode);
      return true;
    } finally {
      setBusy(false);
    }
  }, [channel, isEmail]);

  // Ritorna { ok, merged } ; dopo ok la sessione è quella del numero verificato.
  const verifyCode = useCallback(async (code) => {
    setError(null);
    setBusy(true);
    try {
      const res = await confirmOtp({
        phone, email, code, mode: modeRef.current, ticket: ticketRef.current,
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
  }, [phone, email]);

  const reset = useCallback(() => { setStep('phone'); setError(null); setPhone(null); setEmail(null); ticketRef.current = null; }, []);

  // "Esci da questo telefono": la push non arriva a chi usa il telefono dopo (spec §5.4).
  const signOutDevice = useCallback(async (deactivatePush) => {
    try { if (deactivatePush) await deactivatePush(); } catch { /* best effort */ }
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return { step, busy, error, phone, email, channel, sendCode, verifyCode, reset, signOutDevice };
}
