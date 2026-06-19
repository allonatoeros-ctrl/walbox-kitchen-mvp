import { useState } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import CounterOrdersView from './CounterOrdersView';
import KitchenOrdersView from './KitchenOrdersView';
import MenuView from './MenuView';
import StoricoView from './StoricoView';
import AlertView from './AlertView';
import './KitchenStaffDashboard.css';

export default function KitchenStaffDashboard() {
  const { orders, updateOrderStatus, confirmPayment, cancelOrder, resetToDemo, updateStaffNote } = useKitchenOrders();
  const { menuItems, toggleAvailability } = useKitchenMenu();

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

  const unavailableCount    = menuItems.filter((i) => !i.available).length;

  const pendingPaymentCount = orders.filter((o) => o.status === 'pending_counter_payment').length;
  const kitchenOrders       = orders.filter((o) => o.status !== 'pending_counter_payment');
  const activeKitchenCount  = kitchenOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const readyCount          = kitchenOrders.filter((o) => o.status === 'ready').length;
  const urgentCount         = kitchenOrders.filter((o) => {
    if (o.status === 'delivered' || o.status === 'cancelled') return false;
    return Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000) >= 10;
  }).length;

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
          {unavailableCount > 0 && (
            <span className="ksd-badge-menu-out">{unavailableCount} esaurit{unavailableCount === 1 ? 'o' : 'i'} 🟡</span>
          )}
          {urgentCount > 0 && (
            <span className="ksd-badge-alert">{urgentCount} alert ⚠️</span>
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
        <button
          className={`ksd-tab ${activeTab === 'menu' ? 'ksd-tab--active-menu' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          MENU
        </button>
        <button
          className={`ksd-tab ${activeTab === 'storico' ? 'ksd-tab--active-storico' : ''}`}
          onClick={() => setActiveTab('storico')}
        >
          STORICO
        </button>
        <button
          className={`ksd-tab ${activeTab === 'alert' ? 'ksd-tab--active-alert' : ''}`}
          onClick={() => setActiveTab('alert')}
        >
          ALERT
          {urgentCount > 0 && (
            <span className="ksd-tab-badge ksd-tab-badge--alert">{urgentCount}</span>
          )}
        </button>
      </div>

      {/* View */}
      {activeTab === 'counter' && (
        <CounterOrdersView orders={orders} confirmPayment={confirmPayment} updateOrderStatus={updateOrderStatus} cancelOrder={cancelOrder} updateStaffNote={updateStaffNote} />
      )}
      {activeTab === 'kitchen' && (
        <KitchenOrdersView orders={orders} updateOrderStatus={updateOrderStatus} />
      )}
      {activeTab === 'menu' && <MenuView menuItems={menuItems} toggleAvailability={toggleAvailability} />}
      {activeTab === 'storico' && <StoricoView orders={orders} />}
      {activeTab === 'alert' && <AlertView orders={orders} />}
    </div>
  );
}
