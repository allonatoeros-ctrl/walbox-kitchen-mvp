import { useId } from 'react';

/*
 * TeamCrest — FantaWalrus
 *
 * Ridisegno moderno-italiano.
 * - Scudi credibili (classic / round / pointed) con lieve bisello interno
 * - Motivi araldici curati: strisce verticali, banda orizzontale, palo, chevron,
 *   quarti, diagonale, campo stellato
 * - Monogramma centrale con medaglione oro/nero (grande, leggibile)
 * - 6 preset originali con riferimenti territoriali (LUPI, ARDITI, SIRENA,
 *   AQUILA, TRIDENTE, MONTAGNA). Nessun riferimento a club esistenti.
 *
 * Contratto stabile:
 *   export CREST_PRESETS: [{ id, shape, pattern, palette, name?, motto?, territory? }]
 *   export default TeamCrest({ shape, pattern, palette, initial, size,
 *                              selected, empty, medallion, showLetter, goldBorder })
 * I campi shape/pattern/palette continuano ad essere valori-stringa validi.
 */

const SHAPES = {
  classic: 'M10 8 Q50 -4 90 8 L90 55 Q90 100 50 118 Q10 100 10 55 Z',
  round:   'M10 10 Q50 0 90 10 L90 60 Q90 118 50 118 Q10 118 10 60 Z',
  pointed: 'M50 2 L88 20 L88 60 Q88 100 50 118 Q12 100 12 60 L12 20 Z',
};

// Palette moderno-italiane (fondo scudo + colore accento araldico).
// Ogni palette è stata calibrata per contrasto sul crema della tessera.
const PALETTES = {
  // Notte Adriatica: blu profondo + oro
  p1: ['#0B2A4A', '#E9C46A'],
  // Granata Storico: bordeaux + panna
  p2: ['#5A0F17', '#F4EBDA'],
  // Bosco Verticale: verde scuro + oro caldo
  p3: ['#173A2E', '#D9A441'],
  // Nero Vulcano: nero grafite + rosso pompeiano
  p4: ['#131417', '#C1272D'],
  // Tramonto Egeo: blu petrolio + panna
  p5: ['#123B4A', '#F1E4C6'],
  // Rosso Ducale: rosso scuro + oro
  p6: ['#4A0A0A', '#E3B23C'],
  // Salvia + Verde acqua
  p7: ['#274546', '#7CB7A4'],
  // Anima Prugna + Ambra
  p8: ['#2E1547', '#E8A02E'],
};

const EMPTY_PALETTE = ['#26262A', '#4A4A55'];

// Sei crest originali, moderno-italiani, con narrativa territoriale.
// eslint-disable-next-line react-refresh/only-export-components -- costante dati accoppiata al componente
export const CREST_PRESETS = [
  { id: 'crest_01', shape: 'classic', pattern: 'stripes',  palette: 'p1', name: 'ARDITI ADRIATICI',   monogram: 'A', territory: 'Costa Adriatica', motto: 'Sul mare, avanti' },
  { id: 'crest_02', shape: 'round',   pattern: 'chevron',  palette: 'p3', name: 'BOSCO VERTICALE',    monogram: 'B', territory: 'Nord Alpino',      motto: 'Radici alte' },
  { id: 'crest_03', shape: 'pointed', pattern: 'stars',    palette: 'p4', name: 'LUPI DEL COLLE',     monogram: 'L', territory: 'Colli Romani',     motto: 'Branco unito' },
  { id: 'crest_04', shape: 'classic', pattern: 'quarters', palette: 'p6', name: 'DUCATO ROSSO',       monogram: 'D', territory: 'Città Ducale',     motto: 'Storia in campo' },
  { id: 'crest_05', shape: 'round',   pattern: 'band',     palette: 'p5', name: 'SIRENA D\u2019EGEO', monogram: 'S', territory: 'Mari del Sud',     motto: 'Onda dopo onda' },
  { id: 'crest_06', shape: 'pointed', pattern: 'pole',     palette: 'p8', name: 'AQUILA IMPERIALE',   monogram: 'I', territory: 'Vette del Centro', motto: 'Vola alto' },
];

// eslint-disable-next-line react-refresh/only-export-components -- costante dati accoppiata al componente
export const TEAM_COLORS = [
  { id: 'color_gold',    label: 'ORO',      value: '#E9C46A' },
  { id: 'color_crimson', label: 'CREMISI',  value: '#C1272D' },
  { id: 'color_navy',    label: 'MARINA',   value: '#1E3A5F' },
  { id: 'color_bosco',   label: 'BOSCO',    value: '#2F6A3E' },
];

function renderPattern(pattern, bg, fg) {
  switch (pattern) {
    case 'stripes':
      // Tre pali verticali su fondo — stile bandierine da curva
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="18" y="0" width="12" height="120" fill={fg} opacity="0.92" />
          <rect x="44" y="0" width="12" height="120" fill={fg} opacity="0.92" />
          <rect x="70" y="0" width="12" height="120" fill={fg} opacity="0.92" />
        </>
      );
    case 'diagonal':
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <polygon points="0,0 100,0 0,120" fill={fg} />
        </>
      );
    case 'band':
      // Banda orizzontale + linea sottile di rifinitura
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="0" y="46" width="100" height="28" fill={fg} />
          <rect x="0" y="44" width="100" height="1.5" fill={bg} opacity="0.55" />
          <rect x="0" y="74" width="100" height="1.5" fill={bg} opacity="0.55" />
        </>
      );
    case 'quarters':
      return (
        <>
          <rect x="0" y="0" width="50" height="60" fill={bg} />
          <rect x="50" y="0" width="50" height="60" fill={fg} />
          <rect x="0" y="60" width="50" height="60" fill={fg} />
          <rect x="50" y="60" width="50" height="60" fill={bg} />
        </>
      );
    case 'pole':
      // Palo centrale ampio + bordi laterali
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="34" y="0" width="32" height="120" fill={fg} />
        </>
      );
    case 'chevron':
      // Chevron araldico: due bracci a V dall'alto verso il centro
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <polygon points="0,20 50,58 100,20 100,44 50,82 0,44" fill={fg} />
        </>
      );
    case 'stars': {
      // Campo scuro con corona di 3 stelle in alto (araldica classica)
      const star = (cx, cy, r) => {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.42;
          pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
        }
        return <polygon points={pts.join(' ')} fill={fg} />;
      };
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          {star(30, 26, 6.5)}
          {star(50, 20, 7)}
          {star(70, 26, 6.5)}
          <rect x="0" y="52" width="100" height="3" fill={fg} opacity="0.85" />
        </>
      );
    }
    default:
      return <rect x="0" y="0" width="100" height="120" fill={bg} />;
  }
}

export default function TeamCrest({
  shape = 'classic',
  pattern = 'stripes',
  palette = 'p1',
  initial = 'T',
  size = 96,
  selected = false,
  empty = false,
  medallion = false,
  showLetter = true,
  goldBorder = false,
}) {
  const clipId = useId();
  const gradId = `${clipId}-inner`;
  const finalShape = empty ? 'classic' : shape;
  const finalPattern = empty ? 'band' : pattern;
  const [bg, fg] = empty ? EMPTY_PALETTE : (PALETTES[palette] || PALETTES.p1);
  const finalInitial = empty ? 'W' : (initial || 'T').charAt(0).toUpperCase();
  const shapePath = SHAPES[finalShape] || SHAPES.classic;

  const borderColor = selected || goldBorder ? '#E9C46A' : 'rgba(0,0,0,0.4)';
  const borderWidth = selected ? 4 : goldBorder ? 3 : 2;

  return (
    <svg
      className="team-crest"
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      role="img"
      aria-label={empty ? 'Stemma non selezionato' : `Stemma squadra, iniziale ${finalInitial}`}
      style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))' }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shapePath} />
        </clipPath>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      {/* Campo araldico */}
      <g clipPath={`url(#${clipId})`}>
        {renderPattern(finalPattern, bg, fg)}
        {/* bisello interno per profondità (leggerissimo) */}
        <rect x="0" y="0" width="100" height="120" fill={`url(#${gradId})`} />
      </g>

      {/* Bordo esterno + doppio filetto oro per autenticità araldica */}
      <path
        d={shapePath}
        fill="none"
        stroke={borderColor}
        strokeWidth={borderWidth}
        style={selected ? { filter: 'drop-shadow(0 0 5px rgba(233,196,106,0.85))' } : undefined}
      />
      {!empty && (
        <path
          d={shapePath}
          fill="none"
          stroke="rgba(233,196,106,0.55)"
          strokeWidth="0.8"
          transform="translate(0,0) scale(1)"
          style={{ mixBlendMode: 'screen' }}
        />
      )}

      {/* Monogramma / lettera */}
      {showLetter && (medallion ? (
        <>
          {/* Cartiglio superiore piccolo */}
          <rect x="30" y="10" width="40" height="5" rx="1" fill="rgba(0,0,0,0.35)" />
          {/* Medaglione centrale */}
          <circle cx="50" cy="62" r="26" fill="#0F1116" />
          <circle cx="50" cy="62" r="26" fill="none" stroke="#E9C46A" strokeWidth="2.2" />
          <circle cx="50" cy="62" r="22" fill="none" stroke="rgba(233,196,106,0.5)" strokeWidth="0.7" />
          <text
            x="50"
            y="74"
            textAnchor="middle"
            fontFamily="'Anton', var(--font-display, sans-serif)"
            fontWeight="400"
            fontSize="34"
            fill="#F5D373"
            style={{ letterSpacing: '1px' }}
          >
            {finalInitial}
          </text>
          {/* Due stelline araldiche in basso */}
          <StarMini cx={38} cy={102} r={2.4} fill="#E9C46A" />
          <StarMini cx={62} cy={102} r={2.4} fill="#E9C46A" />
        </>
      ) : (
        <>
          <text
            x="50"
            y="74"
            textAnchor="middle"
            fontFamily="'Anton', var(--font-display, sans-serif)"
            fontWeight="400"
            fontSize="42"
            fill="#FFFFFF"
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 2, letterSpacing: '1px' }}
          >
            {finalInitial}
          </text>
        </>
      ))}

      {/* Indicatore selezione: filetto oro alla base */}
      {selected && <rect x="28" y="112" width="44" height="4" rx="2" fill="#E9C46A" />}
    </svg>
  );
}

function StarMini({ cx, cy, r, fill }) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} />;
}
