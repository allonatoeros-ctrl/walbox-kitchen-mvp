// WALRUS FOOD CLUB V1 — email + codice a 6 cifre (usa useFoodClubIdentity col canale 'email').
// Stessa interfaccia di PhoneOtpForm (identity, onVerified, beforeSend, children, sendLabel, verifyLabel).
// Passo 'phone' (= inserimento): email + eventuali consensi (children) + MANDAMI IL CODICE.
// Passo 'code': 6 caselle, reinvio dopo 60 s, cambia email. Nessun invito installazione/notifiche qui.
import { useEffect, useState } from 'react';
import { clubErrorMessage } from '../../lib/foodClubRules';
import { formatCountdown } from '../../lib/foodClubOtp';
import { ClubCta } from './ClubCta';
import { OtpBoxes } from './PhoneOtpForm';
import './FoodClub.css';

const RESEND_SECONDS = 60;

export default function EmailOtpForm({
  identity, onVerified, beforeSend = null, children = null,
  sendLabel = 'MANDAMI IL CODICE', verifyLabel = 'VERIFICA', emailHelp = null,
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

  const changeEmail = () => { setCode(''); setLocalError(null); identity.reset(); };

  const shownError = localError || (error ? clubErrorMessage(error) : null);

  if (step === 'code') {
    return (
      <form onSubmit={verify} noValidate>
        <div className="cx-block" style={{ paddingTop: 10 }}>
          <p className="fc-p" style={{ marginTop: 0 }}>Controlla la posta: ti abbiamo mandato un codice a 6 cifre a <b>{identity.email}</b>.</p>
          <p className="cx-help" style={{ marginTop: 4 }}>Non trovi la mail? Guarda nello spam.</p>
          <button type="button" className="fc-link" onClick={changeEmail}>Email sbagliata? Modifica</button>
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

  const emailErr = error === 'invalid_email';
  return (
    <form onSubmit={send} noValidate>
      <div className="cx-block" style={{ paddingTop: 10 }}>
        <label className="cx-title" htmlFor="fc-email">LA TUA EMAIL</label>
        <div style={{ marginTop: 8 }}>
          <input
            id="fc-email"
            className="cx-name-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="nome@esempio.it"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-invalid={emailErr || undefined}
            aria-describedby="fc-email-err"
            disabled={busy}
          />
        </div>
        {emailHelp ? <p className="cx-help" style={{ marginTop: 8 }}>{emailHelp}</p> : null}
        {children}
        <div id="fc-email-err" aria-live="polite">{shownError ? <div className="fc-error" role="alert">{shownError}</div> : null}</div>
      </div>
      <div className="fc-cta-row" style={{ paddingTop: 4 }}><ClubCta type="submit" title={sendLabel} sub="codice gratis in posta" busy={busy} /></div>
    </form>
  );
}
