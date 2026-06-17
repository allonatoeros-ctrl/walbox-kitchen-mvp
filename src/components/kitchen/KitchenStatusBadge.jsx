import { kitchenOrderStatuses } from '../../data/kitchenMockData';

/**
 * Pill badge showing a kitchen order status with its official color.
 * Used in KitchenStaffDashboard and CustomerOrderStatus.
 */
export default function KitchenStatusBadge({ status, className = '' }) {
  const info = kitchenOrderStatuses[status];
  if (!info) return null;

  return (
    <span
      className={`kitchen-status-badge ${className}`}
      style={{
        color:      info.color,
        background: info.color + '22',
        border:     `1px solid ${info.color}44`,
        fontSize:    12,
        fontWeight:  700,
        borderRadius: 20,
        padding:    '4px 14px',
        letterSpacing: '0.5px',
        display:    'inline-block',
      }}
    >
      {info.label}
    </span>
  );
}
