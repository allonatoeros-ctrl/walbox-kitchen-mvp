// PASSIVE KDS V2 — Demo pubblica: /kitchen/prep-demo (2026-09-17).
// A differenza di /kitchen/prep?preview=1 (DEV-only, sparisce in build produzione, vedi
// KitchenPrepBoard.jsx), questa route e' pensata per essere raggiungibile anche su un deployment
// Vercel pubblico: usa ESCLUSIVAMENTE le fixture sintetiche, mai attiva su DEV, mai un import di
// useKitchenOrders/supabaseClient. Stesso pattern gia' approvato per /kitchen/solo-demo
// (Kitchen Solo Live Demo Harness, 2026-08-27).
// Zero interazione (display passivo), zero DB/RPC/backend changes.
import { usePreviewPrepOrders } from './kitchenPrepPreviewFixtures';
import KitchenPrepBoardView from './KitchenPrepBoardView';

export default function KitchenPrepBoardDemo() {
  const { orders } = usePreviewPrepOrders();

  return <KitchenPrepBoardView orders={orders} bannerText="DEMO — PREVIEW DATA, NON REALE" />;
}
