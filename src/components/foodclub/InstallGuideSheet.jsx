// WALRUS FOOD CLUB V1 — foglio "Come si installa" (istruzioni per browser). MAI un finto bottone "installa":
// su iPhone e sui browser senza evento di installazione l'unica strada sono i passi del browser stesso.
import { useEffect, useRef, useState } from 'react';
import { installGuideSteps } from '../../lib/installInvite';
import { ClubCta, PhoneIllustration } from './ClubCta';
import './FoodClub.css';

function BrowserBar({ kind }) {
  const dim = { fill: 'none', stroke: 'var(--poster-muted)' };
  const share = (cx, cy) => (
    <>
      <circle cx={cx} cy={cy} r="19" style={{ fill: 'var(--poster-yellow)' }} />
      <path transform={`translate(${cx - 13} ${cy - 13}) scale(1.08)`} d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--poster-on-yellow)' }} />
    </>
  );
  const frame = <rect x="1" y="1" width="318" height="50" rx="14" strokeWidth="2" style={{ fill: 'var(--poster-panel)', stroke: 'var(--poster-line)' }} />;
  if (kind === 'safari') {
    return (
      <svg className="fc-ill" viewBox="0 0 320 52" role="img" aria-label="Barra di Safari in basso: il tasto Condividi è quello centrale">
        {frame}
        <path d="M42 16 32 26 42 36" strokeWidth="2.4" strokeLinecap="round" style={dim} />
        <path d="M92 16 102 26 92 36" strokeWidth="2.4" strokeLinecap="round" style={dim} />
        {share(160, 26)}
        <rect x="212" y="15" width="22" height="22" rx="3" strokeWidth="2.4" style={dim} />
        <rect x="270" y="17" width="16" height="16" rx="3" strokeWidth="2.4" style={dim} />
      </svg>
    );
  }
  if (kind === 'chrome') {
    return (
      <svg className="fc-ill" viewBox="0 0 320 52" role="img" aria-label="Barra del browser in alto: il tasto Condividi è a destra">
        {frame}
        <rect x="14" y="10" width="206" height="32" rx="16" style={{ fill: 'var(--poster-bg)' }} />
        {share(250, 26)}
      </svg>
    );
  }
  return (
    <svg className="fc-ill" viewBox="0 0 320 52" role="img" aria-label="Barra del browser Android: il menu ⋮ è a destra">
      {frame}
      <rect x="14" y="10" width="218" height="32" rx="16" style={{ fill: 'var(--poster-bg)' }} />
      <circle cx="288" cy="26" r="19" style={{ fill: 'var(--poster-yellow)' }} />
      {[17, 26, 35].map((y) => <circle key={y} cx="288" cy={y} r="2.6" style={{ fill: 'var(--poster-on-yellow)' }} />)}
    </svg>
  );
}

function barKind(guide) {
  if (guide === 'ios-safari') return 'safari';
  if (guide?.startsWith('ios-')) return 'chrome';
  if (guide?.startsWith('android-')) return 'android';
  return null;
}

export default function InstallGuideSheet({ open, onClose, guide }) {
  const closeRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const prevFocus = document.activeElement;
    document.documentElement.classList.add('fc-lock');
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('fc-lock');
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const inApp = guide === 'ios' || guide === 'android';
  const needsSafari = guide === 'ios-chrome' || guide === 'ios-edge' || guide === 'ios-firefox' || guide === 'ios-other';
  const steps = [...installGuideSteps(guide), 'Ora apri Walbox dall’icona'];
  const kind = barKind(guide);
  const link = typeof window !== 'undefined' ? window.location.href : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fc-scope">
      <div className="kitch-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="kitch-drawer fc-sheet" role="dialog" aria-modal="true" aria-labelledby="fc-guide-title" data-testid="fc-guide">
        <div className="kitch-drawer-handle" />
        <div className="kitch-drawer-header">
          <div className="kitch-drawer-title" id="fc-guide-title">COME SI INSTALLA</div>
          <button type="button" ref={closeRef} className="kitch-drawer-close" onClick={onClose} aria-label="Chiudi la guida">×</button>
        </div>
        <div className="kitch-drawer-body">
          {inApp ? (
            <div className="fc-sheet-warn">
              <b>Da qui non si può installare</b>
              <span>Instagram, Facebook e simili aprono Walbox in un browser interno che non sa aggiungere app alla Home.</span>
            </div>
          ) : (
            <p className="fc-sheet-intro">Pochi tocchi, dal browser che stai usando. Poi Walbox è sulla Home come una vera app.</p>
          )}
          {steps.length > 1 ? (
            <ol className="fc-steps">
              {steps.map((text, i) => (
                <li key={i}>
                  <span className="fc-step-n" aria-hidden="true">{i + 1}</span>
                  <div>
                    <b>{text}</b>
                    {i === 0 && kind && !inApp ? <BrowserBar kind={kind} /> : null}
                    {i === steps.length - 1 ? <div className="fc-ill-row"><PhoneIllustration width={48} /></div> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="fc-sheet-cta">
            {inApp || needsSafari ? (
              <>
                <button type="button" className="fc-btn-ghost" onClick={copyLink}>{copied ? 'LINK COPIATO ✓' : (needsSafari ? 'COPIA LINK PER SAFARI' : 'COPIA LINK')}</button>
                <p className="fc-small" style={{ margin: 0 }} aria-live="polite">
                  {copied ? 'Ora incollalo nel browser.' : (needsSafari ? 'Non trovi «Aggiungi alla schermata Home»? Apri questa pagina in Safari.' : 'Non trovi la voce? Copia il link e incollalo nel browser.')}
                </p>
              </>
            ) : null}
            <ClubCta title="HO CAPITO" onClick={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}
