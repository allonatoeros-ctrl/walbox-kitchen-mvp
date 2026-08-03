import { useEffect, useState } from 'react';
import { getFantaSession, onFantaAuthStateChange, signInWithEmail, signOut } from '../../lib/fantaAuth';
import { FantaShell, FantaBand, FantaButton, FantaPanel } from '../components/ui';

/*
 * FantaAuth — F-AUTH1 login/logout FantaWalrus (email+password).
 *
 * Primo layer di Auth dedicato a Fanta: nessuna dipendenza da Staff/Kitchen.
 * Dopo login valido reindirizza a /fanta/entry. Se una sessione Fanta valida
 * e' gia' attiva, mostra lo stato loggato con azione di logout.
 */

function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function FantaAuth() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getFantaSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setChecking(false);
    });
    const { data: { subscription } } = onFantaAuthStateChange((s) => {
      setSession(s);
      setChecking(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data, error: signInError } = await signInWithEmail(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message || 'Accesso non riuscito.');
      return;
    }
    if (data?.session) {
      navigateTo('/fanta/entry');
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    await signOut();
    setSubmitting(false);
  }

  if (checking) return null;

  return (
    <FantaShell width="narrow" data-testid="fanta-auth-page">
      <FantaBand title="FANTAWALRUS" subtitle="ACCESSO" />

      {session ? (
        <FantaPanel title="SESSIONE ATTIVA" meta={session.user?.email} data-testid="fanta-auth-session">
          <p className="fw-note__line">Hai gia' effettuato l'accesso come {session.user?.email}.</p>
          <footer className="fw-footer">
            <FantaButton
              variant="primary"
              block
              onClick={() => navigateTo('/fanta/entry')}
              data-testid="fanta-auth-go-entry"
            >
              Vai al Tesseramento
            </FantaButton>
            <FantaButton
              variant="ghost"
              block
              disabled={submitting}
              onClick={handleLogout}
              data-testid="fanta-auth-logout"
            >
              Esci
            </FantaButton>
          </footer>
        </FantaPanel>
      ) : (
        <FantaPanel title="ACCEDI" data-testid="fanta-auth-form-panel">
          <form onSubmit={handleSubmit}>
            <div className="fw-input">
              <span className="fw-input__marker" aria-hidden="true" />
              <input
                className="fw-input__field"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                data-testid="fanta-auth-email"
              />
            </div>
            <div className="fw-input" style={{ marginTop: 'var(--fw-space-12)' }}>
              <span className="fw-input__marker" aria-hidden="true" />
              <input
                className="fw-input__field"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                data-testid="fanta-auth-password"
              />
            </div>

            {error && (
              <div className="fw-note fw-note--error" data-testid="fanta-auth-error">
                <p className="fw-note__line fw-note__line--error">{error}</p>
              </div>
            )}

            <footer className="fw-footer">
              <FantaButton
                variant="primary"
                block
                disabled={submitting}
                onClick={handleSubmit}
                data-testid="fanta-auth-submit"
              >
                {submitting ? 'Accesso in corso...' : 'Accedi'}
              </FantaButton>
            </footer>
          </form>
        </FantaPanel>
      )}
    </FantaShell>
  );
}
