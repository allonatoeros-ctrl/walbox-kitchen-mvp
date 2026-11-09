// WALRUS FOOD CLUB V1 — logica OTP pura (nessun import di rete): flusso invio/verifica codice e traduzione errori
// Supabase Auth. Le dipendenze (auth, api, sessione) sono iniettate: useFoodClubIdentity passa quelle vere, i test
// quelle finte. Nessun SMS parte senza provider configurato in Supabase Auth (gate di Eros).
import { normalizeItalianPhone } from './foodClubRules.js';

// Errore Supabase Auth (GoTrue) -> codice tradotto da clubErrorMessage. L'ordine conta: un 429 o un "invalid phone"
// non devono diventare "codice sbagliato".
export function otpErrorCode(err) {
  const code = String(err?.code ?? '').toLowerCase();
  const msg = `${code} ${String(err?.message ?? '')}`.toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (code === 'phone_exists' || msg.includes('phone_exists') || msg.includes('already been registered')) return 'phone_exists';
  if (status === 429 || /over_sms_send_rate_limit|over_request_rate_limit|rate limit|too many|only request this after/.test(msg)) {
    return 'sms_rate_limited';
  }
  if (code === 'phone_provider_disabled' || /unsupported phone provider|phone provider/.test(msg)) return 'sms_unavailable';
  if (code === 'sms_send_failed' || /error sending (sms|confirmation)|sms_send_failed/.test(msg)) return 'sms_send_failed';
  if (/phone/.test(msg) && /invalid|format|e\.164|validation_failed/.test(msg)) return 'invalid_phone';
  if (code === 'otp_expired' || /otp|token has expired|token.*invalid|expired|invalid/.test(msg)) return 'otp_invalid';
  if (/failed to fetch|network|load failed/.test(msg)) return 'network_error';
  return 'unknown_error';
}

// Invio del codice. Ritorna { ok: true, phone, mode, ticket } oppure { ok: false, error }.
//   anonimo + numero nuovo        -> auth.updateUser({ phone })      mode 'phone_change' (stesso uid: ordini e push restano)
//   anonimo + numero già iscritto -> biglietto di unione + signInWithOtp, mode 'sms'
//   sessione non anonima          -> signInWithOtp, mode 'sms'
export async function requestOtp({ rawPhone, auth, ensureSession, createMergeTicket }) {
  const phone = normalizeItalianPhone(rawPhone);
  if (!phone) return { ok: false, error: 'invalid_phone' };
  try {
    const session = await ensureSession();
    const user = session?.user;
    let ticket = null;
    let mode;
    if (user?.is_anonymous) {
      const { error: upErr } = await auth.updateUser({ phone });
      if (!upErr) {
        mode = 'phone_change';
      } else if (otpErrorCode(upErr) === 'phone_exists') {
        try { ticket = await createMergeTicket(phone); } catch { ticket = null; }
        const { error: otpErr } = await auth.signInWithOtp({ phone });
        if (otpErr) throw otpErr;
        mode = 'sms';
      } else {
        throw upErr;
      }
    } else {
      const { error: otpErr } = await auth.signInWithOtp({ phone });
      if (otpErr) throw otpErr;
      mode = 'sms';
    }
    return { ok: true, phone, mode, ticket };
  } catch (err) {
    return { ok: false, error: otpErrorCode(err) };
  }
}

// Verifica del codice. Ritorna { ok: true, merged } oppure { ok: false, error }. Il biglietto di unione si riscatta
// solo dopo la verifica (sessione del numero); un errore di riscatto non blocca l'accesso.
export async function confirmOtp({ phone, code, mode, ticket, auth, redeemMergeTicket }) {
  const token = String(code ?? '').replace(/\D/g, '');
  if (token.length !== 6) return { ok: false, error: 'otp_invalid' };
  if (!phone) return { ok: false, error: 'invalid_phone' };
  try {
    const { error: vErr } = await auth.verifyOtp({ phone, token, type: mode === 'phone_change' ? 'phone_change' : 'sms' });
    if (vErr) throw vErr;
    let merged = null;
    if (ticket) {
      try { merged = await redeemMergeTicket(ticket); } catch { merged = null; }
    }
    return { ok: true, merged };
  } catch (err) {
    return { ok: false, error: otpErrorCode(err) };
  }
}

// Conto alla rovescia per "Mandamelo di nuovo": 60 -> "1:00", 9 -> "0:09".
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
