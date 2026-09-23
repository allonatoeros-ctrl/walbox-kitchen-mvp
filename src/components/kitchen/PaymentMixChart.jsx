// Kitchen Analytics V1 — Fase 7 (MIX PAGAMENTI).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §CHARTS punto 2, §CASH_SECTION.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo di aggregazione — riceve
// `paymentsByMethod` gia' calcolato da `summarizePaymentsByMethod` (Fase 1, riusato identico
// dalla tabella CONTROLLO SERATA/CASSA, AC8: stessa fonte dati, zero divergenza). Mostra solo i
// metodi con almeno un pagamento succeeded nella serata (`mixCount > 0`) — un metodo con soli
// tentativi falliti non compare come barra a 0€.
//
// MIX_PAYMENT_REFUND_FIX: usa mixIncasso/mixCount (non incasso/count) — un ordine con refund
// succeeded e' escluso del tutto dal Mix pagamento, indipendentemente dal metodo. La vista
// CONTROLLO SERATA/CASSA (incasso/rimborsato/netto/count) resta invariata altrove.
//
// METHOD_LABELS intenzionalmente duplicato da PaymentsView.jsx/CassaControlSection.jsx (stesso
// dizionario statico a 7 voci) per evitare import circolari, stesso pattern gia' in uso.
const METHOD_LABELS = {
  cash: 'Contanti',
  card_counter_manual: 'Carta/POS banco',
  sumup_online: 'SumUp online',
  sumup_pos: 'SumUp POS',
  satispay_app: 'Satispay',
  manual_comp: 'Omaggio',
  manual_other: 'Manuale',
};

function formatEuro(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

/** `paymentsByMethod` = { byMethod: { [method]: {incasso, rimborsato, netto, count, mixIncasso, mixCount} }, sumup: {...} }. */
export default function PaymentMixChart({ paymentsByMethod }) {
  const byMethod = paymentsByMethod?.byMethod ?? {};
  const methods = Object.keys(byMethod).filter((method) => byMethod[method].mixCount > 0);

  if (methods.length === 0) {
    return (
      <div className="kpd-empty" data-testid="payment-mix-empty">
        Nessun pagamento riuscito in questa serata.
      </div>
    );
  }

  const totalSucceeded = methods.reduce((sum, method) => sum + byMethod[method].mixIncasso, 0);
  const maxIncasso = Math.max(1, ...methods.map((method) => byMethod[method].mixIncasso));
  const sorted = [...methods].sort((a, b) => byMethod[b].mixIncasso - byMethod[a].mixIncasso);

  return (
    <div className="kpd-paymentmix-chart" data-testid="payment-mix-chart">
      {sorted.map((method) => {
        const m = byMethod[method];
        const pct = totalSucceeded > 0 ? (m.mixIncasso / totalSucceeded) * 100 : 0;
        return (
          <div key={method} className="kpd-paymentmix-row" data-testid={`payment-mix-row-${method}`}>
            <span className="kpd-paymentmix-label">{METHOD_LABELS[method] ?? method}</span>
            <div className="kpd-paymentmix-track">
              <div className="kpd-paymentmix-bar" style={{ width: `${(m.mixIncasso / maxIncasso) * 100}%` }} />
            </div>
            <span className="kpd-paymentmix-meta">
              {formatEuro(m.mixIncasso)} · {m.mixCount}× · {pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
