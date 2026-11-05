# Food Club V1 — Opzione C: correzione N1, verifica N5/N6 (2026-11-05)

**Verdetto: N1 PASS (riprodotto RED → corretto → GREEN su DB locale). N5 e N6: analisi completa, nessun codice protetto toccato.**
Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Modificati solo 2 file in `docs/food-club/implementation/proposed/`
(non tracciati). Nessuna modifica a `api/`, `supabase/migrations/` o all'app. Nessun commit, push, deploy, produzione o pagamento.
Copia dei file prima delle modifiche: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/a1bef9a4-56fe-4823-9d34-4114d41f3493/scratchpad/backup/`.
Legenda: **[V]** verificato (codice o test eseguito) · **[D]** dedotto · **[NV]** non verificato.

## 1. Difetto N1: percorso reale
- Unico scrittore del motivo `sumup_amount_mismatch`: `api/_lib/sumupPaymentResolution.js:54` [V, grep su api/src/migrations].
  SumUp risponde PAID ma `checkout.amount ≠ attempt.amount` → `kitchen_payment_fail(attempt, 'sumup_amount_mismatch', checkout)`.
  L'attempt diventa `failed`, il payload (`raw_last_event`) conserva `status: PAID` e l'importo SumUp. **I soldi sono incassati.**
- Arriva da: webhook, reconcile cliente/staff, sweep notturno, sweep dei 5 minuti (`resolvePaid`).
- Secondo passo reale (ordine ancora in attesa): al giro dopo lo sweep dei 5 minuti non trova attempt «vivi» e chiama
  `kitchen_order_mark_payment_abandoned` → ordine abbandonato [V test].
- SQL Fase 2: quell'attempt non era né «confermabile» né «riuscito» → stato `closed` → **buono restituito** [V RED].
- Per riprodurlo **non serve toccare `api/`**: il test chiama la stessa RPC con gli stessi argomenti dell'API (service_role).
  La parte JavaScript (rilevazione del mismatch) è già coperta dagli unit test esistenti di `sumupPaymentResolution`.

## 2. Correzione (solo `proposed/20261105105000_food_club_v1_option_c.sql`)
1. Nuova `food_club_attempt_captured_mismatch(p)`: `charge` + `failed` + `sumup` + motivo `sumup_amount_mismatch`.
   Basta il motivo (unico scrittore = ramo PAID): se mai fosse ambiguo, l'esito è **blocco**, non rilascio.
2. `food_club_order_payment_state`: nuovo stato `mismatch`, con priorità `paid` > `mismatch` > `open` > `closed`.
3. `food_club_settle_unpaid_order`: se c'è un attempt mismatch, il buono **resta riservato** su ordine aperto o chiuso,
   un solo evento `held_amount_mismatch` + un solo log `food_club_voucher_amount_mismatch` (`needs_manual_reconciliation`),
   con importo attempt, importo SumUp e stato SumUp. Mai `used`, mai `available`, mai timbro.
4. `food_club_staff_vouchers_on_hold`: lo segnala **subito** come `amount_mismatch`.
5. `food_club_admin_release_voucher`: con `mismatch` rifiuta (`payment_succeeded_needs_reconciliation`, codice già esistente).
6. Permessi: la nuova funzione non è eseguibile da anon/authenticated (REVOKE) — [NV a runtime: verificato solo nel testo].

Distinzione chiesta al punto 6:
| Stato attempt | Significato | Buono |
|---|---|---|
| `succeeded`, importo giusto | incassato e registrato | consumato (ordine chiuso) / regolato dal pagamento |
| `succeeded`, importo ≠ totale | incassato, anomalo (difesa in profondità) | bloccato |
| `failed/sumup_amount_mismatch` | **incassato su SumUp, non registrato** | bloccato |
| `initiated`, `pending`, `failed/sumup_failed`, `failed/abandoned_timeout` | ancora pagabile | bloccato (avviso a 30 min) |
| `failed/sumup_expired`, `sumup_cancelled`, altri definitivi | sicuramente non pagato | restituito |

## 3. Test (`51_option_c.sql`)
- **OC11 riscritto** sul percorso reale: a1 ordine già abbandonato + webhook mismatch consegnato 2 volte; a2 ordine in attesa,
  mismatch, poi abbandono dello sweep. Asserzioni: evidenza `failed/sumup_amount_mismatch/PAID`; ordine in attesa non diventa
  pagato; entrambi i buoni `reserved` anche dopo l'abbandono; un solo evento anomalia per buono; log staff; zero eventi
  `available`/`used`; zero timbri; entrambi in lista staff come `amount_mismatch`; sblocco manager rifiutato per entrambi.
  Tutte le asserzioni originali sono rimaste o sono state rafforzate (a2 ora anche dopo l'abbandono).
- **OC11b** = il vecchio OC11 (charge `succeeded` con importo diverso), conservato come difesa in profondità.

### Matrice (stack locale isolato `walbox-fc-oc`, 74 migration + patch P1 + Opzione C = 76; 0 container a fine run)
| Test | RED (SQL Fase 2) | GREEN (SQL corretta) |
|---|---|---|
| OC1–OC9 | PASS | PASS |
| **OC11 percorso reale** | **FAIL** «OC11 abbandonato: buono resta riservato» | **PASS** |
| OC11b | PASS | PASS |
| OC10-C1 webhook ↔ sblocco manager (2 sessioni reali) | PASS | PASS |
| OC10-C2 webhook ↔ riuso buono (2 sessioni reali) | PASS | PASS |
| Scenari SQL 10/20/30/40 | OK 4/4 | OK 4/4 |
| RF2–RF5 | PASS | PASS |
| RF1, RF1b | FAIL attesi | FAIL attesi (non modificati: vanno riscritti per l'Opzione C, vedi report Fase 3A §8) |

Comando: `ONLY_OPTION_C=1 SUPABASE_BIN=…/supabase docs/food-club/implementation/proposed/harness/run-oc-local.sh <scratchpad>/{red,green}`.
Log: `…/scratchpad/red.log`, `…/scratchpad/green.log`.

## 4. N5: scadenza di 15 minuti solo per i checkout Food Club
**Si può fare senza cambiare gli ordini normali** [V codice, D comportamento]:
- `api/kitchen-sumup-create-checkout.js` legge già l'ordine con service_role (r.59–60) e costruisce il corpo della POST (r.193–201).
  Basta una lettura in più: `food_club_vouchers` con `reserved_order_id = order_id` e `status = 'reserved'` (il buono si riserva
  alla creazione dell'ordine [D]). Solo se esiste si aggiunge `valid_until = adesso + 15 min`. Senza buono il corpo della POST
  resta **identico byte per byte** → nessun cambiamento per gli ordini normali (da blindare con un test sul corpo).
- Se la lettura del buono fallisce: non creare il checkout (errore 5xx, il cliente riprova). Mai creare un checkout Food Club
  senza scadenza, altrimenti il buono resta bloccato per sempre.
- **Interazioni:**
  - Pagamento normale: entro 5 minuti lo sweep chiude comunque l'ordine; 15 > 5 → nessun conflitto.
  - Riuso del checkout (PENDING/FAILED, r.372–386): dopo la scadenza il GET dovrebbe dire EXPIRED → `attempt_no_longer_valid`
    → nuovo attempt con nuova scadenza. Se SumUp lasciasse FAILED dopo la scadenza [NV], il cliente vedrebbe una pagina SumUp
    non più pagabile: nessun rischio di soldi, l'ordine è già abbandonato dopo 5 min.
  - Webhook tardivo: un PAID avvenuto **prima** della scadenza ma consegnato dopo resta valido → confirm → buono consumato.
    Dopo la scadenza SumUp non può più incassare (doc) → nessun PAID nuovo.
  - Sweep «buoni in attesa» (E1): FAILED + `valid_until` letto **dalla risposta SumUp** passato da almeno 2 min → definitivo
    → buono restituito. `valid_until` assente (ordini normali o vecchi) → nessuna chiusura automatica.
- **Da provare in sandbox** [NV]: SumUp accetta `valid_until` col checkout hosted; stato restituito dopo la scadenza
  (EXPIRED o FAILED); comportamento del DELETE su un checkout con scadenza.
- File protetto da toccare: solo `api/kitchen-sumup-create-checkout.js` (+ test in `tests/unit/sumup-payment-reliability.test.mjs`
  e `kitchen-amount-integrity.test.mjs` se confrontano il corpo della POST).

## 5. N6: manager e amministratore (solo codice locale)
| Cosa | Dove | Chi |
|---|---|---|
| `kitchen_staff_members.role` ∈ {`staff`, `manager`}, per locale | baseline r.17–24 | [V] |
| Scrittura della tabella | RLS attiva, una sola policy: SELECT della propria riga. Nessuna policy INSERT/UPDATE → nessuno si promuove dall'app; solo service_role/SQL | [V] |
| `is_staff_for_venue` (pagamenti, rimborsi, annulli, reconcile) | qualunque ruolo | [V] |
| `food_club_require_staff(venue, true)` = `role = 'manager'` | campagna on/off, sblocco buono | [V] |
| «admin» FantaWalrus (`app_metadata.fanta_role = 'admin'`) | altro track, nessun legame con Kitchen | [V] |
| Assegnazione dei manager | nessun seed/script nel repo: si fa a mano nel DB | [V] |

**Conclusione:** nel codice «amministratore autorizzato» = riga `manager` per quel locale; non esiste un ruolo superiore.
Chi lo sia in produzione **non è verificabile** senza leggere la produzione (vietato qui).
**Controllo proposto (nessun privilegio nuovo):**
1. Tenere `food_club_require_staff(venue, true)` come unica guardia; non usare `fanta_role`, non aggiungere ruoli.
2. Sblocco solo se il DB dice `closed` (nessun attempt pagabile, nessun incasso, nessun mismatch): già così, ora anche per N1.
3. Nessuna RPC che chiuda un attempt «a mano» (N4): l'attempt diventa definitivo solo da un esito SumUp verificato (E1/E3).
4. Motivo obbligatorio + `staff_id` + log (già presenti).
5. Eros controlla una volta l'elenco dei manager in produzione (lettura sua, oppure mia in sola lettura con autorizzazione).

## 6. Prossimi interventi protetti (ognuno con autorizzazione a parte)
| # | Intervento | Area |
|---|---|---|
| 1 | Riscrivere RF1/RF1b per l'Opzione C (Fase 3A §8) | test `proposed/` |
| 2 | `api/_lib/foodClubHoldSweep.js` + unit test (E1), regola FAILED + `valid_until` | `api/` |
| 3 | `valid_until` 15 min solo per ordini con buono in `kitchen-sumup-create-checkout.js` + test sul corpo POST | `api/` soldi |
| 4 | Collegare E1 (fase nell'endpoint dello sweep + migration pg_cron ogni 5 min) | `api/` + migration |
| 5 | E3 «verifica ora» per il manager + UI staff | `api/` + app |
| 6 | Sandbox SumUp (punti [NV] del §4) | pagamenti di prova |
| 7 | Fondere la SQL nelle migration, poi commit / `db push` / deploy | gate |

Modello/effort: passo 1 subagent Sonnet medium; passi 2–3 in sessione principale, effort high (soldi).
