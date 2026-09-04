/**
 * Category tab bar for the kitchen menu.
 * Accepts categories array, activeKey, onSelect handler.
 * Sistema cromatico unico Walrus (CLAUDE.md §8 / decisione Eros): niente
 * tinting per categoria — un solo stato attivo (red/orange + cream/gold) e
 * un solo stato inattivo (dark + cream/muted) per tutti i tab.
 */

const TAB_THEME = {
  active:   { bg: 'var(--k-orange)', border: 'var(--k-yellow)', iconColor: 'var(--k-cream)', labelColor: 'var(--k-cream)' },
  inactive: { bg: 'var(--k-surface)', border: 'transparent', iconColor: 'var(--k-text-muted)', labelColor: 'var(--k-text-muted)' },
};

export default function KitchenCategoryTabs({ categories, activeKey, onSelect }) {
  return (
    <div className="kitch-tabs">
      {categories.map((cat) => {
        const isActive = activeKey === cat.key;
        const theme    = isActive ? TAB_THEME.active : TAB_THEME.inactive;
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
                background:  theme.bg,
                borderColor: theme.border,
                boxShadow:   isActive ? '0 8px 20px rgba(240, 90, 36, 0.35)' : 'none',
              }}
            >
              <span style={{ color: theme.iconColor, transform: isActive ? 'scale(1.1)' : 'scale(1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cat.icon}
              </span>
            </div>
            <span
              className="kitch-tab-label"
              style={{ color: theme.labelColor }}
            >
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
