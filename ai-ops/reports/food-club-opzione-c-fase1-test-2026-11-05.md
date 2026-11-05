# Food Club V1 — Opzione C, Fase 1: test RED (2026-11-05)

**Verdetto: PASS della fase** (10 test scritti, verificati, RED dove la logica manca). Nessuna logica Opzione C implementata.
Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Nessun commit/push/deploy, nessun accesso remoto.
`api/`, `supabase/migrations/`, codice applicativo: non toccati. `run-rf-local.sh` (non committato) preservato intatto.

## File creati (solo `docs/food-club/implementation/proposed/`)
| File | Contenuto |
|---|---|
| `51_option_c.sql` | OC1–OC9 (blocchi DO, uno per scenario) + contratto proposto in testa |
| `harness/oc-helpers.sql` | helper `fc_test.*` solo locali (manager, buono, ordine online+attempt, abbandono, conteggio eventi) |
| `harness/oc10-concurrency.sh` | OC10: due sessioni Postgres reali in parallelo (C1, C2), rifiuta DB non locale |
| `harness/run-oc-local.sh` | runner isolato (copia di migrations/config, `project_id walbox-fc-oc`, seed spento, check `127.0.0.1:54322`, stop finale). `ASSERTS_OFF=1` = autocontrollo dei test |

## Harness (verificato)
OrbStack Running · Supabase CLI 2.122.0 da cache npx · porte 5432x libere · psql 18 · 74 migration (75 con la patch).
Due run: (1) completa con ASSERT; (2) autocontrollo con `plpgsql.check_asserts = off`. Dopo ogni run: 0 container `walbox-fc-oc`.
Comando: `SUPABASE_BIN=~/.npm/_npx/91eb58246759989d/node_modules/.bin/supabase docs/food-club/implementation/proposed/harness/run-oc-local.sh`

## Matrice
Esito identico su BASE (74) e BASE + patch `20261105104000` (eccetto dove indicato).

| Test | Area | Esito | Dove fallisce (motivo reale) |
|---|---|---|---|
| OC1 | abbandono | **FAIL** | buono `available` dopo l'abbandono con attempt `abandoned_timeout` ancora confermabile; riuso su nuovo ordine accettato |
| OC2 | webhook tardivo + idempotenza | **FAIL** | PAID tardivo: buono non consumato (ordine resta `payment_abandoned`, FIX-1 scatta solo su `paid`) |
| OC3 | riconciliazione FAILED/EXPIRED/CANCELLED | **FAIL** | `sumup_failed` (ritentabile): buono già liberato all'abbandono |
| OC4 | annullamento semplice/verificato | **FAIL** | `kitchen_order_cancel` con attempt `initiated` vivo libera il buono |
| OC5 | doppio checkout | **FAIL** | annullo verificato lascia `failed/sumup_failed` confermabile ma libera il buono (precondizioni: nessun 2° checkout ✔) |
| OC6 | rimborso | **FAIL** | rimborso del pagamento tardivo: buono non era mai stato consumato |
| OC7 | 30 minuti → avviso staff | **FAIL** | buono liberato subito; `food_club_staff_vouchers_on_hold` non esiste |
| OC8 | sblocco manuale admin | **FAIL** | buono non riservato; `food_club_admin_release_voucher` non esiste |
| OC9 | conferma staff (passaggio al banco) | **PASS** | comportamento già corretto: guardia di non regressione |
| OC10-C1 | concorrenza webhook vs sblocco manager | **FAIL** | finale `available`, 0 used (atteso used×1) |
| OC10-C2 | concorrenza webhook vs riuso buono | **FAIL** | il nuovo ordine si prende il buono: 2 ordini sullo stesso buono (doppio sconto) |

Totale: 10 test (OC10 con 2 casi) → 9 FAIL, 1 PASS, 0 BLOCKED.
Autocontrollo (ASSERT spenti): OC2–OC6, OC9 girano fino in fondo senza errori; OC1 si ferma sul riuso accettato (bug reale),
OC7/OC8 solo su «function does not exist» (funzioni del contratto). Nessun errore di setup, guardie o vincoli → i FAIL non sono artificiali.
Nota: nella run 1 la riga BASE/OC1 è stata tagliata dall'output; il FAIL BASE/OC1 è confermato dalla run 2.

## Contratto fissato dai test (proposta per la Fase 2)
- Attempt confermabile = `initiated` | `pending` | `failed/sumup_failed` | `failed/abandoned_timeout` (stessa lista di `kitchen_payment_confirm`).
- `food_club_order_payment_state(order_id)` → `paid` | `open` | `closed`.
- Ordine `cancelled`/`payment_abandoned` con stato `open` → buono resta `reserved`, evento `held_payment_open`.
- Charge `succeeded` su ordine chiuso con buono riservato → `used` su quell'ordine, una sola volta (D6), nessun timbro.
- Attempt che diventa definitivo + nessun altro confermabile → `available` con scadenza originale, o `expired`.
- `food_club_staff_vouchers_on_hold(venue, p_min_minutes = 30)` (staff): buoni riservati su ordini chiusi creati da > 30 min.
- `food_club_admin_release_voucher(order_id, reason)`: `manager_only`; `payment_still_confirmable` se stato `open`; idempotente.

## Proposta modifiche Fase 2 (ogni riga = gate separato di Eros)
| # | Area protetta | Modifica |
|---|---|---|
| 1 | nuovo file in `proposed/` (consentito) → poi `supabase/migrations/` | migration Opzione C: funzione stato, trigger rilascio condizionato, trigger su `kitchen_payments` (consumo su `succeeded` con ordine chiuso; rilascio quando l'ultimo attempt diventa definitivo), RPC staff `on_hold` e RPC admin release con lock `FOR UPDATE` su buono e ordine (necessario per OC10) |
| 2 | `api/_lib/sumupReconcileSweep.js` (+ test) | includere gli attempt `abandoned_timeout` di ordini chiusi: PAID → confirm; EXPIRED/CANCELLED → `kitchen_payment_fail` definitivo; FAILED/PENDING → resta aperto |
| 3 | UI cliente/staff (Fase 3) | testo D5; lista staff «buoni in verifica» con sblocco manager |

## NEEDS_DECISION (emerse dai test)
- **N1 importo diverso**: PAID tardivo con importo ≠ totale → consumare il buono (D6) o tenerlo riservato con anomalia? Non testato.
- **N2 inizio dei 30 minuti**: proposto dalla creazione dell'ordine; alternativa dalla chiusura (abbandono/annullo).
- **N3 sweep notturna**: oggi riverifica solo `sumup_failed`; per D3 serve anche `abandoned_timeout` (riga 2).

## Prossimo passo
Approvazione di Eros per la riga 1 (scrivere la migration Opzione C in `proposed/` e farla passare OC1–OC10 in locale).
