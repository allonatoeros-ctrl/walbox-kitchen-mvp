import { kitchenOrderStatuses } from '../../data/kitchenMockData';
import KitchenStatusBadge from './KitchenStatusBadge';

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Compact card used in the customer-facing order switcher (CustomerOrderStatus).
 * Renders table, status badge, item count and time.
 */
export default function KitchenOrderCard({ order, isSelected, onClick }) {
  const count = order.items
    ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
    : 0;
  const statusColor = kitchenOrderStatuses[order.status]?.color || '#f5c842';

  return (
    <button
      className={`ost-order-card${isSelected ? ' ost-order-card--selected' : ''}`}
      onClick={onClick}
    >
      <div className="ost-order-card-header">
        <span className="ost-order-card-id">#{order.id.replace('order-', '')}</span>
        <span
          className="ost-order-card-status"
          style={{
            color:      statusColor,
            background: statusColor + '15',
            border:     `1px solid ${statusColor}33`,
          }}
        >
          {kitchenOrderStatuses[order.status]?.label || order.status}
        </span>
      </div>
      <div className="ost-order-card-meta">
        <span>{count} {count === 1 ? 'piatto' : 'piatti'}</span>
        <span>•</span>
        <span>{formatTime(order.createdAt)}</span>
      </div>
    </button>
  );
}
