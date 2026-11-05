# Food Club V1 — Audit finale pagamenti e rimborsi (2026-11-05)

**Verdetto: PARZIALE.** 5 bypass reali confermati, tutti sul DB. Tutti chiusi dalla SQL proposta e verificati su DB
locale isolato: prima con i test rossi, poi verdi, senza regressioni. Restano due cose fuori dal mio perimetro:
- le modifiche API protette (§8), senza le quali parte della protezione dell'Opzione C non entra in funzione;
- il file storico `tests/db/food-club/10_rules_payments.sql`, che fallisce ancora su T18. La versione proposta passa.

Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. File nuovi solo in `docs/food-club/implementation/proposed/`
più questo report. Nessuna modifica a `api/`, `supabase/migrations/`, `tests/db/` o all'app. Nessun accesso alla produzione,
nessun commit, push, deploy o pagamento. Stack locale `walbox-fc-oc` fermato a fine run (0 container).
Legenda: **[V]** verificato con test o query sul DB locale · **[D]** dedotto dalla lettura del codice · **[NV]** non verificato.

## 1. Funzioni di rimborso (punto 1)
| RPC | Chi può eseguirla oggi | Guardia interna | Chi la usa davvero |
|---|---|---|---|
| `kitchen_payment_refund(order, reason)` | anon, authenticated | staff del locale | `api/kitchen-sumup-refund.js` con il **JWT dello staff** [D] |
| `kitchen_payment_refund_claim_provider_call` | anon, authenticated, service_role | `auth.role() <> 'service_role'` | API con service_role [D] |
| `kitchen_payment_refund_confirm` | anon, authenticated, service_role | `auth.role() <> 'service_role'` | API con service_role, dopo il 204 di SumUp (o subito per contanti/manuale) [D] |
| `kitchen_payment_refund_fail` | anon, authenticated, service_role | service_role **oppure staff**, motivo libero | API con service_role; l'app non la chiama mai col JWT [D grep `src/`] |
| UPDATE diretto `kitchen_orders.payment_status` | staff (policy `staff_update_venue_orders`) | nessuna sul valore | l'app scrive solo `status`, `ready_at`, `staff_note` [D `useKitchenOrders.js`] |

## 2. Lo staff può falsificare l'esito di un rimborso? (punto 2) — SÌ, in 3 modi [V]
| Id | Azione dello staff | Effetto osservato sul DB attuale (test RED) |
|---|---|---|
| **RA1** dichiarare **fallito** un rimborso già eseguito | `refund_fail` con JWT staff dopo il claim del server, cioè dopo il 204 di SumUp o in uno stato `unknown` | rimborso `failed`; poi la conferma del server viene **rifiutata** (`invalid_refund_status`); ordine resta `paid`, **timbro resta**, buono resta usato; il rimborso **sparisce dalla vista drift** (0 righe). Soldi restituiti al cliente, ledger e Food Club dicono «incassato». |
| **RA2** chiudere un rimborso aperto | `refund_fail` su un rimborso `initiated` | rimborso `failed`. Danno basso (SumUp non è stato chiamato), ma il privilegio non serve a nessuno. |
| **RA3** dichiarare **completato** un rimborso mai fatto | `UPDATE kitchen_orders SET payment_status='refunded'` | ordine `refunded` senza alcuna riga di rimborso; il trigger Food Club **riaccredita il buono** (`available`, con `refund_recredits_voucher`) e revoca il timbro; poi `kitchen_order_cancel` passa e l'ordine pagato diventa `cancelled`. Il charge resta `succeeded`: contabilità incoerente (rilevabile solo a posteriori come `refunded_without_verifiable_refund`). |
| **RA4** **annullare** un rimborso vero | `UPDATE … SET payment_status='paid'` su un ordine rimborsato | ordine di nuovo `paid` con il rimborso `succeeded` nel ledger; il timbro revocato non torna (0). Stato contabile incoerente. |

«Annullato» per i rimborsi non esiste come stato: l'unico modo per annullare un rimborso è RA4 (sopra).
La conferma di un rimborso è **solo service_role** [V RA5]: lo staff non può segnare `succeeded` un rimborso SumUp.
Fa eccezione il rimborso di un pagamento al banco (`cash`/`manual`), che l'API conferma subito su richiesta dello staff.
Questo è voluto (i soldi li restituisce lo staff a mano), quindi non è un bypass tecnico: vedi D-RA2.

## 3. Test negativi (punti 3, 10) — `proposed/52_refund_audit.sql`, `proposed/53_T18_update.sql`
Ruoli Postgres reali (`SET LOCAL ROLE` + claim JWT), ogni blocco in BEGIN/ROLLBACK. Runner: `proposed/harness/run-ra-local.sh`.
RED = 74 migration + patch proposte 104000 e 105000 (76). GREEN = RED + la nuova `20261105106000` (77). Entrambe con reset pulito.

| Test | RED (oggi) | GREEN (con correzione) |
|---|---|---|
| RA1 staff/manager dichiarano fallito un rimborso reclamato | **FAIL** (bypass riprodotto) | PASS |
| RA2 staff chiude un rimborso aperto | **FAIL** | PASS |
| RA3 finto rimborso con UPDATE diretto | **FAIL** | PASS |
| RA4 rimborso annullato a mano + totale modificato; UPDATE operativi (stato, nota) ancora permessi | **FAIL** | PASS |
| RA5 conferma/claim solo server; cliente e anon esclusi; **claim `service_role` falsificato con ruolo `authenticated`** | **FAIL** (con claim falso `refund_confirm` passa: decide solo la guardia sul claim) | PASS (blocca il GRANT) |
| RA6 controllo: flussi legittimi (contanti, SumUp, nuovo rimborso dopo rifiuto 4xx) | PASS | PASS |
| T18 proposto / T18b | PASS / PASS | PASS / PASS |

Regressioni in GREEN [V]:
| Suite | Esito |
|---|---|
| OC1–OC9, OC11, OC11b, OC12, OC12b, OC13–OC16 | 17/17 PASS |
| OC10-C1, OC10-C2 (concorrenza) | 2/2 PASS |
| RF1, RF1b, RF2–RF5 | 6/6 PASS |
| `tests/db/food-club` 20, 30, 40 | OK |
| `10_rules_payments.sql` | **FAIL su T18**, come prima: è il file storico, fuori da `proposed/` |

Log: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/ff08e8b9-955d-437a-b194-2a0c51ab4d55/scratchpad/ra2.log`.

## 4. GRANT EXECUTE delle funzioni di pagamento (punti 4, 5) [V catalogo]
| Funzione | anon oggi | auth oggi | Serve al checkout pubblico? | Proposta |
|---|---|---|---|---|
| `kitchen_payment_attempt_start` | no | sì | **sì** (cliente con sessione anonima = ruolo `authenticated`) | invariata |
| `kitchen_order_cancel`, `…cancel_with_payment_attempt`, `…attempt_close_unpaid`, `record_counter`, `record_cash`, `kitchen_payment_refund` | **sì** | sì | no, solo staff (guardia interna) | togli anon |
| `kitchen_payment_fail` | **sì** | sì | no, solo server (staff rifiutato dall'Opzione C) | togli anon; authenticated resta solo perché OC14 verifica il messaggio |
| `kitchen_payment_refund_fail` | **sì** | **sì** | no | solo service_role |
| `attempt_claim_checkout`, `attempt_set_provider_ref`, `refund_claim_provider_call`, `refund_confirm`, `webhook_ingest` | **sì** | **sì** | no, solo server | solo service_role |
| `confirm`, `attest_closed`, `switch_to_counter_system`, `mark_payment_abandoned`, `log_online_abandon_stuck`, `record_closure_provenance` | no | no | no | invariate |
| `kitchen_payment_report_problem` | no | sì | no, staff | invariata |

Dal client l'app chiama solo `kitchen_customer_create_order`, `kitchen_payment_attempt_start`, `kitchen_payment_record_counter` (staff)
e le RPC Food Club/promo [D grep `src/`]. Il checkout anonimo usa il ruolo `authenticated` (anon non esegue già oggi
`attempt_start`), quindi togliere anon dalle RPC di pagamento non lo tocca. Pagamento al banco e ordini normali restano
uguali [V: RA6, OC9, RF2, scenari SQL].
Debolezza trovata: 5 funzioni solo-server usano `auth.role() <> 'service_role'`. Con claim vuoti il confronto dà NULL e la
guardia non scatta. Via PostgREST i claim non sono mai vuoti (non sfruttabile da client) [D]; il GRANT proposto chiude il caso.
La copia di `kitchen_payment_confirm` nell'Opzione C ha la stessa forma: conviene `IS DISTINCT FROM` quando si fonde la SQL.

## 5. Attestazioni server SumUp (punto 7)
- **JWT staff**: `attest_closed` è eseguibile solo da service_role, con doppio controllo (GRANT + ruolo) [V OC14/OC15/OC16]. Una chiusura fatta dallo staff
  scrive la provenienza come «non verificata», e solo il server la può attestare [V].
- **Parametri del client**: `attest_closed` accetta solo `EXPIRED`/`CANCELLED`, e solo su attempt non più confermabili [V OC16].
  Nessuna API passa al DB uno stato SumUp preso dal body: webhook, reconcile e switch-to-counter rileggono il checkout con GET
  e confrontano id e `checkout_reference` [D].
- **SECURITY DEFINER esposte**: dentro una DEFINER `auth.role()` resta il ruolo del JWT. Una RPC dello staff che chiude un attempt
  produce quindi una chiusura non verificata, non un'attestazione [V OC14]. Nessuna DEFINER eseguibile dai client chiama
  `attest_closed` [D]. Nessuna migration cambia i claim JWT: l'unico `set_config` (watchdog) non tocca `request.jwt.*` [V grep].
- **Punto debole residuo (non un bypass)**: la ri-chiusura con service_role vale come attestazione (`SERVER_RECHECK`) **con
  qualsiasi motivo**. È corretta finché i chiamanti service_role sono solo le API che hanno fatto GET su SumUp. Se domani
  un'API chiamasse `kitchen_payment_fail` con service_role senza GET, il buono verrebbe liberato senza prova [D].
  Oggi l'unico caso senza GET è `create-checkout` (`order_already_paid_race`), che riguarda un ordine già pagato: innocuo.

## 6. Test storico T18 (punto 8)
T18 afferma «staff annulla → buono liberato subito», cioè proprio il bypass OC12b. Proposta minima in `proposed/53_T18_update.sql`:
- **T18**: cambia solo la prima asserzione (`reserved` invece di `available`) e ne aggiunge una (buono non riutilizzabile dopo
  l'incasso tardivo; esito osservato `used`). Le tre asserzioni originali sul pagamento tardivo restano **identiche**.
- **T18b** (nuovo): recupera la copertura «buono già rilasciato all'annullo» passando dal percorso legittimo, cioè l'annullo
  dello staff seguito dall'attestazione del server `CANCELLED`. Poi pagamento tardivo con le stesse 3 asserzioni originali.
Da copiare in `tests/db/food-club/10_rules_payments.sql` solo con la tua autorizzazione (area fuori da `proposed/`).

## 7. SQL proposta (punto 9) — `proposed/20261105106000_payments_refund_least_privilege.sql`
1. `kitchen_payment_refund_fail`: tolto il ramo staff (`staff_cannot_fail_refund`). Il resto è identico all'originale e nel log
   l'autore risulta sempre `system`.
2. Trigger `kitchen_orders_guard_payment_fields` (BEFORE UPDATE, SECURITY INVOKER): se chi esegue l'UPDATE è `anon`/`authenticated`,
   rifiuta i passaggi **da o verso `refunded`** e le modifiche a `total`/`discount_amount` (`payment_fields_rpc_only`).
   Le RPC SECURITY DEFINER passano, perché girano come proprietario della funzione.
3. GRANT: anon fuori da tutte le RPC di pagamento; RPC solo-server fuori anche da authenticated; GRANT esplicito a service_role.

## 8. Modifiche API protette necessarie (elenco preciso)
| # | File | Modifica | Perché |
|---|---|---|---|
| A1 | `api/kitchen-cancel-with-payment-check.js`, `api/kitchen-staff-sumup-close-for-counter.js` | dopo `deactivateAndVerify` con esito EXPIRED/CANCELLED chiamare `kitchen_payment_attest_closed(attempt, status, checkout)` con service_role | senza, ogni annullo legittimo trattiene il buono (già nel report OC12b) |
| A2 | `api/kitchen-sumup-webhook.js` (filtro stato) + `api/_lib/sumupPaymentResolution.js` (uscita anticipata) | far passare gli attempt SumUp `cancelled` **solo verso il ramo PAID** (`kitchen_payment_confirm`) | oggi un PAID arrivato dopo un annullo dello staff viene **ignorato** dal webhook. L'Opzione C lo registrerebbe, ma la chiamata non arriva mai [D] |
| A3 | `api/_lib/sumupReconcileSweep.js` | ricontrollare anche gli attempt con chiusura non attestata (lettura service_role di `kitchen_payment_closure_attestations` con `attested_at IS NULL`): PAID→`confirm`, EXPIRED/CANCELLED→`attest_closed`, FAILED→nulla (A23) | oggi lo sweep legge solo `initiated`/`pending`/`sumup_failed`: le chiusure non verificate restano trattenute per sempre se nessuno le ricontrolla [D] |
| A4 | nessuna in `api/kitchen-sumup-refund.js` | — | usa già service_role per `refund_fail`, `refund_confirm` e il claim; con JWT staff chiama solo `kitchen_payment_refund`, che resta permessa [D] |
| A5 | nessuna chiamata API usa con JWT le funzioni a cui tolgo authenticated | — | verificato con grep di `.rpc(` in `api/` [D] |
Ordine di rilascio: SQL e A1–A3 insieme. La sola SQL è fail safe: blocca solo chiusure e rimborsi fatti dallo staff a mano.

## 9. Rischi residui
- **D-RA1 (NEEDS_DECISION)**: con la correzione minima lo staff può ancora fare UPDATE diretto di `payment_status` a `paid` o a
  NULL. È osservato [V EVID RA4]: `paid→NULL` seguito da annullo porta a un ordine `cancelled` con charge `succeeded`.
  Bloccare tutti i campi di pagamento è coerente col principio, ma cambia la premessa di RF1, RF2 e OC13, che oggi provano
  proprio lo «staff segna pagato a mano». Con il blocco totale quei 3 test falliscono (`payment_fields_rpc_only`) [V prima run].
  L'app non usa questo percorso [D].
- **D-RA2 (NEEDS_DECISION)**: il rimborso di un pagamento al banco (`cash`/`manual`) è dichiarato dallo staff e confermato
  subito dall'API. Revoca il timbro e, se la campagna lo prevede, riaccredita il buono. Resta tracciato nel log con l'autore.
  Si può limitarlo ai manager.
- Rimborso SumUp con esito `unknown` (rete o 5xx): resta `initiated` e compare nella vista drift; serve riconciliazione manuale.
  Dopo la correzione lo staff non può più «chiuderlo» a mano: si chiude solo dal server.
- T18b mostra che un PAID dopo un `CANCELLED` attestato lascia il buono `available` (doppio vantaggio). Secondo la semantica
  SumUp il caso non dovrebbe esistere [NV in sandbox]; resta alla riconciliazione.
- Doppio incasso banco + SumUp: invariato (log `payment_confirm_lost_race`, rimborso manuale).
- Le copie complete di funzioni nelle SQL proposte (`refund_fail` qui; `fail` e `confirm` nell'Opzione C) vanno riallineate se
  le migration originali cambiano prima del merge.

## 10. File
| File | Stato |
|---|---|
| `proposed/20261105106000_payments_refund_least_privilege.sql` | nuovo |
| `proposed/52_refund_audit.sql` | nuovo (RA1–RA6) |
| `proposed/53_T18_update.sql` | nuovo (T18, T18b) |
| `proposed/harness/run-ra-local.sh` | nuovo (RED/GREEN + regressioni, stack isolato) |
| `ai-ops/reports/food-club-audit-pagamenti-rimborsi-2026-11-05.md` | questo report |

Comando: `SUPABASE_BIN=~/.npm/_npx/91eb58246759989d/node_modules/.bin/supabase docs/food-club/implementation/proposed/harness/run-ra-local.sh <scratchpad>/work`

Modello/effort: modifiche API A1–A3 in sessione principale, effort high (soldi); merge SQL + T18 dopo la tua approvazione.
