import { useState, useMemo, useEffect } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import { isEveningServiceActive } from '../lib/kitchenServiceRules';
import { getStaffSession, onAuthStateChange, isKitchenStaff } from '../lib/supabaseAuth';
import './CounterAssistedOrder.css';

/**
 * MODALITÀ CASSA — ordine assistito dallo staff (/kitchen/cassa).
 *
 * Il cliente ordina a voce al banco e non usa l'app: lo staff compone l'ordine per lui da
 * tablet, incassa CONTANTI o POS e l'ordine entra nella coda normale di /kitchen/solo con il
 * suo codice Axx.
 *
 * NON è una seconda Kitchen: catalogo, creazione ordine, Payment Hub e lifecycle sono
 * esattamente gli stessi del flusso cliente —
 *   - catalogo/disponibilità: useKitchenMenu() (stessi item, prezzi e "esaurito")
 *   - regola di servizio birre `evening_only`: kitchenServiceRules (fonte unica, non duplicata)
 *   - creazione ordine: useKitchenOrders().addOrder → RPC kitchen_customer_create_order
 *     (nome/prezzo/totale/codice sempre server-side, mai dal client)
 *   - incasso: useKitchenOrders().confirmPayment → RPC kitchen_payment_record_counter
 *     ('cash' | 'card_counter_manual'), che porta l'ordine a payment_status=paid e
 *     status pending_counter_payment → received, cioè nella coda DA FARE di /kitchen/solo.
 *
 * Nessuna modifica a DB/RLS/schema: l'ordine assistito è riconoscibile tramite campi già
 * esistenti — nickname = "BANCO" e customer_note con il marcatore ASSISTED_ORDER_MARKER,
 * entrambi già mostrati allo staff in Solo Service (card MODIFICHE / NOTE + ricerca).
 */

// Marcatore in chiaro nella nota ordine: nessuna colonna nuova, nessun enum nuovo.
const ASSISTED_ORDER_MARKER = 'ORDINE ASSISTITO — SENZA APP';
const ASSISTED_ORDER_NICKNAME = 'BANCO';

// Etichette staff (non il tono cliente del menu pubblico): la cassa è una lista di lavoro.
const CATEGORY_LABELS = {
  panini: 'PANINI',
  bbq: 'PESI MASSIMI',
  cicchetti: 'CICCHETTI',
  insalatone: 'INSALATONE',
  tartare: 'TARTARE',
  tagliere: 'TAGLIERI',
  birre: 'BIRRE',
  bevande: 'BEVANDE',
  contorni: 'CONTORNI',
  patatine: 'PATATINE',
  combo: 'COMBO',
};

// Stesso ordine di lettura del menu cliente; eventuali categorie non elencate finiscono in coda.
const CATEGORY_ORDER = [
  'panini', 'bbq', 'cicchetti', 'insalatone', 'tartare',
  'tagliere', 'birre', 'bevande', 'contorni', 'patatine', 'combo',
];

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function categoryLabel(key) {
  return CATEGORY_LABELS[key] ?? key.toUpperCase();
}

/**
 * Un item è ordinabile al banco esattamente quando lo è per il cliente: prezzo confermato,
 * non esaurito, e — per le birre `evening_only` — solo dopo l'orario di servizio serale.
 * La regola oraria viene importata, mai riscritta qui (vedi kitchenServiceRules.js).
 */
function counterItemBlockReason(item, now = new Date()) {
  if (item.price == null) return 'PREZZO IN ARRIVO';
  if (item.available === false) return 'ESAURITO';
  if (item.availability === 'evening_only' && !isEveningServiceActive(now)) return 'SOLO SERA';
  return null;
}

export default function CounterAssistedOrder() {
  const [authChecked, setAuthChecked] = useState(
    () => import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true'
  );

  // Stesso guard fail-closed di KitchenSoloService.jsx / KitchenPayments.jsx (F-SEC-2):
  // nessuna sessione o sessione non-staff → login, qualsiasi errore → login.
  // L'autorità resta comunque la policy DB (le RPC usate qui richiedono is_staff_for_venue).
  useEffect(() => {
    if (import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true') return undefined;

    let subscription;
    try {
      getStaffSession()
        .then(async (session) => {
          if (!session) { navigate('/kitchen/login'); return; }
          try {
            const ok = await isKitchenStaff('walrus-main');
            if (!ok) { navigate('/kitchen/login'); return; }
          } catch {
            navigate('/kitchen/login');
            return;
          } finally {
            setAuthChecked(true);
          }
        })
        .catch(() => navigate('/kitchen/login'));

      subscription = onAuthStateChange((s) => {
        if (!s) navigate('/kitchen/login');
      }).data.subscription;
    } catch {
      navigate('/kitchen/login');
    }

    return () => subscription?.unsubscribe();
  }, []);

  if (!authChecked) return null;
  return <CounterAssistedOrderView />;
}

function CounterAssistedOrderView() {
  const { menuItems } = useKitchenMenu();
  const { addOrder, confirmPayment } = useKitchenOrders();

  // 'compose' → 'pay' → 'done'. L'ordine esiste già (e ha il suo codice) dalla fine di 'compose':
  // se lo staff abbandona in 'pay', l'ordine resta DA INCASSARE in /kitchen/solo, mai perso.
  const [step, setStep] = useState('compose');
  const [cart, setCart] = useState([]);           // [{ id, name, price, qty }]
  const [fulfillmentType, setFulfillmentType] = useState(null); // 'eat_here' | 'takeaway'
  const [staffNote, setStaffNote] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [paidMethod, setPaidMethod] = useState(null);

  const categories = useMemo(() => {
    const present = [...new Set(menuItems.map((i) => i.category).filter(Boolean))];
    return present.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [menuItems]);

  const currentCategory = activeCategory ?? categories[0] ?? null;
  const visibleItems = useMemo(
    () => menuItems.filter((i) => i.category === currentCategory),
    [menuItems, currentCategory]
  );

  const total = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0);

  const addItem = (item) => {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.id === item.id);
      if (existing) return prev.map((l) => (l.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const decItem = (id) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter((l) => l.id !== id);
      return prev.map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l));
    });
  };

  const removeLine = (id) => setCart((prev) => prev.filter((l) => l.id !== id));

  const resetAll = () => {
    setCart([]);
    setFulfillmentType(null);
    setStaffNote('');
    setCreatedOrder(null);
    setPaidMethod(null);
    setError(null);
    setStep('compose');
  };

  // La nota porta sempre il marcatore assistito in testa; l'eventuale nota dettata dal cliente
  // ("senza cipolla") la segue sulla stessa riga, così la card NOTE di Solo Service la mostra
  // già oggi senza nessuna modifica lato cucina.
  const buildNote = () => {
    const extra = staffNote.trim();
    return extra ? `${ASSISTED_ORDER_MARKER} · ${extra}` : ASSISTED_ORDER_MARKER;
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0 || !fulfillmentType || busy) return;
    setBusy(true);
    setError(null);
    // Stesso contratto di CustomerKitchenMenu.handleSubmit: l'ordine esiste solo se la RPC
    // server conferma id + order_code — nessun ordine fantasma mostrato al banco.
    const result = await addOrder({
      nickname: ASSISTED_ORDER_NICKNAME,
      items: cart.map((l) => ({ itemId: l.id, name: l.name, quantity: l.qty, price: l.price })),
      total,
      note: buildNote(),
      status: 'pending_counter_payment',
      paymentStatus: 'pending_counter_payment',
      paidAt: null,
      fulfillmentType,
    });
    setBusy(false);
    if (!result.ok) {
      setError('Ordine non creato — riprova');
      return;
    }
    setCreatedOrder(result.order);
    setStep('pay');
  };

  // Stesso gate di conferma esplicita usato in Solo Service per carta/POS: l'incasso avviene su
  // hardware esterno e l'app non può verificarlo.
  const handlePay = async (method) => {
    if (!createdOrder || busy) return;
    if (method === 'card_counter_manual') {
      const amount = createdOrder.total != null ? Number(createdOrder.total).toFixed(2) : '?';
      if (!window.confirm(`Confermi che la carta/POS è stata incassata per € ${amount}?`)) return;
    }
    setBusy(true);
    setError(null);
    const result = await confirmPayment(createdOrder.id, method);
    setBusy(false);
    if (!result?.ok) {
      setError(
        result?.reason === 'online_payment_in_progress'
          ? 'Pagamento online in corso per questo ordine — verifica prima di incassare'
          : 'Pagamento non registrato — riprova'
      );
      return;
    }
    setPaidMethod(result.method ?? method);
    setStep('done');
  };

  const canCreate = cart.length > 0 && !!fulfillmentType && !busy;

  return (
    <div className="kca-page" data-testid="cassa-page">
      <header className="kca-header">
        <span className="kca-brand">WALBOX KITCHEN</span>
        <span className="kca-divider" />
        <span className="kca-mode">
          <span aria-hidden="true">🧾</span> MODALITÀ CASSA
        </span>
        <span className="kca-claim">{ASSISTED_ORDER_MARKER}</span>
        <span className="kca-spacer" />
        <button type="button" className="kca-secondary" onClick={() => navigate('/kitchen/solo')}>
          CODA CUCINA →
        </button>
      </header>

      {step === 'compose' && (
        <div className="kca-body">
          {/* ---- CATALOGO (stesso menu reale del cliente) ---- */}
          <section className="kca-catalog">
            <div className="kca-tabs" role="tablist" aria-label="Categorie menu">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={cat === currentCategory}
                  data-testid={`cassa-tab-${cat}`}
                  className={`kca-tab ${cat === currentCategory ? 'kca-tab--active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>

            <div className="kca-grid">
              {visibleItems.map((item) => {
                const blocked = counterItemBlockReason(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!!blocked}
                    data-testid={`cassa-item-${item.id}`}
                    className={`kca-item ${blocked ? 'kca-item--blocked' : ''}`}
                    onClick={() => addItem(item)}
                  >
                    <span className="kca-item-name">{item.name.toUpperCase()}</span>
                    <span className="kca-item-price">
                      {blocked ?? `€ ${item.price.toFixed(2)}`}
                    </span>
                  </button>
                );
              })}
              {visibleItems.length === 0 && (
                <div className="kca-empty">Nessun prodotto in questa categoria.</div>
              )}
            </div>
          </section>

          {/* ---- ORDINE IN COMPOSIZIONE ---- */}
          <aside className="kca-cart">
            <div className="kca-cart-head">
              <span>ORDINE</span>
              <span className="kca-cart-count" data-testid="cassa-count">{itemCount}</span>
            </div>

            <div className="kca-cart-lines">
              {cart.length === 0 && (
                <div className="kca-cart-empty">Tocca un prodotto per aggiungerlo.</div>
              )}
              {cart.map((line) => (
                <div className="kca-line" key={line.id} data-testid={`cassa-line-${line.id}`}>
                  <span className="kca-line-name">{line.name}</span>
                  <span className="kca-line-price">€ {(line.price * line.qty).toFixed(2)}</span>
                  <div className="kca-qty">
                    <button
                      type="button"
                      aria-label={`Togli uno ${line.name}`}
                      data-testid={`cassa-minus-${line.id}`}
                      onClick={() => decItem(line.id)}
                    >
                      −
                    </button>
                    <span data-testid={`cassa-qty-${line.id}`}>{line.qty}</span>
                    <button
                      type="button"
                      aria-label={`Aggiungi uno ${line.name}`}
                      data-testid={`cassa-plus-${line.id}`}
                      onClick={() => addItem(line)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="kca-line-remove"
                      aria-label={`Rimuovi ${line.name}`}
                      onClick={() => removeLine(line.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="kca-fulfillment">
              <div className="kca-field-label">DOVE MANGIA</div>
              <div className="kca-toggle">
                <button
                  type="button"
                  data-testid="cassa-fulfillment-eat_here"
                  aria-pressed={fulfillmentType === 'eat_here'}
                  className={fulfillmentType === 'eat_here' ? 'kca-toggle-on' : ''}
                  onClick={() => setFulfillmentType('eat_here')}
                >
                  QUI
                </button>
                <button
                  type="button"
                  data-testid="cassa-fulfillment-takeaway"
                  aria-pressed={fulfillmentType === 'takeaway'}
                  className={fulfillmentType === 'takeaway' ? 'kca-toggle-on' : ''}
                  onClick={() => setFulfillmentType('takeaway')}
                >
                  PORTO VIA
                </button>
              </div>
            </div>

            <label className="kca-note">
              <span className="kca-field-label">NOTA (facoltativa)</span>
              <input
                type="text"
                value={staffNote}
                data-testid="cassa-note"
                placeholder="Es. senza cipolla"
                onChange={(e) => setStaffNote(e.target.value)}
              />
            </label>

            <div className="kca-total">
              <span>TOTALE</span>
              <span data-testid="cassa-total">€ {total.toFixed(2)}</span>
            </div>

            {error && <div className="kca-error" data-testid="cassa-error">{error}</div>}

            <button
              type="button"
              className="kca-primary"
              data-testid="cassa-create"
              disabled={!canCreate}
              onClick={handleCreateOrder}
            >
              {busy ? 'CREAZIONE...' : 'CREA ORDINE E INCASSA'}
            </button>
            {cart.length > 0 && (
              <button type="button" className="kca-ghost" onClick={resetAll}>
                SVUOTA
              </button>
            )}
          </aside>
        </div>
      )}

      {step === 'pay' && createdOrder && (
        <div className="kca-panel" data-testid="cassa-pay">
          <div className="kca-panel-label">DA INCASSARE</div>
          <div className="kca-code" data-testid="cassa-code">{createdOrder.orderCode}</div>
          <div className="kca-panel-total" data-testid="cassa-pay-total">
            € {Number(createdOrder.total).toFixed(2)}
          </div>
          <div className="kca-panel-sub">
            {createdOrder.fulfillmentType === 'takeaway' ? 'PORTO VIA' : 'MANGIA QUI'} · {ASSISTED_ORDER_MARKER}
          </div>

          {error && <div className="kca-error" data-testid="cassa-error">{error}</div>}

          <div className="kca-pay-actions">
            <button
              type="button"
              className="kca-primary kca-primary--green"
              data-testid="cassa-pay-cash"
              disabled={busy}
              onClick={() => handlePay('cash')}
            >
              CONTANTI
            </button>
            <button
              type="button"
              className="kca-primary"
              data-testid="cassa-pay-pos"
              disabled={busy}
              onClick={() => handlePay('card_counter_manual')}
            >
              POS / CARTA
            </button>
          </div>

          {/* L'ordine esiste già: uscire di qui non lo cancella, resta DA INCASSARE in coda. */}
          <button type="button" className="kca-ghost" onClick={resetAll}>
            LASCIA DA INCASSARE E TORNA ALLA CASSA
          </button>
        </div>
      )}

      {step === 'done' && createdOrder && (
        <div className="kca-panel kca-panel--done" data-testid="cassa-done">
          <div className="kca-panel-label">ORDINE IN CUCINA</div>
          <div className="kca-code kca-code--big" data-testid="cassa-code">{createdOrder.orderCode}</div>
          <div className="kca-panel-sub">
            Di' al cliente il codice <strong>{createdOrder.orderCode}</strong> e basta.
          </div>
          <div className="kca-panel-total">
            PAGATO € {Number(createdOrder.total).toFixed(2)} ·{' '}
            {paidMethod === 'cash' ? 'CONTANTI' : 'POS / CARTA'}
          </div>

          <div className="kca-pay-actions">
            <button type="button" className="kca-primary" data-testid="cassa-new" onClick={resetAll}>
              NUOVO ORDINE
            </button>
            <button type="button" className="kca-ghost" onClick={() => navigate('/kitchen/solo')}>
              VAI ALLA CODA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
