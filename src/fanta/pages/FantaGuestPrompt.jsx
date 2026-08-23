import { useEffect } from 'react';
import { FantaShell, FantaBand, FantaButton, FantaPanel } from '../components/ui';

/*
 * FantaGuestPrompt — schermata di entrata in Guest Mode pubblico minimale.
 *
 * Non richiede autenticazione: imposta localStorage.fanta_walrus_guest_mode
 * e reindirizza a /fanta/entry, dove FantaEntryTesseramento in guest mode
 * crea un'identità locale senza RPC cloud.
 */

const GUEST_MODE_KEY = 'fanta_walrus_guest_mode';

function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function FantaGuestPrompt() {
  useEffect(() => {
    // Se già in guest mode, vai direttamente a entry
    try {
      if (localStorage.getItem(GUEST_MODE_KEY) === 'true') {
        navigateTo('/fanta/entry');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function enterGuestMode() {
    try {
      localStorage.setItem(GUEST_MODE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    navigateTo('/fanta/entry');
  }

  return (
    <FantaShell width="narrow" data-testid="fanta-guest-prompt-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="OSPITE"
        status="ACCESSO LIBERO"
      />

      <FantaPanel title="BENVENUTO" data-testid="fanta-guest-prompt-panel">
        <p className="fw-note__line">
          Entra in modalità ospite per fondare il tuo club direttamente dal telefono,
          senza account e senza sincronizzazione cloud.
        </p>
        <p className="fw-note__line">
          La tua squadra rimarrà salvata solo su questo dispositivo.
        </p>

        <footer className="fw-footer">
          <FantaButton
            variant="primary"
            block
            onClick={enterGuestMode}
            data-testid="fanta-guest-enter-cta"
          >
            Entra come ospite
          </FantaButton>
          <FantaButton
            variant="ghost"
            block
            onClick={() => navigateTo('/fanta/auth')}
            data-testid="fanta-guest-auth-cta"
          >
            Accedi con account
          </FantaButton>
        </footer>
      </FantaPanel>
    </FantaShell>
  );
}
