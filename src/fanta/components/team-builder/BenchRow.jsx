/*
 * BenchRow — riga panchina del Team Builder (redesign, fase F7).
 *
 * Componente puro: solo rendering. Nessuna logica di validazione, nessuna
 * dipendenza dal motore di calcolo, dallo storage o dal routing. Riceve dati
 * pronti e delega ogni pedina a PlayerSlot (variante bench, 34px).
 */
import PlayerSlot from './PlayerSlot';

const MAX_BENCH = 4;

export default function BenchRow({
  playersById = {},
  benchIds = [],
  maxBench = MAX_BENCH,
  onSlotClick,
}) {
  const slots = Array.from({ length: maxBench }, (_, index) => {
    const playerId = benchIds[index];
    const player = playerId ? playersById[playerId] : null;
    const state = player ? (player.role === 'GK' ? 'gk' : 'filled') : 'empty';

    return {
      key: playerId || `bench-${index}`,
      role: player?.role,
      state,
      initials: player?.initials || '',
      name: player?.name || '',
      clubTag: player?.clubTag || '',
      onClick: () => onSlotClick?.(index, playerId),
      testId: `fanta-bench-slot-${index}`,
    };
  });

  return (
    <div className="fw-bench">
      {slots.map(({ key, ...slotProps }) => (
        <PlayerSlot key={key} size="bench" {...slotProps} />
      ))}
    </div>
  );
}
