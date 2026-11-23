// WALRUS FOOD CLUB V1 — logica OTP pura (nessun import di rete): flusso invio/verifica codice e traduzione errori
// Supabase Auth. Le dipendenze (auth, api, sessione) sono iniettate: useFoodClubIdentity passa quelle vere, i test
// quelle finte. Nessun SMS parte senza provider configurato in Supabase Auth (gate di Eros).
import { normalizeItalianPhone, normalizeEmail } from './foodClubRules.js';

// Errore Supabase Auth (GoTrue) -> codice tradotto da clubErrorMessage. L'ordine conta: un 429 o un "invalid phone"
// non devono diventare "codice sbagliato".
export function otpErrorCode(err, channel = 'phone') {
  const code = String(err?.code ?? '').toLowerCase();
  const msg = `${code} ${String(err?.message ?? '')}`.toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  if (code === 'email_exists' || msg.includes('email_exists') || (channel === 'email' && msg.includes('already been registered'))) return 'email_exists';
  if (code === 'phone_exists' || msg.includes('phone_exists') || msg.includes('already been registered')) return 'phone_exists';
  if (code === 'over_email_send_rate_limit' || (status === 429 && channel === 'email')) return 'email_rate_limited';
  if (status === 429 || /over_sms_send_rate_limit|over_request_rate_limit|rate limit|too many|only request this after/.test(msg)) {
    return channel === 'email' ? 'email_rate_limited' : 'sms_rate_limited';
  }
  if (code === 'email_provider_disabled' || /email.*(provider|signups?).*disabled|unsupported email provider/.test(msg)) return 'email_unavailable';
  if (code === 'phone_provider_disabled' || /unsupported phone provider|phone provider/.test(msg)) return 'sms_unavailable';
  if (/error sending .*email|email_send_failed/.test(msg) || (channel === 'email' && code === 'unexpected_failure')) return 'email_send_failed';
  if (code === 'sms_send_failed' || /error sending (sms|confirmation)|sms_send_failed/.test(msg)) return 'sms_send_failed';
  if (code === 'email_address_invalid' || (/email/.test(msg) && /invalid|format|validation_failed/.test(msg) && !/otp|token|link|expired/.test(msg))) return 'invalid_email';
  if (/phone/.test(msg) && /invalid|format|e\.164|validation_failed/.test(msg)) return 'invalid_phone';
  if (code === 'otp_expired' || /otp|token has expired|token.*invalid|expired|invalid/.test(msg)) return 'otp_invalid';
  if (/failed to fetch|network|load failed/.test(msg)) return 'network_error';
  return 'unknown_error';
}

// Invio del codice. channel 'phone' (default) o 'email'. Ritorna { ok: true, phone|email, mode, ticket } oppure
// { ok: false, error }.
//   anonimo + identità nuova      -> auth.updateUser({ phone|email })   mode 'phone_change' | 'email_change' (stesso uid)
//   anonimo + già iscritta        -> biglietto di unione + signInWithOtp, mode 'sms' | 'email'
//   sessione non anonima          -> signInWithOtp, mode 'sms' | 'email'
export async function requestOtp({ channel = 'phone', rawPhone, rawEmail, auth, ensureSession, createMergeTicket }) {
  const isEmail = channel === 'email';
  const value = isEmail ? normalizeEmail(rawEmail) : normalizeItalianPhone(rawPhone);
  if (!value) return { ok: false, error: isEmail ? 'invalid_email' : 'invalid_phone' };
  const key = isEmail ? 'email' : 'phone';
  const existsCode = isEmail ? 'email_exists' : 'phone_exists';
  try {
    const session = await ensureSession();
    const user = session?.user;
    let ticket = null;
    let mode;
    if (user?.is_anonymous) {
      const { error: upErr } = await auth.updateUser({ [key]: value });
      if (!upErr) {
        mode = isEmail ? 'email_change' : 'phone_change';
      } else if (otpErrorCode(upErr, channel) === existsCode) {
        try { ticket = await createMergeTicket(value); } catch { ticket = null; }
        const { error: otpErr } = await auth.signInWithOtp({ [key]: value });
        if (otpErr) throw otpErr;
        mode = isEmail ? 'email' : 'sms';
      } else {
        throw upErr;
      }
    } else {
      const { error: otpErr } = await auth.signInWithOtp({ [key]: value });
      if (otpErr) throw otpErr;
      mode = isEmail ? 'email' : 'sms';
    }
    return { ok: true, [key]: value, mode, ticket };
  } catch (err) {
    return { ok: false, error: otpErrorCode(err, channel) };
  }
}

// Verifica del codice. Il canale si deduce dal modo di invio (email/email_change -> email, altrimenti telefono).
// Ritorna { ok: true, merged } oppure { ok: false, error }. Il biglietto di unione si riscatta solo dopo la
// verifica (sessione dell'identità); un errore di riscatto non blocca l'accesso.
export async function confirmOtp({ phone, email, code, mode, ticket, auth, redeemMergeTicket }) {
  const isEmail = mode === 'email' || mode === 'email_change';
  const channel = isEmail ? 'email' : 'phone';
  const token = String(code ?? '').replace(/\D/g, '');
  if (token.length !== 6) return { ok: false, error: 'otp_invalid' };
  if (isEmail ? !email : !phone) return { ok: false, error: isEmail ? 'invalid_email' : 'invalid_phone' };
  try {
    const payload = isEmail
      ? { email, token, type: mode === 'email_change' ? 'email_change' : 'email' }
      : { phone, token, type: mode === 'phone_change' ? 'phone_change' : 'sms' };
    const { error: vErr } = await auth.verifyOtp(payload);
    if (vErr) throw vErr;
    let merged = null;
    if (ticket) {
      try { merged = await redeemMergeTicket(ticket); } catch { merged = null; }
    }
    return { ok: true, merged };
  } catch (err) {
    return { ok: false, error: otpErrorCode(err, channel) };
  }
}

// Conto alla rovescia per "Mandamelo di nuovo": 60 -> "1:00", 9 -> "0:09".
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
