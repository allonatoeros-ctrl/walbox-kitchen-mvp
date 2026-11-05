# Food Club V1 — Opzione C, Fase 2: implementazione SQL (2026-11-05)

**Verdetto: PARZIALE.** Il lato DB è completo e verde in locale (OC1–OC11 PASS, regressioni OK). Però il risultato
end-to-end dipende da `api/` (riconciliazione SumUp), che non è stata toccata. **Senza Fase 3-API l'Opzione C non va in
produzione:** i buoni di ordini abbandonati resterebbero bloccati per sempre (vedi D-R1).

Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Nessun commit, push, deploy o accesso remoto.
`api/`, `supabase/migrations/` e il codice dell'app non sono stati toccati. File non tracciati preesistenti preservati.

## A. File creati / modificati (solo `docs/food-club/implementation/proposed/`)
| File | Modifica |
|---|---|
| `20261105105000_food_club_v1_option_c.sql` (nuovo) | migration proposta: vedi sotto |
| `51_option_c.sql` | **OC7**: i 30 minuti ora partono dal primo attempt in sospeso (decisione N2: aggiunte 2 righe che retrodatano gli attempt; nessuna asserzione cambiata). **OC11** nuovo (N1, importo anomalo) |
| `harness/run-oc-local.sh` | 3ª suite: base + P1 + Opzione C, con regressioni (SQL esistenti + RF); `ONLY_OPTION_C=1` |
| `harness/oc10-concurrency.sh` | solo la stampa del messaggio di errore della sessione B (C2) |

Contenuto della migration proposta:
1. `food_club_attempt_confirmable(payment)` e `food_club_order_payment_state(order)` → `paid`/`open`/`closed`. La lista
   degli attempt confermabili è la stessa di `kitchen_payment_confirm`.
2. `food_club_settle_unpaid_order(order, stage)`: regolamento unico e idempotente del buono riservato su un ordine non pagato:
   - charge riuscito, importo giusto, ordine chiuso → `used` una volta (`consumed_on_late_payment`), niente timbro;
   - charge riuscito, importo diverso (N1) → resta `reserved`, evento `held_amount_mismatch` + `food_club_voucher_amount_mismatch` (una volta);
   - ordine chiuso, nessun attempt confermabile → `available`/`expired` (`released`, `all_attempts_final`);
   - ordine chiuso con attempt confermabili → resta `reserved`, evento `held_payment_open` (una volta).
3. Corpo nuovo del trigger esistente `kitchen_orders_food_club_on_closed_unpaid`: stessa firma e stesso `WHEN`, chiama il punto 2.
4. Nuovo trigger `kitchen_payments_food_club_on_attempt_change` (`AFTER UPDATE OF status, failure_reason`, solo cambi reali):
   blocca l'ordine e chiama il punto 2. Gli errori Food Club non bloccano mai il registro dei pagamenti: vanno in log `food_club_error`.
5. `food_club_staff_vouchers_on_hold(venue, 30)` (staff): buoni con primo attempt in sospeso da più di 30 min (N2), più i casi di importo anomalo (subito).
6. `food_club_admin_release_voucher(order, motivo)`: solo `manager`, motivo obbligatorio. Ordine dei lock attempt → ordine → buono.
   Rifiuta con `payment_still_confirmable`, `payment_succeeded_needs_reconciliation`, `order_not_closed`. Idempotente (`not_held`).
7. Permessi: le funzioni interne non sono eseguibili da anon/authenticated; le 2 RPC staff sono eseguibili solo da `authenticated`, con guardia interna.

Compatibilità con la patch P1: FIX-1..5 restano invariati e servono come rete di sicurezza. FIX-1 non scatta più sul percorso
nuovo (il buono risulta già `used` sull'ordine); FIX-2 e l'Opzione C lavorano su casi separati (ordine `paid` contro ordine non pagato).

## B. Matrice OC (stack locale: 74 migration + P1 + Opzione C = 76; due run identiche)
| Test | DB locale | End-to-end | Nota |
|---|---|---|---|
| OC1 abbandono | PASS | PASS | solo DB |
| OC2 webhook tardivo + duplicato | PASS | PARZIALE | il webhook chiama già `kitchen_payment_confirm`; non provato con SumUp sandbox |
| OC3 riconciliazione | PASS | **BLOCKED** | nessuno oggi riverifica gli `abandoned_timeout` (serve E1) |
| OC4 annullamento | PASS | PASS | solo DB (l'annullo verificato via `api/` chiude già l'attempt) |
| OC5 doppio checkout | PASS | PARZIALE | il rilascio dopo un `sumup_failed` richiede E1 |
| OC6 rimborso | PASS | PARZIALE | rimborso SumUp reale non provato |
| OC7 avviso 30 min | PASS | PARZIALE | la RPC c'è; la vista staff è UI di Fase 3 |
| OC8 sblocco admin | PASS | **BLOCKED** | senza E1 gli attempt abbandonati restano «confermabili»: il manager non può mai sbloccare |
| OC9 conferma al banco | PASS | PASS | solo DB |
| OC10-C1 webhook ↔ sblocco manager | PASS | PASS | 2 sessioni reali: il manager attende il lock e trova `not_held`; buono usato ×1 |
| OC10-C2 webhook ↔ riuso buono | PASS | PASS | 2 sessioni reali: il riuso viene rifiutato con `voucher_not_available` |
| OC11 importo anomalo (N1) | PASS | PARZIALE | dipende dall'importo verificato in `api/` (già passato a confirm) |

## C. RF e regressioni (stessa suite)
- Scenari SQL esistenti `tests/db/food-club` 10/20/30/40: **OK 4/4**.
- RF2, RF3, RF4, RF5: **PASS**.
- **RF1, RF1b: FAIL, attesi e non modificati.** Verificano il comportamento vecchio, che la decisione Opzione C ha superato:
  RF1 si aspetta il buono `available` subito dopo l'abbandono; RF1b spende lo stesso buono su un 2° ordine mentre il 1° pagamento
  è aperto, e ora quel riuso viene rifiutato (`voucher_not_available`). Lo scopo di RF1 (niente doppio sconto col pagamento tardivo)
  è coperto da OC2/OC10-C2. Proposta: riscriverli in Fase 3 (serve il tuo ok, perché sono test).
- Fase 1 confermata: senza la migration Opzione C, OC1–OC8 e OC10 falliscono e OC9 passa.

Controlli di sicurezza:
- Funzioni: tutte con `search_path` fisso; le interne non sono eseguibili da anon/authenticated (verificato con `has_function_privilege`).
- RLS su `food_club_vouchers` attiva; nessuna policy nuova.
- Race condition: ordine dei lock attempt → ordine → buono, lo stesso di `kitchen_payment_confirm`, cancel e abandon (nessun ordine nuovo).
  Il trigger sull'ordine legge gli attempt senza lock: se un attempt cambia in parallelo, il suo trigger aspetta il lock dell'ordine e ricalcola.

## D. Rischi residui di doppio utilizzo
| # | Rischio | Gravità | Mitigazione |
|---|---|---|---|
| D-R1 | Senza E1 i buoni degli ordini abbandonati restano bloccati per sempre: nessun doppio uso, ma clienti scontenti, e il manager non può sbloccarli | alta (operativa) | E1 prima della produzione, oppure decisione N4 |
| D-R2 | Buoni liberati con la logica vecchia (ordini abbandonati prima del deploy) e poi pagati in ritardo senza intervento dello staff: nessuna anomalia registrata (FIX-1 scatta solo su `paid`) | bassa (finestra breve) | Food Club non è ancora in produzione, quindi oggi 0 casi; altrimenti log extra |
| D-R3 | `UPDATE` manuale dello staff su `kitchen_orders` (percorso RF1): coperto da FIX-1, il buono è già `used` | bassa | nessuna |
| D-R4 | Il trigger sull'ordine non ha un gestore d'errore (come l'originale): un errore blocca annullo o abbandono (fallisce chiuso) | bassa | log `food_club_error` se desiderato |
| D-R5 | Rimborso con `refund_recredits_voucher = true`: il buono torna disponibile (voluto da D-2) | nessuna | — |

## E. Modifiche necessarie in `api/` (area protetta, non fatte)
- **E1 (necessaria)** `api/_lib/sumupReconcileSweep.js` (o la sweep dei 5 minuti): includere gli attempt `failed/abandoned_timeout`
  e `failed/sumup_failed` di ordini `cancelled`/`payment_abandoned` con buono riservato. Esito della GET del checkout:
  `PAID` → `kitchen_payment_confirm` (consuma il buono); `EXPIRED`/`CANCELLED` → `kitchen_payment_fail` con `sumup_expired`/`sumup_cancelled`
  (rilascio automatico); `FAILED`/`PENDING`/errore di rete → nessuna azione (resta riservato, l'avviso staff dopo 30 min lo fa la RPC). Test unitari con rete simulata.
- **E2** usare il `valid_until` del checkout SumUp per sapere quando un FAILED non è più ritentabile (oggi non viene letto).
- **E3** endpoint per lo staff «verifica ora» su un ordine (stessa logica di E1, su richiesta) prima dello sblocco manuale.
- Il webhook non richiede modifiche: chiama già `kitchen_payment_confirm` anche sugli `abandoned_timeout`.

## F. Piano Fase 3 (ogni riga = autorizzazione separata di Eros)
| # | Passo | Area protetta | Gate |
|---|---|---|---|
| 1 | Riscrivere RF1/RF1b secondo l'Opzione C | no (`proposed/`), ma sono test | tuo ok |
| 2 | E1 + E3 in `api/` con test unitari | **sì, `api/` (soldi reali)** | autorizzazione |
| 3 | UI: messaggio D5 nel sacco e nel Club; lista staff «buoni in verifica» con sblocco manager | codice app | autorizzazione |
| 4 | Fondere la SQL nelle migration Food Club non ancora applicate (oppure spostarla in `supabase/migrations/`) | **sì** | autorizzazione |
| 5 | Prova SumUp sandbox: abbandono, poi pagamento tardivo, scadenza, importo anomalo | pagamenti di prova | autorizzazione |
| 6 | Commit, `db push`, deploy | **sì** | autorizzazione separata per ciascuno |

## NEEDS_DECISION
- **N4** finché E1 non c'è: il manager può sbloccare dopo aver verificato a mano sulla dashboard SumUp (serve una RPC che chiude
  l'attempt come definitivo, con motivo e log), oppure si aspetta E1? Raccomandato: aspettare E1 e non rilasciare prima.

## Comandi eseguiti
`ONLY_OPTION_C=1 [KEEP_STACK=1] SUPABASE_BIN=…/supabase docs/food-club/implementation/proposed/harness/run-oc-local.sh <scratchpad>`, due volte.
Stack `walbox-fc-oc` fermato con `stop --no-backup` (solo il volume temporaneo di quello stack); 0 container a fine run.
