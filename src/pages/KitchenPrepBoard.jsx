// PASSIVE KDS V2 (2026-09-17). Route LIVE: /kitchen/prep. Vista sola-lettura per la cucina, dati
// reali via useKitchenOrders (stesso realtime di /kitchen/solo). Zero interazione, zero
// auto-transition, zero DB/RPC/backend changes — vedi ai-ops/reports/prep-v1-*.md, prep-v2-*.md.
// La UI vive in KitchenPrepBoardView.jsx (presentazionale, nessun import Supabase): questo file è
// solo il data source. La demo pubblica Supabase-free vive in KitchenPrepBoardDemo.jsx.
import { useCallback, useEffect, useState } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenAudio } from '../hooks/useKitchenAudio';
import { usePreviewPrepOrders } from './kitchenPrepPreviewFixtures';
import KitchenPrepBoardView from './KitchenPrepBoardView';
import { getStaffSession, onAuthStateChange, isKitchenStaff } from '../lib/supabaseAuth';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * DEV-only preview entry: /kitchen/prep?preview=1. Never active in a production build
 * (import.meta.env.DEV gate), regardless of URL — same pattern as KitchenSoloService.jsx.
 * Diverso dalla demo pubblica /kitchen/prep-demo (sempre attiva, mai gated su DEV).
 */
function isPreviewModeActive() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('preview') === '1';
  } catch {
    return false;
  }
}

export default function KitchenPrepBoard() {
  const previewMode = isPreviewModeActive();
  const live = useKitchenOrders();
  const preview = usePreviewPrepOrders();
  const { orders } = previewMode ? preview : live;

  // Stesso guard fail-closed di /kitchen/solo (KitchenSoloService.jsx): senza sessione staff
  // useKitchenOrders() non fa fetch, quindi senza questo guard la board resta vuota invece di
  // mandare al login. Non attivo in preview (?preview=1, DEV-only) ne' sotto E2E bypass, stesso
  // comportamento di /kitchen/solo.
  const [authChecked, setAuthChecked] = useState(
    () => previewMode || import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true'
  );

  useEffect(() => {
    if (previewMode || import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true') return undefined;

    // ?next=/kitchen/prep: KitchenLogin.jsx torna qui dopo il login invece del default
    // /kitchen/solo. Non cambia il comportamento degli altri ingressi (loro non passano next).
    const goToLogin = () => navigate('/kitchen/login?next=/kitchen/prep');

    let subscription;
    try {
      getStaffSession()
        .then(async (session) => {
          if (!session) { goToLogin(); return; }
          try {
            const ok = await isKitchenStaff('walrus-main');
            if (!ok) { goToLogin(); return; }
          } catch {
            goToLogin();
            return;
          } finally {
            setAuthChecked(true);
          }
        })
        .catch(() => goToLogin());

      subscription = onAuthStateChange((s) => {
        if (!s) goToLogin();
      }).data.subscription;
    } catch {
      goToLogin();
    }

    return () => subscription?.unsubscribe();
  }, [previewMode]);

  // Display passivo su TV in cucina: nessun gesture spontaneo sblocca l'AudioContext (a
  // differenza di /kitchen/solo, dove lo staff tocca comunque lo schermo). Un solo tap
  // sull'overlay "ATTIVA AUDIO" all'avvio del turno sblocca l'audio, poi la board resta
  // passiva. observeOrders() segue lo stesso pattern di KitchenSoloService.jsx (riga
  // 245-246): nessuna subscription Realtime nuova, riusa gli ordini già forniti da
  // useKitchenOrders()/usePreviewPrepOrders().
  const { unlock, observeOrders } = useKitchenAudio();
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    observeOrders(orders);
  }, [orders, observeOrders]);

  const handleActivateAudio = useCallback(async () => {
    const unlocked = await unlock();
    if (unlocked) setAudioUnlocked(true);
  }, [unlock]);

  if (!authChecked) return null;

  return (
    <KitchenPrepBoardView
      orders={orders}
      bannerText={previewMode ? 'DEV PREVIEW — DATI DI ESEMPIO, NON REALI' : null}
      showAudioPrompt={!audioUnlocked}
      onActivateAudio={handleActivateAudio}
    />
  );
}
