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

  return (
    <div className="coach-dim" data-coach-overlay>
      {rect && (
        <div
          className="coach-spot"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        className={`coach-tooltip ${rect ? '' : 'coach-tooltip--floating'}`}
        style={rect ? tooltipPosition(rect) : undefined}
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

function tooltipPosition(rect) {
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > 200;
  return placeBelow
    ? { top: rect.bottom + 16, left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)) }
    : { top: Math.max(12, rect.top - 16), left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)), transform: 'translateY(-100%)' };
}
