// Unica fonte per le etichette allergeni del menu cliente — evita che le 6 card
// (5 section custom + card generica) mantengano ognuna la propria mappa e
// finiscano per divergere (già successo: chiave `noci` mentre i dati usano
// `frutta_secca`, es. item-017 MORTAZZA CLASSE ALTA e item-035 LARDO & NOCI).
export const ALLERGEN_LABEL = {
  glutine:      '🌾 Glutine',
  latte:        '🥛 Latte',
  uova:         '🥚 Uova',
  pesce:        '🐟 Pesce',
  senape:       '🌿 Senape',
  soia:         '🌱 Soia',
  arachidi:     '🥜 Arachidi',
  noci:         '🥜 Frutta secca',
  frutta_secca: '🥜 Frutta secca',
  crostacei:    '🦐 Crostacei',
  sedano:       '🌿 Sedano',
};

export default function AllergenBadges({ allergens }) {
  if (!allergens || allergens.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 4px', marginTop: '6px', marginBottom: '4px' }}>
      {allergens.map((a) => (
        <span key={a} style={{
          fontSize: '12px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          padding: '2px 7px',
          borderRadius: '20px',
          background: '#ffc107',
          border: '1px solid #ffb300',
          color: '#000000',
          whiteSpace: 'nowrap',
        }}>
          {ALLERGEN_LABEL[a] ?? a}
        </span>
      ))}
    </div>
  );
}
