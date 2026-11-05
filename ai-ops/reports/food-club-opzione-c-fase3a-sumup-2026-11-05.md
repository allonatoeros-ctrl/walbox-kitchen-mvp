# Food Club V1 — Opzione C, Fase 3A: progettazione integrazione SumUp (2026-11-05)

**Verdetto: PROGETTO PRONTO, con 1 difetto trovato nella SQL proposta e 2 decisioni aperte.** Solo analisi.
Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Nessuna modifica a `api/`, `supabase/`, codice app.
Nessun commit, push, deploy, pagamento o accesso a produzione. File non tracciati preesistenti intatti.
Legenda: **[V]** verificato nel codice/doc · **[D]** dedotto · **[NV]** non verificato (serve sandbox).

## 1. Cosa c'è oggi (api/)
| Pezzo | Quando gira | Quali attempt guarda | Nota |
|---|---|---|---|
| `kitchen-sumup-webhook.js` | a ogni notifica SumUp | quello col `provider_ref`; lascia passare `failed` | PAID su `abandoned_timeout` → `kitchen_payment_confirm` → buono consumato [V]. **Fetch senza timeout** (regola 5, preesistente) |
| `_lib/onlineAbandonSweep.js` | pg_cron ogni minuto, HTTP solo se c'è un ordine online scaduto (5 min) | attempt vivi dell'ordine | DELETE + GET di verifica, poi `mark_payment_abandoned` → attempt `failed/abandoned_timeout` [V] |
| `_lib/sumupReconcileSweep.js` | cron Vercel 03:00 | `initiated`, `pending`, `failed/sumup_failed` | **non** guarda `abandoned_timeout` [V]. Fetch senza timeout (preesistente) |
| `kitchen-sumup-reconcile.js` / `kitchen-staff-sumup-reconcile.js` | su richiesta cliente / staff | un ordine | auth staff via JWT + `is_staff_for_venue` [V] |
| `_lib/sumupCheckout.js` | condiviso | — | GET verificato con timeout 5 s + controllo `checkout_reference`; FAILED dopo DELETE = «chiuso» (incidente A23) [V] |

`kitchen_payment_fail` (service_role) accetta un attempt già `failed` e ne cambia il motivo: il trigger Opzione C
(`AFTER UPDATE OF failure_reason`) scatta e rilascia il buono se non resta nulla di confermabile [V]. **Non serve
nessuna nuova RPC di pagamento per il rilascio automatico.**

## 2. Stati e scadenze SumUp (documentazione ufficiale)
- Stati checkout online: `PENDING`, `PAID`, `FAILED`, `EXPIRED`. EXPIRED = non più processabile; FAILED = ultimo tentativo fallito, **ritentabile** [V doc].
- `valid_until`: facoltativo; dopo quell'ora il checkout non è più processabile. **Se manca, nessuna scadenza** [V doc].
- **Il nostro `create-checkout` non imposta `valid_until`** [V codice] → un checkout FAILED (anche dopo DELETE, A23) resta in teoria ritentabile per sempre.
- Se dopo `valid_until` il GET riporta davvero `EXPIRED` non è documentato [NV]. Esito del DELETE: l'esempio mostra EXPIRED, nessuna garanzia [NV].

Conseguenza: senza `valid_until` l'unico caso che resta «per sempre in dubbio» è **FAILED senza scadenza**. Con N4
(niente sblocco a vista) quel buono resterebbe bloccato per sempre. Quindi E2 è **prerequisito**, non un extra.

## 3. Difetto trovato nella SQL proposta (Fase 2) — importo anomalo
`applySumupCheckoutResult` con PAID e importo diverso **non conferma**: chiama `kitchen_payment_fail(..., 'sumup_amount_mismatch')` [V].
Per la SQL Opzione C quell'attempt non è confermabile → **il buono viene restituito in automatico**, contro N1
(blocco + riconciliazione). OC11 passa solo perché simula un `kitchen_payment_confirm` con importo diverso, percorso che
l'API non usa mai. **Fix proposto (solo `proposed/`)**: in `food_club_settle_unpaid_order` e in
`food_club_staff_vouchers_on_hold` trattare `failed/sumup/sumup_amount_mismatch` come «held_amount_mismatch»; riscrivere
OC11 sul percorso reale (`kitchen_payment_fail` con `sumup_amount_mismatch`). Lo sblocco admin deve rifiutarlo
(`payment_succeeded_needs_reconciliation`).

## 4. Architettura proposta
**E2 — scadenza sul checkout.** `create-checkout` aggiunge `valid_until = now + N minuti` (N5, consigliato 15: lo sweep
di abbandono chiude già a 5). Vale per **tutti** i pagamenti online, non solo Food Club → passo a sé, sandbox obbligatoria.

**E1 — sweep «buoni in attesa» ogni 5 minuti.** Nuovo `api/_lib/foodClubHoldSweep.js`:
- candidati: buoni `reserved` su ordini `cancelled`/`payment_abandoned` → loro attempt SumUp confermabili
  (`initiated`, `pending`, `failed/sumup_failed`, `failed/abandoned_timeout`); max 20 per giro, budget 25 s.
- per attempt (riusa `getCheckoutVerified` con timeout, `recoverSumupProviderRef`, `applySumupCheckoutResult`):

| Esito SumUp (GET verificato) | Azione | Buono |
|---|---|---|
| PAID, importo giusto | confirm | consumato, niente timbro |
| PAID, importo diverso | fail `sumup_amount_mismatch` | **bloccato** + avviso (dopo fix §3) |
| EXPIRED / CANCELLED | fail `sumup_expired`/`sumup_cancelled` | rilasciato se tutti gli attempt sono definitivi |
| FAILED con `valid_until` passato (+2 min margine orologio) | fail `sumup_expired_after_failed` | rilasciato |
| FAILED senza `valid_until` o non scaduto | fail `sumup_failed` (resta confermabile) | bloccato; avviso staff a 30 min |
| PENDING, timeout, 4xx/5xx, riferimento diverso | nessuna azione | bloccato |
| nessun `provider_ref`: List `not_found` + claim NULL | fail `sumup_never_created` | rilasciato (due prove indipendenti, come I-3) |
| List `not_found` con claim presente / `ambiguous` | nessuna azione, riconciliazione | bloccato |

  La data `valid_until` si legge **dalla risposta SumUp**, mai dal DB o dal client.
- **Trigger**: nuovo job pg_cron `*/5 * * * *` con lo stesso schema del tick esistente: un EXISTS indicizzato, HTTP solo
  se c'è almeno un buono in attesa. Endpoint: riuso di `kitchen-online-abandon-sweep.js` con `{"phase":"food_club_hold"}`
  e stesso secret (niente nuovo secret né nuova rotta, `vercel.json` intatto). Alternativa: rotta dedicata.
- **5 min contro controllo notturno**: il notturno (03:00) lascerebbe il cliente senza buono tutta la sera e il
  cron Vercel del piano attuale è giornaliero [D]; pg_cron è già in uso e gratuito. Carico: un locale, pochi ordini con
  buono → 0 HTTP quasi sempre, al massimo 288 chiamate/giorno all'endpoint e 1–2 GET SumUp per attempt in attesa.
  Limiti di frequenza SumUp non pubblicati [NV]: limite 20 attempt/giro e stop dei controlli automatici dopo 24 h
  (resta l'avviso staff). Il notturno resta come rete di sicurezza, invariato.

**E3 — «Verifica ora» per il manager.** Nuovo `api/kitchen-food-club-verify-hold.js`: JWT staff, controllo
`food_club_require_staff(venue, manager)` col client dell'utente, poi stessa logica di E1 su un solo ordine (service_role).
Unico modo di sbloccare: E3 rende definitivi gli attempt → la RPC `food_club_admin_release_voucher` (che già rifiuta se
qualcosa è confermabile) o il trigger rilasciano. Rispetta N4: nessuno sblocco senza esito SumUp verificato.

## 5. Ruolo manager = amministratore?
- `kitchen_staff_members.role` ∈ {`staff`, `manager`}, per locale [V]. `manager` è usato **solo** dalle funzioni Food Club
  (`food_club_require_staff(..., true)`) [V]; pagamenti, rimborsi e reconcile usano qualunque staff (`is_staff_for_venue`).
- Nessun legame con l'admin FantaWalrus (`app_metadata.fanta_role`) [V]. Il progetto non allarga privilegi.
- **Chi è `manager` in produzione: non verificato** (accesso vietato). Né se uno staff può promuoversi: RLS di
  `kitchen_staff_members` da controllare nel passo 3 [NV].

## 6. File protetti coinvolti
| File | Passo | Tipo |
|---|---|---|
| `api/kitchen-sumup-create-checkout.js` | E2 | modifica (+`valid_until`) — **tocca tutti i pagamenti online** |
| `api/_lib/foodClubHoldSweep.js` + `.test.js` | E1 | **nuovi** |
| `api/kitchen-online-abandon-sweep.js` | E1 | modifica (fase `food_club_hold`) |
| `api/kitchen-food-club-verify-hold.js` | E3 | **nuovo** |
| migration nuova (job pg_cron + funzione tick) | E1 | `supabase/migrations/` |
| `proposed/20261105105000_food_club_v1_option_c.sql`, `51_option_c.sql`, `50_review_fixes.sql` | fix §3, RF | non protetti ma test |
Non toccati: webhook, `sumupPaymentResolution.js`, `sumupReconcileSweep.js`, `sumupCheckout.js`, `vercel.json`.

## 7. Test previsti
**Unit (rete e Supabase finti, `node --test`)** — `api/_lib/foodClubHoldSweep.test.js`:
PAID giusto / PAID importo diverso / EXPIRED / CANCELLED / FAILED con `valid_until` passato, futuro, assente /
PENDING / timeout (AbortSignal) / 500 / 401 / JSON rotto / `checkout_reference` diverso / senza `provider_ref`
(not_found+claim NULL, not_found+claim, ambiguous, lookup fallito) / doppio giro sullo stesso attempt (idempotente) /
webhook arrivato a metà giro (`already_resolved`) / budget 25 s e limite 20 / errore RPC → lo sweep continua.
E3: senza token, staff non manager, ordine di un altro locale, ordine non chiuso, metodo sbagliato.
E2: corpo POST con `valid_until` ISO; aggiornare le asserzioni in `sumup-payment-reliability.test.mjs` e
`kitchen-amount-integrity.test.mjs` se confrontano il corpo intero.
**DB locale** (harness `run-oc-local.sh`): OC11 riscritto, nuovo OC12 (FAILED → `sumup_expired_after_failed` → rilascio),
OC13 (`sumup_never_created`), tick pg_cron: 0 buoni = 0 HTTP.
**Sandbox SumUp** (gate Eros): abbandono → pagamento tardivo; FAILED → nuova carta sullo stesso checkout; attesa oltre
`valid_until` e lettura reale dello stato (chiude [NV] §2); DELETE su PENDING e su FAILED; webhook duplicato.
Importo anomalo non riproducibile in sandbox (l'importo del checkout è fisso): resta coperto da unit + DB.

## 8. Test RF da aggiornare (senza perdere copertura)
- **RF1** (`50_review_fixes.sql` r.4–20): oggi vuole il buono `available` subito dopo l'abbandono. Nuova versione:
  abbandono → `reserved`; pagamento tardivo → `used` sullo stesso ordine, niente timbro, evento `consumed_on_late_payment`.
  Lo scopo originale (niente doppio sconto) resta asserito.
- **RF1b** (r.24–41): oggi spende il buono su un 2° ordine durante il pagamento aperto. Nuova versione: il 2° utilizzo è
  **rifiutato** (`voucher_not_available`); poi pagamento tardivo → buono usato una sola volta, nessuna anomalia
  `double_spend`. Copertura del ramo `food_club_voucher_double_spend` (FIX-1): mantenerla con un caso dedicato
  (buono liberato a mano + update staff a `paid`), così il ramo resta testato.
- **OC11**: riscritto sul percorso reale (§3).
- Unit api esistenti: `online-abandon-sweep.test.mjs` invariato se la fase hold è separata; aggiungere solo il caso
  `phase` all'endpoint.

## 9. Sequenza proposta (ogni riga = autorizzazione separata)
| # | Passo | Area | Verifica | Ripristino |
|---|---|---|---|---|
| 1 | Fix §3 + riscrittura RF1/RF1b/OC11 in `proposed/` | test | harness locale verde | file non tracciati, si rigenerano |
| 2 | `foodClubHoldSweep.js` + unit test (libreria, non ancora chiamata da nessuno) | `api/_lib` | `node --test` + lint | file nuovo isolato: nessun effetto in produzione |
| 3 | E2 `valid_until` in create-checkout + test | **`api/`, tutti i pagamenti** | unit + sandbox | `git revert` del commit; i checkout già creati non cambiano |
| 4 | Fase `food_club_hold` nell'endpoint + migration pg_cron (tick con EXISTS) | `api/` + migration | DB locale + chiamata con secret | `cron.unschedule` del job; endpoint torna al comportamento S6 |
| 5 | E3 endpoint «verifica ora» + UI staff (Fase 3 UI) | `api/` + app | unit + visual review | revert; RPC admin resta bloccata dal DB |
| 6 | Sandbox SumUp completa §7 | pagamenti di prova | report | — |
| 7 | Commit / `db push` / deploy | gate | — | — |
Ordine vincolante: 3 prima di accendere il flag Food Club (così 0 checkout senza scadenza con buono).

## NEEDS_DECISION
- **N5** durata `valid_until`: consigliato **15 minuti** (oggi nessuna scadenza; lo sweep chiude a 5).
- **N6** chi è manager in produzione: serve una tua lettura (o un mio query in sola lettura con tuo ok) di
  `kitchen_staff_members where role='manager'`.
- (Secondario) timeout mancanti nel webhook e nel sweep notturno: fuori scope, da task separato.

## Richiesta di autorizzazione
Per partire chiedo il via **solo per i passi 1 e 2** (test in `proposed/` + nuova libreria `api/_lib/foodClubHoldSweep.js`
con unit test, non collegata a nulla). Il passo 3 (`valid_until`, tocca tutti i pagamenti) richiede N5 e un'autorizzazione a parte.

Fonti doc SumUp: developer.sumup.com/api/checkouts/create, /api/checkouts/deactivate.
Modello/effort: passi 1–2 subagent Sonnet medium con brief completo; review del diff e passo 3 in sessione principale, effort high.
