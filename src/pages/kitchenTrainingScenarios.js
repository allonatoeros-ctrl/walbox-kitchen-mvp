/** Scenari guidati: ogni scenario ha un solo problema e una sola risposta attesa. */
export const SCENARIO_TITLES = {
  1: 'PAGA / DA FARE / PRONTI', 2: 'Pagamento cash', 3: 'INIZIA → PRONTO → RITIRATO',
  4: 'Quick-pay senza perdere il focus', 5: 'Allergeni', 6: 'SumUp riuscito',
  7: 'Carta rifiutata', 8: 'Pending → confermato', 9: 'Pending ancora pending',
  10: 'Rimborso avviato / stuck', 11: 'Rimborso corretto', 12: 'Double refund protetto',
  13: 'Stato sconosciuto / riconciliazione manuale',
};

const observe = (scenario, targetTestId, title, body, doText, dontText, extra = {}) => ({
  scenario, kind: 'observe', view: 'payments', targetTestId, title, body, doText, dontText, ...extra,
});

export const TRAINING_STEPS = [
  { scenario: 1, kind: 'observe', view: 'solo', targetTestId: 'kpi-paga', title: 'PAGA', body: 'Qui vedi chi deve ancora pagare.', doText: 'Incassa prima di preparare.', dontText: 'Non trattare l’ordine come già pagato.' },
  { scenario: 1, kind: 'observe', view: 'solo', targetTestId: 'kpi-dafare', title: 'DA FARE', body: 'Qui vedi gli ordini da preparare.', doText: 'Segui la coda di lavoro.', dontText: 'Non ignorare un ordine pagato.' },
  { scenario: 1, kind: 'observe', view: 'solo', targetTestId: 'kpi-pronti', title: 'PRONTI', body: 'Qui vedi gli ordini pronti da consegnare.', doText: 'Consegnali senza farli raffreddare.', dontText: 'Non ricominciare la preparazione.' },
  { scenario: 2, kind: 'click', view: 'solo', targetSelector: '[data-order="D098"]', title: 'Seleziona D098', body: 'Il cliente ha scelto il ritiro al banco.', doText: 'Metti a fuoco D098.', dontText: 'Non lavorare su un altro ordine.' },
  { scenario: 2, kind: 'click', view: 'solo', targetTestId: 'next-action', title: 'Conferma il cash', body: 'Il contante è stato ricevuto.', doText: 'Premi CONFERMA PAGAMENTO.', dontText: 'Non lasciare il pagamento in sospeso.' },
  { scenario: 3, kind: 'click', view: 'solo', targetSelector: '[data-order="D085"]', title: 'Seleziona D085', body: 'Questo ordine è ricevuto e pagato.', doText: 'Aprilo per iniziare.', dontText: 'Non saltare il passaggio di presa in carico.' },
  { scenario: 3, kind: 'click', view: 'solo', targetTestId: 'next-action', title: 'INIZIA', body: 'Ora la preparazione è partita.', doText: 'Premi INIZIA.', dontText: 'Non segnare PRONTO prima di lavorarlo.' },
  { scenario: 3, kind: 'click', view: 'solo', targetTestId: 'next-action', title: 'PRONTO', body: 'Il piatto è uscito dal pass.', doText: 'Premi PRONTO.', dontText: 'Non consegnare se non è pronto.' },
  { scenario: 3, kind: 'click', view: 'solo', targetTestId: 'next-action', title: 'RITIRATO', body: 'Il cliente ha ritirato l’ordine.', doText: 'Premi RITIRATO.', dontText: 'Non chiudere senza consegna.' },
  { scenario: 4, kind: 'click', view: 'solo', targetTestId: 'quick-pay', title: 'PAGA rapido', body: 'Un altro cliente paga mentre lavori.', doText: 'Usa il quick-pay e torna al focus.', dontText: 'Non cambiare schermata e non perdere il lavoro in corso.' },
  { scenario: 5, kind: 'click', view: 'solo', targetSelector: '[data-order="D095"]', title: 'Apri l’ordine allergene', body: 'D095 contiene una richiesta allergene.', doText: 'Apri la card.', dontText: 'Non iniziare senza leggerla.' },
  { scenario: 5, kind: 'observe', view: 'solo', targetTestId: 'focus-allergeni', title: 'ALLERGENE', body: 'L’allergia è un vincolo operativo prioritario.', doText: 'Controlla la nota prima di preparare.', dontText: 'Non trattarla come decorazione.' },
  { scenario: null, kind: 'transition', view: 'solo', title: 'Ora i Pagamenti', body: 'Passiamo alla cassa. Vedrai un solo caso alla volta, senza anomalie estranee.', ctaLabel: 'Vai a Pagamenti' },
  observe(6, 'payment-row-pay-training-success', 'SumUp riuscito', 'La charge è SUCCEEDED e la UI mostra PAGATO.', 'Considera l’incasso confermato e lascia proseguire l’ordine.', 'Non fare un secondo incasso.', { paymentIds: ['pay-training-success'] }),
  observe(7, 'payment-row-pay-demo-4', 'Carta rifiutata', 'La carta è stata rifiutata: questo tentativo è FAILED.', 'Fai riprovare il cliente.', 'Non segnare PAGATO e non rimborsare.', { paymentIds: ['pay-demo-4'] }),
  { scenario: 8, kind: 'click', view: 'payments', targetTestId: 'reconcile-btn-ord-training-confirmed', title: 'Verifica stato', body: 'Il pagamento è ambiguo. Solo la verifica può confermare l’esito.', doText: 'Premi VERIFICA STATO.', dontText: 'Non forzare PAGATO manualmente.', paymentIds: ['pay-training-confirmed'] },
  { scenario: 9, kind: 'click', view: 'payments', targetTestId: 'reconcile-btn-ord-training-pending', title: 'Ancora in corso', body: 'La verifica non ha ancora una conferma.', doText: 'Attendi e riprova più tardi.', dontText: 'Non consegnare come pagato.', paymentIds: ['pay-training-pending'] },
  observe(10, 'payment-row-pay-training-refund-stuck', 'Rimborso in corso', 'Il refund è INITIATED: non è ancora confermato.', 'Controlla lo stato prima di rispondere.', 'Non avviare un secondo rimborso.', { targetTestId: 'payment-row-pay-training-refund-stuck', paymentIds: ['pay-training-refund-stuck-charge', 'pay-training-refund-stuck'], anomalyIds: ['ord-training-refund-stuck'] }),
  { scenario: 11, kind: 'click', view: 'payments', targetTestId: 'refund-btn-ord-4821-demo', title: 'Rimborso corretto', body: 'Qui esiste una charge riuscita e nessun refund precedente.', doText: 'Premi RIMBORSA e conferma.', dontText: 'Non rimborsare senza pagamento riuscito.', paymentIds: ['pay-demo-3'] },
  observe(12, 'payment-row-pay-training-double-refund', 'Double refund protetto', 'Questo ordine è già RIMBORSATO. La CTA non deve comparire.', 'Lascia il rimborso chiuso.', 'Non tentare un secondo refund.', { targetTestId: 'payment-row-pay-training-double-refund', paymentIds: ['pay-training-double-charge', 'pay-training-double-refund'] }),
  { scenario: 13, kind: 'click', view: 'payments', targetTestId: 'reconcile-btn-ord-training-unknown', title: 'Riconciliazione manuale', body: 'Il provider non restituisce un esito determinabile.', doText: 'Premi VERIFICA STATO e segnala il caso per riconciliazione manuale.', dontText: 'Non segnare PAGATO alla cieca.', paymentIds: ['pay-training-unknown'] },
];

export const INTRO_COPY = { title: 'FORMAZIONE STAFF — SOLO SERVICE + PAGAMENTI', body: 'Scenari separati, click veri, dati finti. Ogni caso spiega cosa fare e cosa non fare.', cta: 'Inizia formazione' };
export const OUTRO_COPY = { title: 'FORMAZIONE COMPLETATA', body: 'Hai visto ogni stato senza confondere un rifiuto con un pending o un rimborso in corso con uno completato.', cta: 'Riavvia formazione' };
