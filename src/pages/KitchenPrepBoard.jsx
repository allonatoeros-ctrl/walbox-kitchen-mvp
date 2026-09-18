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

  return (
    <KitchenPrepBoardView
      orders={orders}
      bannerText={previewMode ? 'DEV PREVIEW — DATI DI ESEMPIO, NON REALI' : null}
      showAudioPrompt={!audioUnlocked}
      onActivateAudio={handleActivateAudio}
    />
  );
}
