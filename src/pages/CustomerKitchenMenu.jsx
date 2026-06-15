import { useState } from 'react';
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
          <div style={styles.headerTitle}>WALBOX KITCHEN</div>
          <div style={styles.headerSub}>The Walrus Pub — mangia, bevi, stai.</div>
        </div>
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
                    <button style={styles.btnAdd} onClick={() => addItem(item)}>Aggiungi</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order summary */}
      {orderItems.length > 0 && (
        <div style={styles.orderBox}>
          <div style={styles.orderTitle}>Il tuo ordine</div>
          {orderItems.map((o) => (
            <div key={o.id} style={styles.orderRow}>
              <span style={styles.orderItemName}>{o.qty}× {o.name}</span>
              <span style={styles.orderItemPrice}>€{(o.price * o.qty).toFixed(2)}</span>
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
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#111',
    color: '#f5f0e8',
    fontFamily: "'Inter', sans-serif",
    paddingBottom: 120,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 16px 12px',
    borderBottom: '1px solid #2a2a2a',
  },
  headerLogo: { fontSize: 32 },
  headerTitle: { fontSize: 20, fontWeight: 800, letterSpacing: 2, color: '#f5c842' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
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
    background: '#f5c842',
    color: '#111',
    border: '1px solid #f5c842',
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
    background: '#f5c842',
    color: '#111',
    border: 'none',
    borderRadius: 20,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  orderBox: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#1a1a1a',
    borderTop: '2px solid #f5c842',
    padding: '16px',
    zIndex: 100,
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
};
