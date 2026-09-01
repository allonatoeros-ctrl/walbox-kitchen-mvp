import PaymentsView from './PaymentsView';
import { usePreviewKitchenPayments } from './kitchenStaffPaymentsDemoFixtures';
import './KitchenStaffDashboard.css';

// Refund simulato: nessuna chiamata rete/Supabase, solo esito finto per validare visivamente lo stato UI.
async function simulatedRefundAction() {
  return { ok: true, outcome: 'refunded' };
}

// Reconcile simulato: nessuna chiamata rete/Supabase (il default liveReconcileAction farebbe una fetch reale).
async function simulatedReconcileAction() {
  return { ok: true, tone: 'ok', text: 'Pagamento confermato (simulato).' };
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
  zIndex: 50,
};

/**
 * Preview Harness: /kitchen/staff-payments-demo.
 * Renderizza il componente LIVE PaymentsView.jsx (stesso usato in /kitchen/staff), con dati/azioni
 * iniettati via props (usePaymentsData/refundAction) da fixture locali deterministiche
 * (kitchenStaffPaymentsDemoFixtures.js). Nessun auth guard, zero Supabase/network/fetch.
 * Non collegato a mockData.js, routing di produzione o dati live.
 */
export default function KitchenStaffDashboardDemo() {
  return (
    <div className="ksd-page">
      <div role="banner" data-testid="demo-banner" style={bannerStyle}>
        <span>⚠ DEMO — NO LIVE DATA · PAGAMENTI (preview)</span>
      </div>

      <div className="ksd-header">
        <div>
          <div className="ksd-header-title">WALBOX KITCHEN</div>
          <div className="ksd-header-sub">Staff · Pagamenti (Preview)</div>
        </div>
      </div>

      <div className="ksd-tabs">
        <button className="ksd-tab ksd-tab--active-storico" disabled>
          PAGAMENTI
        </button>
      </div>

      <PaymentsView
        usePaymentsData={usePreviewKitchenPayments}
        refundAction={simulatedRefundAction}
        reconcileAction={simulatedReconcileAction}
        confirmRefundMessage="Rimborso SIMULATO — nessuna chiamata reale a SumUp. Continuare?"
      />
    </div>
  );
}
