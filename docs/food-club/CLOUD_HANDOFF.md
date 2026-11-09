# Walrus Food Club V1 — Handoff per Claude Code Cloud

_Aggiornato: 2026-11-09 (sessione Claude Code Cloud) · branch `food-club-v1-p1` · repo `allonatoeros-ctrl/walbox-kitchen-mvp`_
_Legenda esiti: **VERIFICATO** = eseguito e osservato in questa sessione; **DEDOTTO** = da lettura del codice o della doc, non eseguito._
_Documento autosufficiente: chi lo legge nel cloud non ha accesso al Mac, a OrbStack, ai DB locali né ai report in
`ai-ops/reports/` (gitignored)._

## 0. Regole che valgono sopra tutto il resto
- **Walrus è in produzione con pagamenti reali.** Vercel `walbox-from-zero-v2` fa deploy di produzione dal branch `main`.
  Supabase di produzione: `pcrqfdzipotprqtuemso`.
- **Ogni branch pushato su GitHub crea una Preview Vercel pubblica che usa Supabase e SumUp di PRODUZIONE**
  (verificato: deployment GitHub `Preview` per ogni branch pushato; audit sicurezza F14). Nessun push di un branch
  senza che `vercel.json` lo escluda (`git.deploymentEnabled`, vedi §13). Esclusi oggi: `food-club-v1-p1`,
  `claude/*`, `claude/**`, `feat/watchdog-observability`. Un branch con un nome diverso NON è escluso: niente push.
  Non togliere né mettere a `true` queste voci (con minimatch, se una regola che combacia è `true` il deploy parte).
- Vietati senza autorizzazione esplicita di Eros, una per azione: push, PR, merge, `npx supabase db push`,
  `functions deploy`, `secrets set`, `cron.schedule`, `vercel`, chiamate SumUp (anche sandbox), SMS reali, push reali,
  qualsiasi accesso a Supabase produzione, modifiche a Vercel o GitHub Actions.
- Aree protette (task dedicato + approvazione): `api/`, `supabase/migrations/`, `supabase/functions/`, `vercel.json`,
  `.env*`, auth, routing `src/App.jsx`, `package.json`/lock. Mai segreti nel repo o in chat.
- Mai `rm`, `git add -A`, `git reset`, `git restore .`. Commit atomici, prefisso `feat`/`fix`/`docs`/`test` + italiano.
- Le regole complete del repo sono in `CLAUDE.md`, `api/CLAUDE.md`, `supabase/CLAUDE.md`, `ai-ops/SECURITY_POLICY.md`.

## 1. Stato attuale (sessione cloud 2026-11-09)
- Codice: 12 commit sopra `8000080` (push, OTP, campagna OFF, E2E, proposte Kitchen, doc). Base Kitchen di produzione
  `ad08729` antenata del branch. Nessun file Kitchen K1–K6, D1 o della regola dei 5 minuti modificato (VERIFICATO: diff).
- Food Club V1 completo in locale dietro `VITE_FOOD_CLUB_ENABLED` (spento). Migration Club: **11** (`20261109100000`..
  `20261109110000`), tutte SOLO LOCALI.
- Verdetto: **READY FOR SANDBOX**, non pronto per la produzione. Mancano: prova push su telefoni veri, SMS reale con
  fornitore, SB-1..SB-7 su SumUp, «Confirm phone» attivo in produzione, decisioni aperte (§3, §8).
- P-B e P-C spente (solo P-A attivo): invariato.
- Notifiche push: logica, migration del tick, gestione errori e prova Deno locale completate (§9). OTP: logica client
  corretta e testata, checklist provider pronta (§10). Campagna OFF: corretta un'incoerenza UI e provata in E2E (§8.4).

## 2. Architettura e directory
| Area | Dove |
|---|---|
| Migration Club (10, in ordine) | `supabase/migrations/20261109100000`..`20261109109000_food_club_v1_*.sql`, ognuna con `.test.js` (assert sul testo) |
| Regole pure UI | `src/lib/foodClubRules.js`, `foodClubApi.js`, `foodClubConfig.js` (flag) |
| UI cliente | `src/pages/FoodClubPage.jsx`, `src/components/foodclub/*` (tessera, buoni, OTP, invito PWA) |
| UI staff | `src/pages/FoodClubStaffPage.jsx/.css` (`/kitchen/club-staff`) |
| Rotte | `src/App.jsx`: `/kitchen/club/*`, `/kitchen/club-staff`, solo con flag ON |
| Evidenze SumUp e rilascio buono | `api/_lib/foodClubCheckoutEvidence.js`, `api/_lib/foodClubVoucherRelease.js` |
| Aggancio Kitchen | `api/kitchen-sumup-create-checkout.js` (intento Club), `api/kitchen-online-abandon-sweep.js` (tick rilascio, spento di default) |
| Push Club | `supabase/functions/send-food-club-push/` (`index.ts`, `logic.js` con `processBatch`, `logic.test.js`); migration `20261109110000_food_club_v1_push_delivery.sql`; prova Deno `tests/push-proof/` |
| OTP client | `src/lib/foodClubOtp.js` (+ test), `src/hooks/useFoodClubIdentity.js`, `src/components/foodclub/PhoneOtpForm.jsx`; checklist `docs/food-club/implementation/OTP-PROVIDER-CHECKLIST.md` |
| E2E Food Club | `tests/e2e-real/food-club-campaign-off.spec.js` (stack Supabase locale) |
| Test DB | `tests/db/apply-migrations.sh`, `tests/db/supabase-shim.sql`, `tests/db/run-food-club-sql.sh`, `tests/db/food-club/*` (nuovo `41_push_delivery.sql`), `tests/db/food-club-push-concurrency.test.mjs` |
| Test unit/simulazioni | `tests/unit/food-club-sb-simulations.test.mjs`, `src/lib/*.test.js`, `api/_lib/*.test.js` |
| Documenti | `docs/food-club/implementation/` (DECISIONS, RUNBOOK-push, TEST-MATRIX), `docs/food-club/fase3/` (spec PWA/notifiche, prototipi) |

## 3. Decisioni commerciali definitive (fonte `docs/food-club/implementation/DECISIONS.md`)
- Iscrizione gratuita con telefono verificato via OTP.
- ≥10 € di food pagato = 1 timbro (bevande escluse); massimo 1 timbro per serata (06:00→06:00 Europe/Rome).
- 2 serate diverse entro 30 giorni dalla prima visita valida = buono 5 €.
- Buono valido 30 giorni, usabile con ≥12 € di food su un ordine successivo, 1 per ordine, non cumulabile con promo.
- Valgono solo ordini app pagati (online o al banco) e confermati; esclusi gli ordini creati dallo staff.
- Mai doppio uso del buono. Campagna spenta: niente nuovi timbri, i buoni maturati restano validi ma si usano solo
  quando la campagna torna attiva.
- Decisioni ancora aperte (NEEDS_DECISION, non decidere da soli): D-1, D-2, D-3, D-4, D-10/D-16 (fornitore SMS e
  budget), D-11 (testi legali), D-14, D-17, D-18, D-19; colonne staff `cycle_stamps`/`total_visits` (oggi «—»).
  Bloccante per il lancio: «Confirm phone» attivo nel progetto Supabase di produzione.

## 4. Comportamento D1 approvato (pagamento al banco)
- Il cliente può passare da SumUp al banco **sullo stesso ordine**: il checkout viene chiuso e verificato con GET
  (un 200 della DELETE non basta), stessa comanda, stesso id, buono consumato una sola volta, mai due incassi.
- Su un ordine sigillato dal Club l'incasso al banco è permesso solo se il buono è **ancora `reserved` su quell'ordine**
  e non esiste una prova SumUp `PAID`; altrimenti `food_club_order_sealed` o `food_club_order_paid_evidence`.
- Dopo 5 minuti senza azione Kitchen porta l'ordine a `payment_abandoned` e non incassa più al banco (regola Kitchen,
  non toccata). Kitchen K1–K6 e la regola dei 5 minuti non vanno modificati in questo lavoro.

## 5. Ricreare l'ambiente di test nel cloud (senza OrbStack, senza Supabase CLI)
Serve solo Postgres locale e Node. Secondo la documentazione Anthropic (cloud-environments, letta il 2026-11-09) la VM
cloud è Ubuntu 24.04 con Node 22 di default, PostgreSQL 16 e Docker preinstallati ma non avviati; rete «Trusted» di
default (GitHub, npm, apt Ubuntu, Docker Hub). La CI e il Mac usano Postgres 17/18 e Node 24: **Postgres 16 e Node 22
non sono mai stati provati su queste migration**. Prima prova con quelli; se qualcosa fallisce per versione, installare
Postgres 17 / Node 24 nello setup script e annotarlo.
```bash
# 1) dipendenze (unico passo con rete)
npm ci --no-audit --no-fund
# 2) Postgres effimero sulla porta 54329 (service postgresql start, oppure initdb/pg_ctl su un datadir temporaneo)
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres
# 3) DB migrato da zero: shim Supabase + tutte le migration in ordine
tests/db/apply-migrations.sh walbox_fc_test
```
**Esito nel cloud (VERIFICATO 2026-11-09)**:
- Postgres 16.15 (apt) funziona con tutte le migration e tutti i test SQL. Il datadir NON va nello scratchpad (i
  permessi possono cambiare e Postgres va in PANIC): usare `/var/lib/postgresql/<dir>` con `su postgres -c "initdb/pg_ctl"`.
- **Node 22 non basta**: `tests/unit/sumup-reconcile-sweep.test.mjs` annulla 15 casi su 29 (event loop), con Node 24
  passa 29/29. Nel cloud: `npm install node@24` in una cartella di lavoro e metterla in `PATH` per test e CI.
- Docker funziona (`dockerd` da avviare a mano). Stack Supabase completo con la CLI 3.0 (installata con npm fuori dal
  repo) **solo con `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`**: le immagini su `public.ecr.aws` sono bloccate dal
  proxy (CloudFront 403). Config come `scripts/e2e-real-supabase-local.sh`, più `[auth.sms]` con `enable_signup` e
  `enable_confirmations` true, `test_otp` (393475550001..4 = "123456") e twilio finto abilitato.
- Playwright: il `@playwright/test` del repo (1.61) non trova il suo browser; serve `executablePath:
  '/opt/pw-browsers/chromium'` in un config fuori dal repo che importa `playwright.real-local.config.js`.
- La CI locale `tests/ci/kitchen-payments-ci.sh` va lanciata con `env -u CLOUDSDK_AUTH_ACCESS_TOKEN` (variabile
  dell'ambiente cloud che la guardia rifiuta) e la fase `lint` richiede la base `origin/main`.
Gli script rifiutano host non locali. Per riferimento sul setup vedi `.github/workflows/kitchen-payments.yml` e
`tests/ci/kitchen-payments-ci.sh` (stessa ricetta usata dalla CI, con guardia di rete che blocca host remoti).
Non presumere uno stack Supabase completo (GoTrue, PostgREST, Realtime): nel cloud non c'è. I test di privilegi via
PostgREST e OTP con GoTrue (fatti sul Mac) vanno rifatti solo se il cloud consente Docker; altrimenti restano
«PASS LOCALE Mac» e si dichiarano non rieseguiti.

## 6. Comandi di verifica
| Cosa | Comando |
|---|---|
| SQL Food Club (12 file, 180 casi) | `tests/db/run-food-club-sql.sh walbox_fc_test` |
| Concorrenza push (due tick) | `node --test tests/db/food-club-push-concurrency.test.mjs` |
| Prova Deno push (rete solo verso npm) | `tests/push-proof/run-deno-push-proof.sh [cartella]` |
| E2E Food Club (stack Supabase locale, più le variabili di `scripts/e2e-real-supabase-local.sh`) | `VITE_FOOD_CLUB_ENABLED=true E2E_LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx playwright test -c playwright.real-local.config.js food-club-campaign-off` |
| Wrapper SQL + concorrenza | `node --test tests/db/food-club-sql.test.mjs tests/db/food-club-concurrency.test.mjs` |
| Concorrenza | `tests/db/food-club/p3c_release_concorrenza.sh`, `p90_d1_concorrenza.sh`, `p95_sb_concorrenza.sh` (`<db> 10`) |
| Pagamenti Kitchen (regressione) | `tests/db/kitchen-payments/run-kitchen-payments-sql.sh` e `bash tests/ci/kitchen-payments-ci.sh all` |
| Testo migration | `node --test supabase/migrations/*.test.js` |
| Unit | `node --test src/lib/*.test.js api/_lib/*.test.js supabase/functions/send-food-club-push/logic.test.js` |
| Simulazioni SumUp | `node --test tests/unit/food-club-sb-simulations.test.mjs` (fetch non mockato = test fallito) |
| Unit Kitchen | `node --test tests/unit/*.test.mjs` |
| Build flag OFF/ON | `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build` (ON: `VITE_FOOD_CLUB_ENABLED=true`) |
| Lint | `npm run lint` (117 errori preesistenti, 0 nei file Food Club: non deve crescere; VERIFICATO 117 a fine sessione) |

## 7. Risultati
### 7.1 Sessione cloud 2026-11-09 (VERIFICATO, commit `8ded72c` e precedenti della sessione)
| Cosa | Esito |
|---|---|
| Migration da zero su Postgres 16 | 86 applicate |
| SQL Food Club | 12/12 file, 180 PASS (nuovo `41_push_delivery.sql`: PD01–PD13) |
| Wrapper SQL + concorrenza (C1–C4) + concorrenza push (PC1 10 rip., PC2) | 13/13 |
| Concorrenza p3c, p90, p95 (10 rip.) | OK, zero deadlock, zero invarianti violate |
| Mutante senza lock per utente | PC1 rosso (2 invii allo stesso utente): il test rileva il difetto |
| Kitchen pagamenti SQL | 15 scenari OK, 0 FAIL; CI fasi `migrations`, `db`, `r3`, `build` OK; `unit` OK con Node 24 (811/812, 1 esclusione nota) |
| Testo migration | 532/543: i 10 FAIL preesistenti (catalogo menu/Garpez), 0 nuovi; Club `20261109*` 79/79 |
| Unit Food Club (src/lib, api/_lib, push, simulazioni, create-checkout) | 478/480 + 1 skip; l'unico FAIL era il conteggio migration, corretto |
| Unit Kitchen `tests/unit` (Node 24) | 483/485: `kitchen-analytics-service-night-selector` (preesistente) e `sumup-refund-reliability` (intermittente, §8.5) |
| Prova Deno push (index.ts + vera web-push + push service finto HTTPS) | PASS: 401 senza secret o errato; payload aes128gcm decifrato con VAPID e TTL 12 h; 410 → sottoscrizione cancellata e messaggio `skipped`; endpoint muto → `timeout`, torna in coda; log senza endpoint/testi |
| Stack Supabase locale (GoTrue + PostgREST + pg_cron/pg_net/Vault reali) | 86 migration applicate; permessi via PostgREST 60/60 (script p3) + 18/18 sulle funzioni push nuove; job `food-club-push` eseguito da pg_cron, senza secret WARNING e 0 richieste HTTP |
| E2E Food Club (Chromium, rete esterna bloccata, 0 richieste bloccate) | 3/3: OTP con codice di prova (numero fisso rifiutato, codice errato, stesso uid anonimo); campagna OFF coerente; controllo positivo a campagna ON. Il test diventa rosso se la card buono torna a mostrare USALO ORA |
| Lint | 117 errori, invariato |
| Build flag OFF e ON | OK |
### 7.2 Mac (2026-11-08/09, non rieseguito qui salvo quanto sopra)
- UI cliente e staff: 18 voci PASS LOCALE (`docs/food-club/implementation/TEST-MATRIX.md`); voce 2 (0 timbri) parziale.
- OTP con GoTrue locale (invio, verifica, 429, `phone_exists`): ora anche nel cloud per invio/verifica/errore.
### 7.3 Preesistenti, non regressioni
- 10 FAIL nei test migration (catalogo menu/Garpez); `kitchen-analytics-service-night-selector` (data fissa);
  E2E Kitchen reali con selettore vecchio `.pm-list .pc-cta` (il menu attuale usa «Aggiungi <piatto>, panino»).

## 8. Lavoro aperto
1. **Notifiche push**: lato codice FATTO (§9). Restano i gate di Eros: secret, deploy, prova su due telefoni.
2. **OTP/SMS**: lato client FATTO (§10). Restano fornitore (D-10/D-16), configurazione Supabase Auth, prova reale.
3. **E2E con backend isolato**: FATTO per Food Club (OTP + campagna OFF). Non coperti: pagamento SumUp online (solo
   simulato), push dal browser (serve un push service reale).
4. **Campagna OFF**: FATTO. Difetto trovato e corretto: la pagina Club mostrava «USALO ORA» e la striscia del menu
   prometteva timbri mentre carrello e server (correttamente) rifiutavano il buono. Ora: avviso «Club in pausa», buono
   DISPONIBILE + CLUB IN PAUSA senza CTA, nessuna promessa di timbro. Testi da validare (NEEDS_DECISION, sotto).
5. **Test intermittenti**: causa trovata per `sumup-refund-reliability` (SIGSEGV/abort alla chiusura di Vite durante la
   scansione dipendenze); correzione di una riga provata 0/50 (Node 22) e 0/15 (Node 24). File Kitchen non modificato:
   proposta in `docs/food-club/implementation/proposed/KITCHEN-TEST-FLAKY-sumup-refund.md` (task dedicato).
6. **Messaggio staff alla cassa** per `food_club_order_sealed` / `food_club_order_paid_evidence`: invariato, file
   Kitchen (`src/hooks/useKitchenOrders.js`, `src/pages/CounterAssistedOrder.jsx`) → task dedicato.
7. **SB-1..SB-7 sul provider SumUp** (§11), poi eventuale accensione P-B/P-C con nuova migration.
8. **Rilascio**: checklist aggiornata in §12.

NEEDS_DECISION nuove (Eros): (a) attivare il job winback (funzione pronta, job NON schedulato); (b) testi «Club in
pausa»; (c) `voucher_expiring` saltato a campagna spenta (alternativa: inviarlo comunque); (d) regole D-19 come
implementate (§9); (e) CAPTCHA sull'invio SMS (costi da pompaggio); (f) promo: oggi solo da SQL (`food_club_promo_enqueue`,
service_role), nessuna UI staff.

**Prossimo passo (uno solo):** Eros fa la prova reale della push «ordine pronto» esistente su iPhone (PWA installata,
iOS ≥ 16.4) e Android (`RUNBOOK-push-food-club.md` §0 e §5 punto 1): è il prerequisito I-7 di tutte le push Club.

## 9. Piano notifiche push (obbligatorie)
**Aggiornamento cloud 2026-11-09 (VERIFICATO)**: punti 1–5 completati in locale.
- 1. Messaggi per categoria: timbro, buono sbloccato, buono in scadenza (già nel DB) + promo
  (`food_club_promo_enqueue`, solo service_role, testo ≤ 90 caratteri, URL solo interni) e winback
  (`food_club_winback_enqueue`, 21 giorni senza visite, poi non prima di 60, solo a campagna attiva). Consenso
  marketing ricontrollato al momento dell'invio (test PD07: revoca dopo la creazione → non inviata).
- 2. Regole: fascia 22:30–10:00, 1 al giorno (anche un invio in corso conta), `voucher_expiring` solo 17:00–20:00 e una
  volta, promo mai nell'ora di un ordine, tetto promo, buono usato = niente avviso (PD02–PD07).
- 3. Migration `20261109110000` (non applicata): job `food-club-push` ogni 5 minuti; senza secret Vault WARNING e
  nessuna chiamata (PD10 su shim, e su pg_cron/pg_net/Vault reali dello stack locale).
- 4. Errori: orfani `sending` recuperati o chiusi al 3° tentativo (prima restavano `sending` per sempre e bloccavano
  il tetto dell'utente: difetto corretto), `time_budget` non consuma tentativi, 410 su tutti gli endpoint = `skipped`,
  due tick concorrenti mai due invii allo stesso utente (advisory lock, test con mutante), timeout per invio anche sotto
  Deno, report falliti non fermano il batch (unit 22/22).
- 5. Prova Deno: PASS (§7.1). Da verificare al deploy: `--allow-sys` (vedi runbook §4).
- 6. Preferenze: già presenti (Ordini, Tessera e premi, Promo e novità + revoca marketing con data/ora); non toccate.
- 7. Gate di Eros: invariati (runbook §1–§5); il cron ora nasce con il `db push`, il secret Vault è l'interruttore.

Stato precedente: funzione `send-food-club-push` pronta e testata in logica (401 su secret errato, 404/410 cancellano la
sottoscrizione, 500 ritentato, `vapid_invalid` su chiavi malformate). SQL `food_club_push_claim_batch`,
`food_club_push_report`, `food_club_push_tick` nella migration `20261109102000_food_club_v1_identity_api.sql`
(il runbook cita il vecchio nome `20261105102000`). **Il cron non esiste.** Mai inviata una push reale; anche la push
«ordine pronto» esistente non è mai stata provata su telefono (prerequisito I-7).

Da completare nel cloud, tutto in locale e con test:
1. Generazione dei messaggi per categoria (spec `docs/food-club/fase3/PWA-NOTIFICHE-spec.md` §4): servizio ordine,
   tessera e premi (`stamp`, `voucher_unlocked`, `voucher_expiring`), promo (`promo`, `winback`) solo con
   `marketing_consent_at` valido **al momento dell'invio**.
2. Regole: fascia silenziosa 22:30–10:00 (escluso servizio ordine e timbro), max 1 notifica Club al giorno, deduplica
   (membro, tipo, riferimento), `tag` per tipo, `voucher_expiring` 1 sola volta 3 giorni prima tra 17:00 e 20:00.
3. Automazione: definire in una **nuova migration** (non applicata) lo schedule `food-club-push` ogni 5 minuti,
   spento finché il secret non è in Vault; scrivere test SQL che provino tick senza secret = WARNING e nessuna chiamata.
4. Gestione errori: batch 50, budget ~25 s, retry DB ogni 5 min max 3 tentativi, `failed` dopo; endpoint 404/410
   cancellati; log JSON senza endpoint/chiavi/testi. Aggiungere test per timeout, budget superato, messaggi `sending`
   orfani (recupero), doppio tick concorrente.
5. Prova Deno: se il cloud ha rete verso il registry, eseguire `index.ts` con la vera `web-push` contro un push
   service finto in locale. Nessun push service reale.
6. Preferenze cliente: tre interruttori (Ordini, Tessera e premi, Promo) + revoca marketing con data/ora.
7. Gate di Eros (fuori dal cloud): secret Vault + `FOOD_CLUB_PUSH_SECRET`, deploy funzione, cron, prova reale su
   iPhone (PWA installata, iOS ≥ 16.4) e Android (`docs/food-club/implementation/RUNBOOK-push-food-club.md` §5).

## 10. OTP/SMS
- Usa Supabase phone auth. Verificato sul Mac solo con GoTrue locale e numeri di prova (`GOTRUE_SMS_TEST_OTP`): invio,
  verifica, codice errato, rate limit 429, input non valido, `phone_exists`, iscrizione con consensi.
- NON DIMOSTRATO: SMS reale, scadenza e consumo reali del codice. Servono fornitore (D-10/D-16, decide Eros),
  configurazione nel progetto Supabase (gate Eros) e un numero di Eros.
- Nel cloud (FATTO 2026-11-09, VERIFICATO): logica in `src/lib/foodClubOtp.js` con 13 test. Difetti corretti: un 429 o
  «Invalid phone number» di GoTrue venivano mostrati come «Codice sbagliato»; i fissi `+39 0…` passavano la
  validazione; il conto alla rovescia mostrava «0:60». Nuovi messaggi: SMS non attivi, SMS non partito, rete assente.
  E2E con GoTrue locale e codice di prova: PASS. Checklist provider: `docs/food-club/implementation/OTP-PROVIDER-CHECKLIST.md`.
  Nessun SMS inviato.

## 11. SB-1..SB-7: simulati, NON dimostrati su SumUp
Tutte PASS LOCALE con risposte simulate (29 test JS, 25 casi SQL, concorrenza p95). Da provare in sandbox SumUp con
credenziali fornite da Eros, prima di accendere P-B/P-C:
1. `valid_until` nella POST: restituito identico da 201 e GET?
2. Dopo `valid_until`: EXPIRED o PENDING? La pagina hosted rifiuta il pagamento, con quale margine (oggi 2 min)?
3. POST con `valid_until` già passato: 400 o 201 pagabile?
4. Stati reali: FAILED → retry → PAID; DELETE → EXPIRED; CANCELLED mai come stato del checkout.
5. List `?checkout_reference=`: filtrata davvero? array vuoto se assente? ritardo dopo la 201? paginazione?
6. 409 `DUPLICATED_CHECKOUT`: corpo ed `error_code` reali.
7. Campi GET/List (`merchant_code`, `amount` a 2 decimali, `currency`); il merchant reale va in
   `food_club_expected_merchant_code()` con una nuova migration (gate Eros).
Configurazione da non cambiare finché non ci sono le prove: `food_club_release_verified_rules()` = false/false/false,
`food_club_expected_merchant_code()` = NULL, `TERMINAL_STATES_SANDBOX_VERIFIED = false`.

## 12. Preparazione del rilascio (ogni passo = gate Eros, in quest'ordine)
0. Prima di tutto: task Kitchen dedicati se Eros li vuole prima del lancio (§8.5 test intermittente, §8.6 messaggio cassa).
1. Fatto: `vercel.json` esclude `food-club-v1-p1` e `claude/*` dalle Preview (commit `e15edf5`). Al merge in `main` le
   voci restano innocue per `main`; valutare con Eros se servirà una Preview isolata (env non di produzione).
2. Sandbox SumUp SB-1..SB-7 (§11). Finché non ci sono le prove, regole P-B/P-C spente.
3. Decisioni aperte (§3 e §8 NEEDS_DECISION) chiuse da Eros; testi legali (D-11).
4. Precheck `npx supabase migration list --linked`; controllare che la produzione non abbia una vecchia
   `food_club_staff_members` (nel demo la `103000` è fallita per questo).
5. `npx supabase db push --linked` delle **11** migration, in ordine:
   `100000` schema · `101000` ordine-pagamento · `102000` identità/API/coda · `103000` staff/analytics · `104000`
   rilascio buoni · `105000` tick sweep (ri-schedula `kitchen-online-abandon-sweep`) · `106000` buoni in verifica ·
   `107000` incasso al banco su sigillato · `108000` stati checkout documentati · `109000` my_state · `110000` consegna
   push (crea il job `food-club-push`, inerte senza secret).
   Postcheck: `migration list` senza pending; job cron (`food-club-expire-sweep`, `food-club-retention-sweep`,
   `food-club-push`, comando di `kitchen-online-abandon-sweep`); REVOKE (anon/authenticated non eseguono RPC staff,
   release, push); `food_club_release_verified_rules()` = false/false/false; nessun secret `food_club_push_secret`.
6. Deploy con `VITE_FOOD_CLUB_ENABLED` spento; poi flag ON, `FOOD_CLUB_RELEASE_ENABLED`, interruttore DB del tick
   di rilascio (migration dedicata).
7. OTP: fornitore, «Confirm phone» attivo, prova reale (`OTP-PROVIDER-CHECKLIST.md`).
8. Push: prova I-7 «ordine pronto» su due telefoni → `FOOD_CLUB_PUSH_SECRET` + VAPID nella funzione → deploy
   `send-food-club-push --no-verify-jwt` → secret Vault per ultimo → prova Club su due telefoni (runbook §5).
9. Campagna accesa dalla pagina staff (solo manager).

Rollback (ogni voce = migration dedicata o azione di Eros):
- Push: togliere il secret Vault `food_club_push_secret` (immediato, nessuna chiamata) oppure
  `SELECT cron.unschedule('food-club-push')`.
- Tick di rilascio: ri-schedulare prima il comando originale della sweep Kitchen
  (`SELECT cron.schedule('kitchen-online-abandon-sweep', '* * * * *', $$SELECT public.kitchen_online_abandon_sweep_tick()$$)`),
  poi la funzione Club resta inerte; emergenza: env `FOOD_CLUB_RELEASE_ENABLED` su Vercel.
- Club visibile ai clienti: `VITE_FOOD_CLUB_ENABLED` spento + redeploy; campagna spenta dalla pagina staff (i buoni
  maturati restano validi, ora mostrati come «in pausa»).
- Le migration sono additive (nessun DROP di oggetti Kitchen usati dal codice live).

## 13. Procedura per continuare con Claude Code Cloud
1. Fatto (2026-11-09, autorizzato da Eros): `vercel.json` esclude `food-club-v1-p1`, `claude/*`, `claude/**`.
   Prova: `feat/watchdog-observability` è stato pushato la prima volta con l'esclusione già nel commit (`aa03cd2`) e
   non ha deployment né stato Vercel. Verifica dopo un push: Vercel registra i deployment con `ref` = SHA, quindi
   `gh api "repos/allonatoeros-ctrl/walbox-kitchen-mvp/deployments?sha=<sha>"` e
   `gh api repos/allonatoeros-ctrl/walbox-kitchen-mvp/commits/<sha>/statuses` devono essere vuoti
   (filtrare per nome del branch restituisce sempre 0 e non prova nulla).
2. Push del solo branch `food-club-v1-p1` (autorizzato da Eros il 2026-11-09).
3. Su claude.ai/code: scegliere il repo `allonatoeros-ctrl/walbox-kitchen-mvp` nel selettore sotto il campo di testo e
   il branch `food-club-v1-p1` nel controllo accanto; incollare il prompt di avvio. Prerequisiti (doc Anthropic
   claude-code-on-the-web / web-quickstart): piano Pro/Max/Team, GitHub collegato e Claude GitHub App installata sul
   repo privato. Alternativa dal Mac, con il branch già pushato: `claude --cloud "<prompt>"` dal worktree.
4. Ambiente cloud **senza variabili di produzione**: niente chiavi Supabase/SumUp/VAPID/Twilio. Le variabili d'ambiente
   cloud sono leggibili da chiunque usi l'ambiente: non metterci segreti.
5. Ogni sessione cloud lavora su un proprio branch (nome non confermato dalla doc: verificare che sia escluso dalle
   Preview prima che la sessione faccia push). Nessuna PR, nessun merge senza Eros.
6. Per riportare il lavoro sul Mac: `claude --teleport <session-id>` (albero git pulito, branch pushato).

## 14. Prompt di avvio della sessione cloud
```text
WALRUS FOOD CLUB V1 — continuazione nel cloud (repo allonatoeros-ctrl/walbox-kitchen-mvp, branch food-club-v1-p1).
Leggi prima docs/food-club/CLOUD_HANDOFF.md (§0 vincoli, §5 ambiente, §8 lavoro aperto), poi CLAUDE.md.
Walrus è in produzione con pagamenti reali: niente push su main, PR, merge, db push, functions deploy, secrets,
cron reali, chiamate SumUp/SMS/push reali, accesso a Supabase produzione, modifiche a Vercel o GitHub Actions.
Non hai OrbStack né il DB del Mac: crea Postgres locale (porta 54329) e usa tests/db/apply-migrations.sh.
Obiettivo, in quest'ordine, tutto in locale e con test:
1. Notifiche push (obbligatorie per il lancio): generazione messaggi per categoria, regole di frequenza e fascia
   silenziosa, consenso marketing al momento dell'invio, nuova migration (non applicata) per lo schedule del tick,
   gestione errori e recupero dei messaggi orfani, test SQL e unit (§9).
2. OTP/SMS: test della logica client e checklist di collaudo provider, nessun SMS (§10).
3. E2E con backend isolato (Postgres locale, rete esterna bloccata).
4. Campagna OFF: nessun nuovo timbro, buoni maturati validi e coerenti tra carrello, server e pagina Club.
5. Stabilizzare i test intermittenti; i file Kitchen solo con proposta separata, non modificarli.
6. Preparare il rilascio: checklist §12 aggiornata, migration in ordine, rollback, gate di Eros elencati.
Regole: P-B/P-C restano spente; non toccare Kitchen K1–K6, D1 e la regola dei 5 minuti; decisioni di prodotto =
NEEDS_DECISION. Prima di ogni push verifica che il branch sia escluso dalle Preview Vercel (§0, §13); se non lo è,
non fare push e fermati. Commit atomici in italiano, mai git add -A. Alla fine aggiorna questo file (§1, §7, §8) con
esiti verificati vs dedotti e un solo prossimo passo.
```
