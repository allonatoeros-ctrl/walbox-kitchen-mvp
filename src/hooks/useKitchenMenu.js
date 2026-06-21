import { useState, useEffect } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';
import { supabase } from '../lib/supabaseClient';

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

async function supabaseUpsertMenuAvailability(itemId, available) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) return;
    const { error } = await supabase
      .from('kitchen_menu_availability')
      .upsert({ venue_id: 'walrus-main', item_id: itemId, available },
               { onConflict: 'venue_id,item_id' });
    if (error) throw error;
  } catch (err) {
    console.warn('[Walbox] Supabase menu availability update failed', err);
  }
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

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('kitchen_menu_availability')
          .select('item_id, available')
          .eq('venue_id', 'walrus-main');

        if (error) throw error;
        if (!data?.length) return;

        setMenuItems((prev) =>
          prev.map((item) => {
            const row = data.find((r) => r.item_id === item.id);
            return row ? { ...item, available: row.available } : item;
          })
        );
      } catch (err) {
        console.warn('[Walbox] Supabase menu read failed — using localStorage', err);
      }
    })();
  }, []);

  const toggleAvailability = (itemId) => {
    const current = menuItems.find((item) => item.id === itemId);
    const newAvailable = current ? !current.available : true;
    setMenuItems((prev) => {
      const next = prev.map((item) =>
        item.id === itemId ? { ...item, available: newAvailable } : item
      );
      saveMenu(next);
      return next;
    });
    supabaseUpsertMenuAvailability(itemId, newAvailable);
  };

  return { menuItems, toggleAvailability };
}
