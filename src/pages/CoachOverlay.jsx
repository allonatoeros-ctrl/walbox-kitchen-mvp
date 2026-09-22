import { useEffect, useRef, useState } from 'react';
import './CoachOverlay.css';

/**
 * Componente generico: spotlight + tooltip su un elemento reale dell'app sottostante,
 * individuato via data-testid o CSS selector. Non blocca né disabilita nulla sotto di sé
 * (dimming layer con pointer-events:none, solo il proprio tooltip è cliccabile).
 *
 * step: {
 *   kind: 'click' | 'observe' | 'transition',
 *   targetTestId?: string, targetSelector?: string,
 *   title: string, body: string, ctaLabel?: string,
 * }
 * Per kind 'click': avanza SOLO quando l'utente clicca davvero sull'elemento target
 * (o un suo discendente) nell'app reale — mai su timer, mai in automatico.
 */
export default function CoachOverlay({ step, stepLabel, onAdvance }) {
  const [rect, setRect] = useState(null);
  const [mismatch, setMismatch] = useState(false);
  const mismatchTimer = useRef(null);

  const needsTarget = step && step.kind !== 'transition';

  useEffect(() => {
    if (!needsTarget) {
      const raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    let raf;
    const update = () => {
      const el = findTarget(step);
      setRect(el ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [step, needsTarget]);

  useEffect(() => {
    if (!step || step.kind !== 'click') return undefined;

    const handler = (e) => {
      if (e.target.closest('[data-coach-overlay]')) return; // clic sulla nostra UI: mai un mismatch
      const el = findTarget(step);
      if (el && (el === e.target || el.contains(e.target))) {
        setMismatch(false);
        onAdvance();
        return;
      }
      setMismatch(true);
      window.clearTimeout(mismatchTimer.current);
      mismatchTimer.current = window.setTimeout(() => setMismatch(false), 1600);
    };

    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      window.clearTimeout(mismatchTimer.current);
    };
  }, [step, onAdvance]);

  if (!step) return null;

  if (step.kind === 'transition') {
    return (
      <div className="coach-dim" data-coach-overlay>
        <div className="coach-center">
          <div className="coach-step-label">{stepLabel}</div>
          <div className="coach-title">{step.title}</div>
          <div className="coach-body">{step.body}</div>
          <button type="button" className="coach-cta" onClick={onAdvance}>
            {step.ctaLabel ?? 'Continua'}
          </button>
        </div>
      </div>
    );
  }

  // Se il target ha una posizione ancorabile (sopra o sotto) che resta dentro il viewport, la usa;
  // altrimenti (target troppo vicino al bordo o del tutto fuori viewport — es. 2026-09-22, riga
  // pagamento spinta sotto il fold da un blocco filtri piu' alto) `tooltipPosition` ritorna `null`
  // e si ricade sullo stesso fallback centrato gia' usato quando il target non si trova (classe
  // "coach-tooltip--floating", nessuna nuova regola CSS). Lo spot resta comunque sul target reale.
  const position = rect ? tooltipPosition(rect) : null;

  return (
    <div className="coach-dim" data-coach-overlay>
      {rect && (
        <div
          className="coach-spot"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        className={`coach-tooltip ${position ? '' : 'coach-tooltip--floating'}`}
        style={position ?? undefined}
      >
        <div className="coach-step-label">{stepLabel}</div>
        <div className="coach-title">{step.title}</div>
        <div className="coach-body">{step.body}</div>
        {mismatch && <div className="coach-mismatch">Non questo — guarda l'evidenziato.</div>}
        {step.kind === 'observe' && (
          <button type="button" className="coach-cta" onClick={onAdvance}>
            {step.ctaLabel ?? 'Ho capito, avanti'}
          </button>
        )}
        {step.kind === 'click' && !rect && (
          <div className="coach-waiting">In attesa dell'elemento…</div>
        )}
      </div>
    </div>
  );
}

function findTarget(step) {
  if (step.targetTestId) return document.querySelector(`[data-testid="${step.targetTestId}"]`);
  if (step.targetSelector) return document.querySelector(step.targetSelector);
  return null;
}

// Stima conservativa dell'altezza del tooltip (titolo + corpo + bottone, vedi CoachOverlay.css):
// serve solo per decidere se un ancoraggio "sopra" resta davvero dentro il viewport, mai per il
// layout vero (quello lo decide il DOM/CSS reale).
const ESTIMATED_TOOLTIP_HEIGHT = 180;
const VIEWPORT_MARGIN = 12;

function tooltipPosition(rect) {
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > 200;
  if (placeBelow) {
    return { top: rect.bottom + 16, left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)) };
  }
  // Ancoraggio "sopra": il tooltip (bottom = rect.top - 16, top = bottom - altezza, per via del
  // translateY(-100%) sotto) deve restare interamente dentro [VIEWPORT_MARGIN, innerHeight - VIEWPORT_MARGIN].
  // Se il target e' troppo vicino al bordo del viewport o del tutto fuori (2026-09-22: riga
  // pagamento sotto il fold in un training demo con blocco filtri piu' alto), nessuno dei due
  // ancoraggi e' raggiungibile: si torna `null` e il chiamante ricade sul fallback centrato.
  const anchoredBottom = rect.top - 16;
  const anchoredTop = anchoredBottom - ESTIMATED_TOOLTIP_HEIGHT;
  const fitsAbove = anchoredTop >= VIEWPORT_MARGIN && anchoredBottom <= window.innerHeight - VIEWPORT_MARGIN;
  if (!fitsAbove) return null;
  return {
    top: anchoredBottom,
    left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)),
    transform: 'translateY(-100%)',
  };
}
