import { useSelectedServiceNight } from '../../hooks/useSelectedServiceNight';
import { formatServiceNightLabel } from '../../lib/kitchenServiceRules';

/**
 * Selettore UNICO service night per tutta Analytics (Storico + Cassa) — Gate 1 approvato da Eros
 * il 2026-09-21. Nessuna prop richiesta: legge/scrive lo stato condiviso via
 * useSelectedServiceNight (modulo esterno), quindi ogni istanza montata (Storico o Cassa) mostra
 * e governa la STESSA notte selezionata, anche a router SPA cambiato (vedi hook per il perche').
 */
export default function ServiceNightSelector() {
  const {
    resolvedNight, isToday, disablePrev, disableNext,
    oldestAllowedNight, todayNight, goPrev, goNext, goToday, goToDate,
  } = useSelectedServiceNight();

  return (
    <div className="ksn-selector" data-testid="service-night-selector">
      <button
        type="button"
        className="ksn-selector-arrow"
        data-testid="service-night-prev"
        onClick={goPrev}
        disabled={disablePrev}
        aria-label="Serata precedente"
      >
        ‹
      </button>

      <div className="ksn-selector-current">
        <span className="ksn-selector-date" data-testid="service-night-current">
          {formatServiceNightLabel(resolvedNight)}
        </span>
        {isToday && <span className="ksn-selector-badge">OGGI</span>}
      </div>

      <button
        type="button"
        className="ksn-selector-arrow"
        data-testid="service-night-next"
        onClick={goNext}
        disabled={disableNext}
        aria-label="Serata successiva"
      >
        ›
      </button>

      {!isToday && (
        <button
          type="button"
          className="ksn-selector-today-btn"
          data-testid="service-night-today-btn"
          onClick={goToday}
        >
          OGGI
        </button>
      )}

      <input
        type="date"
        className="ksn-selector-date-input"
        data-testid="service-night-date-input"
        value={resolvedNight}
        min={oldestAllowedNight}
        max={todayNight}
        onChange={(e) => e.target.value && goToDate(e.target.value)}
        aria-label="Scegli data serata"
      />
    </div>
  );
}
