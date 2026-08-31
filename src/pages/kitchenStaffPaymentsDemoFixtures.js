/**
 * Fixture dati per /kitchen/staff-payments-demo.
 * Stessa shape di useKitchenPayments (hooks/useKitchenPayments.js) ma 100% locale/deterministico:
 * zero Supabase, zero network, zero polling.
 * order_code/table sono etichette leggibili per lo staff (payment id tecnico resta solo come key interna).
 */
export function usePreviewKitchenPayments() {
  const todaySummary = {
    incasso: 187.5,
    rimborsato: 12.0,
    netto: 175.5,
    inSospeso: 8.5,
    falliti: 1,
  };

  const anomalies = [
    {
      order_id: 'ord-7734-demo',
      order_code: 'Tavolo 7',
      drift_type: 'refund_stuck_initiated',
      total: 12.0,
    },
  ];

  const recentPayments = [
    // Tavolo 7: charge OK poi rimborso avviato ma bloccato -> è l'anomalia sopra, niente CTA refund (già in corso).
    {
      id: 'pay-demo-1',
      order_id: 'ord-7734-demo',
      order_code: 'Tavolo 7',
      provider: 'sumup',
      method: 'sumup_pos',
      direction: 'charge',
      status: 'succeeded',
      amount: 12.0,
      failure_reason: null,
      created_at: new Date(Date.now() - 50 * 60000).toISOString(),
    },
    {
      id: 'pay-demo-2',
      order_id: 'ord-7734-demo',
      order_code: 'Tavolo 7',
      provider: 'sumup',
      method: 'sumup_online',
      direction: 'refund',
      status: 'initiated',
      amount: 12.0,
      failure_reason: null,
      created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    },
    // Tavolo 4: charge OK, mai rimborsato -> CTA refund attiva.
    {
      id: 'pay-demo-3',
      order_id: 'ord-4821-demo',
      order_code: 'Tavolo 4',
      provider: 'sumup',
      method: 'sumup_pos',
      direction: 'charge',
      status: 'succeeded',
      amount: 24.5,
      failure_reason: null,
      created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    // Asporto #12: pagamento rifiutato -> nessuna CTA (nulla da rimborsare).
    {
      id: 'pay-demo-4',
      order_id: 'ord-1290-demo',
      order_code: 'Asporto #12',
      provider: 'sumup',
      method: 'sumup_pos',
      direction: 'charge',
      status: 'failed',
      amount: 8.5,
      failure_reason: 'card_declined',
      created_at: new Date(Date.now() - 70 * 60000).toISOString(),
    },
    // Tavolo 2: charge OK via Satispay, mai rimborsato -> CTA refund attiva.
    {
      id: 'pay-demo-5',
      order_id: 'ord-2005-demo',
      order_code: 'Tavolo 2',
      provider: 'satispay',
      method: 'satispay_app',
      direction: 'charge',
      status: 'succeeded',
      amount: 16.0,
      failure_reason: null,
      created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    },
    // Bancone: contanti, chiuso regolarmente -> CTA refund attiva.
    {
      id: 'pay-demo-6',
      order_id: 'ord-5501-demo',
      order_code: 'Bancone',
      provider: 'cash',
      method: 'cash',
      direction: 'charge',
      status: 'succeeded',
      amount: 9.0,
      failure_reason: null,
      created_at: new Date(Date.now() - 180 * 60000).toISOString(),
    },
  ];

  return {
    loading: false,
    error: null,
    refresh: () => {},
    todaySummary,
    anomalies,
    recentPayments,
  };
}
