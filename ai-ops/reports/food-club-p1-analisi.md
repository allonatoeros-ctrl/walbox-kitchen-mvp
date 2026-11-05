# Food Club V1 — Passo 2: analisi P1 (doppio uso del buono)

Data: 2026-11-05 · Worktree: `walbox-food-club-v1` · branch locale `food-club-v1-p1` @ `a58c7ef` (= `origin/feat/food-club-v1`)
Solo lettura: nessuna patch integrata, nessun servizio avviato, nessuna modifica a migration, nessun commit.

## 1. Guard (`.claude/hooks/walbox-guard.py`)
- R1 hook git non aggirabili · R2 niente `git add -A`/`.` · R3 **ask** su `api/`, `supabase/migrations/`, `supabase/functions/`,
  package*, vite.config, vercel.json, App.jsx, kitchenMockData · R4 hook/settings non modificabili · R5 Supabase MCP mutanti
  negati · R6 `execute_sql` solo SELECT · R7 Vercel mutanti negati · R9 segreti negati.
- `git worktree add` non è coperto da nessuna regola: consentito.
- **Limite rilevato (verificato leggendo il codice):** le regole di percorso usano `CLAUDE_PROJECT_DIR`, cioè il worktree
  originale. Nel nuovo worktree (`../walbox-food-club-v1`) i file `supabase/migrations/` ecc. **non** sono protetti dal guard
  (`rel_to_root` = None). Restano protetti solo dalle regole di CLAUDE.md: disciplina manuale.

## 2. La vulnerabilità (verificata leggendo le migration)
Catena senza patch:
1. `food_club_create_order` riserva il buono e scrive `total = total - sconto` (evento `reserved_on_order`).
2. Abbandono (5 min) o annullo → trigger `kitchen_orders_food_club_on_closed_unpaid` rilascia il buono (`available`),
   ma `total` resta scontato e la guardia importi non vale più (buono non più riservato).
3. SumUp conferma in ritardo → `payment_confirmed_after_abandon`; lo staff porta l'ordine a `paid`.
4. `kitchen_orders_food_club_on_paid` cerca solo buoni `reserved` su quell'ordine → non trova nulla → il charge combacia
   col totale scontato → **timbro assegnato e buono di nuovo disponibile**. Il cliente può provocarlo apposta.

## 3. Come funziona la patch (`proposed/20261105104000_food_club_v1_review_fixes.sql`)
- Nuova `food_club_settle_paid_order(order, stage)`, idempotente, chiamata dal trigger `on_paid` (ora un guscio) e da un
  nuovo trigger su `kitchen_payments` (charge `succeeded` su ordine già `paid` = FIX-2).
- Ramo FIX-1: ordine pagato, `discount_amount > 0`, nessun buono `used` su di esso → cerca il buono con evento
  `reserved_on_order` per quell'ordine:
  - `available` → available→reserved→used su questo ordine (rispetta il guard delle transizioni), evento `reclaimed_on_late_payment`;
  - `expired` → nulla (sconto goduto una volta sola);
  - altro (reserved/used altrove, revoked) → log `food_club_voucher_double_spend` con `needs_manual_reconciliation`.
- `food_club_award_order_stamp`: "ordine con buono" include anche il buono rilasciato (via eventi) → niente timbro se D-3 spento.
- In più FIX-3 (rimborso revoca premio invito), FIX-4 (FK RESTRICT), FIX-5 (quota food combo), REVOKE sulle funzioni.

Giudizio: la logica è corretta per il caso RF1 e il codice rispetta transizioni, indici unici e permessi.

## 4. Rischi residui (dedotti, NON verificati con test)
| # | Rischio | Gravità |
|---|---|---|
| R-a | **RF1b è rilevato, non impedito**: se il cliente spende il buono su un secondo ordine prima del pagamento tardivo, ottiene due sconti; resta solo l'anomalia per lo staff. Prevenirlo richiede di non rilasciare il buono mentre un checkout SumUp è ancora aperto → decisione di prodotto. | P2 (5 € per caso, richiede intenzione) — NEEDS_DECISION |
| R-b | Falso positivo `double_spend` in gara: se `on_paid` e `on_charge` girano in parallelo sullo stesso ordine, il secondo può leggere il buono già `used` **su questo stesso ordine** e loggare l'anomalia. Fix di 1 riga: saltare se `v_released.used_order_id = v_order.id`. | P3 |
| R-c | Buono `revoked` (es. ordine sorgente rimborsato) etichettato come `double_spend`: etichetta fuorviante per lo staff. | P3 |
| R-d | Ordine reso `paid` prima che il charge sia registrato → log `food_club_paid_without_charge` spurio, poi sanato dal trigger su charge. Comportamento già presente prima della patch. | P3 |
| R-e | Il log usa `available→used` in un solo evento mentre le transizioni reali sono due: ok per l'audit, da sapere. | info |
| R-f | Esito "senza patch falliscono, con patch passano" dichiarato dalla revisione (container cloud), **non ancora ripetuto sul Mac**. | — |

## 5. Copertura dei 6 test RF (`proposed/50_review_fixes.sql`)
| Test | Copre | Manca |
|---|---|---|
| RF1 | abbandono → late confirm → staff `paid` → riconsumo, 0 timbri, evento | variante **annullo** (`cancelled`); D-3 acceso; percorso via trigger su charge |
| RF1b | buono speso altrove → anomalia, 0 timbri | **verifica che il doppio sconto resti** (è il rischio R-a); statuto `revoked` |
| RF2 | `paid` manuale poi charge → usato + timbro, idempotente | — |
| RF3 | rimborso → premio invitante revocato, invito void | premio già usato → log `kept` |
| RF4 | DELETE ordine → `foreign_key_violation` | — |
| RF5 | ribasso combo → quota food segue | rialzo; tetto `LEAST(…, price)` |
Mancano anche: buono `expired` al pagamento tardivo (ramo "nulla"), rimborso di un ordine con buono riconsumato,
gara `on_paid`/`on_charge` (R-b).

## 6. Preflight ambiente (senza avviare nulla)
| Voce | Stato |
|---|---|
| OrbStack | installato (`/Applications/OrbStack.app`, `orb`), context docker `orbstack` |
| Docker daemon | **SPENTO** (socket OrbStack assente) |
| Supabase CLI | **non globale**, non in `node_modules`; in cache npx 2.120.0 / 2.122.0 (la revisione usava 3.0.0) |
| psql | presente (`/opt/homebrew/bin/psql`) · node v26.7.0 |
| `node_modules` nel nuovo worktree | **assente** → `npx --prefix ROOT supabase` e `npx vite` dello script falliranno o scaricheranno |
| `config.toml` | contiene le stringhe che lo script patcha (anonimi, test_otp commentato, twilio, `enable_confirmations`) |

Esito preflight: **BLOCKED** per Passo 3 finché OrbStack non è acceso e `node_modules` non è disponibile nel nuovo worktree.
