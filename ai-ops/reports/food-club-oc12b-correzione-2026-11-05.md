# Food Club V1 — Correzione vulnerabilità OC12b (2026-11-05)

**Verdetto: PARZIALE.** Lato database la correzione è completa e testata: OC1–OC16, OC10, RF1–RF5 e 3 file di scenari
SQL su 4 sono verdi. Due cose impediscono il PASS pieno:
1. **Serve una modifica al contratto delle API** (§5). Senza, gli annulli legittimi dello staff trattengono il buono
   finché il server non attesta l'esito.
2. `tests/db/food-club/10_rules_payments.sql` (fuori da `proposed/`, non modificabile qui) fallisce su **T18**, che
   verifica la vecchia regola. Gli altri 23 scenari del file passano.

Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Modificati solo file in `docs/food-club/implementation/proposed/`.
Nessuna modifica a `api/`, `supabase/migrations/`, app o produzione. Nessun commit, push, deploy o pagamento.
Backup prima delle modifiche: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/3826a861-b24f-4bb4-aa38-6f5e8bb6cd1b/scratchpad/backup2/proposed/`.
Legenda: **[V]** verificato con test o query · **[D]** dedotto dal codice · **[NV]** non verificato.

## 1. Causa
Mappa sul DB locale di tutte le funzioni eseguibili da `authenticated` che scrivono `kitchen_payments` o `kitchen_orders` [V].
Tre percorsi raggiungibili dallo staff rendono **non confermabile** un attempt SumUp basandosi solo sul suo JWT:

| RPC (migration esistente) | Effetto | Chi la usa davvero |
|---|---|---|
| `kitchen_payment_fail` | staff su `initiated`/`pending`: `failed` con **qualsiasi motivo** scelto dal chiamante | solo `api/` con service_role [V grep]; ramo staff mai usato dall'app |
| `kitchen_order_cancel_with_payment_attempt` | attempt → `cancelled`, ordine → `cancelled` | `api/kitchen-cancel-with-payment-check.js:236` **con il JWT dello staff**, dopo DELETE+GET su SumUp |
| `kitchen_payment_attempt_close_unpaid` | attempt → `failed/staff_closed_for_counter` | `api/kitchen-staff-sumup-close-for-counter.js:238` **con il JWT dello staff**, dopo DELETE+GET |

Il DB non distingue «staff tramite l'API che ha controllato SumUp» da «staff che chiama la RPC a mano». Conseguenze:
- Opzione C trattava l'attempt come definitivo → **buono liberato** (D4 aggirata).
- `kitchen_payment_confirm` rifiuta un PAID su quell'attempt (`invalid_attempt_status`) → **incasso reale fuori dal
  ledger**. Questo vale per tutti gli ordini, anche senza buono (problema già presente, non introdotto dal Food Club).

Altri percorsi controllati, nessun problema per i charge [V]:
- Scrittura diretta su `kitchen_payments`: RLS solo SELECT, 0 righe aggiornate.
- `UPDATE kitchen_orders` dello staff: con un attempt aperto il buono resta riservato; `paid` senza charge → resta
  riservato e viene segnalato (RF2).
- `kitchen_payment_record_counter`: bloccato con un pagamento online in corso.
- `set_provider_ref`, `claim_checkout`, `confirm`, `refund_confirm`: solo service_role.

## 2. Correzione proposta (`proposed/20261105105000_food_club_v1_option_c.sql`)
Principio: **l'autorizzazione dipende dal ruolo, mai dalla stringa del motivo**. Solo `service_role` (il server, dopo
il GET su SumUp) può attestare l'esito terminale di un checkout.
1. **Tabella `kitchen_payment_closure_attestations`** (sezione 0): RLS attiva, nessun privilegio per anon/authenticated.
   Il trigger su `kitchen_payments` registra **prima** del regolamento, fuori dal blocco EXCEPTION (se fallisce, la
   chiusura fallisce: fail closed), ogni attempt SumUp che diventa non confermabile per mano di un chiamante non
   service_role (staff, sessione senza claim). Salva chi, ruolo, stato e motivo prima/dopo.
2. **Nuovo stato `unverified`** in `food_club_order_payment_state`, con priorità paid > mismatch > open > unverified > closed.
   - Il buono resta riservato; evento `held_closure_unverified` e log `food_club_voucher_closure_unverified` (una volta).
   - La lista staff lo mostra **subito** come `closure_unverified`.
   - Lo sblocco del manager viene rifiutato con `payment_closure_unverified`.
3. **`kitchen_payment_attest_closed(attempt, provider_status, raw)`**:
   - Chiamabile solo da service_role, con doppio controllo: GRANT + `auth.role()`.
   - Accetta solo `EXPIRED`/`CANCELLED`. FAILED, PAID, PENDING o qualsiasi altro valore vengono rifiutati
     (A23: SumUp lascia FAILED anche dopo il DELETE).
   - Rifiuta gli attempt ancora confermabili; è idempotente.
   - Dopo l'attestazione regola il buono (ordine dei lock attempt → ordine → buono) e scrive il log.
   - Anche una ri-chiusura con service_role (`kitchen_payment_fail` da webhook/reconcile/sweep) vale come attestazione (`SERVER_RECHECK`).
4. **`kitchen_payment_report_problem(attempt, nota)`**: solo staff del locale. Scrive solo un log, con la nota marcata
   `untrusted_note`. Attempt, ordine e buono non cambiano. È il modo per lo staff di segnalare un problema (requisito 4).
5. **`kitchen_payment_fail`** (copia esatta della versione attuale, cambia solo il ramo staff): staff e manager
   ricevono `staff_cannot_fail_payment_use_report`. Il service_role resta invariato.
6. **`kitchen_payment_confirm`** (copia esatta, cambia una sola condizione): accetta anche gli attempt chiusi senza
   attestazione. Un PAID reale dopo un annullo o una chiusura dello staff **entra nel ledger**. Su ordine annullato
   resta `cancelled` con il log `payment_confirmed_after_cancel` (mai `cancelled` + `paid`, logica esistente).
   Dopo un'attestazione EXPIRED/CANCELLED il PAID resta rifiutato come prima.

**Pagamento al banco preservato** (requisito 5) [V]:
- `switch_to_counter_system` (service_role) e poi incasso → buono usato (OC9).
- Chiusura dello staff + incasso al banco → ordine pagato, buono usato, timbro (OC14 g).
- Un PAID SumUp tardivo sullo stesso ordine viene registrato come `payment_confirm_lost_race` con l'id dell'attempt
  perdente: un solo charge succeeded, nessun doppio timbro o consumo.

**Effetto sugli ordini normali** (senza buono): cambiano solo due cose, entrambe in direzione più sicura.
Lo staff non può più chiamare `kitchen_payment_fail` (l'app non lo fa [V]). Un PAID dopo una chiusura dello staff
ora viene registrato invece di essere perso. Annulli e passaggi al banco non cambiano nell'esito dell'ordine.

## 3. Test (`proposed/51_option_c.sql`)
Tutti con ruoli Postgres reali (`fc_test.oc_try`: `SET LOCAL ROLE` + claim JWT).

| Test | Cosa prova |
|---|---|
| OC12b (asserzione **invariata**) | staff `fail(sumup_expired)` su attempt vivo + sweep → buono riservato |
| **OC14** staff/manager | `fail` con 9 motivi (provider, maiuscole, spazio finale, inventato) → sempre rifiutato, attempt intatto; segnalazione = solo log; attest e tabella di provenienza → permission denied (anche per il manager); UPDATE diretto → nessun effetto; annullo diretto senza verifica → buono trattenuto, `unverified`, lista `closure_unverified`, manager rifiutato, riuso rifiutato; PAID dopo → incasso registrato, ordine resta annullato, buono usato una volta, 0 timbri; `close_unpaid` + sweep → trattenuto, PAID registrato; passaggio al banco legittimo + PAID doppio → lost race evidenziato |
| **OC15** cliente (proprietario ed estraneo) e anon | 10 percorsi (fail ×2, cancel, close_unpaid, report, attest, confirm, sblocco, SELECT/INSERT sulla provenienza) → tutti rifiutati; claim `service_role` falsificati con ruolo Postgres `authenticated` → attest negata dal GRANT; attempt, buono e provenienza intatti |
| **OC16** attestazione | rifiutata su attempt vivo; FAILED/PAID/PENDING/minuscolo/inventato/NULL rifiutati; CANCELLED → buono restituito una volta; seconda volta: nulla da fare; PAID dopo l'attestazione rifiutato (come prima); ri-verifica server = attestazione; chiusura senza claim = non verificata, buono trattenuto |
| OC4 (asserzione **cambiata**, motivo sotto) | annullo dello staff → riservato e `unverified`; attestazione server CANCELLED → restituito |

**Asserzione cambiata — OC4.** Prima diceva «annullo verificato dallo staff: buono liberato subito», ma nel test lo
«verificato» era la chiamata diretta dello staff, cioè proprio la vulnerabilità. La nuova asserzione applica la
regola approvata: il buono viene liberato solo dopo l'attestazione del server. Nessuna asserzione è stata indebolita
per ottenere un PASS; OC12b è rimasta identica.

### Matrice (stack isolato `walbox-fc-oc`, 76 migration da reset pulito; 0 container a fine run)
| Suite | Esito |
|---|---|
| OC1–OC9, OC11, OC11b, OC12, **OC12b**, OC13, **OC14, OC15, OC16** | 17/17 PASS |
| OC10-C1, OC10-C2 (concorrenza, 2 sessioni reali) | 2/2 PASS |
| RF1, RF1b, RF2–RF5 | 6/6 PASS |
| Scenari SQL 20/30/40 | OK 3/3 |
| Scenari SQL 10_rules_payments | **FAIL su T18** (vecchia regola). Copia senza T18: T01–T23 tutti PASS. T18 con la sola prima asserzione aggiornata (`reserved`): PASS |

Catalogo [V]:
- `attest_closed`: EXECUTE solo per service_role.
- `report_problem`: authenticated sì, anon no.
- Provenienza: nessun EXECUTE e nessun privilegio sulla tabella per anon/authenticated; RLS attiva.
- Tutte le funzioni nuove: SECURITY DEFINER con `search_path` fissato.

Log: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/3826a861-b24f-4bb4-aa38-6f5e8bb6cd1b/scratchpad/run3.log`.

## 4. Requisiti
| # | Requisito | Stato |
|---|---|---|
| 1 | Analisi di tutti i percorsi | fatta (§1) [V] |
| 2 | Il motivo non autorizza nulla | sì: decide solo il ruolo; il motivo dello staff viene rifiutato o resta un dato [V] |
| 3 | Solo il server attesta | sì lato DB (`attest_closed` / ri-chiusura con service_role) [V]; **l'API deve chiamarla** (§5) |
| 4 | Lo staff segnala senza liberare | `kitchen_payment_report_problem` [V] |
| 5 | Pagamento al banco preservato | OC9, OC14 g [V] |
| 6 | Nessun incasso ignorato | i PAID dopo chiusure dello staff vengono registrati [V]; doppio incasso banco+SumUp evidenziato nel log [V]; limiti in §6 |

## 5. Modifica al contratto delle API: **SÌ, necessaria** per la protezione completa
1. `api/kitchen-cancel-with-payment-check.js` e `api/kitchen-staff-sumup-close-for-counter.js`: dopo `deactivateAndVerify`
   con esito EXPIRED/CANCELLED, chiamare `kitchen_payment_attest_closed` con service_role e lo stato letto da SumUp.
   Senza questo passo ogni annullo legittimo dello staff trattiene il buono (`closure_unverified`) e il manager non
   può sbloccarlo. Per il cliente è una regressione funzionale finché l'API non cambia.
2. Caso A23 (checkout che resta FAILED dopo il DELETE): l'attestazione viene rifiutata di proposito. Si risolve con E1
   (FAILED + `valid_until` passato) e prove in sandbox. Fino ad allora il buono resta trattenuto.
3. Webhook/reconcile: da verificare che `applySumupCheckoutResult` chiami `kitchen_payment_confirm` anche quando
   l'attempt locale è `cancelled` o `failed/staff_closed_for_counter`, senza fermarsi prima [NV].
4. Il deploy della SQL e quello dell'API vanno coordinati: la SQL da sola ferma solo le chiusure dello staff (fail safe).

## 6. Rischi residui
- **Rimborsi**: `kitchen_payment_refund_fail` accetta dallo staff qualsiasi motivo su un rimborso `initiated`/`pending`
  [V codice]. Un rimborso eseguito su SumUp potrebbe restare `failed` nel ledger. Stesso schema di OC12b, ma fuori
  scope (non tocca i buoni): da trattare come task separato.
- **Privilegi da ripulire**: anon ha EXECUTE su `kitchen_payment_fail`, `cancel_with_payment_attempt`, `close_unpaid`,
  `claim_checkout`, `set_provider_ref` e `refund_*`. Le guardie interne rifiutano [V OC15], ma conviene un REVOKE da
  anon per difesa in profondità (migration esistente, area protetta).
- **Doppio incasso banco + SumUp**: il secondo incasso è visibile solo nel log `payment_confirm_lost_race` e l'attempt
  resta `failed`. Va rimborsato a mano (comportamento esistente, F03).
- **service_role** ha privilegi diretti sulla tabella di provenienza (default Supabase): l'API deve usare solo la RPC.
- Le chiusure fatte da console SQL o da job senza JWT vengono trattate come non verificate: il buono viene trattenuto
  (scelta fail safe).
- `auth.role()` si fida del JWT verificato da PostgREST. Claim falsi richiedono il segreto JWT; per l'attestazione
  c'è anche il GRANT [V].
- La SQL proposta contiene copie complete di `kitchen_payment_fail` e `kitchen_payment_confirm` (prese dal DB locale
  a 76 migration). Se quelle migration cambiano prima del merge, le copie vanno riallineate.

## 7. File modificati (solo `proposed/`)
| File | Modifica |
|---|---|
| `20261105105000_food_club_v1_option_c.sql` | sezione 0 (tabella di provenienza), stato `unverified`, settle, trigger, lista staff, sblocco manager, sezione 7 (provenienza, attestazione, segnalazione, `kitchen_payment_fail`, `kitchen_payment_confirm`), permessi |
| `51_option_c.sql` | OC4 aggiornato alla regola nuova; nuovi OC14, OC15, OC16 |
| `50_review_fixes.sql`, `harness/oc-helpers.sql` | invariati rispetto al report precedente |

Modello/effort: modifica API §5 in sessione principale, effort high (soldi); refund_fail e REVOKE da anon come task separati.
