import { useState, useEffect } from 'react';
import { kitchenOrderStatuses } from '../data/kitchenMockData';
import { useKitchenOrders, getOwnedOrderIds, rememberOwnedOrderId } from '../hooks/useKitchenOrders';
import CustomerOrderPanel from '../components/kitchen/CustomerOrderPanel';
import NotificationOptIn from '../components/kitchen/NotificationOptIn';
import './CustomerOrderStatus.css';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// P0 privacy (2026-09-16). `useKitchenOrders` legge TUTTI gli ordini del locale (stessa hook
// dello staff): la selezione qui è quindi l'unico confine fra il cliente e gli ordini altrui.
// Regola unica: è mio solo l'ordine creato da questo dispositivo (registro
// `walbox_kitchen_my_order_ids`, scritto al submit in CustomerKitchenMenu).
// Vietati e rimossi i vecchi fallback: `orders[0]`, l'ordine più recente del locale, e il match
// per nickname/tavolo — entrambi condivisi fra clienti diversi e quindi non una prova di proprietà.
function readOwnedOrderIds() {
  const ids = getOwnedOrderIds();
  try {
    // Retro-compatibilità: sessione cliente aperta prima di questo fix, quando l'unica traccia
    // dell'ordine proprio era `walbox_kitchen_last_order_id` (scritto dallo stesso submit).
    const legacyId = localStorage.getItem('walbox_kitchen_last_order_id');
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);
  } catch { }
  return ids;
}

// Un orderId in querystring non è una prova di proprietà (è condivisibile e ispezionabile):
// vale solo se quell'ordine risulta già di questo dispositivo. Usato solo per decidere quale
// ordine è il target dell'eventuale reconciliation SumUp al ritorno (AC7 req 6) — non più per
// scegliere quale ordine mostrare, dato che ora sono tutti visibili contemporaneamente.
function resolveUrlOrderId(ownedIds) {
  const urlOrderId = new URLSearchParams(window.location.search).get('orderId');
  return urlOrderId && ownedIds.includes(urlOrderId) ? urlOrderId : null;
}

const sumupReturnRequested = new URLSearchParams(window.location.search).get('sumup') === 'return';

export default function CustomerOrderStatus() {
  // scope cliente: lo storage locale di questa pagina contiene solo gli ordini creati da
  // questo dispositivo, mai la cache della lista ordini del locale lasciata da staff/cassa.
  const { orders } = useKitchenOrders({ scope: 'customer' });
  const [ownedIds, setOwnedIds] = useState(readOwnedOrderIds);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    const handleNav = () => setOwnedIds(readOwnedOrderIds());
    window.addEventListener('popstate', handleNav);
    return () => window.removeEventListener('popstate', handleNav);
  }, []);

  // Unico insieme di ordini che questa pagina può leggere. Ogni blocco ordine (AC7) parte solo da
  // qui: nessun ramo risale mai a `orders`, che contiene anche gli ordini degli altri clienti del
  // locale.
  const myOrders = orders.filter((o) => ownedIds.includes(o.id));

  // AC7: tutti gli ordini attivi, impilati verticalmente, nessun cap. `delivered`/`cancelled`
  // restano fuori dalla vista attiva (AC4/AC5) — quando un ordine passa a uno di questi due stati
  // sparisce da qui al render successivo, senza bisogno di un redirect esplicito: non esiste più
  // un "ordine corrente" da cui allontanarsi.
  const activeOrders = myOrders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // AC7 req 6: la reconciliation al ritorno da SumUp riguarda solo l'ordine il cui id combacia
  // con `?orderId=` in querystring — mai un fallback sul più recente.
  const sumupReturnTargetId = sumupReturnRequested ? resolveUrlOrderId(ownedIds) : null;

  return (
    <div className="ost-page notranslate" translate="no">

      {/* TopBar */}
      <div className="ost-topbar">
        <button className="ost-topbar-back" aria-label="Torna al menu" onClick={() => navigate('/kitchen')}>←</button>
        <span className="ost-topbar-title">STATO ORDINE</span>
        <span className="ost-topbar-bell">🔔</span>
      </div>

      {activeOrders.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }} data-testid="order-status-empty">
          <h2 className="ost-empty-title">
            {myOrders.length === 0 ? 'Nessun ordine trovato' : 'Nessun ordine attivo'}
          </h2>
          <p className="ost-empty-sub">
            {myOrders.length === 0
              ? 'Non abbiamo trovato nessun ordine inviato da questo dispositivo. Gli ordini restano visibili solo sul telefono da cui li hai inviati.'
              : 'I tuoi ordini precedenti sono stati consegnati o annullati.'}
          </p>
          <button className="ost-topbar-back-btn" onClick={() => navigate('/kitchen')}>
            ← Torna al menu
          </button>
        </div>
      ) : (
        <>
          <NotificationOptIn />
          {/* Striscia codici — il codice ordine resta visibile anche fuori dal riquardo (follow-up UX 2026-09-18) */}
          <div className="ost-codes-strip" data-testid="ost-codes-strip">
            {activeOrders.map((o) => (
              <div key={o.id} className="ost-codes-chip">
                <span className="ost-codes-chip-code">{o.orderCode || '-'}</span>
                <span className="ost-codes-chip-status">{kitchenOrderStatuses[o.status]?.label ?? o.status}</span>
              </div>
            ))}
          </div>
          <div className="ost-orders-stack">
          {activeOrders.map((o) => (
            <CustomerOrderPanel
              key={o.id}
              order={o}
              isReturnTarget={o.id === sumupReturnTargetId}
            />
          ))}
          </div>
        </>
      )}

      {/* DemoStateControls */}
      {import.meta.env.DEV && (
        <>
          <div className="ost-dev-toggle-row">
            <button className="ost-dev-toggle-btn" onClick={() => setDevOpen((v) => !v)}>
              {devOpen ? '▲ Dev tools' : '▼ Dev tools'}
            </button>
          </div>
          {devOpen && (
            <div className="ost-dev-bar">
              <span className="ost-dev-label">simula ordine:</span>
              {orders.map((o) => (
                <button
                  key={o.id}
                  className={`ost-dev-btn${ownedIds.includes(o.id) ? ' ost-dev-btn--active' : ''}`}
                  onClick={() => {
                    // Solo DEV (rimosso dal bundle di produzione): simulare un ordine significa
                    // adottarlo esplicitamente come proprio, così il percorso di lettura resta
                    // sempre e solo `myOrders` — nessuna scorciatoia che bypassa il filtro.
                    rememberOwnedOrderId(o.id);
                    setOwnedIds(readOwnedOrderIds());
                  }}
                >
                  {o.nickname} · {kitchenOrderStatuses[o.status]?.label}
                </button>
              ))}
              <div className="ost-dev-note">Demo locale · sync multi-device richiederà Supabase</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
