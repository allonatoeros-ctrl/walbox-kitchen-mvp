import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

// Re-map categories for the visual tabs
const CATEGORIES = [
  { key: 'panini', label: 'PANINI', icon: '🍔' },
  { key: 'patatine', label: 'PATATINE', icon: '🍟' },
  { key: 'birre', label: 'BIRRE', icon: '🍺' },
  { key: 'combo', label: 'COMBO', icon: '⭐' },
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

const promoItem = kitchenMenuItems.find((i) => i.id === 'item-007') || kitchenMenuItems.find(i => i.category === 'combo');

const LS_KEY = 'walbox_kitchen_orders_demo';

const CATEGORY_THEMES = {
  panini: {
    activeBg: '#e05929',
    activeBorder: '#f8c53a',
    inactiveBg: '#2d1910',
    inactiveBorder: '#442b1f',
    inactiveLabel: '#a8927d',
  },
  patatine: {
    activeBg: '#f3be32',
    activeBorder: '#e05929',
    inactiveBg: '#2c2212',
    inactiveBorder: '#41351e',
    inactiveLabel: '#a8927d',
  },
  birre: {
    activeBg: '#e05929',
    activeBorder: '#f8c53a',
    inactiveBg: '#231c18',
    inactiveBorder: '#342a24',
    inactiveLabel: '#a8927d',
  },
  combo: {
    activeBg: '#457c39',
    activeBorder: '#f8c53a',
    inactiveBg: '#1b2417',
    inactiveBorder: '#293623',
    inactiveLabel: '#a8927d',
  },
};

export default function CustomerKitchenMenu() {
  const [activeCategory, setActiveCategory] = useState('panini');
  const [orderItems, setOrderItems] = useState([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState(null);
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

  const removeAllOfItem = (id) => {
     setOrderItems((prev) => prev.filter((o) => o.id !== id));
  };

  const total = orderItems.reduce((sum, o) => sum + o.price * o.qty, 0);
  const totalPoints = orderItems.reduce((sum, o) => {
    const item = kitchenMenuItems.find((i) => i.id === o.id);
    return sum + (item ? item.points * o.qty : 0);
  }, 0);

  const handleSubmit = () => {
    if (orderItems.length === 0) return;
    let sessionTable = 'T7';
    let sessionNickname = 'Ospite Walrus';
    try {
      const raw = localStorage.getItem('walboxCustomerSession');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.table) sessionTable = `T${s.table}`;
        sessionNickname = s.nickname || 'Ospite Walrus';
      }
    } catch { }
    const newOrder = {
      id: `order-${Date.now()}`,
      table: sessionTable,
      nickname: sessionNickname,
      items: orderItems.map((o) => ({
        itemId: o.id,
        name: o.name,
        quantity: o.qty,
        price: o.price,
      })),
      total,
      status: 'received',
      createdAt: new Date().toISOString(),
      note,
    };
    try {
      const existing = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      localStorage.setItem(LS_KEY, JSON.stringify([...existing, newOrder]));
    } catch { }
    try {
      localStorage.setItem('walbox_kitchen_last_order_id', newOrder.id);
    } catch { }
    setSubmittedOrderId(newOrder.id);
    setSubmitted(true);
  };

  const handleReset = () => {
    setOrderItems([]);
    setNote('');
    setSubmittedOrderId(null);
    setSubmitted(false);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
  }, [orderItems.length, cartOpen]);

  if (submitted) {
    return (
      <div style={styles.page}>
        <div style={styles.confirmBox}>
          <div style={styles.confirmLogoWrapper}>
            <span style={{fontSize: 80}}>🦭</span>
          </div>
          <div style={styles.confirmTitle}>IL TUO ORDINE È IN CUCINA.<br/><span style={{color: '#f05a24'}}>PREGATE.</span></div>
          
          <div style={styles.statusList}>
             <div style={styles.statusRow}>
               <div style={styles.statusIconActive}>✓</div>
               <div style={styles.statusTextCol}>
                 <div style={styles.statusLabelActive}>RICEVUTO</div>
                 <div style={styles.statusDesc}>Il tuo ordine è stato ricevuto.</div>
               </div>
             </div>
             <div style={styles.statusRow}>
               <div style={{...styles.statusIcon, border: '2px dashed #f8c53a', color: '#f8c53a'}}>+</div>
               <div style={styles.statusTextCol}>
                 <div style={{...styles.statusLabelActive, color: '#f8c53a'}}>IN PREPARAZIONE</div>
                 <div style={styles.statusDesc}>Stiamo cucinando roba seria.</div>
               </div>
             </div>
          </div>

          <div style={styles.followHintBox}>
             <span style={{fontSize: 20}}>🔔</span>
             <div>
               <div style={{fontWeight: 900, color: '#f7dfb5', fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif'}}>QUANDO È PRONTO TI AVVISIAMO NOI</div>
               <div style={{fontSize: 12, color: '#aaa', marginTop: 2}}>Rimani nei paraggi, non sparire.</div>
             </div>
          </div>

          <button
            style={styles.btnFollowOrder}
            onClick={() => {
              const url = submittedOrderId ? `/kitchen/status?orderId=${submittedOrderId}` : '/kitchen/status';
              window.history.pushState({}, '', url);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            SEGUI IL TUO ORDINE
          </button>
          <button style={styles.btnSecondary} onClick={handleReset}>
            NUOVO ORDINE
          </button>
        </div>
      </div>
    );
  }

  const getCategoryTitle = (cat) => {
    switch(cat) {
       case 'panini': return <>I PANINI DA <span style={{color: '#f05a24'}}>SPACCO</span></>;
       case 'patatine': return <>FRITTO <span style={{color: '#f05a24'}}>TERAPEUTICO</span></>;
       case 'birre': return <>SETI <span style={{color: '#f05a24'}}>IMPLACABILI</span></>;
       case 'combo': return <>COMBO <span style={{color: '#f05a24'}}>LETALI</span></>;
       default: return cat.toUpperCase();
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLogo}>🦭</div>
        <div style={styles.headerTextCol}>
          <div style={styles.headerTitle}>WALRUS<br/>KITCHEN</div>
          <div style={styles.headerSub}>PANINI IGNORANTI, FAME EDUCATA.</div>
        </div>
      </div>

      {/* Promo banner */}
      {promoItem && (
        <div style={styles.promoWrapper}>
          <div style={styles.promoBadge}>LA TOP<br/>DEL<br/>BANCO</div>
          <div style={styles.promoBanner}>
             <div style={styles.promoTextCol}>
               <div style={styles.promoTitle}>COMBO</div>
               <div style={styles.promoTitleOrange}>PORCHERIA</div>
               <div style={styles.promoTitle}>SERIA</div>
               <div style={styles.promoDesc}>PANINO + BIRRA<br/>+ PATATINE</div>
               <div style={styles.promoPriceBox}>
                  <div style={styles.promoPrice}>€14,90</div>
               </div>
             </div>
             <div style={styles.promoImgBox}>
                <span style={{fontSize: 80}}>🍔🍟🍺</span>
             </div>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div style={styles.tabsContainer}>
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          const theme = CATEGORY_THEMES[cat.key];
          return (
            <button
              key={cat.key}
              style={{
                ...styles.tab,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onClick={() => setActiveCategory(cat.key)}
            >
              <div style={{
                ...styles.tabIconCircle,
                background: isActive ? theme.activeBg : theme.inactiveBg,
                borderColor: isActive ? theme.activeBorder : theme.inactiveBorder,
                boxShadow: isActive ? '0 8px 20px rgba(240, 90, 36, 0.35)' : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                 <span style={{
                   fontSize: 28,
                   transform: isActive ? 'scale(1.1)' : 'scale(1)',
                   transition: 'transform 0.2s ease',
                   display: 'inline-block',
                 }}>{cat.icon}</span>
              </div>
              <span style={{
                ...styles.tabLabel,
                color: isActive ? '#f7dfb5' : theme.inactiveLabel,
                fontWeight: isActive ? '900' : 'normal',
                transition: 'all 0.2s ease',
              }}>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section Title */}
      <div style={styles.sectionTitle}>
         {getCategoryTitle(activeCategory)}
      </div>

      {/* Menu items */}
      <div style={styles.menuList}>
        {visibleItems.map((item) => {
          const inOrder = orderItems.find((o) => o.id === item.id);
          return (
            <div key={item.id} style={styles.card}>
              <div style={styles.cardImgBox}>
                 <span style={{fontSize: 50}}>
                   {item.category === 'panini' ? '🍔' : item.category === 'patatine' ? '🍟' : item.category === 'birre' ? '🍺' : '🍔🍟'}
                 </span>
              </div>
              <div style={styles.cardContent}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardName}>{item.name.toUpperCase()}</div>
                  <span style={styles.cardLogoIcon}>🦭</span>
                </div>
                <div style={styles.cardDesc}>{item.description}</div>
                <div style={styles.cardFooter}>
                  <div style={styles.cardPrice}>€{item.price.toFixed(2)}</div>
                  <button style={styles.btnLoVoglio} onClick={() => addItem(item)}>LO VOGLIO</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Cart Bar */}
      {orderItems.length > 0 && (
        <>
          <div style={styles.bottomBarSpacer} />
          <div style={styles.bottomBar}>
            <div style={styles.bottomBarLeft} onClick={() => setCartOpen(true)}>
               <div style={styles.cartIconWrapper}>
                  🛍️
                  <div style={styles.cartBadge}>{orderItems.reduce((s, o) => s + o.qty, 0)}</div>
               </div>
               <div style={styles.bottomBarText}>
                 <div style={styles.bottomBarTitle}>
                   {orderItems.reduce((s, o) => s + o.qty, 0)} ROBE NEL SACCO
                 </div>
                 <div style={styles.bottomBarTotal}>€{total.toFixed(2)}</div>
               </div>
            </div>
            <button style={styles.btnVaiAllOrdine} onClick={() => setCartOpen(true)}>
               VAI ALL'ORDINE
            </button>
          </div>
        </>
      )}

      {/* Bottom sheet backdrop */}
      {cartOpen && (
        <div style={styles.backdrop} onClick={() => setCartOpen(false)} />
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <div style={styles.drawer}>
           <div style={styles.drawerHandle} />
           <div style={styles.drawerHeader}>
              <div style={styles.drawerTitle}>IL TUO SACCO</div>
              <button style={styles.drawerClose} onClick={() => setCartOpen(false)}>×</button>
           </div>
           <div style={styles.drawerBody}>
              {orderItems.map((o) => (
                <div key={o.id} style={styles.drawerRow}>
                   <div style={styles.drawerRowImgBox}>
                     <span style={{fontSize: 24}}>
                       {o.name.toLowerCase().includes('birra') || o.name.toLowerCase().includes('pils') ? '🍺' : o.name.toLowerCase().includes('patat') ? '🍟' : '🍔'}
                     </span>
                   </div>
                   <div style={styles.drawerRowContent}>
                      <div style={styles.drawerRowName}>{o.name.toUpperCase()}</div>
                      <div style={styles.drawerRowPrice}>€{o.price.toFixed(2)}</div>
                   </div>
                   <div style={styles.drawerRowControls}>
                      <button style={styles.qtyBtn} onClick={() => removeItem(o.id)}>−</button>
                      <span style={styles.qtyNum}>{o.qty}</span>
                      <button style={styles.qtyBtn} onClick={() => addItem(o)}>+</button>
                      <button style={styles.trashBtn} onClick={() => removeAllOfItem(o.id)}>🗑️</button>
                   </div>
                </div>
              ))}
              
              <div style={styles.upsellBanner}>
                 <div style={styles.upsellText}>
                   <div style={styles.upsellTitle}>AGGIUNGI E RISPARMIA!</div>
                   <div style={styles.upsellSub}>RENDI LA TUA COMBO</div>
                   <div style={styles.upsellPrice}>+€2,00</div>
                 </div>
                 <div style={styles.upsellImgBox}>🍟🍺</div>
                 <button style={styles.upsellAddBtn} onClick={() => setActiveCategory('combo')}>+</button>
              </div>

              <div style={styles.drawerTotalRow}>
                 <div style={styles.drawerTotalLabel}>TOTALE</div>
                 <div style={styles.drawerTotalValue}>€{total.toFixed(2)}</div>
              </div>

              <button style={styles.btnSubmitOrder} onClick={handleSubmit}>
                 VAI ALL'ORDINE
              </button>
              <div style={styles.secureOrderHint}>🔒 Ordine sicuro e veloce</div>
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
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '24px 16px 16px',
  },
  headerLogo: {
    fontSize: 50,
  },
  headerTextCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  headerTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 32,
    lineHeight: 1,
    color: '#f7dfb5',
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 14,
    color: '#f8c53a',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  promoWrapper: {
    position: 'relative',
    margin: '16px',
  },
  promoBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    background: '#f8c53a',
    color: '#20120b',
    borderRadius: '50%',
    width: 70,
    height: 70,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 12,
    lineHeight: 1,
    boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
    zIndex: 10,
    transform: 'rotate(10deg)',
  },
  promoBanner: {
    background: '#f7dfb5',
    borderRadius: 16,
    padding: '20px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  promoTextCol: {
    zIndex: 2,
  },
  promoTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 32,
    color: '#20120b',
    lineHeight: 0.9,
  },
  promoTitleOrange: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 32,
    color: '#f05a24',
    lineHeight: 0.9,
  },
  promoDesc: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    color: '#20120b',
    fontWeight: 700,
    marginTop: 8,
    lineHeight: 1.2,
  },
  promoPriceBox: {
    background: '#f05a24',
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 8,
    marginTop: 12,
  },
  promoPrice: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    color: '#f7dfb5',
    fontSize: 20,
  },
  promoImgBox: {
    position: 'absolute',
    right: -20,
    bottom: -10,
    zIndex: 1,
    opacity: 0.9,
  },
  tabsContainer: {
    display: 'flex',
    justifyContent: 'space-evenly',
    padding: '24px 12px 16px',
    marginTop: 8,
  },
  tab: {
    background: 'transparent',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    padding: 0,
  },
  tabIconCircle: {
    width: 76,
    height: 76,
    borderRadius: '50%',
    borderWidth: 3,
    borderStyle: 'solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 14,
    color: '#aaa',
  },
  sectionTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 24,
    color: '#f7dfb5',
    padding: '20px 16px 12px',
    letterSpacing: 1,
  },
  menuList: {
    padding: '0 16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  card: {
    display: 'flex',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    background: '#2b1b11',
  },
  cardImgBox: {
    width: 100,
    height: 100,
    background: '#1a0e08',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid #332115',
  },
  cardContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardName: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 20,
    color: '#f7dfb5',
    letterSpacing: 0.5,
    lineHeight: 1.1,
  },
  cardLogoIcon: {
    fontSize: 16,
    opacity: 0.8,
  },
  cardDesc: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
    lineHeight: 1.3,
    marginBottom: 8,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  cardPrice: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 20,
    color: '#f05a24',
  },
  btnLoVoglio: {
    background: '#f8c53a',
    color: '#20120b',
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    border: 'none',
    borderRadius: 24,
    padding: '6px 12px',
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
  bottomBarSpacer: {
    height: 90,
  },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#150a06',
    borderTop: '1px solid #332115',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
    zIndex: 100,
  },
  bottomBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
  },
  cartIconWrapper: {
    position: 'relative',
    fontSize: 24,
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    background: '#f05a24',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    width: 18,
    height: 18,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarText: {
    display: 'flex',
    flexDirection: 'column',
  },
  bottomBarTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 14,
    color: '#f7dfb5',
    letterSpacing: 0.5,
  },
  bottomBarTotal: {
    fontSize: 14,
    color: '#aaa',
  },
  btnVaiAllOrdine: {
    background: '#f05a24',
    color: '#f7dfb5',
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    border: 'none',
    borderRadius: 8,
    padding: '12px 20px',
    fontSize: 16,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 200,
  },
  drawer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#f7dfb5',
    borderRadius: '24px 24px 0 0',
    zIndex: 300,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHandle: {
    width: 40,
    height: 4,
    background: '#ccc',
    borderRadius: 2,
    margin: '12px auto',
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px 16px',
    borderBottom: '1px solid #e0c89e',
  },
  drawerTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 24,
    color: '#20120b',
    letterSpacing: 1,
  },
  drawerClose: {
    background: 'transparent',
    border: 'none',
    fontSize: 28,
    color: '#20120b',
    cursor: 'pointer',
    lineHeight: 1,
  },
  drawerBody: {
    overflowY: 'auto',
    padding: '16px 20px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  drawerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  drawerRowImgBox: {
    width: 60,
    height: 60,
    background: '#20120b',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  drawerRowContent: {
    flex: 1,
  },
  drawerRowName: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 16,
    color: '#20120b',
    marginBottom: 4,
  },
  drawerRowPrice: {
    color: '#b8261d',
    fontWeight: 700,
    fontSize: 14,
  },
  drawerRowControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#eaddc2',
    padding: '6px 12px',
    borderRadius: 20,
  },
  qtyBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 20,
    fontWeight: 700,
    color: '#20120b',
    cursor: 'pointer',
    width: 24,
    display: 'flex',
    justifyContent: 'center',
  },
  qtyNum: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 18,
    color: '#20120b',
    minWidth: 20,
    textAlign: 'center',
  },
  trashBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    marginLeft: 4,
  },
  upsellBanner: {
    background: '#20120b',
    borderRadius: 12,
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  upsellText: {
    display: 'flex',
    flexDirection: 'column',
  },
  upsellTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 14,
    color: '#f8c53a',
    letterSpacing: 0.5,
  },
  upsellSub: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
  },
  upsellPrice: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 700,
    marginTop: 4,
  },
  upsellImgBox: {
    fontSize: 32,
  },
  upsellAddBtn: {
    background: '#f8c53a',
    color: '#20120b',
    border: 'none',
    width: 40,
    height: 40,
    borderRadius: '50%',
    fontSize: 24,
    fontWeight: 900,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  drawerTotalLabel: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 24,
    color: '#20120b',
  },
  drawerTotalValue: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 24,
    color: '#20120b',
  },
  btnSubmitOrder: {
    background: '#f05a24',
    color: '#f7dfb5',
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    border: 'none',
    borderRadius: 12,
    padding: '16px',
    fontSize: 20,
    cursor: 'pointer',
    letterSpacing: 1,
    width: '100%',
  },
  secureOrderHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#555',
    marginTop: 8,
  },
  confirmBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
    background: '#150a06',
  },
  confirmLogoWrapper: {
    marginBottom: 20,
  },
  confirmTitle: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 36,
    color: '#f7dfb5',
    textAlign: 'center',
    lineHeight: 1,
    letterSpacing: 1,
    marginBottom: 40,
  },
  statusList: {
    width: '100%',
    maxWidth: 300,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginBottom: 40,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  statusIconActive: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#4b7a2f',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    boxSizing: 'border-box',
  },
  statusTextCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  statusLabelActive: {
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    fontSize: 16,
    color: '#4b7a2f',
    letterSpacing: 0.5,
  },
  statusDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  followHintBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#20120b',
    padding: '16px',
    borderRadius: 12,
    border: '1px solid #332115',
    marginBottom: 24,
    width: '100%',
    maxWidth: 300,
  },
  btnFollowOrder: {
    background: '#f8c53a',
    color: '#150a06',
    fontFamily: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
    border: 'none',
    borderRadius: 12,
    padding: '16px',
    fontSize: 18,
    cursor: 'pointer',
    width: '100%',
    maxWidth: 300,
    marginBottom: 12,
  },
  btnSecondary: {
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #444',
    borderRadius: 12,
    padding: '12px',
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    maxWidth: 300,
  },
};
