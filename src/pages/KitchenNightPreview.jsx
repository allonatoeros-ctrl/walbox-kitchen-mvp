// Kitchen V2 — Fase 2 / micro-fase B3 — TEMPORARY DEV HARNESS.
//
// Monta gli adapter DEV "Serata Walrus" (B1 dataset + B2 hook, ai-ops/reports/
// kitchen-v2-fase2-b2-dev-mock-hooks-result.md) per collaudare Storico/Report contro un
// dataset realistico senza toccare useKitchenOrders/useKitchenPayments reali e senza rete.
//
// QUESTO FILE E' TEMPORANEO: va rimosso prima del cutover V2 insieme al resto dei
// TEMP_FILES_TO_REMOVE elencati nel report B3 (dataset B1, hook adapter B2, questa pagina,
// la route dedicata in App.jsx, il test di isolamento).
import { useMemo } from 'react';
import { usePreviewKitchenNightOrders } from '../hooks/useKitchenNightPreviewOrders';
import { usePreviewKitchenNightPayments } from '../hooks/useKitchenNightPreviewPayments';
import { SERATA_WALRUS_NIGHT_START_ISO } from '../data/kitchenNightMockData.js';
import { serviceNightWindow } from '../lib/kitchenServiceRules';
import StoricoView from './StoricoView';
import './KitchenStaffDashboard.css';

const STATUS_LABELS = {
  pending_counter_payment: 'IN ATTESA PAGAMENTO',
  received: 'RICEVUTO',
  preparing: 'IN PREPARAZIONE',
  ready: 'PRONTO',
  delivered: 'CONSEGNATO',
  cancelled: 'ANNULLATO',
};

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

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 8,
  padding: '0.6rem 0.9rem',
  minWidth: 120,
};

const cardLabelStyle = { fontSize: '0.68rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' };
const cardValueStyle = { fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' };
const sectionTitleStyle = { fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', margin: '1.25rem 0 0.6rem' };

function SummaryTile({ label, value }) {
  return (
    <div style={cardStyle}>
      <span style={cardLabelStyle}>{label}</span>
      <span style={cardValueStyle}>{value}</span>
    </div>
  );
}

/**
 * DEV Harness: /kitchen/night-preview (route caricata solo in DEV, vedi App.jsx).
 * Dati 100% locali/deterministici (dataset B1 "Serata Walrus" via adapter B2), zero
 * Supabase/rete/localStorage. Riusa StoricoView reale per collaudare Storico/Report.
 */
export default function KitchenNightPreview() {
  const { orders, resetToDemo } = usePreviewKitchenNightOrders();
  const { todaySummary, anomalies } = usePreviewKitchenNightPayments();

  // Il dataset B1 e' fisso sulla notte del 2026-09-20 (SERATA_WALRUS_NIGHT_START_ISO): senza
  // passare questo serviceNight a StoricoView, il componente ricade sulla serata "adesso" reale
  // e non trova ne' gli ordini ne' i pagamenti del mock nella finestra 06:00->06:00, mostrando
  // '-'/0 anche se il pannello Pagamenti qui sopra li mostra correttamente (mismatch da harness,
  // non da dato mancante — vedi ai-ops/reports/kitchen-analytics-capability-audit-20260921.md).
  const serviceNight = useMemo(
    () => serviceNightWindow(new Date(SERATA_WALRUS_NIGHT_START_ISO)).night,
    []
  );

  const byStatus = useMemo(() => {
    const counts = {};
    orders.forEach((order) => {
      counts[order.status] = (counts[order.status] ?? 0) + 1;
    });
    return counts;
  }, [orders]);

  return (
    <div style={{ minHeight: '100vh', background: '#0f1115', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div role="banner" data-testid="night-preview-banner" style={bannerStyle}>
        <span>⚠ DEV PREVIEW — SERATA WALRUS — NO LIVE DATA — {orders.length} ORDINI</span>
        <button type="button" data-testid="night-preview-reset" style={btnStyle} onClick={resetToDemo}>
          RESET
        </button>
      </div>

      <div style={{ padding: '0 1rem 2rem' }}>
        <div style={sectionTitleStyle}>Ordini per stato</div>
        <div data-testid="night-preview-status-counts" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <SummaryTile key={status} label={label} value={byStatus[status] ?? 0} />
          ))}
        </div>

        <div style={sectionTitleStyle}>Pagamenti (Serata Walrus)</div>
        <div data-testid="night-preview-payments-summary" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <SummaryTile label="Incasso" value={`€ ${todaySummary.incasso.toFixed(2)}`} />
          <SummaryTile label="Rimborsato" value={`€ ${todaySummary.rimborsato.toFixed(2)}`} />
          <SummaryTile label="Netto" value={`€ ${todaySummary.netto.toFixed(2)}`} />
          <SummaryTile label="In sospeso" value={`€ ${todaySummary.inSospeso.toFixed(2)}`} />
          <SummaryTile label="Falliti" value={todaySummary.falliti} />
          <SummaryTile label="Anomalie" value={anomalies.length} />
        </div>

        <div style={sectionTitleStyle}>Storico / Report Serata (componente reale, dataset mock)</div>
        <StoricoView orders={orders} paymentsSummary={todaySummary} serviceNight={serviceNight} />
      </div>
    </div>
  );
}
