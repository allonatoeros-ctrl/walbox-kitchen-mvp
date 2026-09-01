import { useState, useEffect } from 'react';
import { KitchenSoloServiceView } from './KitchenSoloService';
import { useDemoKitchenOrders } from './kitchenSoloDemoFixtures';
import { usePreviewKitchenMenu } from './kitchenSoloPreviewFixtures';
import PaymentsView from './PaymentsView';
import { usePreviewKitchenPayments } from './kitchenStaffPaymentsDemoFixtures';
import { simulatedTrainingRefundAction, simulatedTrainingReconcileAction } from './kitchenTrainingFixtures';
import { TRAINING_STEPS, SCENARIO_TITLES, INTRO_COPY, OUTRO_COPY } from './kitchenTrainingScenarios';
import { PRACTICE_SCENARIOS } from './kitchenTrainingPracticeScenarios';
import CoachOverlay from './CoachOverlay';
import './CoachOverlay.css';
import './KitchenStaffDashboard.css';

const SESSION_KEY = 'kss-training-step';
const INTRO = -1;
const OUTRO = TRAINING_STEPS.length;
const PRACTICE_INTRO = 'practice-intro';
const PRACTICE_FEEDBACK = 'practice-feedback';

const SCENARIO_NUMBERS = [...new Set(TRAINING_STEPS.map((s) => s.scenario).filter(Boolean))];

function readInitialStep() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw == null) return INTRO;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= INTRO && n <= OUTRO) return n;
  } catch {
    // sessionStorage non disponibile: si riparte sempre dall'intro, mai un crash.
  }
  return INTRO;
}

const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 14px',
  background: '#eab308',
  color: '#1b232c',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: '0.03em',
  position: 'sticky',
  top: 0,
  zIndex: 9100,
};

const btnStyle = {
  border: '1px solid #1b232c',
  background: '#1b232c',
  color: '#f4f6f8',
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.02em',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
};

const checklistStyle = {
  listStyle: 'none',
  margin: '0 0 18px',
  padding: 0,
  textAlign: 'left',
  fontSize: 13,
  lineHeight: 1.7,
  color: '#d7dde3',
};

const practicePanelStyle = {
  position: 'fixed', bottom: 18, left: 18, zIndex: 9050, width: 'min(360px, calc(100vw - 36px))',
  padding: 16, borderRadius: 12, background: '#151b22', color: '#f4f6f8',
  border: '1px solid #eab308', boxShadow: '0 12px 36px #0008', fontFamily: 'system-ui, sans-serif',
};

/**
 * Kitchen Staff Training Demo (F0-F6): route /kitchen/training.
 * Riusa 1:1 KitchenSoloServiceView + PaymentsView (componenti live), con dati/azioni iniettate
 * via fixture demo esistenti + due azioni simulate locali (refund/reconcile). Zero Supabase/
 * network/refund reali, zero localStorage condiviso col live. Stato training isolato in
 * sessionStorage (chiave dedicata) solo per sopravvivere a un refresh accidentale.
 */
export default function KitchenTrainingDemo() {
  const [stepIndex, setStepIndex] = useState(readInitialStep);
  const [resetCount, setResetCount] = useState(0);
  const [practiceState, setPracticeState] = useState(PRACTICE_INTRO);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceEvents, setPracticeEvents] = useState([]);
  const [practiceErrors, setPracticeErrors] = useState([]);

  const {
    orders, updateOrderStatus: updateOrderStatusLive, confirmPayment: confirmPaymentLive, cancelOrder, updateStaffNote, retrySync, resetDemo,
  } = useDemoKitchenOrders();
  const { menuItems, toggleAvailability } = usePreviewKitchenMenu();

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, String(stepIndex));
    } catch {
      // best-effort: se sessionStorage non è scrivibile il training funziona comunque,
      // semplicemente non sopravvive a un refresh.
    }
  }, [stepIndex]);

  const currentStep = stepIndex >= 0 && stepIndex < TRAINING_STEPS.length ? TRAINING_STEPS[stepIndex] : null;
  const activePractice = stepIndex === OUTRO && practiceState === 'practice' ? PRACTICE_SCENARIOS[practiceIndex] : null;
  const activeView = currentStep?.view ?? activePractice?.view ?? 'solo';
  const visiblePracticeOrders = activePractice?.orderIds
    ? orders.filter((order) => activePractice.orderIds.includes(order.id))
    : orders;
  const scenarioCount = SCENARIO_NUMBERS.length;
  const progressLabel = currentStep?.scenario
    ? `Scenario ${currentStep.scenario}/${scenarioCount}`
    : (stepIndex === OUTRO ? 'Completato' : '');

  const handleStart = () => setStepIndex(0);

  const recordPracticeEvent = (event) => {
    setPracticeEvents((prev) => (prev.includes(event) ? prev : [...prev, event]));
  };

  const updateOrderStatus = (id, status) => {
    updateOrderStatusLive(id, status);
    if (practiceState === 'practice') recordPracticeEvent(`status:${id}:${status}`);
  };

  const confirmPayment = (id, method) => {
    confirmPaymentLive(id, method);
    if (practiceState === 'practice') recordPracticeEvent(`payment:${id}`);
  };

  const simulatedRefund = async (orderId) => {
    const result = await simulatedTrainingRefundAction(orderId);
    if (practiceState === 'practice') recordPracticeEvent(`refund:${orderId}`);
    return result;
  };

  const simulatedReconcile = async (orderId) => {
    const result = await simulatedTrainingReconcileAction(orderId);
    if (practiceState === 'practice') recordPracticeEvent(`reconcile:${orderId}`);
    return result;
  };

  const startPractice = () => {
    setPracticeState('practice');
    setPracticeIndex(0);
    setPracticeEvents([]);
    setPracticeErrors([]);
  };

  const resetPractice = () => {
    resetDemo();
    setResetCount((n) => n + 1);
    setPracticeState('practice');
    setPracticeIndex(0);
    setPracticeEvents([]);
    setPracticeErrors([]);
  };

  const acknowledgePractice = () => {
    const current = PRACTICE_SCENARIOS[practiceIndex];
    if (current?.id === 'allergen') recordPracticeEvent('ack:allergen');
    if (current?.id === 'failed') recordPracticeEvent('seen:failed');
    if (current?.id === 'sumup-success') recordPracticeEvent('seen:sumup-success');
    if (current?.id === 'refund-stuck') recordPracticeEvent('seen:refund-stuck');
    if (current?.id === 'double-refund') recordPracticeEvent('seen:double-refund');
    if (current?.id === 'close') finishPractice();
  };

  const finishPractice = () => {
    const expected = PRACTICE_SCENARIOS.map((scenario) => scenario.success).filter((key) => key !== 'close');
    const missing = expected.filter((key) => !practiceEvents.includes(key));
    setPracticeErrors(missing);
    setPracticeState(PRACTICE_FEEDBACK);
  };

  const advancePractice = () => {
    const current = PRACTICE_SCENARIOS[practiceIndex];
    if (!current) return;
    const success = current.success === 'lifecycle:D085'
      ? ['preparing', 'ready', 'delivered'].every((status) => practiceEvents.includes(`status:demo-6:${status}`))
      : current.success === 'quick-pay:D098'
        ? practiceEvents.includes('payment:demo-2')
        : current.success === 'seen:failed' || current.success === 'ack:allergen'
          ? practiceEvents.includes(current.success)
          : practiceEvents.includes(current.success);
    if (!success) setPracticeErrors((prev) => [...new Set([...prev, current.success])]);
    if (practiceIndex >= PRACTICE_SCENARIOS.length - 1) {
      finishPractice();
      return;
    }
    // Ogni situazione riparte dalle fixture iniziali: il caso precedente non può
    // alterare lo stato operativo del caso corrente (es. lifecycle prima di quick-pay).
    resetDemo();
    setResetCount((n) => n + 1);
    setPracticeIndex((index) => index + 1);
  };

  const handleAdvance = () => {
    setStepIndex((prev) => {
      const next = prev + 1;
      return next >= TRAINING_STEPS.length ? OUTRO : next;
    });
  };

  const handleRestart = () => {
    resetDemo();
    setResetCount((n) => n + 1);
    setStepIndex(INTRO);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // no-op: nessuna persistenza da pulire se sessionStorage non è disponibile.
    }
    setPracticeState(PRACTICE_INTRO);
    setPracticeIndex(0);
    setPracticeEvents([]);
    setPracticeErrors([]);
  };

  return (
    <>
      <div role="banner" data-testid="training-banner" style={bannerStyle}>
        <span>⚠ FORMAZIONE — NO DATI REALI{progressLabel ? ` · ${progressLabel}` : ''}</span>
        <button type="button" data-testid="training-restart" style={btnStyle} onClick={handleRestart}>
          RIAVVIA FORMAZIONE
        </button>
      </div>

      {stepIndex === INTRO && (
        <div className="coach-dim coach-dim--solid" data-coach-overlay>
          <div className="coach-center">
            <div className="coach-title">{INTRO_COPY.title}</div>
            <div className="coach-body">{INTRO_COPY.body}</div>
            <button type="button" className="coach-cta" data-testid="training-start" onClick={handleStart}>
              {INTRO_COPY.cta}
            </button>
          </div>
        </div>
      )}

      {stepIndex === OUTRO && practiceState === PRACTICE_INTRO && (
        <div className="coach-dim coach-dim--solid" data-coach-overlay>
          <div className="coach-center">
            <div className="coach-title">{OUTRO_COPY.title}</div>
            <div className="coach-body">{OUTRO_COPY.body}</div>
            <ul style={checklistStyle} data-testid="training-checklist">
              {SCENARIO_NUMBERS.map((n) => (
                <li key={n}>✓ {SCENARIO_TITLES[n]}</li>
              ))}
            </ul>
            <button type="button" className="coach-cta" data-testid="training-start-practice" onClick={startPractice}>INIZIA PROVA LIBERA</button>
            <button type="button" className="coach-cta" data-testid="training-restart-outro" onClick={handleRestart}>{OUTRO_COPY.cta}</button>
          </div>
        </div>
      )}

      {stepIndex === OUTRO && practiceState === PRACTICE_FEEDBACK && (
        <div className="coach-dim coach-dim--solid" data-coach-overlay>
          <div className="coach-center">
            <div className="coach-title">SIMULAZIONE COMPLETATA</div>
            <div className="coach-body">{practiceErrors.length ? 'Turno da riprovare: alcune situazioni non sono state gestite.' : 'Turno superato: hai gestito la serata senza aiuti.'}</div>
            <ul style={checklistStyle} data-testid="practice-checklist">
              {PRACTICE_SCENARIOS.slice(0, -1).map((scenario) => {
                const ok = !practiceErrors.includes(scenario.success);
                return <li key={scenario.id}>{ok ? '✓' : '⚠'} {scenario.title}</li>;
              })}
            </ul>
            <button type="button" className="coach-cta" data-testid="practice-retry" onClick={resetPractice}>RIPROVA SIMULAZIONE</button>
            <button type="button" className="coach-cta" data-testid="practice-back-outro" onClick={() => setPracticeState(PRACTICE_INTRO)}>TORNA ALL’OUTRO</button>
          </div>
        </div>
      )}

      {(currentStep || activePractice) && (
        <>
          {activeView === 'solo' ? (
            <KitchenSoloServiceView
              key={`solo-${resetCount}`}
              orders={visiblePracticeOrders}
              updateOrderStatus={updateOrderStatus}
              confirmPayment={confirmPayment}
              cancelOrder={cancelOrder}
              updateStaffNote={updateStaffNote}
              retrySync={retrySync}
              menuItems={menuItems}
              toggleAvailability={toggleAvailability}
            />
          ) : (
            <div className="ksd-page">
              <div className="ksd-header">
                <div>
                  <div className="ksd-header-title">WALBOX KITCHEN</div>
                  <div className="ksd-header-sub">Staff · Pagamenti (Formazione)</div>
                </div>
              </div>
              <div className="ksd-tabs">
                <button className="ksd-tab ksd-tab--active-storico" disabled>PAGAMENTI</button>
              </div>
              <PaymentsView
                key={`pay-${resetCount}`}
                usePaymentsData={usePreviewKitchenPayments}
                visiblePaymentIds={currentStep?.paymentIds ?? activePractice?.paymentIds}
                visibleAnomalyIds={currentStep?.anomalyIds ?? activePractice?.anomalyIds ?? []}
                allowReconcileFailed={false}
                refundAction={simulatedRefund}
                reconcileAction={simulatedReconcile}
                confirmRefundMessage="Rimborso SIMULATO (formazione) — nessuna chiamata reale a SumUp. Continuare?"
              />
            </div>
          )}
          {currentStep && <CoachOverlay step={currentStep} stepLabel={progressLabel} onAdvance={handleAdvance} />}
        </>
      )}

      {stepIndex === OUTRO && practiceState === 'practice' && (
        <>
          <div style={practicePanelStyle} data-testid="practice-panel">
            <div style={{ color: '#eab308', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em' }}>PROVA LIBERA · SITUAZIONE {practiceIndex + 1}/{PRACTICE_SCENARIOS.length}</div>
            <h2 style={{ margin: '8px 0 6px', fontSize: 19 }}>{PRACTICE_SCENARIOS[practiceIndex].title}</h2>
            <p style={{ margin: '0 0 14px', lineHeight: 1.45, fontSize: 13 }}>{PRACTICE_SCENARIOS[practiceIndex].body}</p>
            {['allergen', 'failed', 'sumup-success', 'refund-stuck', 'double-refund', 'close'].includes(PRACTICE_SCENARIOS[practiceIndex].id) && (
              <button type="button" className="coach-cta" data-testid="practice-ack" onClick={acknowledgePractice}>
                {PRACTICE_SCENARIOS[practiceIndex].id === 'close' ? 'CHIUDI SIMULAZIONE' : 'CONFERMA SITUAZIONE GESTITA'}
              </button>
            )}
            {!['close'].includes(PRACTICE_SCENARIOS[practiceIndex].id) && (
              <button type="button" className="coach-cta" data-testid="practice-next" onClick={advancePractice}>SITUAZIONE GESTITA → AVANTI</button>
            )}
            <button type="button" style={{ ...btnStyle, marginTop: 8 }} data-testid="practice-reset" onClick={resetPractice}>RESET PROVA</button>
          </div>
          {PRACTICE_SCENARIOS[practiceIndex].view === 'payments' && activeView !== 'payments' && null}
        </>
      )}
    </>
  );
}
