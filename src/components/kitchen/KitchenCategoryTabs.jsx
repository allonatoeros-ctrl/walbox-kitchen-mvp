/**
 * Category tab bar for the kitchen menu.
 * Accepts categories array, activeKey, onSelect handler.
 * Inline styles only for data-driven colors (per-category themes).
 */

const CATEGORY_THEMES = {
  panini:   { activeBg: '#e05929', activeBorder: '#f8c53a', inactiveBg: '#2d1910', inactiveBorder: '#442b1f' },
  patatine: { activeBg: '#f3be32', activeBorder: '#e05929', inactiveBg: '#2c2212', inactiveBorder: '#41351e' },
  birre:    { activeBg: '#e05929', activeBorder: '#f8c53a', inactiveBg: '#231c18', inactiveBorder: '#342a24' },
  combo:    { activeBg: '#457c39', activeBorder: '#f8c53a', inactiveBg: '#1b2417', inactiveBorder: '#293623' },
  bbq:      { activeBg: '#8b1e1e', activeBorder: '#f8c53a', inactiveBg: '#1f1212', inactiveBorder: '#3b1f1f' },
  box:      { activeBg: '#5c4b1f', activeBorder: '#f8c53a', inactiveBg: '#1a1810', inactiveBorder: '#332e1f' },
  tartare:  { activeBg: '#c25a6b', activeBorder: '#f8c53a', inactiveBg: '#1f1215', inactiveBorder: '#3b1f25' },
  cicchetti: { activeBg: '#b8533a', activeBorder: '#f8c53a', inactiveBg: '#1f1610', inactiveBorder: '#3b2a1a' },
  tagliere_salumi: { activeBg: '#7a3b2e', activeBorder: '#f8c53a', inactiveBg: '#1f1410', inactiveBorder: '#3b211a' },
  tagliere_formaggi: { activeBg: '#b88a3a', activeBorder: '#f8c53a', inactiveBg: '#1f1a10', inactiveBorder: '#3b321a' },
  insalatone: { activeBg: '#4a7c3f', activeBorder: '#f8c53a', inactiveBg: '#121f10', inactiveBorder: '#1f3b1a' },
  bruschette: { activeBg: '#9c5a2a', activeBorder: '#f8c53a', inactiveBg: '#1f1410', inactiveBorder: '#3b211a' },
  special:  { activeBg: '#6b4c7a', activeBorder: '#f8c53a', inactiveBg: '#14121f', inactiveBorder: '#251f3b' },
};

export default function KitchenCategoryTabs({ categories, activeKey, onSelect }) {
  return (
    <div className="kitch-tabs">
      {categories.map((cat) => {
        const isActive = activeKey === cat.key;
        const theme    = CATEGORY_THEMES[cat.key] || CATEGORY_THEMES.panini;
        return (
          <button
            key={cat.key}
            className="kitch-tab"
            style={{ transform: isActive ? 'scale(1.08)' : 'scale(1)' }}
            onClick={() => onSelect(cat.key)}
          >
            <div
              className="kitch-tab-circle"
              style={{
                background:  isActive ? theme.activeBg    : theme.inactiveBg,
                borderColor: isActive ? theme.activeBorder : theme.inactiveBorder,
                boxShadow:   isActive ? '0 8px 20px rgba(240, 90, 36, 0.35)' : 'none',
              }}
            >
              <span style={{ transform: isActive ? 'scale(1.1)' : 'scale(1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cat.icon}
              </span>
            </div>
            <span
              className="kitch-tab-label"
              style={{
                color:      isActive ? 'var(--k-text)' : '#a8927d',
                fontWeight: isActive ? '900' : 'normal',
              }}
            >
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
