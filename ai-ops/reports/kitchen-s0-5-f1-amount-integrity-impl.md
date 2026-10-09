# S0.5 F1 — Amount Integrity — IMPLEMENTATION (LOCAL BUILD ONLY) — MIGRATION NOT APPLIED

Branch `kitchen-clean-baseline-v2-phase-a`, base HEAD `dba5a79`. Nessun commit/push/deploy/apply.

## File
- NEW `supabase/migrations/20261009120000_kitchen_payment_amount_integrity_v1.sql` (CREATE OR REPLACE x3)
- NEW `supabase/migrations/20261009120000_kitchen_payment_amount_integrity_v1.test.js` (12 test statici)
- NEW `tests/unit/kitchen-amount-integrity.test.mjs` (5 test API)
- MOD `api/kitchen-sumup-create-checkout.js` (select `total` + guard 409 `amount_mismatch` prima di claim/reuse)
- MOD `src/hooks/useOrderPaymentFlow.js` (+1 riga: mappa `amount_mismatch_live_attempt`)
- MOD `tests/unit/sumup-payment-reliability.test.mjs` (fixture: `total: 10` negli ordini mock create-checkout)

## Invariant
- I2 promo: `payment_in_progress` se esiste charge ONLINE live: `initiated`/`pending` solo con `channel='app'`, oppure retry-eligible `failed`+`provider='sumup'`+`failure_reason='sumup_failed'` (ramo invariato); dopo il retry idempotente, prima di ogni scrittura. Attempt `channel='counter'` non bloccano.
- I1 attempt_start: riuso di `v_existing` solo se `amount = order.total`, altrimenti `amount_mismatch_live_attempt`.
- I3 confirm: se `payment.amount <> order.total` charge resta `succeeded`, ordine NON toccato, log `payment_confirmed_amount_mismatch` (needs_manual_reconciliation=true).
- create-checkout: `Number(attempt.amount) !== Number(order.total)` (anche total mancante) -> 409, zero fetch SumUp, nessun claim.

## Limiti dichiarati
- Test SQL = statici sul sorgente (no DB: supabase CLI assente, nessuna mutation locale). Comportamento runtime SQL e race T9 NON eseguiti; coperti solo come lock-order statico.
- Il predicato promo e volutamente piu stretto del duplicate guard di `attempt_start` (che resta su qualsiasi canale): la promo e bloccata solo da pagamenti online (vedi I2).
- 3 test pre-esistenti falliscono identici su HEAD in `sumup-payment-reliability.test.mjs` (GET PAID `checkout_retry_unavailable`; 2 test CustomerOrderStatus su sorgente) — non regressioni.

## Gate 2 — Local runtime verification

- Target: esclusivamente LOCALE (OrbStack, stack Supabase temporaneo `walbox-kitchen-f1-local`, DB 127.0.0.1:54322, no `--linked`/db push/db reset). Stack distrutto a fine test (0 container/volumi residui).
- Migration apply: PASS — tutte le 84 migration applicate, inclusa `20261009120000_kitchen_payment_amount_integrity_v1.sql`, senza errori.
- Invariant runtime: PASS (11/11) — promo senza attempt OK; app+initiated, app+pending, failed+sumup_failed => `payment_in_progress` con total invariato; counter+initiated e failed+sumup_expired non bloccati; retry idempotente invariato; attempt_start reuse con amount==total, `amount_mismatch_live_attempt` con amount!=total (nessun nuovo attempt); confirm amount==total => paid/received; confirm amount!=total => charge `succeeded`, ordine NON paid, log `payment_confirmed_amount_mismatch` con `needs_manual_reconciliation=true`.
- Race promo <-> attempt_start: VERIFIED in entrambe le direzioni (sessioni concorrenti reali, serializzate su `kitchen_orders FOR UPDATE`; total e attempt.amount mai divergenti).
- Regressione: nessuna nuova. Static F1 13 pass, unit amount-integrity 5 pass, migration storiche 62 pass, suite pagamento pertinenti pass; restano 3 failure in `sumup-payment-reliability` identiche su HEAD.
- REMOTE MIGRATION NOT APPLIED. Nessuna operazione remota.
