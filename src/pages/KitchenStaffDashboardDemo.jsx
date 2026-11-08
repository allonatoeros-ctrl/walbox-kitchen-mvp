import PaymentsView from './PaymentsView';
import { usePreviewKitchenPayments } from './kitchenStaffPaymentsDemoFixtures';
import { buildReconciliationItems } from '../lib/kitchenReconciliation';
import './KitchenStaffDashboard.css';

// K6: segnalazioni finte costruite con la STESSA logica di produzione (buildReconciliationItems).
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const DEMO_LOGS = [
  { id: 'log-dc', order_id: 'o-dc', action: 'payment_confirm_lost_race', created_at: minutesAgo(12),
    metadata: { needs_manual_reconciliation: true, classification: 'double_charge', losing_provider: 'sumup', losing_provider_ref: 'TXN-ABC123456', losing_amount: 12, winning_provider: 'counter', winning_method: 'cash', winning_amount: 12 } },
  { id: 'log-tv', order_id: 'o-tv', action: 'payment_late_unverified', created_at: minutesAgo(35),
    metadata: { needs_manual_reconciliation: true, provider_ref: 'TXN-XYZ987654', amount: 18.5 } },
  { id: 'log-pa', order_id: 'o-pa', action: 'payment_confirmed_after_cancel', created_at: minutesAgo(70),
    metadata: { needs_manual_reconciliation: true, payment_id: 'pay-pa', provider_ref: 'TXN-QQQ246810' } },
  { id: 'log-rn', order_id: 'o-rn', action: 'payment_confirm_lost_race', created_at: minutesAgo(90),
    metadata: { needs_manual_reconciliation: true, classification: 'duplicate_notification', losing_provider: 'sumup', losing_provider_ref: 'TXN-DUP135790', losing_amount: 9 } },
  { id: 'log-c1', order_id: 'o-c1', action: 'payment_late_unverified', created_at: minutesAgo(300),
    metadata: { needs_manual_reconciliation: true, provider_ref: 'TXN-CLS111222', amount: 7 } },
  { id: 'log-c2', order_id: 'o-c2', action: 'payment_confirmed_after_abandon', created_at: minutesAgo(400),
    metadata: { needs_manual_reconciliation: true, payment_id: 'pay-c2', provider_ref: 'TXN-CLS333444' } },
];
const DEMO_RECON = buildReconciliationItems({
  logs: DEMO_LOGS,
  resolutions: [{ source_log_id: 'log-c1', outcome: 'verified_not_charged', note: 'Controllato su SumUp, nessun addebito', resolved_by_label: 'Marco', created_at: minutesAgo(250) }],
  payments: [
    { id: 'pay-pa', order_id: 'o-pa', direction: 'charge', status: 'succeeded', amount: 15 },
    { id: 'pay-c2', order_id: 'o-c2', direction: 'charge', status: 'succeeded', amount: 10 },
    { id: 'ref-c2', order_id: 'o-c2', direction: 'refund', status: 'succeeded', amount: 10 },
  ],
  orderInfoById: {
    'o-dc': { order_code: 'Tavolo 3', nickname: 'Giulia' },
    'o-tv': { order_code: 'Tavolo 8', nickname: null },
    'o-pa': { order_code: 'Tavolo 5', nickname: 'Luca' },
    'o-rn': { order_code: 'Tavolo 2', nickname: null },
    'o-c1': { order_code: 'Tavolo 6', nickname: null },
    'o-c2': { order_code: 'Tavolo 1', nickname: 'Anna' },
  },
});

// Wrapper della fixture esistente: aggiunge solo i campi K6. Chiusura finta, nessuna rete.
function useDemoPaymentsWithReconciliation(args) {
  const base = usePreviewKitchenPayments(args);
  return {
    ...base,
    reconciliation: { ...DEMO_RECON, resolutionsUnavailable: false },
    isManager: true,
    closeReconciliation: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 300)),
  };
}

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
        usePaymentsData={useDemoPaymentsWithReconciliation}
        refundAction={simulatedRefundAction}
        reconcileAction={simulatedReconcileAction}
        confirmRefundMessage="Rimborso SIMULATO — nessuna chiamata reale a SumUp. Continuare?"
      />
    </div>
  );
}
