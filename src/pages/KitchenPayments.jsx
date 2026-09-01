import { useState, useEffect } from 'react';
import { getStaffSession, onAuthStateChange, isKitchenStaff } from '../lib/supabaseAuth';
import PaymentsView from './PaymentsView';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Route canonica per la UI Payments live, senza le tab legacy di KitchenStaffDashboard.
// Stesso auth gate di KitchenStaffDashboard.jsx (F-SEC-2): authenticated NON equivale a staff.
export default function KitchenPayments() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true') {
      setAuthChecked(true);
      return;
    }
    getStaffSession().then(async (session) => {
      if (!session) { navigate('/kitchen/login'); return; }
      try {
        const ok = await isKitchenStaff('walrus-main');
        if (!ok) { navigate('/kitchen/login'); return; }
      } catch {
        navigate('/kitchen/login');
        return;
      } finally {
        setAuthChecked(true);
      }
    });
    const { data: { subscription } } = onAuthStateChange((session) => {
      if (!session) navigate('/kitchen/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!authChecked) return null;

  return <PaymentsView />;
}
