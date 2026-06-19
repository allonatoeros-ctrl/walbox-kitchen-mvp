import { useState } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import CounterOrdersView from './CounterOrdersView';
import KitchenOrdersView from './KitchenOrdersView';
import './KitchenStaffDashboard.css';

export default function KitchenStaffDashboard() {
  const { orders, updateOrderStatus, confirmPayment, cancelOrder, resetToDemo } = useKitchenOrders();

  // Default to BANCONE ('counter'), but switch to CUCINA ('kitchen') if there are only kitchen orders and no counter orders.
  const [activeTab, setActiveTab] = useState(() => {
    const pendingPayment = orders.filter((o) => o.status === 'pending_counter_payment').length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    const activeKitchen = orders.filter(
      (o) => o.status !== 'pending_counter_payment' && o.status !== 'delivered' && o.status !== 'cancelled'
    ).length;

    const hasCounter = pendingPayment > 0 || ready > 0;
    const hasKitchen = activeKitchen > 0;
    return (!hasCounter && hasKitchen) ? 'kitchen' : 'counter';
  });

  const pendingPaymentCount = orders.filter((o) => o.status === 'pending_counter_payment').length;
  const kitchenOrders       = orders.filter((o) => o.status !== 'pending_counter_payment');
  const activeKitchenCount  = kitchenOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const readyCount          = kitchenOrders.filter((o) => o.status === 'ready').length;

  return (
    <div className="ksd-page">

      {/* Header */}
      <div className="ksd-header">
        <div>
          <div className="ksd-header-title">WALBOX KITCHEN</div>
          <div className="ksd-header-sub">Staff · Gestione Ordini</div>
        </div>
        <div className="ksd-header-badges">
          {pendingPaymentCount > 0 && (
            <span className="ksd-badge-payment">{pendingPaymentCount} pagamento 💳</span>
          )}
          {readyCount > 0 && (
            <span className="ksd-badge-ready">{readyCount} pronti 🟢</span>
          )}
          <button className="ksd-btn-reset" onClick={resetToDemo}>RESET DEMO</button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="ksd-tabs">
        <button
          className={`ksd-tab ${activeTab === 'counter' ? 'ksd-tab--active-counter' : ''}`}
          onClick={() => setActiveTab('counter')}
        >
          BANCONE
          {pendingPaymentCount > 0 && (
            <span className="ksd-tab-badge ksd-tab-badge--counter">{pendingPaymentCount}</span>
          )}
        </button>
        <button
          className={`ksd-tab ${activeTab === 'kitchen' ? 'ksd-tab--active-kitchen' : ''}`}
          onClick={() => setActiveTab('kitchen')}
        >
          CUCINA
          {activeKitchenCount > 0 && (
            <span className="ksd-tab-badge ksd-tab-badge--kitchen">{activeKitchenCount}</span>
          )}
        </button>
      </div>

      {/* View */}
      {activeTab === 'counter'
        ? <CounterOrdersView orders={orders} confirmPayment={confirmPayment} updateOrderStatus={updateOrderStatus} cancelOrder={cancelOrder} />
        : <KitchenOrdersView orders={orders} updateOrderStatus={updateOrderStatus} />
      }
    </div>
  );
}
