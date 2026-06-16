import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

const CATEGORIES = [
  { key: 'combo', label: '🔥 Combo' },
  { key: 'panini', label: '🥪 Panini' },
  { key: 'patatine', label: '🍟 Patatine' },
  { key: 'birre', label: '🍺 Birre' },
];

const TAG_LABELS = {
  bestseller: '⭐ Best',
  hot: '🌶️ Hot',
  spicy: '🌶️ Spicy',
  veg: '🌿 Veg',
  'walrus-special': '🦭 Special',
  promo: '💥 Promo',
  combo: null,
  drink: null,
  dark: null,
};

const promoItem = kitchenMenuItems.find((i) => i.id === 'item-007');

export default function CustomerKitchenMenu() {
  const [activeCategory, setActiveCategory] = useState('combo');
  const [orderItems, setOrderItems] = useState([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const visibleItems = kitchenMenuItems.filter((i) => i.category === activeCategory);

  const addItem = (item) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) => o.id === item.id ? { ...o, qty: o.qty + 1 } : o);
      }
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

  const total = orderItems.reduce((sum, o) => sum + o.price * o.qty, 0);
  const totalPoints = orderItems.reduce((sum, o) => {
    const item = kitchenMenuItems.find((i) => i.id === o.id);
    return sum + (item ? item.points * o.qty : 0);
  }, 0);

  const handleSubmit = () => {
    if (orderItems.length === 0) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setOrderItems([]);
    setNote('');
    setSubmitted(false);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
  }, [orderItems.length, cartOpen]);

  if (submitted) {
    return (
      <div style={styles.page}>
        <div style={styles.confirmBox}>
          <div style={styles.confirmEmoji}>🐴</div>
          <div style={styles.confirmTitle}>CAVALLOOOO</div>
          <div style={styles.confirmMsg}>
            Ordine ricevuto. Ti chiamiamo quando è pronto.
          </div>
          <div style={styles.confirmSub}>Problemi fuori, cibo dentro.</div>
          <button style={styles.btnSecondary} onClick={handleReset}>
            Nuovo ordine
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLogo}>🦭</div>
        <div>
          <div style={styles.headerTitle}>WALRUS KITCHEN</div>
          <div style={styles.headerSub}>PANINI IGNORANTI, FAME EDUCATA.</div>
        </div>
      </div>

      {/* How it works strip */}
      <div style={styles.infoStrip}>
        📱 Ordina dal telefono · La cucina prepara · Ti avvisiamo quando è pronto
      </div>

      {/* Promo banner */}
      {promoItem && (
        <div style={styles.promoBanner} onClick={() => { setActiveCategory('combo'); addItem(promoItem); }}>
          <div style={styles.promoTag}>💥 PROMO SERATA</div>
          <div style={styles.promoName}>{promoItem.name}</div>
          <div style={styles.promoDesc}>{promoItem.description}</div>
          <div style={styles.promoFooter}>
            <span style={styles.promoPrice}>€{promoItem.price.toFixed(2)}</span>
            <span style={styles.promoPoints}>+{promoItem.points} punti</span>
            <span style={styles.promoAdd}>+ Aggiungi</span>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div style={styles.tabs}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            style={{ ...styles.tab, ...(activeCategory === cat.key ? styles.tabActive : {}) }}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Menu items */}
      <div style={styles.menuList}>
        {visibleItems.map((item) => {
          const inOrder = orderItems.find((o) => o.id === item.id);
          return (
            <div key={item.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={styles.cardName}>{item.name}</div>
                <div style={styles.cardPrice}>€{item.price.toFixed(2)}</div>
              </div>
              <div style={styles.cardDesc}>{item.description}</div>
              <div style={styles.cardFooter}>
                <div style={styles.tagRow}>
                  {item.tags.map((t) => TAG_LABELS[t] ? (
                    <span key={t} style={styles.tag}>{TAG_LABELS[t]}</span>
                  ) : null)}
                  <span style={styles.tagPoints}>+{item.points} pt</span>
                </div>
                <div style={styles.qtyControl}>
                  {inOrder ? (
                    <>
                      <button style={styles.qtyBtn} onClick={() => removeItem(item.id)}>−</button>
                      <span style={styles.qtyNum}>{inOrder.qty}</span>
                      <button style={styles.qtyBtn} onClick={() => addItem(item)}>+</button>
                    </>
                  ) : (
                    <button style={styles.btnAdd} onClick={() => addItem(item)}>LO VOGLIO</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating cart pill */}
      {orderItems.length > 0 && (
        <button style={styles.cartPill} onClick={() => setCartOpen(true)}>
          <span style={styles.cartPillIcon}>🛒</span>
          <span style={styles.cartPillCount}>
            {orderItems.reduce((s, o) => s + o.qty, 0)}
          </span>
          <span style={styles.cartPillDot}>·</span>
          <span style={styles.cartPillTotal}>€{total.toFixed(2)}</span>
        </button>
      )}

      {/* Bottom sheet backdrop */}
      {cartOpen && (
        <div style={styles.backdrop} onClick={() => setCartOpen(false)} />
      )}

      {/* Bottom sheet */}
      {cartOpen && (
        <div style={styles.sheet}>
          <div style={styles.sheetHandle} />
          <div style={styles.sheetHeader}>
            <span style={styles.sheetTitle}>
              Il tuo ordine
              <span style={styles.orderCount}>
                {orderItems.reduce((s, o) => s + o.qty, 0)} item
              </span>
            </span>
            <button style={styles.sheetClose} onClick={() => setCartOpen(false)}>×</button>
          </div>
          <div style={styles.sheetBody}>
            {orderItems.map((o) => (
              <div key={o.id} style={styles.sheetRow}>
                <span style={styles.sheetItemName}>{o.name}</span>
                <div style={styles.sheetRowRight}>
                  <button style={styles.sheetQtyBtn} onClick={() => removeItem(o.id)}>−</button>
                  <span style={styles.sheetQtyNum}>{o.qty}</span>
                  <button style={styles.sheetQtyBtn} onClick={() => addItem(o)}>+</button>
                  <span style={styles.sheetItemPrice}>€{(o.price * o.qty).toFixed(2)}</span>
                </div>
              </div>
            ))}
            <div style={styles.orderDivider} />
            <div style={styles.orderTotalsRow}>
              <span style={styles.orderTotal}>Totale: €{total.toFixed(2)}</span>
              <span style={styles.orderPoints}>+{totalPoints} pt</span>
            </div>
            <textarea
              style={styles.noteInput}
              placeholder="Note per la cucina (opzionale)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <button style={styles.btnSubmit} onClick={handleSubmit}>
              🐴 Invia ordine
            </button>
            <div style={styles.submitHint}>Ti avvisiamo qui quando è pronto al banco.</div>
            <button style={styles.btnContinue} onClick={() => setCartOpen(false)}>
              Continua a scegliere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#20120b',
    color: '#f7dfb5',
    fontFamily: "'Inter', sans-serif",
    paddingBottom: 80,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 16px 12px',
    borderBottom: '1px solid #2a2a2a',
  },
  headerLogo: { fontSize: 32 },
  headerTitle: { fontSize: 26, fontWeight: 900, letterSpacing: 2, color: '#f5c842' },
  headerSub: { fontSize: 13, color: '#f7dfb5', fontWeight: 700, marginTop: 4, letterSpacing: 1 },
  promoBanner: {
    margin: '16px',
    background: 'linear-gradient(135deg, #1a1a00, #2a2000)',
    border: '2px solid #f5c842',
    borderRadius: 12,
    padding: '14px 16px',
    cursor: 'pointer',
  },
  promoTag: { fontSize: 11, color: '#f5c842', fontWeight: 700, letterSpacing: 1, marginBottom: 6 },
  promoName: { fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 },
  promoDesc: { fontSize: 13, color: '#aaa', marginBottom: 10 },
  promoFooter: { display: 'flex', alignItems: 'center', gap: 10 },
  promoPrice: { fontSize: 20, fontWeight: 800, color: '#f5c842' },
  promoPoints: { fontSize: 12, color: '#888', flex: 1 },
  promoAdd: { fontSize: 13, color: '#f5c842', fontWeight: 700 },
  tabs: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    overflowX: 'auto',
  },
  tab: {
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: 20,
    color: '#aaa',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  tabActive: {
    background: '#f05a24',
    color: '#fff',
    border: '1px solid #f05a24',
  },
  menuList: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '14px',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardName: { fontSize: 16, fontWeight: 700, color: '#f5f0e8', flex: 1, marginRight: 8 },
  cardPrice: { fontSize: 17, fontWeight: 800, color: '#f5c842', flexShrink: 0 },
  cardDesc: { fontSize: 13, color: '#888', marginBottom: 10, lineHeight: 1.4 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  tag: {
    background: '#2a2a2a',
    color: '#aaa',
    fontSize: 11,
    borderRadius: 10,
    padding: '2px 8px',
    fontWeight: 600,
  },
  tagPoints: {
    background: '#1a2a1a',
    color: '#4caf50',
    fontSize: 11,
    borderRadius: 10,
    padding: '2px 8px',
    fontWeight: 700,
  },
  qtyControl: { display: 'flex', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: '1px solid #444',
    background: '#222',
    color: '#f5f0e8',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  qtyNum: { fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: 'center' },
  btnAdd: {
    background: '#f05a24',
    color: '#fff',
    border: 'none',
    borderRadius: 20,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  cartPill: {
    position: 'fixed',
    bottom: 24,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#f5c842',
    color: '#111',
    border: 'none',
    borderRadius: 28,
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    zIndex: 200,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  cartPillIcon: { fontSize: 18 },
  cartPillCount: { fontSize: 15, fontWeight: 900 },
  cartPillDot: { fontSize: 13, opacity: 0.6 },
  cartPillTotal: { fontSize: 15, fontWeight: 800 },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 300,
  },
  sheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#1a1a1a',
    borderTop: '2px solid #f5c842',
    borderRadius: '16px 16px 0 0',
    zIndex: 400,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    background: '#444',
    borderRadius: 2,
    margin: '12px auto 0',
    flexShrink: 0,
  },
  sheetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px 8px',
    flexShrink: 0,
  },
  sheetTitle: { fontSize: 14, fontWeight: 700, color: '#f5c842', letterSpacing: 1 },
  sheetClose: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px',
  },
  sheetBody: {
    overflowY: 'auto',
    padding: '4px 16px 24px',
    flex: 1,
  },
  orderTitle: { fontSize: 14, fontWeight: 700, color: '#f5c842', marginBottom: 8, letterSpacing: 1 },
  orderRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  orderItemName: { fontSize: 13, color: '#ccc' },
  orderItemPrice: { fontSize: 13, color: '#f5f0e8', fontWeight: 600 },
  orderDivider: { borderTop: '1px solid #2a2a2a', margin: '8px 0' },
  orderTotalsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderTotal: { fontSize: 17, fontWeight: 800, color: '#f5c842' },
  orderPoints: { fontSize: 13, color: '#4caf50', fontWeight: 700 },
  noteInput: {
    width: '100%',
    background: '#111',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#f5f0e8',
    fontSize: 13,
    padding: '8px 10px',
    marginBottom: 10,
    resize: 'none',
    boxSizing: 'border-box',
  },
  btnSubmit: {
    width: '100%',
    background: '#f5c842',
    color: '#111',
    border: 'none',
    borderRadius: 10,
    padding: '13px',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: 1,
  },
  btnSecondary: {
    marginTop: 20,
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 10,
    color: '#aaa',
    padding: '10px 24px',
    fontSize: 14,
    cursor: 'pointer',
  },
  confirmBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 32,
    textAlign: 'center',
  },
  confirmEmoji: { fontSize: 64, marginBottom: 16 },
  confirmTitle: { fontSize: 36, fontWeight: 900, color: '#f5c842', letterSpacing: 3, marginBottom: 12 },
  confirmMsg: { fontSize: 18, color: '#f5f0e8', marginBottom: 8, lineHeight: 1.5 },
  confirmSub: { fontSize: 14, color: '#666', marginBottom: 32 },
  infoStrip: {
    padding: '9px 16px',
    background: '#161610',
    borderBottom: '1px solid #2a2a1a',
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  orderCount: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: 600,
    color: '#888',
    background: '#2a2a2a',
    borderRadius: 10,
    padding: '2px 8px',
  },
  submitHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#888',
    marginTop: 8,
  },
  sheetRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 10,
    borderBottom: '1px solid #242424',
  },
  sheetItemName: {
    fontSize: 14,
    color: '#f5f0e8',
    fontWeight: 600,
    flex: 1,
    marginRight: 10,
  },
  sheetRowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  sheetQtyBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '1px solid #444',
    background: '#2a2a2a',
    color: '#f5f0e8',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  sheetQtyNum: {
    fontSize: 16,
    fontWeight: 800,
    color: '#f5c842',
    minWidth: 22,
    textAlign: 'center',
  },
  sheetItemPrice: {
    fontSize: 14,
    fontWeight: 700,
    color: '#f5f0e8',
    minWidth: 52,
    textAlign: 'right',
  },
  btnContinue: {
    display: 'block',
    width: '100%',
    marginTop: 12,
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 10,
    color: '#888',
    fontSize: 14,
    fontWeight: 600,
    padding: '11px',
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
};
