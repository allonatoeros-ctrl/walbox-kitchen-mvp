import { useState, useEffect } from 'react';
import { kitchenMenuItems, kitchenCategoryPromos, kitchenCartUpsell } from '../data/kitchenMockData';
import { useCustomerSession } from '../hooks/useCustomerSession';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import KitchenCategoryTabs from '../components/kitchen/KitchenCategoryTabs';
import './CustomerKitchenMenu.css';

// Flat SVG icons — matching the reference flat icon style (using currentColor for dynamic fill)
const CATEGORY_SVGS = {
  panini: (
    <svg width="38" height="30" viewBox="0 0 38 30" fill="none">
      <path d="M4,10 C4,5.5 10,2 19,2 C28,2 34,5.5 34,10 H4 Z M12.5,6.5 L13,5.5 L13.5,6.5 L13,7 Z M18.5,5 L19,4 L19.5,5 L19,5.5 Z M24.5,6.5 L25,5.5 L25.5,6.5 L25,7 Z" fill="currentColor" fillRule="evenodd" />
      <path d="M2,13.5 H36 V15.5 C36,17 33,17.5 31,17.5 C29,17.5 28,16 26,16 C24,16 23,17.5 21,17.5 C19,17.5 18,16 16,16 C14,16 13,17.5 11,17.5 C9,17.5 8,16 6,16 C4,16 2,16.5 2,15 Z" fill="currentColor" />
      <rect x="4" y="20" width="30" height="4" rx="2" fill="currentColor" />
      <path d="M4,26 C4,25 6,25 19,25 C32,25 34,25 34,26 V27 C34,28.5 29,30 19,30 C9,30 4,28.5 4,27 Z" fill="currentColor" />
    </svg>
  ),
  patatine: (
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
      <rect x="6" y="5" width="4" height="13" rx="1.5" transform="rotate(-10 8 11.5)" fill="currentColor" />
      <rect x="11" y="2" width="4.5" height="16" rx="2" fill="currentColor" />
      <rect x="16" y="4" width="4.5" height="14" rx="2" transform="rotate(5 18.25 11)" fill="currentColor" />
      <rect x="21" y="7" width="4" height="11" rx="1.5" transform="rotate(15 23 12.5)" fill="currentColor" />
      <path d="M5,15 C9,18 21,18 25,15 L22.5,33 C22.2,34.5 21,35 15,35 C9,35 7.8,34.5 7.5,33 Z M15,21.5 A3.5,3.5 0 1,0 15,28.5 A3.5,3.5 0 1,0 15,21.5 Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  ),
  birre: (
    <svg width="22" height="36" viewBox="0 0 22 36" fill="none">
      <rect x="9" y="1" width="4" height="2" rx="0.5" fill="currentColor" />
      <path d="M9.5,3 H12.5 V11 C12.5,11.5 13,12 17,15 V33 C17,34.5 15.5,35 11,35 C6.5,35 5,34.5 5,33 V15 C9,12 9.5,11.5 9.5,11 Z M7,19 V26 H15 V19 Z M9.5,6 V7.5 H12.5 V6 Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  ),
  combo: (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M18 2 C19.5 9 24.5 12 34 13 C25.5 17 26 23.5 28 33 C20 28 16 28 8 33 C10 23.5 10.5 17 2 13 C11.5 12 16.5 9 18 2 Z" fill="currentColor" />
    </svg>
  ),
};

const CATEGORIES = [
  { key: 'panini', label: 'PANINI', icon: CATEGORY_SVGS.panini },
  { key: 'patatine', label: 'PATATINE', icon: CATEGORY_SVGS.patatine },
  { key: 'birre', label: 'BIRRE', icon: CATEGORY_SVGS.birre },
  { key: 'combo', label: 'COMBO', icon: CATEGORY_SVGS.combo },
];

const promoItem =
  kitchenMenuItems.find((i) => i.id === 'item-007') ||
  kitchenMenuItems.find((i) => i.category === 'combo');



function generateOrderCode() {
  return 'W-' + Math.random().toString(36).slice(2, 5).toUpperCase() + Date.now().toString(36).slice(-2).toUpperCase();
}

function drawerIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('birra') || n.includes('pils')) return '🍺';
  if (n.includes('patat')) return '🍟';
  return '🍔';
}

const ALLERGEN_LABEL = {
  glutine:   '🌾 Glutine',
  latte:     '🥛 Latte',
  uova:      '🥚 Uova',
  pesce:     '🐟 Pesce',
  senape:    '🌿 Senape',
  soia:      '🌱 Soia',
  arachidi:  '🥜 Arachidi',
  noci:      '🥜 Frutta secca',
  crostacei: '🦐 Crostacei',
  sedano:    '🌿 Sedano',
};

function getCategoryTitle(cat) {
  if (cat === 'panini') return <>I PANINI DA <span style={{ color: 'var(--k-orange)' }}>SPACCO</span></>;
  if (cat === 'patatine') return <>FRITTO <span style={{ color: 'var(--k-orange)' }}>TERAPEUTICO</span></>;
  if (cat === 'birre') return <>SETI <span style={{ color: 'var(--k-orange)' }}>IMPLACABILI</span></>;
  if (cat === 'combo') return <>COMBO <span style={{ color: 'var(--k-orange)' }}>LETALI</span></>;
  return cat.toUpperCase();
}

export default function CustomerKitchenMenu() {
  const { session } = useCustomerSession();
  const { addOrder } = useKitchenOrders();
  const { menuItems } = useKitchenMenu();

  const [activeCategory, setActiveCategory] = useState('panini');
  const [orderItems, setOrderItems] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState(null);
  const [submittedOrderCode, setSubmittedOrderCode] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [bannerOrderId, setBannerOrderId] = useState(null);

  useEffect(() => {
    try {
      const lastId = localStorage.getItem('walbox_kitchen_last_order_id');
      if (lastId) setBannerOrderId(lastId);
    } catch { }
  }, []);

  useEffect(() => {
    if (!submitted || !submittedOrderId) {
      setCountdown(5);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          const url = `/kitchen/status?orderId=${submittedOrderId}`;
          window.history.pushState({}, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [submitted, submittedOrderId]);

  const visibleItems = menuItems.filter((i) => i.category === activeCategory);



  const addItem = (item) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        if (item.id === kitchenCartUpsell.id) return prev;
        return prev.map((o) => o.id === item.id ? { ...o, qty: o.qty + 1 } : o);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1, image: item.image }];
    });
  };

  const removeItem = (id) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === id);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter((o) => o.id !== id);
      return prev.map((o) => o.id === id ? { ...o, qty: o.qty - 1 } : o);
    });
  };

  const removeAllOfItem = (id) => setOrderItems((prev) => prev.filter((o) => o.id !== id));

  const total = orderItems.reduce((sum, o) => sum + o.price * o.qty, 0);

  const handleSubmit = () => {
    if (orderItems.length === 0 || submitting) return;
    setSubmitting(true);
    const orderCode = generateOrderCode();
    const newOrder = {
      id: `order-${Date.now()}`,
      table: session.table ? `T${session.table}` : 'T7',
      nickname: session.nickname,
      items: orderItems.map((o) => ({ itemId: o.id, name: o.name, quantity: o.qty, price: o.price })),
      total,
      note: customerNote.trim() || null,
      status: 'pending_counter_payment',
      paymentStatus: 'pending_counter_payment',
      paymentMethod: 'counter',
      paidAt: null,
      orderCode,
      createdAt: new Date().toISOString(),
    };
    addOrder(newOrder);
    try { localStorage.setItem('walbox_kitchen_last_order_id', newOrder.id); } catch { }
    setSubmittedOrderId(newOrder.id);
    setSubmittedOrderCode(orderCode);
    setSubmitted(true);
  };

  const handleReset = () => {
    setOrderItems([]);
    setSubmittedOrderId(null);
    setSubmittedOrderCode(null);
    setSubmitted(false);
    setSubmitting(false);
    setCountdown(5);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
  }, [orderItems.length, cartOpen]);

  // ── Confirm screen ────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="kitch-page">
        <div className="kitch-confirm">
          <div className="kitch-confirm-logo"><img src="/assets/kitchen/walrus-chef.png" className="kitch-confirm-logo-img" /></div>
          <div className="kitch-confirm-title">
            <p>ORDINE RICEVUTO —</p>
            <p>PASSA AL BANCO.</p>
          </div>
          <div className="kitch-confirm-subtitle">PORTA QUESTO CODICE.</div>
          {submittedOrderCode && (
            <div style={{
              margin: '0 0 20px',
              padding: '14px 28px',
              background: 'rgba(200,150,10,0.15)',
              border: '2px solid #c8960a',
              borderRadius: '12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'rgba(245,234,216,0.55)', marginBottom: '4px' }}>CODICE ORDINE</div>
              <div style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '0.08em', color: '#c8960a', lineHeight: 1 }}>{submittedOrderCode}</div>
            </div>
          )}
          <div className="kitch-status-list">
            <div className="kitch-status-row">
              <div className="kitch-status-col">
                <div className="kitch-status-icon-done">✓</div>
                <div className="kitch-status-connector" />
              </div>
              <div className="kitch-status-text">
                <div className="kitch-status-label-done">RICEVUTO</div>
                <div className="kitch-status-desc">Il tuo ordine è stato ricevuto.</div>
              </div>
            </div>
            <div className="kitch-status-row">
              <div className="kitch-status-col">
                <div className="kitch-status-icon-pending">+</div>
                <div className="kitch-status-connector" />
              </div>
              <div className="kitch-status-text">
                <div className="kitch-status-label-pending">IN ATTESA PAGAMENTO</div>
                <div className="kitch-status-desc">Mostra il codice e paga in cassa.</div>
              </div>
            </div>
            <div className="kitch-status-row">
              <div className="kitch-status-col">
                <div className="kitch-status-icon-inactive" />
                <div className="kitch-status-connector" />
              </div>
              <div className="kitch-status-text">
                <div className="kitch-status-label-inactive">IN PREPARAZIONE</div>
                <div className="kitch-status-desc-inactive">La cucina partirà appena lo staff conferma.</div>
              </div>
            </div>
            <div className="kitch-status-row">
              <div className="kitch-status-col">
                <div className="kitch-status-icon-inactive" />
              </div>
              <div className="kitch-status-text">
                <div className="kitch-status-label-inactive">PRONTO AL BANCO</div>
                <div className="kitch-status-desc-inactive">Vieni al banco e spacca tutto.</div>
              </div>
            </div>
          </div>
          <div className="kitch-follow-hint">
            <span className="kitch-follow-hint-icon">🔔</span>
            <div className="kitch-follow-hint-text">
              <strong>QUANDO È PRONTO TI AVVISIAMO NOI</strong>
              <small>Rimani nei paraggi, non sparire.</small>
            </div>
          </div>
          <button
            className="kitch-btn-follow"
            onClick={() => {
              const url = submittedOrderId ? `/kitchen/status?orderId=${submittedOrderId}` : '/kitchen/status';
              window.history.pushState({}, '', url);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            SEGUI IL TUO ORDINE
          </button>
          <div style={{ fontSize: '12px', color: 'rgba(245,234,216,0.45)', textAlign: 'center', marginTop: '-4px', marginBottom: '8px' }}>
            Segui il tuo ordine in {countdown}…
          </div>
          <button className="kitch-btn-secondary" onClick={handleReset}>
            NUOVO ORDINE
          </button>
        </div>
      </div>
    );
  }

  // ── Main menu ─────────────────────────────────────────────────────────
  return (
    <div className={`kitch-page active-cat-${activeCategory}`}>
      <style>{`
        .kitch-tabs .kitch-tab .kitch-tab-circle {
          transition: background-color 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
        }

        /* Inactive tab base colors (dimmed) */
        .kitch-tabs .kitch-tab:nth-child(1) .kitch-tab-circle { background-color: rgba(200,150,10,0.28) !important; color: rgba(212,200,154,0.7) !important; }
        .kitch-tabs .kitch-tab:nth-child(2) .kitch-tab-circle { background-color: rgba(184,48,32,0.28) !important; color: rgba(212,200,154,0.7) !important; }
        .kitch-tabs .kitch-tab:nth-child(3) .kitch-tab-circle { background-color: rgba(196,168,106,0.28) !important; color: rgba(212,200,154,0.7) !important; }
        .kitch-tabs .kitch-tab:nth-child(4) .kitch-tab-circle { background-color: rgba(58,74,40,0.28) !important; color: rgba(212,200,154,0.7) !important; }

        /* PANINI tab active */
        .active-cat-panini .kitch-tabs .kitch-tab:nth-child(1) .kitch-tab-circle {
          background-color: #c8960a !important;
          color: #0e0c08 !important;
          box-shadow: inset 0px 2px 4px rgba(255,255,255,0.08), inset 0px -2px 4px rgba(0,0,0,0.35), 0 6px 18px rgba(200,150,10,0.5) !important;
        }

        /* PATATINE tab active */
        .active-cat-patatine .kitch-tabs .kitch-tab:nth-child(2) .kitch-tab-circle {
          background-color: #b83020 !important;
          color: #fff !important;
          box-shadow: inset 0px 2px 4px rgba(255,255,255,0.08), inset 0px -2px 4px rgba(0,0,0,0.35), 0 6px 18px rgba(184,48,32,0.5) !important;
        }

        /* BIRRE tab active */
        .active-cat-birre .kitch-tabs .kitch-tab:nth-child(3) .kitch-tab-circle {
          background-color: #c4a86a !important;
          color: #0e0c08 !important;
          box-shadow: inset 0px 2px 4px rgba(255,255,255,0.08), inset 0px -2px 4px rgba(0,0,0,0.35), 0 6px 18px rgba(196,168,106,0.45) !important;
        }

        /* COMBO tab active */
        .active-cat-combo .kitch-tabs .kitch-tab:nth-child(4) .kitch-tab-circle {
          background-color: #3a4a28 !important;
          color: #fff !important;
          box-shadow: inset 0px 2px 4px rgba(255,255,255,0.08), inset 0px -2px 4px rgba(0,0,0,0.35), 0 6px 18px rgba(58,74,40,0.5) !important;
        }

        /* Card svg icons: dark color on cream background */
        .kitch-card-img svg {
          color: #1c1a14 !important;
        }
      `}</style>

      {/* Active order banner */}
      {bannerOrderId && (
        <button
          style={{
            position: 'sticky', top: 0, zIndex: 80, width: '100%',
            display: 'block', background: '#f05a24', border: 'none', cursor: 'pointer',
            padding: '10px 14px', textAlign: 'left',
          }}
          onClick={() => {
            const url = `/kitchen/status?orderId=${bannerOrderId}`;
            window.history.pushState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: '1.5px', color: '#fff' }}>
            HAI UN ORDINE ATTIVO → SEGUI IL TUO ORDINE
          </span>
        </button>
      )}

      {/* Missing table warning */}
      {!session.table && (
        <div style={{
          margin: '12px 16px 0',
          padding: '12px 14px',
          background: 'rgba(240,90,36,0.08)',
          border: '1px solid rgba(240,90,36,0.3)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <span style={{ flexShrink: 0, fontSize: 15 }}>⚠️</span>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(245,234,216,0.8)', lineHeight: 1.4 }}>
            Nessun tavolo rilevato — l&apos;ordine sarà assegnato al tavolo 7.{' '}
            <button
              onClick={() => {
                window.history.pushState({}, '', '/kitchen/entry');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              style={{ background: 'none', border: 'none', padding: 0, color: '#f05a24', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Torna all&apos;ingresso per selezionare il tuo tavolo.
            </button>
          </span>
        </div>
      )}

      {/* Header */}
      <div className="kitch-header" style={{ padding: 0, display: 'block', background: 'transparent' }}>
        <img
          src="/assets/kitchen/01_header_walrus_kitchen.png"
          alt="Walrus Kitchen - Panini Ignoranti, Fame Educata."
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* Promo hero card */}
      {kitchenCategoryPromos[activeCategory] ? (
        <div className="kitch-promo-wrapper">
          <img
            src={kitchenCategoryPromos[activeCategory].image}
            alt={kitchenCategoryPromos[activeCategory].alt || ''}
            style={{ width: '100%', borderRadius: '28px', display: 'block' }}
          />
        </div>
      ) : null}

      {/* Category tabs */}
      <KitchenCategoryTabs
        categories={CATEGORIES}
        activeKey={activeCategory}
        onSelect={setActiveCategory}
      />

      {/* Section title */}
      <div className="kitch-section-title">{getCategoryTitle(activeCategory)}</div>

      {/* Menu items */}
      <div className="kitch-menu-list">
        {visibleItems.map((item) => (
          <div key={item.id} className="kitch-card" style={item.available === false ? { opacity: 0.6 } : undefined}>
            <div className="kitch-card-img" style={{ overflow: 'hidden', position: 'relative' }}>
              {item.available === false && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(14,12,8,0.55)',
                  zIndex: 2,
                }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 900, letterSpacing: '0.12em',
                    color: '#f5ead8', background: 'rgba(180,40,20,0.85)',
                    padding: '4px 10px', borderRadius: '6px',
                  }}>ESAURITO</span>
                </div>
              )}
              {item.image
                ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (CATEGORY_SVGS[item.category] ?? CATEGORY_SVGS.panini)}
            </div>
            <div className="kitch-card-content">
              <div className="kitch-card-header">
                <div className="kitch-card-name">{item.name.toUpperCase()}</div>
                <span className="kitch-card-icon">🦭</span>
              </div>
              <div className="kitch-card-desc">{item.description}</div>
              {item.allergens?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 4px', marginTop: '6px', marginBottom: '4px' }}>
                  {item.allergens.map((a) => (
                    <span key={a} style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      padding: '2px 7px',
                      borderRadius: '20px',
                      background: '#ffc107',
                      border: '1px solid #ffb300',
                      color: '#000000',
                      whiteSpace: 'nowrap',
                    }}>
                      {ALLERGEN_LABEL[a] ?? a}
                    </span>
                  ))}
                </div>
              )}
              <div className="kitch-card-footer">
                <div className="kitch-card-price">€{item.price.toFixed(2)}</div>
                <button
                  className="kitch-btn-lo-voglio"
                  onClick={() => addItem(item)}
                  disabled={item.available === false}
                  style={item.available === false ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >LO VOGLIO</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom cart bar */}
      {orderItems.length > 0 && (
        <>
          <div className="kitch-bottom-spacer" />
          <div className="kitch-bottom-bar">
            <div className="kitch-bottom-card">
              <div className="kitch-bottom-left" onClick={() => setCartOpen(true)} role="button" aria-label="Apri carrello">
                <div className="kitch-cart-icon-wrap">
                  <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 7h2.5l3.8 14.5h12.4l3-10.5H10.5" stroke="#e8ddb8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="13.5" cy="27" r="2" fill="#e8ddb8"/>
                    <circle cx="23" cy="27" r="2" fill="#e8ddb8"/>
                  </svg>
                  <div className="kitch-cart-badge">{orderItems.reduce((s, o) => s + o.qty, 0)}</div>
                </div>
                <div>
                  <div className="kitch-bottom-title">
                    {orderItems.reduce((s, o) => s + o.qty, 0)} ROBE NEL SACCO
                  </div>
                  <div className="kitch-bottom-total">€{total.toFixed(2).replace('.', ',')}</div>
                </div>
              </div>
              <button className="kitch-btn-vai" onClick={() => setCartOpen(true)}>
                VAI ALL'ORDINE
              </button>
            </div>
          </div>
        </>
      )}

      {/* Backdrop */}
      {cartOpen && <div className="kitch-backdrop" onClick={() => setCartOpen(false)} />}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="kitch-drawer">
          <div className="kitch-drawer-handle" />
          <div className="kitch-drawer-header">
            <div className="kitch-drawer-title">IL TUO SACCO</div>
            <button className="kitch-drawer-close" onClick={() => setCartOpen(false)}>×</button>
          </div>
          <div className="kitch-drawer-body">
            <div className="kitch-drawer-items-list">
              {orderItems.map((o) => (
                <div key={o.id} className="kitch-drawer-row">
                  <div className="kitch-drawer-row-img">
                    {o.image ? (
                      <img
                        src={o.image}
                        alt={o.name}
                        className="kitch-drawer-row-photo"
                      />
                    ) : (
                      drawerIcon(o.name)
                    )}
                  </div>
                  <div className="kitch-drawer-row-content">
                    <div className="kitch-drawer-row-name">{o.name.toUpperCase()}</div>
                    <div className="kitch-drawer-row-price">€{o.price.toFixed(2)}</div>
                  </div>
                  <div className="kitch-drawer-row-controls">
                    <button className="kitch-qty-btn" onClick={() => removeItem(o.id)}>−</button>
                    <span className="kitch-qty-num">{o.qty}</span>
                    <button className="kitch-qty-btn" onClick={() => addItem(o)}>+</button>
                    <button className="kitch-trash-btn" onClick={() => removeAllOfItem(o.id)}>🗑️</button>
                  </div>
                </div>
              ))}

              <button
                className="kitch-upsell-promo-card"
                onClick={() => addItem(kitchenCartUpsell)}
                aria-label={`Aggiungi ${kitchenCartUpsell.name} per €${kitchenCartUpsell.price.toFixed(2).replace('.', ',')}`}
              >
                <img
                  src={kitchenCartUpsell.image}
                  alt={kitchenCartUpsell.alt || kitchenCartUpsell.name}
                  className="kitch-upsell-promo-img"
                />
              </button>
            </div>

            <div style={{ padding: '0 16px 12px' }}>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Note per la cucina (allergie, variazioni…)"
                maxLength={200}
                rows={3}
                style={{
                  width: '100%',
                  background: '#1a0800',
                  border: '1.5px solid #3a1800',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  padding: '10px 12px',
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div className="kitch-drawer-footer">
              <div className="kitch-drawer-total-row">
                <div className="kitch-drawer-total-label">TOTALE</div>
                <div className="kitch-drawer-total-value">€{total.toFixed(2)}</div>
              </div>
              <button className="kitch-btn-submit" onClick={handleSubmit} aria-label="Invia ordine" disabled={submitting} style={submitting ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>VAI ALL'ORDINE</button>
              <div className="kitch-secure-hint">🔒 Ordine sicuro e veloce</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
