# Kitchen — Payment Lifecycle V2 (piano eseguibile S3→S7)

Creato 2026-10-12 (Fase 2 di `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`). Rende eseguibile il piano originale di Eros
(`docs/KITCHEN_PAYMENT_PLAN_EROS.md`) con le decisioni D1–D4 del 2026-10-12. **Non ridecide nulla**: dove serviva
una scelta tecnica è segnata come "scelta tecnica"; dove servirebbe una scelta di prodotto è `NEEDS_DECISION`.
Riferimenti `file:riga` verificati sul branch `kitchen-clean-baseline-v2-phase-a` il 2026-10-12.
Abbreviazioni: POP = `pending_online_payment`, PA = `payment_abandoned`, PCP = `pending_counter_payment`.

## 1. Regola guida

- SumUp decide cosa è successo ai soldi; Walbox decide cosa succede all'ordine. Verifica sempre server-side.
- **La cassa vede solo ordini puliti**: online già pagati (`received`) o scelti "al banco" (PCP).
- Ogni problema dell'online lo risolve il sistema da solo; le anomalie vanno in log back-office per Eros, mai alla cassa.

## 2. State machine target

```
NOME → COME VUOI PAGARE?
  ├─ BANCO  → crea ordine PCP → cassa lo vede → incasso → received
  └─ ONLINE → crea ordine POP (nascosto) → attempt → SumUp
               ├─ PAID verificato ............ POP → received (cassa lo vede)
               ├─ FAILED ..................... resta POP: "Riprova" (nuovo attempt) o "Paga al banco"
               ├─ PAGA AL BANCO (cliente) .... disattiva checkout → POP → PCP (online_payment_disabled=true)
               ├─ stato incerto .............. resta POP, nascosto; il sistema riverifica
               └─ 5 min senza pagamento ...... 1 disattiva checkout → 2 rilegge SumUp
                                                → PAID: received · non pagato: POP → PA (terminale)
```

- Timer: parte da `kitchen_orders.created_at` dell'ordine POP (l'ordine nasce alla scelta, S5). FAILED e "Riprova"
  **non** lo azzerano (D2). Dopo il passaggio al banco il timer non vale più.
- PA è lo stato "annullato dal sistema" della corsia online (piano originale: abbandonato → `payment_abandoned`).
  Non compare in cassa, Solo, TV, Storico (Storico mostra solo `delivered`/`cancelled`, `StoricoView.jsx:68-69`).
- **D4 prevale su A1/A2 di S2.** Dopo PA non si paga più: `attempt_start` rifiuta PA; un PAID SumUp che arriva su PA
  (anomalia residua) chiude il charge nel ledger come `succeeded` (i soldi non si perdono) e scrive
  `payment_confirmed_after_abandon` in `kitchen_action_log`, **senza toccare l'ordine** (stesso schema del ramo
  `cancelled` di oggi, `20261009120000_…amount_integrity_v1.sql:351-369`). Nessun rimborso automatico.
  Il trigger S2 resta così com'è (più permissivo delle RPC: nessuna modifica alla migration S2).

## 3. Cosa c'è oggi (audit 2026-10-12, sintesi)

| Pezzo | Oggi | Problema per V2 |
|---|---|---|
| S2 `20261009140000` | stati POP/PA, `client_request_id` + unique parziale, trigger guardia I1/I2/I3 | solo locale, non applicata |
| `kitchen_customer_create_order` (`20260923130000:188`) | inserisce sempre PCP (291, 294), nessuna idempotenza | serve v2 con corsia + `client_request_id` |
| `kitchen_payment_confirm` (`20261009120000:249`) | ramo PCP→received (347); ELSE: `paid` senza cambiare status (370-375) | **con un ordine POP il trigger I2 lo rifiuta**: webhook/reconcile andrebbero in errore. Va corretto prima di creare ordini POP |
| `kitchen_payment_attempt_start` (`20261009120000:137`) | blocca `cancelled`, `paid`, `online_payment_disabled` | non blocca PA né il timer scaduto |
| `kitchen_payment_attempt_claim_checkout` (`20260830143353:34`) | guarda solo l'attempt | non guarda stato/scadenza dell'ordine |
| `close_unpaid`, `order_cancel*` | solo staff (`is_staff_for_venue`) | il sistema (service role, `auth.uid()` NULL) non può usarle |
| CHECK `payment_status` (`20260828100200:26-30`) | NULL, PCP, paid, cancelled, refunded | per POP/PA si usa NULL (scelta tecnica, §4) |
| View `kitchen_payments_provider_drift_candidates` (`20261006124448`) | ramo `failed_charge_retry_window_open` esclude solo `cancelled` (63-71) | attempt di ordini POP/PA finirebbero tra le ANOMALIE staff |
| Disattivazione checkout | `deactivateAndVerify` + `getSumupCheckout` copiati in `api/kitchen-staff-sumup-close-for-counter.js:222-252` e `api/kitchen-cancel-with-payment-check.js:220-256`, senza timeout | da estrarre in `api/_lib/` |
| Sweep | `api/kitchen-sumup-reconcile-sweep.js` (cron 03:00, `CRON_SECRET`), parte dagli attempt, senza soglie, senza DELETE | non vede ordini POP senza attempt; non annulla |
| Cliente | ordine creato **prima** della scelta (`CustomerKitchenMenu.jsx:571-641` → `/kitchen/payment`); "paga al banco" solo in localStorage (`useOrderPaymentFlow.js:41-59`) | S5 |
| Stato cliente | `CustomerOrderStatus.jsx` / `CustomerOrderPanel.jsx:6-14` conoscono solo gli stati legacy; `cancelled` sparisce in silenzio (`:63-65`) | servono testi per POP/PA |
| Staff | Solo/Alert/TV/Prep filtrano con allow-list S1; `useKitchenOrders` scarica comunque tutto (`:175-177`); `useKitchenPayments` **non filtra** per stato ordine (`:106-121`) | anomalie/summary/recentPayments vedrebbero gli attempt POP/PA |
| DB produzione | `pg_net` 0.20.4 e `supabase_vault` installati; `pg_cron` 1.6.4 **disponibile, non installato** (MCP lettura 2026-10-12) | meccanismo 5 min, §5 |

## 4. Scelte tecniche (proposte qui, approvate con il piano)

- T1. `payment_status` degli ordini POP e PA = NULL. Il passaggio al banco scrive PCP, la conferma scrive `paid`.
  L'audit di S3 verifica che nessun consumatore rompa con NULL (oggi NULL è già ammesso dal CHECK).
- T2. Nuove RPC solo per il sistema = `service_role_only` (stessa guardia di `payment_confirm`), mai esposte al browser.
  Le azioni del cliente che toccano SumUp passano da `api/` (il browser non ha le chiavi SumUp).
- T3. `kitchen_customer_create_order` v1 resta (la usano la cassa `CounterAssistedOrder.jsx:247-260` e le app vecchie
  ancora aperte, che continuano a creare PCP come oggi). La v2 è un'aggiunta, non una sostituzione.
- T4. Una sola libreria SumUp in `api/_lib/sumupCheckout.js`: `getCheckoutVerified` (GET + controllo
  `checkout_reference`, timeout) e `deactivateAndVerify` (DELETE + GET di verifica). F2/F3 la riusano a parità di
  comportamento (i loro 41 test restano verdi senza modifiche).
- T5. Margine di sicurezza: `attempt_start` e `claim_checkout` rifiutano dopo `created_at + 4:30`; lo sweep lavora
  gli ordini con `created_at < now() - 5 min`. Così nessun checkout nuovo nasce mentre lo sweep chiude.
- T6. Funzioni Vercel: oggi 8 handler in `api/`; V2 ne aggiunge 2 → 10. Da verificare in S4: il piano Vercel
  (non deducibile dal repo) e se i 2 `api/*.test.js` contano come funzioni (sarebbero 12, il limite Hobby).
  Se serve, S4 sposta quei test fuori da `api/`.

## 5. Meccanismo dei 5 minuti

| Opzione | Come | Costo | Affidabilità |
|---|---|---|---|
| **A (raccomandata)** | `pg_cron` ogni minuto: se esiste un POP con `created_at < now()-5min`, `net.http_post` verso `/api/kitchen-online-abandon-sweep` con secret da Vault (stesso schema del push `20260924130000:82-137`) | 0 € (pg_cron incluso in Supabase; chiamate a Vercel solo quando c'è lavoro) | alta, indipendente dal telefono |
| B | Vercel cron ogni minuto | serve piano Vercel Pro (a pagamento) → 🔒 | alta |
| C | Solo controllo "pigro" dal telefono del cliente alla scadenza | 0 € | bassa: se il cliente chiude l'app l'ordine resta POP |

Raccomandazione: **A**, più C come complemento facoltativo (la pagina stato del cliente, a timer scaduto, chiama lo
stesso controllo per mostrare subito l'esito). La logica SumUp resta in `api/` (le chiavi sono su Vercel).
Gate di Eros per A: migration che attiva `pg_cron` (db push), secret in Vault e `CRON_SECRET`/nuova env su Vercel
(li crea Eros, Claude non tocca segreti).

## 6. Sotto-fasi

Regola per ogni sotto-fase: audit read-only breve → casi limite → test prima del codice → codice → verifiche →
report in `ai-ops/reports/` → 🔒 Eros approva diff e commit. **db push** e **deploy** sono 🔒 separati.
Verifica minima: `node --test` dei test toccati + `node --test src/lib/*.test.js api/*.test.js` + lint dei file
toccati + `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build`. Migration: test statico accanto alla .sql +
runtime su Supabase locale (`scripts/e2e-real-supabase-local.sh`, applica tutte le migration in Docker/OrbStack).

### S3 — RPC e state machine DB (Opus high · area protetta `supabase/migrations/`)

Nuova migration `supabase/migrations/<ts>_kitchen_online_payment_lifecycle_rpc_v1.sql` + `.test.js`:
1. `kitchen_customer_create_order_v2(venue, nickname, note, items, fulfillment, p_payment_lane, p_client_request_id)`:
   stesse guardie e totale da catalogo della v1; `counter` → PCP, `online` → POP + `payment_status` NULL;
   doppio tap (stesso `customer_id` + `client_request_id`) → restituisce l'ordine già creato. Grant `authenticated`.
2. `kitchen_payment_confirm`: nuovo ramo POP → `received` + `paid` nello stesso UPDATE; ramo PA → solo log
   `payment_confirmed_after_abandon` (D4). Rami esistenti invariati.
3. `kitchen_payment_attempt_start`: rifiuta PA (`order_payment_abandoned`) e POP oltre `created_at + 4:30`
   (`online_payment_expired`).
4. `kitchen_payment_attempt_claim_checkout`: stesse due guardie sull'ordine.
5. `kitchen_order_switch_to_counter_system(p_order_id, p_actor_customer_id)` service role: solo da POP; attempt vivi →
   `failed` `customer_switched_to_counter`; `online_payment_disabled=true`; status e `payment_status` → PCP;
   log in `kitchen_action_log`.
6. `kitchen_order_mark_payment_abandoned(p_order_id)` service role: solo da POP; rifiuta se esiste un charge
   `succeeded` o un claim più giovane di 20 s; attempt vivi → `cancelled` `abandoned_timeout`; ordine → PA; log.
7. View drift: ramo `failed_charge_retry_window_open` esclude anche POP e PA.

Casi limite (ognuno con test runtime): doppio tap con corsia diversa (vince il primo); `client_request_id` NULL
(nessuna idempotenza, come oggi); confirm su POP/PA/PCP/cancelled; confirm due volte; start su PA, su POP scaduto,
su POP con attempt vivo; switch da PCP/received/PA (rifiutato); abandon con charge succeeded (rifiutato), con claim
giovane (rifiutato, riprova al giro dopo), due volte (idempotente o errore chiaro); `record_counter` su POP
(già fail-closed). Test esistenti delle migration toccate devono restare verdi.
Gate: 🔒 commit · 🔒 db push di S2 + S3 insieme (prima di qualunque frontend che crei ordini POP).

### S4 — API che orchestrano online ↔ banco (Opus high · area protetta `api/`)

1. `api/_lib/sumupCheckout.js` (T4) + test; F2 e F3 la usano (refactor a parità, test esistenti verdi).
2. Nuovo `api/kitchen-customer-switch-to-counter.js`: Bearer cliente + proprietà ordine; per ogni attempt vivo:
   recupero riferimento (anche claim senza `provider_ref`, logica I-3) → `deactivateAndVerify` →
   PAID: confirm (→ `received`, risponde "già pagato") · chiuso/not_found: RPC switch · incerto: 409 "riprova tra poco",
   nessun cambio. Test prima del codice, stessa matrice di F2.
3. `create-checkout`, `webhook`, `reconcile`, `staff-reconcile`: nessun cambio di logica (con S3 il confirm su POP
   funziona); gestione esplicita dei nuovi errori RPC (`order_payment_abandoned`, `online_payment_expired`) → 409
   leggibile, mai 500. Timeout sulle fetch SumUp dei file toccati (`api/CLAUDE.md` regola 5).
4. `scripts/post-deploy-smoke.mjs`: il nuovo endpoint senza token → 401, con token finto → 401.

Casi limite: cliente non proprietario (403); ordine già PCP (idempotente); ordine PA (409); SumUp giù (incerto, nessun
cambio); PAID scoperto durante lo switch; doppio tap su "Paga al banco".
Gate: 🔒 commit · 🔒 deploy (può andare in produzione prima di S5: senza ordini POP è inerte) + smoke.

### S5 — Esperienza cliente "Come vuoi pagare?" (Sonnet medium per il codice, Opus high per la review)

1. `CustomerKitchenMenu.jsx`: dopo lo step NOME, step "COME VUOI PAGARE?" (BANCO / ONLINE) nella stessa pagina,
   **senza nuove route** (`src/App.jsx` protetto). `client_request_id` generato una volta per carrello e tenuto in
   localStorage fino all'esito; creazione con la v2.
   - BANCO → ordine PCP → `/kitchen/status` come oggi.
   - ONLINE → ordine POP → `attempt_start` + create-checkout (codice di `useOrderPaymentFlow.js:102-148`) → SumUp.
2. `CustomerOrderStatus.jsx` / `CustomerOrderPanel.jsx`: testi per POP ("Pagamento online in corso", tempo rimasto,
   RIPROVA, PAGA AL BANCO → nuovo endpoint S4) e PA ("Ordine annullato: il pagamento non è stato completato
   entro 5 minuti."). Messaggio neutro: **nessuna promessa "Nessun addebito"**, perché esiste il caso raro PA + PAID
   SumUp confermato dopo (§2, D4). PA e i POP restano visibili al cliente finché non li chiude.
3. `useKitchenPayments.js`: summary, anomalie e `recentPayments` escludono gli attempt di ordini POP/PA.
4. Logica pura (corsia, scadenza, testo stato) in `src/lib/kitchenOnlineLane.js` + `kitchenOnlineLane.test.js`.
5. E2E: riscrivere i test che fissano il flusso vecchio (`customer-kitchen-flow.spec.js` 3i, 37-44) e aggiungere:
   banco, online pagato, online fallito → riprova, online → banco, scadenza → PA.

Casi limite: doppio tap su ONLINE/BANCO; rete giù alla creazione (carrello conservato, stesso `client_request_id`);
ritorno da SumUp dopo la scadenza; app vecchia aperta (I-6 ricarica prima del pagamento); cucina chiusa tra NOME e
scelta; promo pass (oggi applicata dopo la creazione: l'audit S5 verifica che resti valida su POP prima dell'attempt).
`NEEDS_DECISION` (non bloccante, default proposto): dopo PA, il bottone "RIFAI L'ORDINE" rimette nel carrello gli
stessi piatti (default: sì).
Gate: 🔒 commit · 🔒 deploy · prova reale dal telefono 🔒 (soldi reali, la fa Eros).

### S6 — Chiusura automatica a 5 minuti + smoke SumUp (Opus high · `api/` + migration)

1. Nuovo `api/kitchen-online-abandon-sweep.js` (auth `CRON_SECRET`): ordini POP con `created_at < now()-5min`
   (indice S2 `idx_kitchen_orders_pending_online_created`), al massimo 20 per giro, timeout su ogni fetch.
   Ordine obbligato D4 per ciascuno: 1 disattiva i checkout vivi (`deactivateAndVerify`, recupero I-3 per i claim
   senza `provider_ref`) → 2 rilegge SumUp → 3 PAID: confirm → `received` · 4 chiuso/not_found/nessun attempt:
   `kitchen_order_mark_payment_abandoned` · incerto: nessun cambio, riprova al giro dopo; oltre 15 min incerto →
   log `online_abandon_stuck` (back-office), l'ordine resta nascosto.
2. Migration `<ts>_kitchen_online_abandon_cron_v1.sql`: `CREATE EXTENSION pg_cron`, job ogni minuto (opzione A §5),
   secret letto da Vault (nome fisso, valore inserito da Eros).
   - **Hardening consumo:** il job fa **solo** un controllo DB leggero e indicizzato: `EXISTS` su `kitchen_orders`
     con `status = 'pending_online_payment' AND created_at < now() - interval '5 minutes'` (coperto dall'indice
     parziale S2 `idx_kitchen_orders_pending_online_created`). `net.http_post` verso lo sweep parte **solo se
     l'EXISTS è vero**. Nessuna altra lettura, nessun log applicativo nel ramo vuoto.
   - **Acceptance:** con zero POP scaduti → **zero chiamate HTTP** a Vercel e a SumUp, nessun egress applicativo
     significativo (`net._http_response` non cresce). Test statico sul testo SQL (l'`http_post` sta dentro il ramo
     `IF EXISTS`) + verifica runtime su Supabase locale (job eseguito con zero POP scaduti → nessuna riga nuova in
     `net._http_response`; con un POP scaduto → una sola chiamata).
   - **Retention della cron history:** secondo job pg_cron giornaliero che cancella da `cron.job_run_details` le righe
     più vecchie di **7 giorni**, così lo storico delle esecuzioni (1.440 righe al giorno dal job a 1 minuto) non
     cresce all'infinito. Hardening tecnico dell'opzione A, non una decisione di prodotto.
3. Back-office per Eros: query documentata in `docs/` su `kitchen_action_log` (`payment_confirmed_after_abandon`,
   `online_abandon_stuck`). Nessuna UI cassa.
4. Smoke: `post-deploy-smoke.mjs` aggiunge lo sweep senza secret → 401. E2E locale con Supabase in Docker:
   ordine POP lasciato scadere → PA; POP pagato a 4:50 → `received`.
5. **Verifica consumo post-attivazione** (sola lettura, evidence nel report S6), dopo il db push del cron e di nuovo
   dopo la prima serata:
   - cron idle: con zero POP scaduti le esecuzioni in `cron.job_run_details` risultano `succeeded` e non generano
     chiamate (nessuna riga nuova in `net._http_response`, nessuna invocazione di `/api/kitchen-online-abandon-sweep`
     nei log Vercel);
   - chiamate HTTP generate: numero di invocazioni dello sweep = numero di minuti con almeno un POP scaduto;
   - crescita della cron history: righe in `cron.job_run_details` stabili intorno a 7 giorni × 1.440 (+ il job di
     retention), il job di retention è eseguito con successo;
   - assenza di consumo anomalo: nessun errore ripetuto nel job, nessun picco di invocazioni Vercel o di chiamate SumUp.

Casi limite: sweep doppio in parallelo (RPC idempotente); pagamento completato tra DELETE e rilettura (vince PAID);
DELETE 5xx; SumUp irraggiungibile per tutto il giro; ordine passato al banco mentre lo sweep gira (abandon rifiutato
perché non più POP); webhook PAID su PA (solo log).
Gate: 🔒 commit · 🔒 deploy API · 🔒 secret Vault + env Vercel (Eros) · 🔒 db push cron (dopo il deploy API).

### S7 — Pulizia legacy (Sonnet medium · per ultima, dopo almeno una serata reale con V2)

Candidati (ognuno verificato non più raggiungibile prima di toglierlo): creazione ordine prima della scelta e
bivio su `/kitchen/payment` (`CustomerKitchenMenu.jsx:571-641`, `CustomerOrderPayment.jsx`); `paymentChoice` in
localStorage (`useOrderPaymentFlow.js:41-59`); attempt online su ordini PCP; PASSA AL BANCO staff
(`KitchenSoloService.jsx:370-400,930-947`, `src/lib/kitchenCloseForCounter.js`,
`api/kitchen-staff-sumup-close-for-counter.js`); ramo `online_payment_in_progress` lato cassa; pagine senza route
`KitchenPayments.jsx`, `KitchenPromo.jsx`. La v1 di `create_order` resta finché la usa la cassa.
Gate: 🔒 commit · 🔒 deploy.

## 7. Ordine di rilascio in produzione

1. S3 committata → **db push S2 + S3** (inerte: nessun client crea POP; confirm/start compatibili con PCP).
2. S4 → deploy + smoke (inerte senza ordini POP).
3. S5 → deploy + smoke + pagamento reale di prova. Da qui nascono ordini POP: **S6 deve essere già pronta**.
   Ordine consigliato: S6 sviluppata insieme a S5 e rilasciata **prima** del deploy S5 (sweep attivo prima che
   esistano ordini POP).
4. S7 dopo almeno una serata reale.

Rollback: frontend → Promote del deploy precedente su Vercel (gli ordini POP già creati restano gestiti da S4/S6,
che sono lato server). DB: le migration sono additive; il job pg_cron si spegne con `cron.unschedule` (migration
dedicata, 🔒).

## 8. Decisioni

- Prese (Eros, 2026-10-12): D1–D4 (vedi `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`).
- **Approvati da Eros (2026-10-12): piano integrale, T1–T6 (§4) e opzione A per i 5 minuti (§5)**, con gli
  hardening tecnici di S6 (controllo indicizzato prima di ogni chiamata, retention 7 giorni della cron history,
  verifica consumo post-attivazione) e testo PA neutro (S5).
- `NEEDS_DECISION` non bloccante: "RIFAI L'ORDINE" dopo PA ripopola il carrello (default sì, §S5).

Modello/effort: S3, S4, S6 Opus high · S5 e S7 Sonnet medium (implementazione) + Opus high (review).
