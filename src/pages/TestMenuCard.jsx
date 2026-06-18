import MenuCard from '../components/kitchen/MenuCard';

const mockItems = [
  {
    id: 1,
    name: 'Walrus Burger',
    description: 'Doppio manzo, cheddar fuso, cipolla caramellata, salsa segreta del Walrus. Non chiedere cosa c\'è dentro.',
    price: 14.00,
    image: null,
  },
  {
    id: 2,
    name: 'Fish & Chips del Porto',
    description: 'Merluzzo in pastella, chips croccanti, salsa tartara fatta in casa. Come se fossi a Liverpool ma con più birra.',
    price: 12.50,
    image: null,
  },
  {
    id: 3,
    name: 'Nachos Sta Salendo Male',
    description: 'Tortilla chips, guacamole, jalapeños, panna acida e cheddar. Ordinali solo se sei sicuro di te.',
    price: 9.00,
    image: null,
  },
];

export default function TestMenuCard() {
  const handleAdd = (item) => {
    alert(`Aggiunto: ${item.name}`);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>THE WALRUS KITCHEN</h1>
        <p style={styles.subtitle}>Test — MenuCard Component</p>
      </header>

      <div style={styles.grid}>
        {mockItems.map((item) => (
          <MenuCard
            key={item.id}
            image={item.image}
            name={item.name}
            description={item.description}
            price={item.price}
            onAdd={() => handleAdd(item)}
          />
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-background)',
    padding: '24px 16px 48px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: 900,
    color: 'var(--color-cream)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: '0.8rem',
    color: 'var(--color-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
    maxWidth: '960px',
    margin: '0 auto',
  },
};
