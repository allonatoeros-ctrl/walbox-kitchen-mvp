# Walrus Food Club V1 — Handoff per Claude Code Cloud

_Aggiornato: 2026-11-09 · branch `food-club-v1-p1` · repo `allonatoeros-ctrl/walbox-kitchen-mvp`_
_Documento autosufficiente: chi lo legge nel cloud non ha accesso al Mac, a OrbStack, ai DB locali né ai report in
`ai-ops/reports/` (gitignored)._

## 0. Regole che valgono sopra tutto il resto
- **Walrus è in produzione con pagamenti reali.** Vercel `walbox-from-zero-v2` fa deploy di produzione dal branch `main`.
  Supabase di produzione: `pcrqfdzipotprqtuemso`.
- **Ogni branch pushato su GitHub crea una Preview Vercel pubblica che usa Supabase e SumUp di PRODUZIONE**
  (verificato: deployment GitHub `Preview` per ogni branch pushato; audit sicurezza F14). Nessun push di un branch
  senza che `vercel.json` lo escluda (`git.deploymentEnabled`, vedi §10).
- Vietati senza autorizzazione esplicita di Eros, una per azione: push, PR, merge, `npx supabase db push`,
  `functions deploy`, `secrets set`, `cron.schedule`, `vercel`, chiamate SumUp (anche sandbox), SMS reali, push reali,
  qualsiasi accesso a Supabase produzione, modifiche a Vercel o GitHub Actions.
- Aree protette (task dedicato + approvazione): `api/`, `supabase/migrations/`, `supabase/functions/`, `vercel.json`,
  `.env*`, auth, routing `src/App.jsx`, `package.json`/lock. Mai segreti nel repo o in chat.
- Mai `rm`, `git add -A`, `git reset`, `git restore .`. Commit atomici, prefisso `feat`/`fix`/`docs`/`test` + italiano.
- Le regole complete del repo sono in `CLAUDE.md`, `api/CLAUDE.md`, `supabase/CLAUDE.md`, `ai-ops/SECURITY_POLICY.md`.

## 1. Stato attuale (verificato il 2026-11-09)
- HEAD `1674fa0` sopra `4698ac9` (fix D1). Base Kitchen di produzione `ad08729` è antenata del branch.
- Food Club V1 è **completo in locale** (DB, API, UI cliente e staff) dietro il flag `VITE_FOOD_CLUB_ENABLED` (spento).
- Verdetto locale: **READY FOR SANDBOX**. Non pronto per la produzione: mancano prove sul provider SumUp (SB-1..SB-7),
  OTP/SMS reale e push reali; il cron delle push non esiste.
- Le regole di restituzione buono dipendenti dal provider (P-B, P-C) sono **spente**; solo P-A è attivo.

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
| Push Club | `supabase/functions/send-food-club-push/` (`index.ts`, `logic.js`, `logic.test.js`) |
| Test DB | `tests/db/apply-migrations.sh`, `tests/db/supabase-shim.sql`, `tests/db/run-food-club-sql.sh`, `tests/db/food-club/*` |
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
Gli script rifiutano host non locali. Per riferimento sul setup vedi `.github/workflows/kitchen-payments.yml` e
`tests/ci/kitchen-payments-ci.sh` (stessa ricetta usata dalla CI, con guardia di rete che blocca host remoti).
Non presumere uno stack Supabase completo (GoTrue, PostgREST, Realtime): nel cloud non c'è. I test di privilegi via
PostgREST e OTP con GoTrue (fatti sul Mac) vanno rifatti solo se il cloud consente Docker; altrimenti restano
«PASS LOCALE Mac» e si dichiarano non rieseguiti.

## 6. Comandi di verifica
| Cosa | Comando |
|---|---|
| SQL Food Club (11 file, 167 casi) | `tests/db/run-food-club-sql.sh walbox_fc_test` |
| Wrapper SQL + concorrenza | `node --test tests/db/food-club-sql.test.mjs tests/db/food-club-concurrency.test.mjs` |
| Concorrenza | `tests/db/food-club/p3c_release_concorrenza.sh`, `p90_d1_concorrenza.sh`, `p95_sb_concorrenza.sh` (`<db> 10`) |
| Pagamenti Kitchen (regressione) | `tests/db/kitchen-payments/run-kitchen-payments-sql.sh` e `bash tests/ci/kitchen-payments-ci.sh all` |
| Testo migration | `node --test supabase/migrations/*.test.js` |
| Unit | `node --test src/lib/*.test.js api/_lib/*.test.js supabase/functions/send-food-club-push/logic.test.js` |
| Simulazioni SumUp | `node --test tests/unit/food-club-sb-simulations.test.mjs` (fetch non mockato = test fallito) |
| Unit Kitchen | `node --test tests/unit/*.test.mjs` |
| Build flag OFF/ON | `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build` (ON: `VITE_FOOD_CLUB_ENABLED=true`) |
| Lint | `npm run lint` (117 errori preesistenti, 0 nei file Food Club: non deve crescere) |

## 7. Risultati già verificati sul Mac (2026-11-08/09) e limiti
- SQL Food Club 11/11 file (167 PASS); wrapper 1/1 e 10/10; p3c, p90, p95: zero deadlock, zero invarianti violate.
- Kitchen pagamenti P1–P8b e P7c–f: tutti OK; R3 sweep 5/5.
- Unit Food Club + migration `20261109*` + simulazioni: 174/174 (rilanciati il 2026-11-09 sul commit `1674fa0`).
- Privilegi via PostgREST locale: 60 controlli, 0 mismatch (anon/authenticated non raggiungono RPC staff/manager/release).
- UI cliente e staff: 18 voci PASS LOCALE (dettaglio in `docs/food-club/implementation/TEST-MATRIX.md` dove presente);
  voce 2 (0 timbri) parziale.
- **Preesistenti, non regressioni**: 10 FAIL nei test migration (catalogo menu/Garpez), 1 FAIL
  `kitchen-analytics-service-night-selector` (data fissa), e2e Playwright rossi senza backend con menu.
- **Intermittente**: `tests/unit/sumup-refund-reliability` (Vite chiuso durante la scansione dipendenze; 30/30 in un
  percorso, 21/30 in un altro). File Kitchen, non toccato.

## 8. Lavoro aperto
1. **Notifiche push** (obbligatorie per il lancio, §9).
2. **OTP/SMS** con provider reale (§10).
3. **E2E con backend isolato** (Postgres locale nel cloud; nessun Supabase reale).
4. **Campagna OFF e buoni maturati**: verificare end-to-end che a campagna spenta non nascano timbri, che i buoni
   maturati restino `available` e che carrello, server e pagina Club siano coerenti (UI già corretta, manca prova E2E).
5. **Test intermittenti**: stabilizzare `sumup-refund-reliability` (attendere la scansione Vite prima di
   `server.close()`): file Kitchen, serve task dedicato approvato.
6. **Messaggio staff alla cassa** per `food_club_order_sealed` / `food_club_order_paid_evidence` (oggi generico
   «Pagamento non registrato — riprova»): nasce in `src/hooks/useKitchenOrders.js` e `src/pages/CounterAssistedOrder.jsx`,
   file Kitchen → task dedicato.
7. **SB-1..SB-7 sul provider SumUp** (§11), poi eventuale accensione P-B/P-C con nuova migration.
8. **Preparazione rilascio** (§12).

## 9. Piano notifiche push (obbligatorie)
Stato: funzione `send-food-club-push` pronta e testata in logica (401 su secret errato, 404/410 cancellano la
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
- Nel cloud: rafforzare i test della logica client (`PhoneOtpForm`, normalizzazione E.164, messaggi d'errore) e
  preparare la checklist di collaudo provider; nessun SMS.

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

## 12. Preparazione del rilascio (ogni passo = gate Eros)
1. `vercel.json` del branch con `git.deploymentEnabled` per i branch Food Club e quelli creati dal cloud (§13).
2. Sandbox SumUp SB-1..SB-7.
3. Precheck `npx supabase migration list --linked`; controllare che la produzione non abbia una vecchia
   `food_club_staff_members` (nel demo la `103000` è fallita per questo); poi `db push` delle 10 migration
   `20261109100000`..`109000` in ordine; postcheck job cron, REVOKE, regole spente.
4. Rollback del tick: ri-schedulare prima il comando originale della sweep Kitchen, poi eliminare la funzione.
5. Deploy con `VITE_FOOD_CLUB_ENABLED` spento; poi flag ON, `FOOD_CLUB_RELEASE_ENABLED`, interruttore DB del tick.
6. Push: secret, deploy funzione, cron, prova reale su due telefoni. OTP: provider e prova reale.
7. Campagna accesa dalla pagina staff (solo manager).

## 13. Procedura per continuare con Claude Code Cloud
1. **Prima di qualsiasi push** (Eros, dal Mac): aggiungere al `vercel.json` del branch, dentro
   `git.deploymentEnabled`, le voci per `food-club-v1-p1` e per i branch che il cloud creerà (es. `claude/*`), poi
   verificare che il primo push non produca un deployment GitHub `Preview`
   (`gh api repos/allonatoeros-ctrl/walbox-kitchen-mvp/deployments?ref=<branch>`).
   Precedente: `feat/watchdog-observability` è escluso così e non ha nessun deployment.
2. Push di `food-club-v1-p1` (gate Eros).
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
