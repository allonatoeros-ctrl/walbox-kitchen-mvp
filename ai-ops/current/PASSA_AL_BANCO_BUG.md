# Bug: "PAGA AL BANCO" non funziona dopo pagamento online fallito

## ORA
- Data: 2026-10-31 · Fase: **PR #13 APERTA, in attesa del merge di Eros** (merge su `main` = deploy).
  https://github.com/allonatoeros-ctrl/walbox-kitchen-mvp/pull/13 · branch `fix/paga-al-banco-sumup-failed`, commit `ab67d63`.
- Causa **confermata** dai log Vercel (7 richieste 20:57–20:59 ora italiana): "checkout still not closed after
  DELETE — fail-closed FAILED". SumUp lascia FAILED anche dopo il DELETE.
- Fix (libreria condivisa: Paga al banco cliente, chiusura staff, annullo staff, sweep 5 minuti):
  `api/_lib/sumupCheckout.js` `deactivateAndVerify`: GET verificato FAILED dopo il DELETE = `closed` (+ warn con lo
  status del DELETE). DELETE 5xx/rete, GET illeggibile, PENDING, PAID: invariati. Test su base main: 178/178 pass.
- Rischio residuo accettato: dopo il banco il cliente potrebbe pagare anche sulla pagina SumUp con un'altra carta:
  PAID non registrato (errore nel log del webhook), rimborso manuale dalla dashboard SumUp.
- Prossimo passo: Eros fa il merge della PR #13. Dopo il deploy A23 lo chiude lo sweep (abbandonato) oppure lo staff
  con ANNULLA; verificare in DB che A23 non resti `pending_online_payment`.

## Verificato (DB prod, sola lettura, 31/10)
- Ordine **A23** del 31/10 (20 €, cliente `25d8e4e9…`): stato `pending_online_payment`, tentativo SumUp
  `598be722…` passato a `failed / sumup_failed` alle 19:59 UTC (carta rifiutata o pagamento fallito su SumUp).
  **È ancora bloccato**: né pagato, né al banco, né abbandonato dallo sweep.
- Stessa ora: A24 (40 €) è passato al banco correttamente (`customer_switched_to_counter`) quando il tentativo era ancora aperto.
- A21 chiuso dallo sweep dopo 5 minuti (`abandoned_timeout`): lo sweep funziona sui tentativi aperti.

## Dedotto (da confermare coi log)
- Con tentativo `failed/sumup_failed`, `api/kitchen-customer-switch-to-counter.js` chiama `closeSumupAttempt`
  (`api/_lib/sumupCloseAttempt.js`): GET = FAILED → DELETE → nuova GET. Il test
  `tests/unit/customer-switch-to-counter.test.mjs:231` presume che dopo il DELETE SumUp risponda EXPIRED.
  Se nella realtà il checkout FAILED resta FAILED, `deactivateAndVerify` ritorna `unverified` → 409
  `switch_to_counter_uncertain` → il cliente vede errore a ogni tentativo. Log atteso:
  "checkout still not closed after DELETE — fail-closed FAILED".
- Probabile anche per il pulsante staff (`api/kitchen-staff-sumup-close-for-counter.js`, stessa logica) e per lo sweep,
  che non chiude i tentativi `sumup_failed`.

## Rimedio subito in serata (nessun codice)
- Il cliente paga al banco: lo staff rifà l'ordine dalla CASSA. A23 resta in sospeso, non è stato incassato.

## Idea di fix (da pianificare dopo i log, area protetta `api/`)
- Se SumUp conferma FAILED anche dopo il DELETE, trattarlo come "non pagabile" (chiuso), come EXPIRED/CANCELLED,
  solo dopo un GET verificato che non sia PAID. Test unit sul caso reale + stesso fix per staff e sweep.

Modello/effort: fix in sessione principale (soldi), `/effort high`.
