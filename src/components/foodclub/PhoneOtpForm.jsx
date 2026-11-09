// WALRUS FOOD CLUB V1 — numero + codice SMS (usa useFoodClubIdentity passato dal genitore).
// Passo 'phone': cellulare + eventuali consensi (children) + MANDAMI IL CODICE.
// Passo 'code': 6 caselle, reinvio dopo 60 s, cambia numero. Nessun invito installazione/notifiche qui.
import { useEffect, useRef, useState } from 'react';
import { clubErrorMessage } from '../../lib/foodClubRules';
import { formatCountdown } from '../../lib/foodClubOtp';
import { ClubCta } from './ClubCta';
import './FoodClub.css';

const RESEND_SECONDS = 60;

function OtpBoxes({ value, onChange, invalid, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setAt = (i, d) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, 6));
  };
  const onInput = (i, raw) => {
    const only = raw.replace(/\D/g, '');
    if (only.length > 1) {
      // incolla o autocompletamento "one-time-code": distribuisce le cifre
      const merged = (digits.slice(0, i).join('') + only).slice(0, 6);
      onChange(merged);
      refs.current[Math.min(merged.length, 5)]?.focus();
      return;
    }
    setAt(i, only);
    if (only && i < 5) refs.current[i + 1]?.focus();
  };
  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, '');
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <div className={`fc-otp${invalid ? ' fc-otp--err' : ''}`} role="group" aria-label="Codice a 6 cifre">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Cifra ${i + 1}`}
          aria-invalid={invalid || undefined}
          value={d}
          disabled={disabled}
          maxLength={i === 0 ? 6 : 1}
          autoFocus={i === 0}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
        />
      ))}
    </div>
  );
}

function maskPhone(e164) {
  const d = String(e164 ?? '').replace(/\D/g, '');
  return d ? `+39 ••• ••• ${d.slice(-4)}` : '';
}

export default function PhoneOtpForm({
  identity, onVerified, beforeSend = null, children = null,
  sendLabel = 'MANDAMI IL CODICE', verifyLabel = 'VERIFICA', phoneHelp = null,
}) {
  const [raw, setRaw] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const { step, busy, error } = identity;

  useEffect(() => {
    if (step !== 'code' || !resendAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, resendAt]);

  const secondsLeft = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;

  const send = async (e) => {
    e?.preventDefault();
    setLocalError(null);
    const pre = beforeSend ? beforeSend() : null;
    if (pre) { setLocalError(pre); return; }
    const ok = await identity.sendCode(raw);
    if (ok) {
      const t = Date.now();
      setNow(t);
      setResendAt(t + RESEND_SECONDS * 1000);
      setCode('');
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length < 6) { setLocalError('Scrivi tutte e 6 le cifre del codice.'); return; }
    setLocalError(null);
    const res = await identity.verifyCode(code);
    if (res?.ok) onVerified?.(res);
    else setCode('');
  };

  const changeNumber = () => { setCode(''); setLocalError(null); identity.reset(); };

  const shownError = localError || (error ? clubErrorMessage(error) : null);

  if (step === 'code') {
    return (
      <form onSubmit={verify} noValidate>
        <div className="cx-block" style={{ paddingTop: 10 }}>
          <p className="fc-p" style={{ marginTop: 0 }}>L’abbiamo mandato al {maskPhone(identity.phone)}.</p>
          <button type="button" className="fc-link" onClick={changeNumber}>Numero sbagliato? Modifica</button>
          <div style={{ marginTop: 8 }}>
            <OtpBoxes value={code} onChange={setCode} invalid={!!error} disabled={busy} />
          </div>
          <div aria-live="polite">{shownError ? <div className="fc-error" role="alert">{shownError}</div> : null}</div>
          <p className="cx-help" style={{ marginTop: 12 }}>
            Non arriva?{' '}
            {secondsLeft > 0
              ? <span>Puoi richiederlo di nuovo tra {formatCountdown(secondsLeft)}</span>
              : <button type="button" className="fc-link" onClick={send} disabled={busy}>Mandamelo di nuovo</button>}
          </p>
        </div>
        <div className="fc-cta-row"><ClubCta type="submit" title={verifyLabel} busy={busy} /></div>
      </form>
    );
  }

  const phoneErr = error === 'invalid_phone';
  return (
    <form onSubmit={send} noValidate>
      <div className="cx-block" style={{ paddingTop: 10 }}>
        <label className="cx-title" htmlFor="fc-phone">CELLULARE</label>
        <div className="fc-phone" style={{ marginTop: 8 }}>
          <span className="fc-prefix" aria-hidden="true">+39</span>
          <input
            id="fc-phone"
            className="cx-name-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="333 123 4567"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-invalid={phoneErr || undefined}
            aria-describedby="fc-phone-err"
            disabled={busy}
          />
        </div>
        {phoneHelp ? <p className="cx-help" style={{ marginTop: 8 }}>{phoneHelp}</p> : null}
        {children}
        <div id="fc-phone-err" aria-live="polite">{shownError ? <div className="fc-error" role="alert">{shownError}</div> : null}</div>
      </div>
      <div className="fc-cta-row" style={{ paddingTop: 4 }}><ClubCta type="submit" title={sendLabel} sub="SMS gratuito" busy={busy} /></div>
    </form>
  );
}
