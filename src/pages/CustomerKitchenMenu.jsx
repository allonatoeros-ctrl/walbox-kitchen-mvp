import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';
import { useCustomerSession } from '../hooks/useCustomerSession';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import KitchenCategoryTabs from '../components/kitchen/KitchenCategoryTabs';
import './CustomerKitchenMenu.css';

// ─── KITCHEN ITEM PHOTOS ────────────────────────────────────────────────────
// Map item IDs to photo paths (served from public/assets/kitchen/).
// To replace a photo: overwrite the PNG in public/assets/kitchen/ with the same filename,
// or change the path here. Cards with no entry fall back to the SVG placeholder below.
const KITCHEN_ITEM_PHOTOS = {
  'item-001': '/assets/kitchen/photo-walrus-classic.png',
  'item-002': '/assets/kitchen/photo-tricheco-burger.png',
  'item-003': '/assets/kitchen/photo-patatine-da-banco.png',
  'item-004': '/assets/kitchen/photo-patatine-fuori-di-testa.png',
  'item-005': '/assets/kitchen/photo-birra-del-tricheco.png',
  'item-006': '/assets/kitchen/photo-birra-scura-problematica.png',
  'item-007': '/assets/kitchen/photo-combo-cavalloooo.png',
  'item-008': '/assets/kitchen/photo-combo-sta-salendo-male.png',
};
// ────────────────────────────────────────────────────────────────────────────

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
      <rect x="5"  y="14" width="20" height="22" rx="3" fill="currentColor"/>
      <rect x="0"  y="16" width="5"  height="18" rx="2" fill="currentColor"/>
      <rect x="25" y="16" width="5"  height="18" rx="2" fill="currentColor"/>
      <rect x="11" y="14" width="4"  height="20" rx="2" fill="currentColor"/>
      <rect x="15" y="14" width="4"  height="20" rx="2" fill="currentColor"/>
      <rect x="5"  y="12" width="20" height="6"  rx="2" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  birre: (
    <svg width="22" height="36" viewBox="0 0 22 36" fill="none">
      <rect x="6"  y="0"  width="10" height="5"  rx="2" fill="currentColor"/>
      <rect x="4"  y="4"  width="14" height="28" rx="4" fill="currentColor"/>
      <rect x="6"  y="8"  width="4"  height="16" rx="2" fill="currentColor" opacity="0.25"/>
    </svg>
  ),
  combo: (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M18 2 C19.5 9 24.5 12 34 13 C25.5 17 26 23.5 28 33 C20 28 16 28 8 33 C10 23.5 10.5 17 2 13 C11.5 12 16.5 9 18 2 Z" fill="currentColor" />
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
    <div className={`kitch-page active-cat-${activeCategory}`}>
      <style>{`
        /* Overrides to match the category tabs row look of 03_category_icon_row.png */
        .kitch-tabs .kitch-tab .kitch-tab-circle {
          color: #fff;
          transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
        }

        /* PANINI tab (Yellow circle, dark icon) */
        .active-cat-panini .kitch-tabs .kitch-tab:nth-child(1) .kitch-tab-circle {
          background-color: #f8c53a !important;
          border-color: #e05929 !important;
          color: #150a06 !important;
          box-shadow: 0 8px 20px rgba(248, 197, 58, 0.4) !important;
        }

        /* PATATINE tab (Orange circle, white icon) */
        .active-cat-patatine .kitch-tabs .kitch-tab:nth-child(2) .kitch-tab-circle {
          background-color: #e05929 !important;
          border-color: #f8c53a !important;
          color: #fff !important;
          box-shadow: 0 8px 20px rgba(224, 89, 41, 0.4) !important;
        }

        /* BIRRE tab (Beige/cream circle, dark icon) */
        .active-cat-birre .kitch-tabs .kitch-tab:nth-child(3) .kitch-tab-circle {
          background-color: #f6deb5 !important;
          border-color: #e05929 !important;
          color: #150a06 !important;
          box-shadow: 0 8px 20px rgba(246, 222, 181, 0.4) !important;
        }

        /* COMBO tab (Green circle, white icon) */
        .active-cat-combo .kitch-tabs .kitch-tab:nth-child(4) .kitch-tab-circle {
          background-color: #457c39 !important;
          border-color: #f8c53a !important;
          color: #fff !important;
          box-shadow: 0 8px 20px rgba(69, 124, 57, 0.4) !important;
        }

        /* Ensure card product icons retain their white fill color */
        .kitch-card-img svg {
          color: #fff !important;
        }
      `}</style>

      {/* Header */}
      <div className="kitch-header" style={{ padding: 0, display: 'block', background: 'transparent' }}>
        <img 
          src="/assets/kitchen/01_header_walrus_kitchen.png" 
          alt="Walrus Kitchen - Panini Ignoranti, Fame Educata." 
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
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
              <img 
                src="/assets/kitchen/02_hero_combo_food_only.png" 
                alt="Combo Porcheria Seria" 
                style={{ width: '120px', height: '105px', objectFit: 'cover', objectPosition: 'right center', borderRadius: '16px', display: 'block' }}
              />
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
            <div className="kitch-card-img" style={{ overflow: 'hidden' }}>
                {KITCHEN_ITEM_PHOTOS[item.id]
                  ? <img src={KITCHEN_ITEM_PHOTOS[item.id]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (CATEGORY_SVGS[item.category] ?? CATEGORY_SVGS.panini)}
              </div>
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
