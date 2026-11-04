// WALRUS FOOD CLUB V1 — iscrizione/accesso col numero (F0 §3, PWA spec §5).
//  1. Anonimo + numero nuovo: updateUser({phone}) + OTP 'phone_change' => STESSO uid (ordini e push restano).
//  2. Numero già registrato (phone_exists) o dispositivo nuovo: biglietto di unione (se l'anonimo ha ordini),
//     signInWithOtp + OTP 'sms' => uid del membro, poi riscatto del biglietto (ordini e push dell'anonimo passano).
// Nessun SMS parte senza provider configurato in Supabase Auth (gate di Eros). Il biglietto vive solo in memoria.
import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureCustomerSession, foodClubApi } from '../lib/foodClubApi';
import { normalizeItalianPhone } from '../lib/foodClubRules';

function errCode(err) {
  const msg = `${err?.code ?? ''} ${err?.message ?? ''}`.toLowerCase();
  if (msg.includes('phone_exists') || msg.includes('already been registered')) return 'phone_exists';
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp')) return 'otp_invalid';
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many')) return 'sms_rate_limited';
  return err?.message || 'unknown_error';
}

export function useFoodClubIdentity() {
  const [step, setStep] = useState('phone'); // phone | code | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(null);
  const modeRef = useRef(null); // 'phone_change' | 'sms'
  const ticketRef = useRef(null);

  const sendCode = useCallback(async (rawPhone) => {
    setError(null);
    const e164 = normalizeItalianPhone(rawPhone);
    if (!e164) { setError('invalid_phone'); return false; }
    setBusy(true);
    try {
      const session = await ensureCustomerSession();
      const user = session?.user;
      ticketRef.current = null;
      if (user?.is_anonymous) {
        const { error: upErr } = await supabase.auth.updateUser({ phone: e164 });
        if (!upErr) {
          modeRef.current = 'phone_change';
        } else if (errCode(upErr) === 'phone_exists') {
          // Il numero ha già un account: unione degli ordini di questo dispositivo dopo l'accesso.
          try { ticketRef.current = await foodClubApi.createMergeTicket(e164); } catch { ticketRef.current = null; }
          const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: e164 });
          if (otpErr) throw otpErr;
          modeRef.current = 'sms';
        } else {
          throw upErr;
        }
      } else {
        const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: e164 });
        if (otpErr) throw otpErr;
        modeRef.current = 'sms';
      }
      setPhone(e164);
      setStep('code');
      foodClubApi.track('otp_sent', modeRef.current);
      return true;
    } catch (err) {
      setError(errCode(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  // Ritorna { ok, merged } ; dopo ok la sessione è quella del numero verificato.
  const verifyCode = useCallback(async (code) => {
    setError(null);
    const token = String(code ?? '').replace(/\D/g, '');
    if (token.length < 6) { setError('otp_invalid'); return { ok: false }; }
    setBusy(true);
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({ phone, token, type: modeRef.current === 'phone_change' ? 'phone_change' : 'sms' });
      if (vErr) throw vErr;
      let merged = null;
      if (ticketRef.current) {
        try { merged = await foodClubApi.redeemMergeTicket(ticketRef.current); } catch { merged = null; }
        ticketRef.current = null;
      }
      setStep('done');
      foodClubApi.track('login_done', modeRef.current);
      return { ok: true, merged, mode: modeRef.current };
    } catch (err) {
      setError(errCode(err));
      return { ok: false };
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
