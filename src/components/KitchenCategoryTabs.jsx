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
              <span style={{ fontSize: 28, transform: isActive ? 'scale(1.1)' : 'scale(1)', display: 'inline-block' }}>
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
