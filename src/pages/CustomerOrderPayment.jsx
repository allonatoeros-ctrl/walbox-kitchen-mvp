import { useEffect, useState } from 'react';
import { useKitchenOrders, getOwnedOrderIds } from '../hooks/useKitchenOrders';
import { useOrderPaymentFlow } from '../hooks/useOrderPaymentFlow';
import OrderPaymentActions from '../components/kitchen/OrderPaymentActions';
import './CustomerOrderPayment.css';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Stessa regola di proprietà di CustomerOrderStatus.jsx: un ordine è "mio" solo se questo
// dispositivo lo ha creato (registro walbox_kitchen_my_order_ids), mai per corrispondenza di
// nickname/tavolo/id-più-recente. Vedi CustomerOrderStatus.jsx per il commento esteso.
function readOwnedOrderIds() {
  const ids = getOwnedOrderIds();
  try {
    const legacyId = localStorage.getItem('walbox_kitchen_last_order_id');
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);
  } catch { }
  return ids;
}

/**
 * Pagina pagamento dedicata (follow-up UX 2026-09-18): unico step fra "conferma ordine" e
 * "status ordini". Mostra solo codice ordine grande + bivio "come vuoi pagare?" — nessun
 * jukebox, nessuna timeline, nessuna lista ordini. Riusa `useOrderPaymentFlow` /
 * `OrderPaymentActions`, condivisi con `CustomerOrderPanel` (fallback su /kitchen/status per chi
 * torna lì senza aver completato la scelta) — nessuna logica SumUp duplicata, nessun Payment Hub
 * backend toccato: il ritorno da SumUp resta cablato lato server su /kitchen/status?sumup=return
 * (vedi api/kitchen-sumup-create-checkout.js), quindi il flusso ONLINE lascia questa pagina e
 * rientra già sullo status, dove la reconciliation esiste già (AC3).
 */
export default function CustomerOrderPayment() {
  const { orders } = useKitchenOrders({ scope: 'customer' });
  const [ownedIds] = useState(readOwnedOrderIds);

  const orderId = new URLSearchParams(window.location.search).get('orderId');
  const order = orderId && ownedIds.includes(orderId)
    ? orders.find((o) => o.id === orderId)
    : undefined;

  const flow = useOrderPaymentFlow(order, false);
  const { isPendingPayment, effectiveChoice } = flow;

  const goToStatus = () => navigate(orderId ? `/kitchen/status?orderId=${orderId}` : '/kitchen/status');

  // Ordine già gestito altrove (pagato, in preparazione, ecc.) o mai esistito su questo device:
  // niente bivio da mostrare, solo un accesso diretto allo status.
  useEffect(() => {
    if (order && !isPendingPayment) {
      const t = setTimeout(goToStatus, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, isPendingPayment]);

  if (!orderId || (orders.length > 0 && order === undefined)) {
    return (
      <div className="opay-page">
        <div className="opay-topbar">
          <button className="opay-topbar-back" aria-label="Torna al menu" onClick={() => navigate('/kitchen')}>←</button>
          <span className="opay-topbar-title">PAGAMENTO</span>
          <span style={{ width: 36 }} />
        </div>
        <div className="opay-empty" data-testid="opay-order-not-found">
          <h2 className="opay-empty-title">Ordine non trovato</h2>
          <p className="opay-empty-sub">
            Non abbiamo trovato questo ordine su questo dispositivo. Torna al menu per rifare l'ordine.
          </p>
          <button className="opay-empty-btn" onClick={() => navigate('/kitchen')}>← Torna al menu</button>
        </div>
      </div>
    );
  }

  if (!order) {
    // orders ancora in caricamento (poll/realtime iniziale): nessun flash di "non trovato".
    return <div className="opay-page" />;
  }

  return (
    <div className="opay-page" data-testid="opay-page">
      <div className="opay-topbar">
        <button className="opay-topbar-back" aria-label="Torna al menu" onClick={() => navigate('/kitchen')}>←</button>
        <span className="opay-topbar-title">PAGAMENTO</span>
        <span style={{ width: 36 }} />
      </div>

      <div className="opay-code-block">
        <div className="opay-code-label">IL TUO CODICE ORDINE</div>
        <div className="opay-code-big" data-testid="opay-order-code-big">{order.orderCode || '-'}</div>
      </div>

      {isPendingPayment ? (
        <>
          <OrderPaymentActions order={order} flow={flow} />
          {/* Accesso allo status sempre disponibile una volta fatta una scelta — la scelta CASSA
              non ha altro stato da attendere qui, quella ONLINE lascia comunque la pagina
              (redirect a SumUp) tranne nei casi di errore/attesa, coperti dallo stesso link. */}
          {effectiveChoice && (
            <button className="opay-go-status" data-testid="opay-go-status" onClick={goToStatus}>
              VAI ALLO STATO ORDINE →
            </button>
          )}
        </>
      ) : (
        <div className="opay-resolved" data-testid="opay-already-resolved">
          <p>Pagamento già gestito per questo ordine — ti portiamo allo stato dell'ordine…</p>
          <button className="opay-go-status" onClick={goToStatus}>VAI ALLO STATO ORDINE →</button>
        </div>
      )}
    </div>
  );
}
