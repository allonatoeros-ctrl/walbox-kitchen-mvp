# Food Club V1 — Verifica finale prima delle API (2026-11-05)

**Verdetto: PARZIALE.** Su 26 controlli: 25 PASS, 1 FAIL vero (OC12b: lo staff semplice aggira lo sblocco riservato al manager).
Il FAIL non dipende da `api/`: va deciso da Eros (NEEDS_DECISION §2) prima di passare alle API.
Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Modificati solo file in `docs/food-club/implementation/proposed/`.
Nessuna modifica a `api/`, `supabase/migrations/`, app o produzione. Nessun commit, push, deploy o pagamento.
Backup prima delle modifiche: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/3826a861-b24f-4bb4-aa38-6f5e8bb6cd1b/scratchpad/backup/proposed/`.
Legenda: **[V]** verificato con test eseguito · **[D]** dedotto dal codice · **[NV]** non verificato.

## File modificati (tutti in `proposed/`)
| File | Modifica |
|---|---|
| `50_review_fixes.sql` | RF1 e RF1b riscritti per l'Opzione C; nota in testa (richiedono anche la SQL Opzione C) |
| `51_option_c.sql` | nuovi OC12 (privilegi), OC12b (bypass dello staff), OC13 (tempi 5/10/15) |
| `harness/oc-helpers.sql` | nuovo helper `fc_test.oc_try(ruolo, utente, sql)`: esegue con il ruolo Postgres reale |

## 1. Privilegi sul DB locale (OC12 PASS, OC12b FAIL) [V]
Stack locale isolato `walbox-fc-oc` (127.0.0.1:54322), 76 migration (74 + patch P1 + Opzione C). Ruoli Postgres reali
(`SET LOCAL ROLE anon/authenticated`) + claim JWT, non solo i claim.
- **EXECUTE**: le 7 funzioni interne (`attempt_confirmable`, `attempt_captured_mismatch`, `order_payment_state`,
  `settle_unpaid_order`, `settle_paid_order`, i 2 trigger) non sono eseguibili da anon, authenticated o PUBLIC.
  `staff_vouchers_on_hold` e `admin_release_voucher`: authenticated sì, anon e PUBLIC no.
- **A runtime**: anon riceve `permission denied` su tutte e 5 le chiamate. Cliente estraneo e cliente proprietario:
  `permission denied` sulle interne; lista staff e sblocco rifiutati.
- **SECURITY DEFINER**: tutte le funzioni `*food_club*` hanno owner `postgres` e `search_path` fissato (0 eccezioni).
  L'unica eseguibile da anon è `food_club_public_campaign(text)`, già esistente e pubblica per scelta (non è dell'Opzione C).
- **RLS**: il cliente non può scrivere `food_club_vouchers` né `food_club_voucher_events` (permission denied).
  `UPDATE kitchen_payments` → 0 righe (filtrate dalla RLS): attempt intatto. `kitchen_payment_fail` → `not_authorized`.
  Il buono resta riservato e non compare nessun evento `available` falsificato.
- **Staff/manager**: lo staff legge la lista del suo locale, non quella di un altro; lo sblocco gli è rifiutato prima di
  ogni controllo sul pagamento. Il manager riceve `payment_still_confirmable`.

## 2. FAIL OC12b — lo staff semplice può liberare un buono con il checkout ancora pagabile [V]
Riproduzione: ordine online con buono e attempt `initiated` (checkout SumUp aperto). Uno staff **non manager** chiama
`kitchen_payment_fail(attempt, 'sumup_expired')` con il proprio JWT → `OK`. Lo sweep dei 5 minuti chiude l'ordine →
nessun attempt confermabile → **buono `available`**. Se il cliente paga lo stesso su SumUp, `kitchen_payment_confirm`
risponde `invalid_attempt_status`: **soldi incassati su SumUp ma non registrati**, e buono riutilizzabile.
- Causa: `kitchen_payment_fail` (migration 20260830101227) consente allo staff, su attempt `initiated`/`pending`,
  qualsiasi motivo, compresi quelli che il provider usa per gli esiti definitivi.
- Esposizione: l'app non usa questo percorso. Gli unici chiamanti sono in `api/`, con service_role
  (`sumupPaymentResolution.js`, `kitchen-sumup-create-checkout.js:101`) [V grep]. Serve uno staff che chiama la RPC a mano.
- La regola D4 (sblocco solo dal manager) però non regge.

**NEEDS_DECISION — 3 opzioni:**
1. **(Consigliata)** Lo staff non può più scrivere motivi del provider (`sumup_*`, `abandoned_timeout`). Gli resta un
   motivo suo, ad esempio `staff_cancelled`, che l'Opzione C considera **non definitivo**: il buono resta riservato
   finché SumUp conferma l'esito (E1/E3) o un manager lo sblocca. L'app non cambia (non usa questo ramo).
   Si tocca una migration dei pagamenti (area protetta), con un test dedicato.
2. Togliere del tutto allo staff l'EXECUTE di `kitchen_payment_fail`: più semplice, ma toglie anche un'azione al banco.
3. Accettare il rischio (staff fidato) e registrarlo nel log: nessuna modifica, D4 resta aggirabile.

## 3. RF1/RF1b riscritti (Opzione C) [V]
- **RF1**: abbandono, poi il buono resta riservato. Il webhook PAID arriva in ritardo due volte: il buono viene consumato
  una volta sola. Lo staff segna l'ordine pagato: 1 solo `used`, 0 `available`, nessun `reclaimed_on_late_payment`,
  nessun doppio uso, 0 timbri.
- **RF1b (doppio utilizzo)**:
  - (A) Riuso del buono rifiutato (`voucher_not_available`) prima e dopo il webhook tardivo; un solo ordine riservato; nessun timbro.
  - (B) Checkout scaduto: il buono torna disponibile e viene speso su un secondo ordine. Il PAID tardivo sull'attempt
    scaduto viene rifiutato dal ledger (`invalid_attempt_status`). Anche la riapertura del vecchio ordine per incassarlo
    al banco viene rifiutata (`online_order_not_paid`). Il buono resta usato una sola volta, nessun timbro.
  - Il ramo FIX-1 `double_spend` per questa strada non è raggiungibile.
- Copertura conservata: webhook tardivo (RF1), webhook duplicato (RF1), doppio utilizzo (RF1b A+B).
- Nota: con la sola patch P1 (senza Opzione C) RF1/RF1b ora falliscono per costruzione. È scritto in testa al file.

## 4. Test linea del tempo 5/10/15 (OC13 PASS) [V]
Ramo A, pagato al minuto 10:
| Momento | Ordine | Buono | Importo | Timbro |
|---|---|---|---|---|
| T0 | in attesa, sconto = valore buono | riservato | attempt = totale scontato | 0 |
| T+5 sweep | `payment_abandoned` | riservato, stato `open` | — | 0 |
| T+10, prima del PAID | abbandonato; nessun avviso staff (soglia 30), visibile con soglia 0 come `payment_pending/1` | riservato | — | 0 |
| T+10 PAID | resta abbandonato, non `paid` | `used` su quell'ordine | charge `succeeded` = totale scontato | 0 |
| T+15/17 riverifiche | `kitchen_payment_fail` dopo PAID → `invalid_attempt_status`; webhook duplicato → nessun effetto | 1 `used`, 0 `available` | invariato | 0 |
| staff regolarizza (paid) | `received` → `preparing` | invariato | — | 1 (D-3 acceso), una volta |

Ramo B, mai pagato: SumUp FAILED a T+15 → buono ancora riservato. EXPIRED a T+17 → buono `available` con la scadenza
originale. Un PAID arrivato dopo EXPIRED viene rifiutato dal ledger: niente timbro, niente consumo.

## 5. Matrice finale (run unica, `run-oc-local.sh` con `ONLY_OPTION_C=1`) [V]
| Suite | Esito |
|---|---|
| OC1–OC9, OC11, OC11b | 11/11 PASS |
| OC12 privilegi | PASS |
| **OC12b bypass dello staff** | **FAIL** (§2) |
| OC13 tempi 5/10/15 | PASS |
| OC10-C1 webhook ↔ sblocco manager (2 sessioni reali) | PASS |
| OC10-C2 webhook ↔ riuso del buono (2 sessioni reali) | PASS |
| Scenari SQL 10/20/30/40 | OK 4/4 |
| RF1, RF1b (riscritti), RF2–RF5 | 6/6 PASS |

La prima esecuzione di OC12 conteneva un nome di colonna sbagliato in un tentativo d'insert (`actor_type` invece di
`actor`). Corretto e rieseguito sullo stesso stack: PASS. Stack fermato a fine lavoro (0 container `fc-oc`).
Log: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/3826a861-b24f-4bb4-aa38-6f5e8bb6cd1b/scratchpad/run1.log`.

## 6. `valid_until` di 15 minuti solo per i checkout con buono (analisi, nessuna modifica) [D salvo dove indicato]
**Correzione al report N5:** dopo la scadenza **non** nasce «un nuovo attempt con nuova scadenza». La claim rifiuta
qualsiasi nuovo checkout dopo `created_at + 4:30` (`online_payment_expired`) o su ordine abbandonato
(`order_payment_abandoned`) [V codice, `kitchen-sumup-create-checkout.js` r.149–153]. Il checkout più tardo nasce
quindi entro T+4:30 dalla creazione dell'ordine.
- **Proposta**: `valid_until = order.created_at + 15 min`, ancorato all'ordine e non al momento della POST. Così la
  finestra Food Club è uguale per tutti (T+15) e resta almeno 10:30 di validità. Serve leggere anche `created_at`
  nella select dell'ordine (r.58–62).
- **Solo con buono**: si legge `food_club_vouchers` con `reserved_order_id = order_id` e `status = 'reserved'`, che è la
  fonte autorevole (meglio di `discount_amount`). Senza buono il corpo della POST resta identico byte per byte
  (da blindare con un test). Se la lettura fallisce si risponde 5xx e **non** si crea il checkout (fail closed).
- **Retry nella stessa pagina** (SumUp FAILED, r.373–383): il checkout esistente viene riusato con la sua scadenza
  originale; la POST non si ripete, quindi `valid_until` non si allunga mai. Dopo la scadenza il GET dovrebbe dare
  EXPIRED → `attempt_no_longer_valid` → `kitchen_payment_fail(sumup_expired)` con service_role → buono restituito
  (OC13 ramo B lo copre lato SQL). Il nuovo `attempt_start` del cliente viene poi rifiutato dalla claim: niente secondo checkout.
- **Recupero List-first / 409 DUPLICATED** (r.170+, r.285+): il checkout trovato è quello creato dalla stessa POST, con
  lo stesso `valid_until` → nessun caso nuovo.
- **Rischio aperto [NV]**: dall'incidente A23 (`api/_lib/sumupCheckout.js` r.45) risulta che SumUp lascia FAILED un
  checkout FAILED anche dopo un DELETE. Se dopo `valid_until` resta FAILED invece di EXPIRED, l'attempt resta
  `sumup_failed`, quindi confermabile, e il buono resta riservato. Lo risolve solo la regola E1 (FAILED con
  `valid_until` della risposta SumUp passato da almeno 2 minuti → definitivo). Va provato in sandbox.
- **Ordini normali**: nessun campo nuovo, nessuna lettura che li cambi, stesso sweep. Il rischio residuo è solo la
  lettura del buono in più (latenza, fail closed).

## 7. Prossima fase: file API da toccare (ognuno con autorizzazione dedicata)
| # | File | Cosa | Test |
|---|---|---|---|
| 1 | `api/kitchen-sumup-create-checkout.js` | select + `created_at`; lettura del buono; `valid_until` solo con buono; fail closed | `tests/unit/sumup-payment-reliability.test.mjs`, `tests/unit/kitchen-amount-integrity.test.mjs` (corpo POST con e senza buono), `tests/unit/post-deploy-smoke.test.mjs` (verificare che non cambi) |
| 2 | `api/_lib/foodClubHoldSweep.js` (nuovo) | E1: buoni riservati su ordini chiusi → GET SumUp → `kitchen_payment_fail`/`confirm` via `applySumupCheckoutResult`; FAILED + `valid_until` passato da 2 min → definitivo | `api/_lib/foodClubHoldSweep.test.js` (nuovo) |
| 3 | `api/kitchen-online-abandon-sweep.js` (o `kitchen-sumup-reconcile-sweep.js`) | aggiungere la fase E1 | unit dell'endpoint |
| 4 | `api/_lib/sumupPaymentResolution.js` | solo se E1 richiede di distinguere FAILED scaduto (da decidere dopo la sandbox) | unit esistenti |
| 5 | Fuori da `api/`: migration Opzione C + P1, pg_cron di E1, fix OC12b (§2) | area protetta | 50/51 + OC12b verde |

**Prove SumUp sandbox necessarie** (account di test, nessun incasso reale):
1. POST hosted checkout con `valid_until` → accettato? Formato (ISO 8601 UTC), valore minimo/massimo.
2. GET dopo `valid_until` su checkout mai pagato → `EXPIRED` o `PENDING`?
3. Pagamento rifiutato (FAILED), poi scadenza → resta `FAILED` o diventa `EXPIRED`? (rischio A23)
4. Tentativo di pagare sulla pagina hosted dopo `valid_until` → rifiutato da SumUp?
5. Pagamento riuscito entro la scadenza, webhook consegnato dopo → GET dice `PAID` (confirm valido)?
6. DELETE su checkout con `valid_until` (pending, failed) → stato finale.
7. La risposta del GET contiene `valid_until` (serve a E1)?
8. Checkout senza `valid_until` (ordine normale) → comportamento invariato (regressione).

Modello/effort: decisione §2 in sessione principale; passo 1 (soldi) in sessione principale effort high; passo 2 a un subagent Sonnet con brief completo e review in sessione principale.
