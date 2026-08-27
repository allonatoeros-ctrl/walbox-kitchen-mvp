import { useState } from 'react';
import { KitchenSoloServiceView } from './KitchenSoloService';
import { useDemoKitchenOrders, DEMO_SYNC_ORDER_ID } from './kitchenSoloDemoFixtures';
import { usePreviewKitchenMenu } from './kitchenSoloPreviewFixtures';

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

/**
 * Live Demo Harness: /kitchen/solo-demo.
 * Stessa view di /kitchen/solo, dati totalmente locali/deterministici (kitchenSoloDemoFixtures.js),
 * zero Supabase/network/polling/localStorage condiviso col live. Usabile anche in build produzione.
 */
export default function KitchenSoloServiceDemo() {
  const [resetCount, setResetCount] = useState(0);
  const {
    orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote,
    simulateSyncError, retrySync, resetDemo,
  } = useDemoKitchenOrders();
  const { menuItems, toggleAvailability } = usePreviewKitchenMenu();

  const demoSyncOrder = orders.find((o) => o.id === DEMO_SYNC_ORDER_ID);
  const canSimulateSyncError = !!demoSyncOrder && demoSyncOrder.syncStatus !== 'error';

  const handleReset = () => {
    resetDemo();
    // Remount della view: azzera anche focus/checklist/coda-aperta/ricerca (stato locale della view).
    setResetCount((n) => n + 1);
  };

  return (
    <>
      <div role="banner" data-testid="demo-banner" style={bannerStyle}>
        <span>⚠ DEMO — NO LIVE DATA</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            data-testid="demo-simulate-sync-error"
            style={{ ...btnStyle, opacity: canSimulateSyncError ? 1 : 0.5 }}
            disabled={!canSimulateSyncError}
            onClick={() => simulateSyncError(DEMO_SYNC_ORDER_ID)}
          >
            SIMULA SYNC ✗
          </button>
          <button type="button" data-testid="demo-reset" style={btnStyle} onClick={handleReset}>
            RESET DEMO
          </button>
        </div>
      </div>
      <KitchenSoloServiceView
        key={resetCount}
        orders={orders}
        updateOrderStatus={updateOrderStatus}
        confirmPayment={confirmPayment}
        cancelOrder={cancelOrder}
        updateStaffNote={updateStaffNote}
        retrySync={retrySync}
        menuItems={menuItems}
        toggleAvailability={toggleAvailability}
      />
    </>
  );
}
