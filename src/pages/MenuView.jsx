const CATEGORY_LABEL = { panini: 'PANINI', patatine: 'PATATINE', birre: 'BIRRE', combo: 'COMBO' };

const CATEGORY_ORDER = ['panini', 'patatine', 'birre', 'combo'];

export default function MenuView({ menuItems, toggleAvailability }) {

  const unavailableCount = menuItems.filter((i) => !i.available).length;

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = menuItems.filter((i) => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const otherItems = menuItems.filter((i) => !CATEGORY_ORDER.includes(i.category));

  return (
    <div className="ksd-sections">
      <div className="ksd-section">
        <div className="ksd-section-header" style={{ background: '#0d1a0d', borderLeft: '3px solid #f59e0b' }}>
          <span className="ksd-section-label" style={{ color: '#f59e0b' }}>GESTIONE MENU</span>
          <span className="ksd-section-count" style={{ color: '#f59e0b' }}>
            {unavailableCount > 0
              ? `${unavailableCount} esaurit${unavailableCount === 1 ? 'o' : 'i'}`
              : `${menuItems.length} voci`}
          </span>
        </div>

        <div className="ksd-history-body" style={{ display: 'block' }}>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div style={{
                padding: '8px 14px 4px',
                fontSize: '10px',
                fontWeight: 900,
                letterSpacing: '0.12em',
                color: 'rgba(245,240,232,0.35)',
                borderBottom: '1px solid #1a1a1a',
              }}>
                {CATEGORY_LABEL[cat] || cat.toUpperCase()}
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="ksd-history-row"
                  style={{ opacity: item.available ? 1 : 0.55 }}
                >
                  <div className="ksd-history-row-left" style={{ flex: 1 }}>
                    <span
                      className="ksd-row-nickname"
                      style={{ textDecoration: item.available ? 'none' : 'line-through' }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <div className="ksd-history-row-right" style={{ gap: '10px', alignItems: 'center' }}>
                    <span className="ksd-history-total">€ {item.price.toFixed(2)}</span>
                    <button
                      onClick={() => toggleAvailability(item.id)}
                      style={{
                        background: item.available ? '#10b981' : '#6b7280',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '5px 12px',
                        cursor: 'pointer',
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                        minWidth: '110px',
                      }}
                    >
                      {item.available ? '✓ DISPONIBILE' : '✕ ESAURITO'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {otherItems.map((item) => (
            <div
              key={item.id}
              className="ksd-history-row"
              style={{ opacity: item.available ? 1 : 0.55 }}
            >
              <div className="ksd-history-row-left" style={{ flex: 1 }}>
                <span
                  className="ksd-row-nickname"
                  style={{ textDecoration: item.available ? 'none' : 'line-through' }}
                >
                  {item.name}
                </span>
                <span className="ksd-row-time" style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '4px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                }}>
                  {item.category?.toUpperCase() || '—'}
                </span>
              </div>
              <div className="ksd-history-row-right" style={{ gap: '10px', alignItems: 'center' }}>
                <span className="ksd-history-total">€ {item.price.toFixed(2)}</span>
                <button
                  onClick={() => toggleAvailability(item.id)}
                  style={{
                    background: item.available ? '#10b981' : '#6b7280',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 900,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    minWidth: '110px',
                  }}
                >
                  {item.available ? '✓ DISPONIBILE' : '✕ ESAURITO'}
                </button>
              </div>
            </div>
          ))}

          {menuItems.length === 0 && (
            <div className="ksd-history-empty">Nessuna voce nel menu.</div>
          )}
        </div>
      </div>
    </div>
  );
}
