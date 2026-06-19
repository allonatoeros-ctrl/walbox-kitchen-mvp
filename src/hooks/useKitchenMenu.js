import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

const LS_KEY = 'walbox_kitchen_menu_availability';

function loadMenu() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const savedMap = JSON.parse(saved);
      return kitchenMenuItems.map((item) => ({
        ...item,
        available: savedMap[item.id] !== undefined ? savedMap[item.id] : item.available !== false,
      }));
    }
  } catch {}
  return kitchenMenuItems.map((item) => ({ ...item, available: item.available !== false }));
}

function saveMenu(items) {
  try {
    const map = {};
    items.forEach((i) => { map[i.id] = i.available; });
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {}
}

export function useKitchenMenu() {
  const [menuItems, setMenuItems] = useState(loadMenu);

  useEffect(() => {
    const refresh = () => setMenuItems(loadMenu());
    const onStorage    = (e) => { if (e.key === LS_KEY) refresh(); };
    const onFocus      = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const toggleAvailability = (itemId) => {
    setMenuItems((prev) => {
      const next = prev.map((item) =>
        item.id === itemId ? { ...item, available: !item.available } : item
      );
      saveMenu(next);
      return next;
    });
  };

  return { menuItems, toggleAvailability };
}
