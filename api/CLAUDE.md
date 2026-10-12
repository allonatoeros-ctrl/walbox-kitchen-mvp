# api/ — regole per le funzioni pagamento (SumUp, soldi reali)

Area protetta (`CLAUDE.md §5`): ogni modifica qui richiede un task dedicato approvato da Eros. Queste funzioni
girano su Vercel Production e muovono denaro vero.

## Cosa c'è

- Una funzione serverless Node per file (`export default async function handler(req, res)`), helper condivisi
  in `api/_lib/` (`sumupPaymentResolution`, `sumupProviderRefRecovery`, `sumupReconcileSweep`).
- `kitchen-sumup-reconcile-sweep` gira dal cron di `vercel.json` (03:00, protetta da `CRON_SECRET`).
  Cambiare orario o path del cron = modificare `vercel.json`, area protetta.
- Env lette solo lato server: `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  più `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Mai loggarle, stamparle o passarle al client.

## Regole invarianti

1. **Mai fidarsi del client né del payload del webhook.** SumUp non firma i webhook: il payload serve solo a
   sapere quale checkout ricontrollare. Stato, importo e riferimento si rileggono sempre da SumUp
   (`GET /v0.1/checkouts/{id}`) con la chiave server.
2. **Importo dal DB.** Il checkout usa l'importo dell'attempt, che deve coincidere con `order.total`;
   se diverso → `409 amount_mismatch`. Mai un importo arrivato dal browser.
3. **Scritture solo via RPC `kitchen_*`** (webhook_ingest, confirm, fail, claim_checkout, close_unpaid, refund…),
   mai UPDATE/INSERT diretti su `kitchen_orders`/`kitchen_payments`. La logica di stato sta nel DB.
4. **Idempotenza.** Ogni handler deve reggere doppio tap, retry e webhook ripetuti: claim/lease nel DB prima di
   chiamare SumUp, nessun secondo checkout per lo stesso attempt, esito già terminale → risposta coerente
   senza nuove scritture.
5. **Timeout espliciti** su ogni fetch SumUp (`AbortSignal.timeout`), più corti della lease DB della claim.
   Un timeout non è un "non pagato": lo stato resta incerto e lo risolve la reconcile.
6. **Conflitti = 409** con un `error` stabile (es. `order_already_paid_cannot_cancel`, `order_cancelled`):
   il frontend e i test dipendono da questi codici, non rinominarli.
7. **Rimborsi** solo dal flusso RIMBORSA → verifica stato → ANNULLA. Nessun rimborso automatico.
8. **Input validati**: id di checkout con shape guard (niente `/ \ ? # %`, niente `..`), metodo HTTP controllato.

## Test

- Unit con `fetch` e Supabase mockati: `api/_lib/*.test.js`, `tests/unit/*sumup*.test.mjs`,
  `tests/unit/kitchen-cancel-with-payment-check.test.mjs`,
  `tests/unit/kitchen-staff-sumup-close-for-counter.test.mjs`,
  `tests/unit/cancel-with-payment-check.test.mjs`, `tests/unit/refund-order-flow.test.mjs`.
  Niente test nella radice di `api/`: ogni `.js` lì è una Vercel Function.
  Comando: `node --test api/_lib/*.test.js tests/unit/<file>.test.mjs`.
- Ogni modifica a un handler aggiunge o aggiorna il test del caso limite (retry, timeout, 409, importo, stato
  terminale) prima del codice.
- Mai test contro SumUp reale o Supabase di produzione senza gate di Eros. Il pagamento reale di prova lo fa
  Eros dal telefono.
