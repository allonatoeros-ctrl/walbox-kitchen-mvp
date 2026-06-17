import { useState } from 'react';

const LS_KEY = 'walboxCustomerSession';

function readSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        table:    s.table    || '',
        nickname: s.nickname || 'Ospite Walrus',
      };
    }
  } catch { }
  return { table: '', nickname: 'Ospite Walrus' };
}

/**
 * Returns the current customer session (table + nickname) from localStorage.
 * Also exposes saveSession() to persist updates.
 *
 * Replaces the duplicated try/catch localStorage block that appeared
 * in CustomerKitchenMenu, CustomerRequest, and CustomerOrderStatus.
 */
export function useCustomerSession() {
  const [session, setSession] = useState(readSession);

  const saveSession = (table, nickname) => {
    const updated = { table, nickname };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
    } catch { }
    setSession(updated);
  };

  return { session, saveSession };
}
