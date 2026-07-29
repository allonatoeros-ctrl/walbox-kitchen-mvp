import { useId } from 'react';

const SHAPES = {
  classic: 'M10 8 Q50 -4 90 8 L90 55 Q90 100 50 118 Q10 100 10 55 Z',
  round:   'M10 10 Q50 0 90 10 L90 60 Q90 118 50 118 Q10 118 10 60 Z',
  pointed: 'M50 2 L88 20 L88 60 Q88 100 50 118 Q12 100 12 60 L12 20 Z',
};

const PALETTES = {
  p1: ['#0B3D91', '#F2C14E'],
  p2: ['#7A1E1E', '#F2E9DC'],
  p3: ['#1B4332', '#E8B84B'],
  p4: ['#212529', '#D62828'],
  p5: ['#003049', '#FDF0D5'],
  p6: ['#4A0E0E', '#FFB703'],
  p7: ['#264653', '#2A9D8F'],
  p8: ['#3A0CA3', '#F72585'],
};

const EMPTY_PALETTE = ['#3A3A3A', '#5C5C5C'];

// Combinazioni curate (non prodotto cartesiano libero) — coerenti col frame Figma approvato (7 celle).
// eslint-disable-next-line react-refresh/only-export-components -- costante dati accoppiata al componente, spostarla richiederebbe un nuovo file (fuori scope)
export const CREST_PRESETS = [
  { id: 'crest_01', shape: 'classic', pattern: 'stripes',  palette: 'p1' },
  { id: 'crest_02', shape: 'round',   pattern: 'band',     palette: 'p3' },
  { id: 'crest_03', shape: 'pointed', pattern: 'diagonal', palette: 'p4' },
  { id: 'crest_04', shape: 'classic', pattern: 'quarters', palette: 'p6' },
  { id: 'crest_05', shape: 'round',   pattern: 'pole',     palette: 'p7' },
  { id: 'crest_06', shape: 'pointed', pattern: 'stripes',  palette: 'p8' },
  { id: 'crest_07', shape: 'classic', pattern: 'diagonal', palette: 'p2' },
];

function renderPattern(pattern, bg, fg) {
  switch (pattern) {
    case 'stripes':
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="16" y="0" width="14" height="120" fill={fg} />
          <rect x="44" y="0" width="14" height="120" fill={fg} />
          <rect x="72" y="0" width="14" height="120" fill={fg} />
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
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="0" y="46" width="100" height="28" fill={fg} />
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
      return (
        <>
          <rect x="0" y="0" width="100" height="120" fill={bg} />
          <rect x="36" y="0" width="28" height="120" fill={fg} />
        </>
      );
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
  const finalShape = empty ? 'classic' : shape;
  const finalPattern = empty ? 'band' : pattern;
  const [bg, fg] = empty ? EMPTY_PALETTE : (PALETTES[palette] || PALETTES.p1);
  const finalInitial = empty ? 'W' : (initial || 'T').charAt(0).toUpperCase();
  const shapePath = SHAPES[finalShape] || SHAPES.classic;

  return (
    <svg
      className="team-crest"
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      role="img"
      aria-label={empty ? 'Stemma non selezionato' : `Stemma squadra, iniziale ${finalInitial}`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shapePath} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {renderPattern(finalPattern, bg, fg)}
      </g>
      <path
        d={shapePath}
        fill="none"
        stroke={selected || goldBorder ? '#F2C14E' : 'rgba(0,0,0,0.35)'}
        strokeWidth={selected ? 4 : goldBorder ? 3 : 2}
        style={selected ? { filter: 'drop-shadow(0 0 4px rgba(242,193,78,0.8))' } : undefined}
      />
      {showLetter && (medallion ? (
        <>
          <circle cx="50" cy="65" r="27" fill="#121826" stroke="#F2C14E" strokeWidth="2" />
          <text
            x="50"
            y="76"
            textAnchor="middle"
            fontFamily="var(--font-display, sans-serif)"
            fontWeight="800"
            fontSize="34"
            fill="#FFD700"
          >
            {finalInitial}
          </text>
        </>
      ) : (
        <text
          x="50"
          y="72"
          textAnchor="middle"
          fontFamily="var(--font-display, sans-serif)"
          fontWeight="800"
          fontSize="42"
          fill="#FFFFFF"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 2 }}
        >
          {finalInitial}
        </text>
      ))}
      {selected && <rect x="30" y="112" width="40" height="4" rx="2" fill="#F2C14E" />}
    </svg>
  );
}
