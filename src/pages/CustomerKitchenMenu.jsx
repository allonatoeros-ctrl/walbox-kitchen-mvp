import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';
import { useCustomerSession } from '../hooks/useCustomerSession';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import KitchenCategoryTabs from '../components/kitchen/KitchenCategoryTabs';
import './CustomerKitchenMenu.css';

// Flat SVG icons — matching the reference flat icon style
const CATEGORY_SVGS = {
  panini: (
    <svg width="38" height="30" viewBox="0 0 38 30" fill="none">
      <rect x="1" y="0"  width="36" height="7"  rx="3.5" fill="white"/>
      <rect x="3" y="10" width="32" height="4"  rx="2"   fill="white"/>
      <rect x="3" y="16" width="32" height="4"  rx="2"   fill="white"/>
      <rect x="1" y="23" width="36" height="7"  rx="3.5" fill="white"/>
    </svg>
  ),
  patatine: (
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
      <rect x="5"  y="14" width="20" height="22" rx="3" fill="white"/>
      <rect x="0"  y="16" width="5"  height="18" rx="2" fill="white"/>
      <rect x="25" y="16" width="5"  height="18" rx="2" fill="white"/>
      <rect x="11" y="14" width="4"  height="20" rx="2" fill="white"/>
      <rect x="15" y="14" width="4"  height="20" rx="2" fill="white"/>
      <rect x="5"  y="12" width="20" height="6"  rx="2" fill="white" opacity="0.7"/>
    </svg>
  ),
  birre: (
    <svg width="22" height="36" viewBox="0 0 22 36" fill="none">
      <rect x="6"  y="0"  width="10" height="5"  rx="2" fill="white"/>
      <rect x="4"  y="4"  width="14" height="28" rx="4" fill="white"/>
      <rect x="6"  y="8"  width="4"  height="16" rx="2" fill="white" opacity="0.25"/>
    </svg>
  ),
  combo: (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <polygon points="18,2 22,13 34,13 24,21 28,33 18,25 8,33 12,21 2,13 14,13" fill="white"/>
    </svg>
  ),
};

const CATEGORIES = [
  { key: 'panini',   label: 'PANINI',   icon: CATEGORY_SVGS.panini   },
  { key: 'patatine', label: 'PATATINE', icon: CATEGORY_SVGS.patatine },
  { key: 'birre',    label: 'BIRRE',    icon: CATEGORY_SVGS.birre    },
  { key: 'combo',    label: 'COMBO',    icon: CATEGORY_SVGS.combo    },
];

const promoItem =
  kitchenMenuItems.find((i) => i.id === 'item-007') ||
  kitchenMenuItems.find((i) => i.category === 'combo');



function drawerIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('birra') || n.includes('pils')) return '🍺';
  if (n.includes('patat')) return '🍟';
  return '🍔';
}

function getCategoryTitle(cat) {
  if (cat === 'panini')   return <>I PANINI DA <span style={{ color: 'var(--k-orange)' }}>SPACCO</span></>;
  if (cat === 'patatine') return <>FRITTO <span style={{ color: 'var(--k-orange)' }}>TERAPEUTICO</span></>;
  if (cat === 'birre')    return <>SETI <span style={{ color: 'var(--k-orange)' }}>IMPLACABILI</span></>;
  if (cat === 'combo')    return <>COMBO <span style={{ color: 'var(--k-orange)' }}>LETALI</span></>;
  return cat.toUpperCase();
}

export default function CustomerKitchenMenu() {
  const { session } = useCustomerSession();
  const { addOrder } = useKitchenOrders();

  const [activeCategory, setActiveCategory] = useState('panini');
  const [orderItems, setOrderItems] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  const visibleItems = kitchenMenuItems.filter((i) => i.category === activeCategory);

  const addItem = (item) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) return prev.map((o) => o.id === item.id ? { ...o, qty: o.qty + 1 } : o);
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
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
    if (orderItems.length === 0) return;
    const newOrder = {
      id: `order-${Date.now()}`,
      table:    session.table ? `T${session.table}` : 'T7',
      nickname: session.nickname,
      items:    orderItems.map((o) => ({ itemId: o.id, name: o.name, quantity: o.qty, price: o.price })),
      total,
      status:    'received',
      createdAt: new Date().toISOString(),
    };
    addOrder(newOrder);
    try { localStorage.setItem('walbox_kitchen_last_order_id', newOrder.id); } catch { }
    setSubmittedOrderId(newOrder.id);
    setSubmitted(true);
  };

  const handleReset = () => {
    setOrderItems([]);
    setSubmittedOrderId(null);
    setSubmitted(false);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
  }, [orderItems.length, cartOpen]);

  // ── Confirm screen ────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="kitch-page">
        <div className="kitch-confirm">
          <div className="kitch-confirm-logo">🦭</div>
          <div className="kitch-confirm-title">
            IL TUO ORDINE È IN CUCINA.<br />
            <span>PREGATE.</span>
          </div>
          <div className="kitch-status-list">
            <div className="kitch-status-row">
              <div className="kitch-status-icon-done">✓</div>
              <div>
                <div className="kitch-status-label-done">RICEVUTO</div>
                <div className="kitch-status-desc">Il tuo ordine è stato ricevuto.</div>
              </div>
            </div>
            <div className="kitch-status-row">
              <div className="kitch-status-icon-pending">+</div>
              <div>
                <div className="kitch-status-label-pending">IN PREPARAZIONE</div>
                <div className="kitch-status-desc">Stiamo cucinando roba seria.</div>
              </div>
            </div>
          </div>
          <div className="kitch-follow-hint">
            <span>🔔</span>
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
          <button className="kitch-btn-secondary" onClick={handleReset}>
            NUOVO ORDINE
          </button>
        </div>
      </div>
    );
  }

  // ── Main menu ─────────────────────────────────────────────────────────
  return (
    <div className="kitch-page">

      {/* Header */}
      <div className="kitch-header">
        <div className="kitch-header-logo-box">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <path d="M5 14 C5 8 17 5 17 5 C17 5 29 8 29 14 L29 22 C29 28 17 31 17 31 C17 31 5 28 5 22 Z" fill="white" opacity="0.15"/>
            <circle cx="11" cy="17" r="5" fill="none" stroke="white" strokeWidth="2.5"/>
            <circle cx="23" cy="17" r="5" fill="none" stroke="white" strokeWidth="2.5"/>
            <path d="M16 17 H18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M6 17 C6 12 11 10 11 10" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
            <path d="M28 17 C28 12 23 10 23 10" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6"/>
          </svg>
        </div>
        <div className="kitch-header-text">
          <div className="kitch-header-title">WALRUS<br />KITCHEN</div>
          <div className="kitch-header-sub">PANINI IGNORANTI, FAME EDUCATA.</div>
        </div>
      </div>

      {/* Promo hero card */}
      {promoItem && (
        <div className="kitch-promo-wrapper">
          <div className="kitch-promo-badge">LA TOP<br />DEL BANCO</div>
          <div className="kitch-promo-card">
            <div className="kitch-promo-text">
              <div className="kitch-promo-label">COMBO</div>
              <div className="kitch-promo-name">PORCHERIA</div>
              <div className="kitch-promo-name">SERIA</div>
              <div className="kitch-promo-desc">PANINO + BIRRA + PATATINE</div>
              <div className="kitch-promo-price-pill">
                <span>14,90</span>
              </div>
            </div>
            <div className="kitch-promo-img">
              <svg width="128" height="106" viewBox="0 0 140 106" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 10,45 C 10,12 130,12 130,45 C 130,48 125,49 120,49 L 20,49 C 15,49 10,48 10,45 Z" fill="#dfa65d" />
                <rect x="6"  y="47" width="128" height="10" rx="5" fill="#69b14d" />
                <rect x="8"  y="55" width="124" height="6"  rx="3" fill="#f7cb37" />
                <rect x="10" y="59" width="120" height="16" rx="8" fill="#8c4e29" />
                <path d="M 10,72 H 130 C 130,90 110,96 70,96 C 30,96 10,90 10,72 Z" fill="#dfa65d" />
              </svg>
            </div>
          </div>
        </div>
      )}

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
          <div key={item.id} className="kitch-card">
            <div className="kitch-card-img">{CATEGORY_SVGS[item.category] ?? CATEGORY_SVGS.panini}</div>
            <div className="kitch-card-content">
              <div className="kitch-card-header">
                <div className="kitch-card-name">{item.name.toUpperCase()}</div>
                <span className="kitch-card-icon">🦭</span>
              </div>
              <div className="kitch-card-desc">{item.description}</div>
              <div className="kitch-card-footer">
                <div className="kitch-card-price">€{item.price.toFixed(2)}</div>
                <button className="kitch-btn-lo-voglio" onClick={() => addItem(item)}>LO VOGLIO</button>
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
            <div className="kitch-bottom-left" onClick={() => setCartOpen(true)}>
              <div className="kitch-cart-icon-wrap">
                🛍️
                <div className="kitch-cart-badge">{orderItems.reduce((s, o) => s + o.qty, 0)}</div>
              </div>
              <div>
                <div className="kitch-bottom-title">
                  {orderItems.reduce((s, o) => s + o.qty, 0)} ROBE NEL SACCO
                </div>
                <div className="kitch-bottom-total">€{total.toFixed(2)}</div>
              </div>
            </div>
            <button className="kitch-btn-vai" onClick={() => setCartOpen(true)}>
              VAI ALL'ORDINE
            </button>
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
            {orderItems.map((o) => (
              <div key={o.id} className="kitch-drawer-row">
                <div className="kitch-drawer-row-img">{drawerIcon(o.name)}</div>
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

            <div className="kitch-upsell">
              <div className="kitch-upsell-text">
                <div className="kitch-upsell-title">AGGIUNGI E RISPARMIA!</div>
                <div className="kitch-upsell-sub">RENDI LA TUA COMBO</div>
                <div className="kitch-upsell-price">+€2,00</div>
              </div>
              <div className="kitch-upsell-img">🍟🍺</div>
              <button className="kitch-upsell-add" onClick={() => setActiveCategory('combo')}>+</button>
            </div>

            <div className="kitch-drawer-total-row">
              <div className="kitch-drawer-total-label">TOTALE</div>
              <div className="kitch-drawer-total-value">€{total.toFixed(2)}</div>
            </div>
            <button className="kitch-btn-submit" onClick={handleSubmit}>VAI ALL'ORDINE</button>
            <div className="kitch-secure-hint">🔒 Ordine sicuro e veloce</div>
          </div>
        </div>
      )}
    </div>
  );
}
