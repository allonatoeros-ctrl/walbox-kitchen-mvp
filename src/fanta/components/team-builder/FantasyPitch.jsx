/*
 * FantasyPitch — campo verticale del Team Builder (redesign, fase F3).
 *
 * Componente puro: solo rendering. Nessuna logica di validazione, nessuna
 * dipendenza dal motore di calcolo, dallo storage o dal routing. Riceve dati
 * pronti e delega ogni pedina a PlayerSlot.
 */
import PlayerSlot from './PlayerSlot';

const DEFAULT_FORMATION = { GK: 1, DEF: 4, MID: 3, FWD: 3 };

const ROW_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

export default function FantasyPitch({
  playersById = {},
  selectedIds = {},
  onSlotClick,
  formation = DEFAULT_FORMATION,
}) {
  const rows = ROW_ORDER.map((role) => {
    const count = formation[role] ?? DEFAULT_FORMATION[role];
    const ids = selectedIds[role] || [];

    const slots = Array.from({ length: count }, (_, index) => {
      const playerId = ids[index];
      const player = playerId ? playersById[playerId] : null;
      const state = player ? (role === 'GK' ? 'gk' : 'filled') : 'empty';

      return {
        key: playerId || `${role}-${index}`,
        role,
        state,
        initials: player?.initials || '',
        name: player?.name || '',
        clubTag: player?.clubTag || '',
        onClick: () => onSlotClick?.(role, index, playerId),
        testId: `fanta-pitch-slot-${role}-${index}`,
      };
    });

    return { role, slots };
  });

  return (
    <div className="fw-pitch">
      {rows.map(({ role, slots }) => (
        <div key={role} className={`fw-pitch__row fw-pitch__row--${role.toLowerCase()}`}>
          {slots.map(({ key, ...slotProps }) => (
            <PlayerSlot key={key} {...slotProps} />
          ))}
        </div>
      ))}
    </div>
  );
}
