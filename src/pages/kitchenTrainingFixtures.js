/**
 * Azioni simulate per /kitchen/training: stesso pattern di simulatedRefundAction in
 * KitchenStaffDashboardDemo.jsx. Nessuna chiamata rete/Supabase — i default live di
 * PaymentsView.jsx (liveRefundAction/liveReconcileAction) non vengono mai usati qui.
 */

export async function simulatedTrainingRefundAction() {
  return { ok: true, outcome: 'refunded' };
}

const RECONCILE_RESULTS = {
  'ord-training-confirmed': { ok: true, tone: 'ok', text: 'Pagamento confermato. L’ordine può proseguire.' },
  'ord-training-pending': { ok: true, tone: 'neutral', text: 'Ancora in corso — riprova tra poco.' },
  'ord-training-unknown': { ok: true, tone: 'warn', text: 'Esito non determinabile — serve riconciliazione manuale.' },
};

export async function simulatedTrainingReconcileAction(orderId) {
  return RECONCILE_RESULTS[orderId] ?? { ok: true, tone: 'warn', text: 'Esito non determinabile — verifica manualmente.' };
}
