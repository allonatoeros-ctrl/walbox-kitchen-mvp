import { formatMmSs, POP_TITLE, POP_RETRY_CLOSED_MESSAGE, POP_CLOSING_MESSAGE } from '../../lib/kitchenOnlineLane';

// Blocco "come vuoi pagare?" + bivio cassa/online + CTA SumUp, condiviso fra la pagina
// pagamento dedicata (CustomerOrderPayment) e il riquadro ordine su /kitchen/status
// (fallback per chi torna lì senza aver completato la scelta). Puramente presentazionale:
// tutto lo stato/logica vive in useOrderPaymentFlow.

const POP_TEXT = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: '13px',
  fontWeight: 600,
};

function popButtonStyle(disabled, primary) {
  return {
    width: '100%',
    padding: '16px',
    marginBottom: '10px',
    borderRadius: '12px',
    border: primary ? 'none' : '2px solid #c8960a',
    background: primary ? (disabled ? '#6b5a1e' : '#c8960a') : 'transparent',
    color: primary ? '#1a1206' : '#c8960a',
    opacity: !primary && disabled ? 0.5 : 1,
    fontFamily: "'Anton', sans-serif",
    fontSize: '16px',
    letterSpacing: '1px',
    cursor: disabled ? 'default' : 'pointer',
  };
}

// S5 — ordine in corsia online (status pending_online_payment): niente bivio. Stato "Pagamento
// online in corso" + tempo rimasto, RIPROVA solo nella finestra `active`, PAGA AL BANCO sempre
// (il server lo accetta finché l'ordine è ancora POP). Tutto lo stato vive in useOrderPaymentFlow.
function PendingOnlineBlock({ order, flow }) {
  const { sumup, onlineWindow, onlinePhase, switchState, handlePaySumup, handleSwitchToCounter, runReconciliation } = flow;
  const switchedToCounter = switchState.state === 'done';
  const busy = sumup.state === 'loading' || sumup.state === 'redirecting' || sumup.state === 'verifying';
  const confirmed = sumup.state === 'confirmed';
  const switching = switchState.state === 'loading';
  const canRetryOnline = onlinePhase === 'active' && !busy && !confirmed && !switchedToCounter
    && !['pending', 'unknown'].includes(sumup.state);

  if (switchedToCounter) {
    return (
      <div data-testid="ost-pop-switch-done">
        <div style={{ ...POP_TEXT, margin: '0 20px 12px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(200,150,10,0.12)', border: '2px solid #c8960a', color: '#c8960a', textAlign: 'center' }}>
          Fatto: paga al banco con il codice.
        </div>
        {order.orderCode && (
          <div style={{ margin: '0 20px 20px', padding: '16px 24px', background: 'rgba(200,150,10,0.12)', border: '2px solid #c8960a', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ ...POP_TEXT, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(245,234,216,0.55)', textTransform: 'uppercase', marginBottom: '4px' }}>
              MOSTRA QUESTO CODICE ALLA CASSA
            </div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: '44px', fontWeight: 900, letterSpacing: '3px', color: '#c8960a', lineHeight: 1 }}>
              {order.orderCode}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ margin: '0 20px 20px' }} data-testid="ost-pop-block">
      <div style={{ ...POP_TEXT, fontSize: '12px', fontWeight: 700, letterSpacing: '1px', color: 'rgba(245,234,216,0.7)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '6px' }}>
        {POP_TITLE}
      </div>

      {onlinePhase === 'active' && onlineWindow?.secondsLeft != null && (
        <div data-testid="ost-pop-timer" style={{ ...POP_TEXT, color: '#c8960a', textAlign: 'center', marginBottom: '12px' }}>
          Tempo rimasto per pagare online: {formatMmSs(onlineWindow.secondsLeft)}
        </div>
      )}
      {onlinePhase === 'retry_closed' && (
        <div data-testid="ost-pop-retry-closed" style={{ ...POP_TEXT, color: '#c8960a', textAlign: 'center', marginBottom: '12px' }}>
          {POP_RETRY_CLOSED_MESSAGE}
        </div>
      )}
      {onlinePhase === 'closing' && (
        <div data-testid="ost-pop-closing" style={{ ...POP_TEXT, color: '#c8960a', textAlign: 'center', marginBottom: '12px' }}>
          {POP_CLOSING_MESSAGE}
        </div>
      )}

      {sumup.state === 'verifying' && (
        <div style={{ ...POP_TEXT, color: '#c8960a', textAlign: 'center', padding: '8px 0 12px' }}>
          Stiamo verificando il pagamento con SumUp… aggiorna tra qualche secondo.
        </div>
      )}
      {confirmed && (
        <div style={{ ...POP_TEXT, color: '#22c55e', textAlign: 'center', padding: '8px 0 12px' }}>
          Pagamento confermato — stiamo aggiornando l'ordine…
        </div>
      )}
      {sumup.state === 'pending' && (
        <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
          <div style={{ ...POP_TEXT, color: '#c8960a', marginBottom: '10px' }}>
            Pagamento ancora in corso presso SumUp. Non serve ripagare — verifica tra qualche secondo.
          </div>
          <button onClick={runReconciliation} data-testid="ost-sumup-retry" style={{ padding: '10px 20px', borderRadius: '10px', border: '2px solid #c8960a', background: 'transparent', color: '#c8960a', fontFamily: "'Anton', sans-serif", fontSize: '13px', letterSpacing: '1px', cursor: 'pointer' }}>
            VERIFICA DI NUOVO
          </button>
        </div>
      )}
      {sumup.state === 'unknown' && (
        <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
          <div style={{ ...POP_TEXT, color: '#ef4444', marginBottom: '10px' }}>
            Non riusciamo a verificare il pagamento in questo momento. Se hai già pagato non serve
            ripagare: mostra questa schermata alla cassa se il problema persiste.
          </div>
          <button onClick={runReconciliation} data-testid="ost-sumup-retry" style={{ padding: '10px 20px', borderRadius: '10px', border: '2px solid #ef4444', background: 'transparent', color: '#ef4444', fontFamily: "'Anton', sans-serif", fontSize: '13px', letterSpacing: '1px', cursor: 'pointer' }}>
            VERIFICA DI NUOVO
          </button>
        </div>
      )}

      {canRetryOnline && (
        <button onClick={handlePaySumup} data-testid="ost-pop-retry" style={popButtonStyle(false, true)}>
          💳 RIPROVA PAGAMENTO ONLINE
        </button>
      )}
      {sumup.state === 'error' && sumup.error && !confirmed && (
        <div data-testid="ost-pop-sumup-error" style={{ ...POP_TEXT, fontSize: '12px', color: '#ef4444', textAlign: 'center', margin: '-4px 0 10px' }}>
          {onlinePhase === 'active' ? sumup.error : 'Il pagamento online non è andato a buon fine.'}
        </div>
      )}
      {(sumup.state === 'loading' || sumup.state === 'redirecting') && (
        <div style={{ ...POP_TEXT, color: '#c8960a', textAlign: 'center', padding: '8px 0 12px' }}>
          {sumup.state === 'loading' ? 'Avvio pagamento…' : 'Reindirizzamento a SumUp…'}
        </div>
      )}

      {!confirmed && (
        <button
          onClick={handleSwitchToCounter}
          disabled={switching || busy}
          data-testid="ost-pop-switch-counter"
          style={popButtonStyle(switching || busy, false)}
        >
          {switching ? 'UN ATTIMO…' : '🧾 PAGA AL BANCO'}
        </button>
      )}
      {switchState.state === 'error' && (
        <div data-testid="ost-pop-switch-error" style={{ ...POP_TEXT, fontSize: '12px', color: '#ef4444', textAlign: 'center' }}>
          {switchState.error}
        </div>
      )}
    </div>
  );
}

export default function OrderPaymentActions({ order, flow }) {
  const { isPendingOnline, isPendingPayment, effectiveChoice, showCashFallback, onlinePaymentDisabled, sumup, choosePayment, handleChooseOnline, handlePaySumup, runReconciliation } = flow;

  if (isPendingOnline) return <PendingOnlineBlock order={order} flow={flow} />;
  if (!isPendingPayment) return null;

  return (
    <>
      {/* BUG A fix: staff ha già chiuso il checkout online (PASSA AL BANCO) — nessun bivio, solo
          un messaggio chiaro. Il codice ordine viene comunque mostrato subito sotto da
          showCashFallback (effectiveChoice è forzato su 'counter' da useOrderPaymentFlow). */}
      {onlinePaymentDisabled && (
        <div style={{
          margin: '0 20px 12px',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(200,150,10,0.12)',
          border: '2px solid #c8960a',
          color: '#c8960a',
          fontFamily: "'Montserrat', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          textAlign: 'center',
        }} data-testid="ost-online-payment-disabled-banner">
          Pagamento al banco — comunica il codice ordine alla cassa.
        </div>
      )}

      {/* Payment method fork (AC1) */}
      {!onlinePaymentDisabled && !effectiveChoice && (
        <div style={{ margin: '0 20px 20px' }} data-testid="ost-payment-fork">
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: 'rgba(245,234,216,0.7)',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: '10px',
          }}>
            COME VUOI PAGARE?
          </div>
          <button
            onClick={() => choosePayment('counter')}
            data-testid="ost-pay-counter"
            style={{
              width: '100%',
              padding: '16px',
              marginBottom: '10px',
              borderRadius: '12px',
              border: '2px solid #c8960a',
              background: 'transparent',
              color: '#c8960a',
              fontFamily: "'Anton', sans-serif",
              fontSize: '16px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            🧾 PAGA IN CASSA
          </button>
          <button
            onClick={handleChooseOnline}
            data-testid="ost-pay-online"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              border: 'none',
              background: '#c8960a',
              color: '#1a1206',
              fontFamily: "'Anton', sans-serif",
              fontSize: '16px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            💳 PAGA ONLINE
          </button>
        </div>
      )}

      {/* Code for payment at counter */}
      {showCashFallback && order.orderCode && (
        <div style={{
          margin: '0 20px 20px',
          padding: '16px 24px',
          background: 'rgba(200,150,10,0.12)',
          border: '2px solid #c8960a',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            color: 'rgba(245,234,216,0.55)',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            MOSTRA QUESTO CODICE ALLA CASSA
          </div>
          <div style={{
            fontFamily: "'Anton', sans-serif",
            fontSize: '44px',
            fontWeight: 900,
            letterSpacing: '3px',
            color: '#c8960a',
            lineHeight: 1
          }}>
            {order.orderCode}
          </div>
        </div>
      )}

      {/* SumUp online payment CTA (sandbox) */}
      {effectiveChoice === 'online' && (
        <div style={{ margin: '0 20px 20px', textAlign: 'center' }}>
          {sumup.state === 'verifying' ? (
            <div style={{
              padding: '14px',
              color: '#c8960a',
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Stiamo verificando il pagamento con SumUp… aggiorna tra qualche secondo.
            </div>
          ) : sumup.state === 'confirmed' ? (
            <div style={{
              padding: '14px',
              color: '#22c55e',
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Pagamento confermato — stiamo aggiornando l'ordine…
            </div>
          ) : sumup.state === 'pending' ? (
            <div style={{ padding: '14px' }}>
              <div style={{
                color: '#c8960a',
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '10px',
              }}>
                Pagamento ancora in corso presso SumUp. Non serve ripagare — verifica tra qualche secondo.
              </div>
              <button
                onClick={runReconciliation}
                data-testid="ost-sumup-retry"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '2px solid #c8960a',
                  background: 'transparent',
                  color: '#c8960a',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '13px',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                VERIFICA DI NUOVO
              </button>
            </div>
          ) : sumup.state === 'unknown' ? (
            <div style={{ padding: '14px' }}>
              <div style={{
                color: '#ef4444',
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '10px',
              }}>
                Non riusciamo a verificare il pagamento in questo momento. Se hai già pagato non serve
                ripagare: mostra questa schermata alla cassa se il problema persiste.
              </div>
              <button
                onClick={runReconciliation}
                data-testid="ost-sumup-retry"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '2px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '13px',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                VERIFICA DI NUOVO
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handlePaySumup}
                disabled={sumup.state === 'loading' || sumup.state === 'redirecting'}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: sumup.state === 'loading' || sumup.state === 'redirecting' ? '#6b5a1e' : '#c8960a',
                  color: '#1a1206',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '16px',
                  letterSpacing: '1px',
                  cursor: sumup.state === 'loading' || sumup.state === 'redirecting' ? 'default' : 'pointer',
                }}
              >
                {sumup.state === 'loading'
                  ? 'AVVIO PAGAMENTO…'
                  : sumup.state === 'redirecting'
                    ? 'REINDIRIZZAMENTO A SUMUP…'
                    : '💳 PAGA ONLINE'}
              </button>
              {sumup.state === 'error' && (
                <div style={{
                  marginTop: '8px',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontFamily: "'Montserrat', sans-serif",
                }}>
                  {sumup.error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
