# Food Club V1 — collaudo RF su Mac + piano tecnico Opzione C (2026-11-05)

Worktree: `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Nessun commit, push, deploy o accesso alla produzione.
`supabase/migrations/` non modificata.

## 1. Ambiente (verificato)
| Voce | Esito |
|---|---|
| OrbStack | `orbctl status` = Running, Docker 29.4.0, nessun container acceso prima del test |
| Porte 5432x | libere |
| Supabase CLI | non installata globalmente; usata la 2.122.0 già in cache npx (`~/.npm/_npx/91eb58246759989d`). Il harness originale (`npx --prefix ROOT supabase`) scaricherebbe l'ultima versione: per questo ho scritto `run-rf-local.sh` con `SUPABASE_BIN` |
| Immagini Docker | la CLI ha scaricato da `public.ecr.aws/supabase` (registro ufficiale) postgres 17.11.0.006, gotrue v2.197.0, postgrest v16.5 |
| Node / psql | v26.7.0 / psql 18.6 |
| Dipendenze | `npm ci --ignore-scripts` nel solo worktree (149 pacchetti, playwright 1.61.0, vite 8.0.16). `node_modules` di `walbox-kitchen-release` intatto. `node_modules` è gitignored |
| Isolamento | stack con `project_id = walbox-fc-rf` in cartella temporanea (scratchpad), config patchata solo nella copia, seed spento, controllo che il DB sia `127.0.0.1:54322`; stack fermato a fine run (0 container) |

## 2. Test RF (eseguiti, `proposed/harness/run-rf-local.sh`)
Ogni scenario gira da solo in BEGIN/ROLLBACK. Migration: 74 `.sql` (senza patch), 75 dopo `db reset` con la patch.

| Scenario | Senza patch | Con patch `20261105104000` |
|---|---|---|
| RF1 abbandono → SumUp tardivo → paid: buono ri-consumato | FAIL (buono non usato) | PASS |
| RF1b buono già speso altrove → anomalia staff | FAIL (nessuna anomalia) | PASS |
| RF2 paid a mano poi charge: buono usato + timbro | FAIL (resta riservato) | PASS |
| RF3 rimborso ordine invito → premio revocato | FAIL | PASS |
| RF4 DELETE ordine → FK RESTRICT | FAIL (violazione CHECK) | PASS |
| RF5 combo: quota food segue il prezzo | FAIL | PASS |
| Scenari esistenti (4 file: 10/20/30/40) | OK | OK |

Esito: conferma la revisione del 04/11 (6 FAIL senza, 6 PASS con, nessuna regressione). Non eseguiti in questa run:
HTTP/OTP, browser, PWA, concorrenza, Edge Function (fuori dal perimetro richiesto).

## 3. Integrazione SumUp — fatti rilevanti per l'Opzione C (verificati a campione)
- Il buono viene liberato dal trigger `kitchen_orders_food_club_on_closed_unpaid` (`20261105101000…:405-410`) quando l'ordine passa a
  `cancelled` **o `payment_abandoned`**, senza guardare gli attempt. **Questo è il punto che contraddice l'Opzione C.**
- All'abbandono (5 min) gli attempt diventano `failed/abandoned_timeout`, che `kitchen_payment_confirm` **accetta ancora**
  (`20261012100000…:258-265`): il pagamento resta confermabile, ma il buono è già libero → origine del P1.
- Confermabili oggi: `initiated`, `pending`, `failed/sumup_failed`, `failed/abandoned_timeout`.
  Definitivi: `cancelled`, `failed` con `sumup_expired`, `sumup_cancelled`, `customer_switched_to_counter`,
  `staff_closed_for_counter`, `sumup_amount_mismatch`, `order_already_paid_race`, `succeeded`.
- Conferma tardiva su ordine abbandonato: charge `succeeded`, ordine resta `payment_abandoned`, log
  `payment_confirmed_after_abandon` (needs_manual_reconciliation).
- Chi può confermare in ritardo un `abandoned_timeout`: solo il webhook. La sweep notturna (03:00) e le API reconcile
  filtrano solo `sumup_failed` (`api/_lib/sumupReconcileSweep.js:52-58`): **nessuno riverifica gli `abandoned_timeout`**.
- `valid_until` di SumUp non è usato da nessuna parte. Rischio noto nel codice: un checkout FAILED può ancora diventare
  PAID se il cliente riprova sulla pagina SumUp (`api/_lib/sumupCheckout.js:47-48`).
- Annullo con verifica (`kitchen_order_cancel_with_payment_attempt`): chiude su SumUp e mette l'attempt `cancelled` → definitivo.
  `kitchen_order_cancel` semplice non guarda gli attempt.
- Lo staff vede anomalie da `kitchen_action_log` (Storico/Pagamenti, KPI "Errori Club"); nessuna UI legge `food_club_voucher_events`
  né `online_abandon_stuck`.

## 4. Piano tecnico Opzione C (da approvare, NON implementato)
**Regola in una riga:** buono `reserved` finché l'ordine ha almeno un attempt SumUp confermabile; `used` al primo charge
`succeeded` (anche se l'ordine è abbandonato); `available` solo quando tutti gli attempt sono definitivi e nessuno è `succeeded`.

### Fase 1 — DB (migration proposta in `proposed/`, poi gate per spostarla)
1. Funzione `food_club_order_payment_state(order_id)` → `paid` | `open` (almeno un attempt confermabile) | `closed` (tutti definitivi).
   Unica fonte di verità della lista confermabili/definitivi (la stessa di `kitchen_payment_confirm`).
2. Trigger di rilascio: su `cancelled`/`payment_abandoned` libera **solo se** lo stato è `closed`; se `open` → buono resta
   `reserved`, evento `held_payment_open`.
3. Nuovo trigger su `kitchen_payments` (estende FIX-2): a ogni cambio di stato di un charge
   - `succeeded` → consuma il buono subito (`used`), anche con ordine `payment_abandoned`;
   - attempt diventato definitivo e ordine chiuso (`cancelled`/`payment_abandoned`) e stato `closed` → libera il buono.
4. FIX-1 (ri-consumo e `food_club_voucher_double_spend`) resta come rete di sicurezza per i percorsi legacy; FIX-2..5 invariati.
5. Vista/RPC staff `food_club_vouchers_on_hold` (buoni riservati su ordini chiusi da più di N minuti) e RPC staff
   `food_club_staff_release_voucher(order_id, motivo)` con log, solo dopo verifica manuale.

### Fase 2 — riconciliazione SumUp (`api/`, area protetta: gate dedicato)
6. Sweep di finalizzazione per gli attempt `abandoned_timeout`/`sumup_failed` di ordini chiusi: GET del checkout →
   `PAID` conferma (consuma); `EXPIRED`/`CANCELLED` → `kitchen_payment_fail` con `sumup_expired`/`sumup_cancelled` (definitivo → libera);
   `FAILED`/`PENDING`/errore → resta aperto, riprova; oltre il limite T → log `food_club_voucher_uncertain` per lo staff.
   Si estende `sumupReconcileSweep.js` (filtro) o si aggiunge un passo alla sweep dei 5 minuti; frequenza da scegliere.

### Fase 3 — UI (piccola)
7. Cliente: buono "IN VERIFICA" (non utilizzabile) mentre è riservato su un ordine chiuso. Staff: lista buoni in attesa con azione libera.

### Test (prima, in `proposed/51_option_c.sql`, devono fallire oggi)
OC1 abbandono con attempt `abandoned_timeout` → buono resta riservato · OC2 poi PAID tardivo → `used` senza intervento staff, niente
secondo uso possibile · OC3 poi sweep vede EXPIRED → liberato · OC4 annullo verificato (`cancelled`) → liberato subito ·
OC5 `kitchen_order_cancel` semplice con attempt aperto → resta riservato + evento · OC6 passaggio al banco → buono resta sull'ordine,
consumato all'incasso · OC7 FAILED oltre T → anomalia staff, buono riservato · OC8 rilascio manuale staff → `available` + log ·
OC9 PAID con importo diverso → nessun consumo, anomalia · OC10 idempotenza (doppio webhook / doppio trigger) · più RF1–RF5 e i 44 scenari.

### Casi limite e comportamento atteso
| Caso | Atteso |
|---|---|
| Cliente abbandona e riapre il link SumUp dopo 10 min e paga | buono consumato su quell'ordine; ordine resta abbandonato con anomalia per lo staff (come oggi) |
| Cliente prova a usare lo stesso buono su un nuovo ordine mentre il primo è aperto | rifiutato (buono `reserved`) |
| SumUp irraggiungibile per ore | buono resta riservato; dopo T anomalia staff; nessun rilascio automatico |
| Buono scade mentre è riservato | se poi il pagamento fallisce → `expired`, non `available` |
| Doppio charge succeeded | impossibile (indice unico); lost_race già loggato |

### Decisioni aperte (NEEDS_DECISION)
- **D-C1** limite T dopo cui un FAILED/PENDING è "incerto" e va allo staff (proposta: 30 min; nel frattempo il buono è bloccato).
- **D-C2** un checkout `FAILED` verificato vale come definitivo dopo T? (sì = il buono torna al cliente; no = solo lo staff lo libera).
- **D-C3** chi può liberare a mano: solo manager o tutto lo staff.
- **D-C4** testo per il cliente durante il blocco ("IN VERIFICA" + spiegazione).

### File toccati (stima)
`docs/food-club/implementation/proposed/2026110510500x_food_club_v1_option_c.sql` + `proposed/51_option_c.sql` (consentiti ora);
poi, con gate: `supabase/migrations/` (spostamento), `api/_lib/sumupReconcileSweep.js` o `onlineAbandonSweep.js`, una pagina staff e il sacco/club cliente.

### Gate irreversibili
Spostamento in `supabase/migrations/`, modifica `api/`, commit, `db push`, deploy: tutti di Eros. Prima della produzione serve una prova
SumUp sandbox/reale con abbandono e pagamento tardivo (punto 6 della REVIEW).

Modello/effort: Fase 1 (SQL + test) sessione principale Opus effort high (soldi/buoni); Fase 3 UI subagent Sonnet medium.
