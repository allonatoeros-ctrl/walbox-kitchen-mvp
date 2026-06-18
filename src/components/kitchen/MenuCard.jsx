/**
 * MenuCard — customer-facing kitchen menu item card.
 * Props: image, name, description, price, onAdd
 */
export default function MenuCard({ image, name, description, price, onAdd }) {
  return (
    <article style={styles.card}>
      <div style={styles.imageWrapper}>
        {image ? (
          <img src={image} alt={name} style={styles.image} />
        ) : (
          <div style={styles.imagePlaceholder} />
        )}
      </div>

      <div style={styles.body}>
        <h3 style={styles.name}>{name}</h3>
        {description && <p style={styles.description}>{description}</p>}

        <div style={styles.footer}>
          <span style={styles.price}>
            {typeof price === 'number' ? `€ ${price.toFixed(2)}` : price}
          </span>
          <button style={styles.cta} onClick={onAdd} type="button">
            LO VOGLIO
          </button>
        </div>
      </div>
    </article>
  );
}

const styles = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-surface-mid)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: '4 / 3',
    overflow: 'hidden',
    background: 'var(--color-background-dark)',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    background: 'var(--color-surface-mid)',
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexGrow: 1,
  },
  name: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--color-cream)',
    lineHeight: 1.2,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  description: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'var(--color-cream-soft)',
    lineHeight: 1.5,
    flexGrow: 1,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '8px',
    gap: '12px',
  },
  price: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap',
  },
  cta: {
    background: 'var(--color-cta)',
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 18px',
    fontSize: '0.85rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s ease',
  },
};
