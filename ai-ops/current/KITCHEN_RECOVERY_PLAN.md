# Kitchen Recovery Plan — riordino + onboarding + pagamento app separato

Creato 2026-10-12. **Fonte unica dello stato di questo lavoro.** Dopo `/clear`: "riprendi da ai-ops/current/KITCHEN_RECOVERY_PLAN.md".
Worktree `walbox-kitchen-release`, branch `kitchen-clean-baseline-v2-phase-a`.

## Obiettivo

1. Una sola linea Kitchen pulita, committata e in produzione.
2. Claude istruito sul Kitchen (onboarding) per lavorare senza rileggere la cronologia.
3. Pagamenti via app separati: l'ordine online **entra in cassa/cucina solo dopo il pagamento**.

## Come si lavora

- Claude esegue da solo tutto il lavoro locale e reversibile: lettura, edit, test, build, report, delega a subagent.
- Si ferma **solo** ai gate segnati con 🔒. Lì scrive cosa serve e aspetta Eros.
- A fine fase: verifica, aggiorna la sezione STATO qui sotto, risponde PASS/FAIL/PARZIALE + il gate successivo.
- Report lunghi in `ai-ops/reports/` (gitignored), mai in chat.

## Evidence di partenza (2026-10-12)

- `ai-ops/reports/claude-onboarding-audit-2026-10-12.md`: setup Claude, gap, ricetta di `/init`.
- `ai-ops/reports/kitchen-line-reconciliation-audit-2026-10-12.md`: HEAD = linea più completa.
  - origin/main non ha nulla in più.
  - La produzione ha il frontend/API di `74e7f88` (senza F1–F7) e il DB alla linea HEAD.
  - F1 è compatibile con il codice in produzione.
- `ai-ops/reports/kitchen-s2-migration-a-online-payment-lifecycle-local.md`: S2 costruita in locale.

## Fasi

### Fase A — Onboarding minimo (protezioni). Sonnet medium
- CLAUDE.md §5/§9: aree protette reali.
  - Aggiungere: `api/` (soldi), `supabase/migrations`, `supabase/functions`, `vercel.json` (cron), `.env*`.
  - Togliere: i riferimenti inesistenti (`mockData.js`, `/tv-poster`…).
- `.claude/settings.json` di progetto: `ask` su `npx supabase db push*`, `npx supabase functions deploy*`, `npx vercel*`, `npx playwright test -c playwright.fsec2.config.js*`.
- Test: JSON valido, nessun altro file toccato.
- 🔒 Gate: Eros approva il diff (Gate 2), poi il commit.

### Fase 0 — Riordino working tree. Sonnet medium
- Classificare i 31 file M e gli untracked in gruppi:
  1. UI menu sezioni + Storico + `kitchenServiceRules` PAYMENT_GROUPS;
  2. Web Push F6 (edge function, commenti delle migration 20260924 "APPLIED", runbook);
  3. config dev (`vite.config.js`, `pilot-preflight.js`, e2e spec);
  4. CHECKPOINT;
  5. migration grant `20261009130000`;
  6. migration S2 `20261009140000`;
  7. spazzatura (`.playwright-mcp/`, `ai-brains/`, `walbox-audit-v11/`, `playwright.local.tmp.config.js`).
- Per ogni gruppo: build e unit test pertinenti, poi la proposta `git add <file>` + messaggio.
- La spazzatura non si cancella (niente `rm`): si propone `.gitignore` o lo spostamento in `docs/archive/`.
- Strada scelta: **1 (commit atomici)**, salvo diversa indicazione di Eros. Alternativa 3: un solo commit wip su un ramo a parte.
- 🔒 Gate: Eros approva i commit (uno per gruppo, si possono approvare in blocco).

### Fase B — Onboarding completo. Opus high
- Compattare CHECKPOINT: DONE → `docs/checkpoints/archive-2026-10.md`. Restano solo fase, stato stabile, open issues e UN NEXT STEP.
- `docs/ARCHITECTURE_KITCHEN.md`, da §5 dell'audit onboarding.
- `/init` guidato: CLAUDE.md Kitchen (~120 righe) + `api/CLAUDE.md` + `supabase/CLAUDE.md`. Niente stato o cronologia dentro.
- Skill: correggere `session-start` (non leggere tutto CHECKPOINT) e `phase-plan` (stato su file, non in memory).
- 🔒 Gate: Eros approva il diff e i commit.

### Fase 1 — HEAD in produzione. Sonnet medium + Eros
- Preflight:
  - build, tutti gli unit test, lint;
  - verifica in sola lettura dello stato remoto della migration grant `20261009130000`;
  - `migration list` remoto = locale.
- 🔒 Gate: **push** del branch.
- 🔒 Gate: **merge in main** senza force (deploy automatico Vercel), oppure deploy manuale.
- Smoke in produzione:
  - lettura: pagina, staff login, TV;
  - **pagamento reale piccolo** con SumUp: lo fa Eros dal telefono, Claude controlla gli esiti.
- Fuori dal flusso: se la grant migration non è applicata, 🔒 gate dedicato per `db push --linked`.

### Fase 2 — Piano "Pagamento app separato". Opus high
- **Fonte principale: il piano originale di Eros.**
  - `docs/KITCHEN_PAYMENT_PLAN_EROS.rtf`: copia identica di `~/Desktop/PIANO KITCHEN.MD`, che in realtà è un RTF.
  - `docs/KITCHEN_PAYMENT_PLAN_EROS.md`: versione testo.
  - Contiene la state machine target a due corsie e le fasi S0→S7 (S0, S0.5, S1 fatti; S2 locale; S3 prossimo; S4 parziale; S5–S7 da fare).
  - Il documento citato `WALBOX_KITCHEN_PAYMENT_HANDOFF_…` non è nel repo (verificato dal report S2).
- Scrivere `docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md`: rende il piano originale eseguibile, con file e test per S3…S7. Non ridecide nulla.
- Decisioni già prese nel piano originale:
  - D1: FAILED → riprova online. Il cliente può passare al banco (`pending_counter_payment`). Abbandonato → `payment_abandoned`. Stato incerto → resta nascosto. Un pagamento tardivo non va perso: recupero dal back-office.
  - D3: la cassa/staff **NON** vede gli ordini online finché il pagamento non è verificato (PAID → `received`).
  - L'ordine nasce lato server **solo dopo** la scelta banco/online (S5). `client_request_id` serve per il doppio tap.
- **Decisioni Eros 2026-10-12** (integrano il piano originale). Principio: **la cassa vede solo ordini puliti** (online già pagati o scelti "al banco"); ogni problema lo risolve il sistema da solo.
  - D2: **5 minuti** senza pagamento → il sistema disattiva il checkout SumUp (logica F2/F3), poi **annulla l'ordine da solo**. La cassa non vede nulla.
  - FAILED: ordine nascosto. Il cliente vede "Riprova" (nuovo attempt, stesso ordine) oppure "Paga al banco" (→ `pending_counter_payment`, ordine normale in cassa). Il timer dei 5 minuti continua.
  - Stato incerto: ordine nascosto, verifica server automatica (webhook/reconcile). PAID → `received`, altrimenti regola dei 5 minuti.
  - Nota tecnica: il cron Vercel attuale è giornaliero (03:00). Per i 5 minuti serve un altro meccanismo (pg_cron/edge function schedulata/altro) da scegliere in Fase 2; se ha un costo, 🔒 chiedere a Eros.
  - D4 (chiusa 2026-10-12): il pagamento dopo l'abbandono **non deve esistere**. Ordine obbligato dell'auto-annullamento:
    1. disattivare il checkout SumUp;
    2. rileggere lo stato da SumUp;
    3. PAID → l'ordine va in `received` (pagato all'ultimo secondo, non è un abbandono);
    4. non pagato → annullamento.
    - Nessun rimborso automatico. Un'anomalia SumUp residua va solo in log back-office per Eros, mai alla cassa.
- Da verificare (non contraddizione bloccante): il piano dice "grant hardening applicato a Production", mentre il report locale della grant migration `20261009130000` dice "non applicata" ed è untracked. Verifica read-only in Fase 1.
- 🔒 Gate: Eros approva il piano eseguibile.

### Fase 3 — Esecuzione S2…S7. Sonnet per l'implementazione, Opus per audit e review
- Una sotto-fase alla volta: audit read-only → implementazione → test (unit + DB locale effimero + E2E locale) → report.
- 🔒 Gate per ogni sotto-fase: commit. 🔒 Gate separati per **db push** e **deploy**.
- Smoke del pagamento reale dopo ogni deploy che tocca i pagamenti.

## Dove interviene Eros (solo questi punti)

1. Approvare i diff e i commit a fine fase.
2. Push, merge/deploy, `db push` in produzione.
3. Decisioni di prodotto: D1–D4 tutte decise (2026-10-12). Solo eventuali nuove.
4. Il pagamento reale di prova dal telefono.

## STATO

- Fase corrente: **Fase B COMMITTATA in locale (2026-10-12): `26ddd71`, `1e6fec9`, `0e94941`, `75e2eb1`. Nessun push.** Fase A e Fase 0 committate in locale (`0f8d864`, `f62f800`…`34516e3`), non pushate.
- Fatto Fase B: CHECKPOINT compattato (117 KB → 56 righe, storico copiato esatto in `docs/checkpoints/archive-2026-10.md`); `CLAUDE.md` Kitchen (163 righe, anchor conservati); nuovi `api/CLAUDE.md`, `supabase/CLAUDE.md`, `docs/ARCHITECTURE_KITCHEN.md`; skill `session-start`, `phase-plan`, più `memory-update` e `context-health-reset` (fuori lista, motivo nel report). Report e commit proposti: `ai-ops/reports/kitchen-fase-b-onboarding-2026-10-12.md`.
- Da sapere: `CLAUDE.md §20` dichiara che SECURITY_POLICY §8-10 (router ai-ops) non governano più l'aggiornamento dello stato. Se Eros non è d'accordo, si toglie la riga.
- Attenzione (invariato): `.env.local` punta alla produzione Supabase; per buildare `VITE_SUPABASE_URL=http://127.0.0.1:54321`. Commento edge function "version 1" vs v3 da correggere.
- Decisioni aperte: nessuna. D1–D4 decise.
- Fase 1 preflight FATTO (2026-10-12), PASS con note:
  - build con override OK; `src/lib` + `api` 151/151 pass; `tests/unit` 4 rossi, tutti già a registro in CHECKPOINT (3 `sumup-payment-reliability`, 1 `analytics-service-night-selector`, test con stringhe/data datate).
  - lint: 129 errori, tutti `no-undef` su `process`/`Buffer` (config eslint per file node), preesistenti.
  - Remoto (MCP lettura): grant `20261009130000` APPLICATA. Locale = remoto, tranne `20261009140000` (S2) solo locale, attesa. Nessun `db push` necessario ora.
  - Locale è 34 commit avanti a origin/main; diff vs main tocca `api/kitchen-sumup-webhook.js` e `send-order-ready-push` (aree protette: si rivedono nel gate push).
- Fase 1 ESEGUITA (2026-10-12): merge commit `0ae5c14` (`-s ours origin/main`, zero modifiche di contenuto; main aveva 10 commit già inclusi in versione più nuova nel branch). Push del branch fatto. `main` portato a `0ae5c14` con fast-forward (era `74e7f88`): deploy Vercel automatico partito. Aggiornamento approvato da Eros.
- 🔴 INCIDENTE (2026-10-12): dopo il deploy, il pagamento SumUp dal telefono mostra "Pagamento con SumUp non disponibile ora" (messaggio generico del client, `useOrderPaymentFlow.js`). Il resto non verificato.
  - Ipotesi NON confermata: `api/kitchen-sumup-create-checkout.js` (S0.5-F5) risponde 503 `checkout_origin_unavailable` se manca `VERCEL_ENV=production` o `VERCEL_PROJECT_PRODUCTION_URL` (variabili di sistema Vercel, richiedono "Automatically expose System Environment Variables"). Il vecchio main non aveva questo controllo.
  - Altre cause possibili: 500 `server_configuration_error` (manca `SUMUP_API_KEY`/`SUMUP_MERCHANT_CODE`/`SUPABASE_SERVICE_ROLE_KEY`), errore RPC `kitchen_payment_attempt_start`.
  - Per confermare: log Vercel di `/api/kitchen-sumup-create-checkout` (Eros ha collegato l'MCP Vercel, da verificare in nuova sessione con `/mcp`). Solo lettura finché Eros non approva.
  - Rollback sicuro a scelta di Eros: Vercel → Deployments → deploy `74e7f88` → Promote to Production.
  - LOG LETTI (2026-10-12, CLI `npx --no-install vercel logs --json`; MCP Vercel dà 403 sullo scope): 3 POST a `/api/kitchen-sumup-create-checkout` sul deploy `dpl_Gib1eYMT5rv4vjrFTvxpVg4mg7Mb`, tutte **401**. Nessun 503/500: l'ipotesi `checkout_origin_unavailable` è **smentita**. `logs[]` vuoto, quindi il corpo (`missing_session` vs `invalid_session`) non si distingue dai log.
  - Cause candidate (non verificate): (a) `missing_session`: il telefono serve ancora il frontend vecchio in cache (senza header Authorization) contro la API nuova; (b) `invalid_session`: `getUser(token)` fallisce, es. `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` di Vercel non sono del progetto `pcrqfdzipotprqtuemso`.
  - AUDIT 2026-10-12 (report `ai-ops/reports/sumup-401-incident-2026-10-12.md`): (b) env ESCLUSA (le API staff sullo stesso deploy, stesso `getUser`, rispondono 200); (c) improbabile (stesso JWT accettato da PostgREST 1 s prima); (a) **causa più probabile**: scheda/PWA aperta da prima del deploy, JS vecchio in memoria senza header Authorization (il service worker non fa cache). Attempt `eb587ada` ha `checkout_claim_at` NULL: nessun checkout SumUp mai partito.

### Piano incidente SumUp 401 (in attesa del via di Eros)

Obiettivo: pagamenti online di nuovo funzionanti, ordine di prova chiuso, controllo automatico dopo ogni deploy.

- **I-1 Conferma causa (nessun codice).** Eros chiude del tutto app/scheda sul telefono (anche dal multitasking), la riapre, nuovo ordine da 1 €, PAGA ONLINE. Atteso: pagina SumUp → causa (a) confermata e niente da fixare lato server; può abbandonare (nessun addebito) o pagare 1 € (soldi reali, sua scelta). Claude verifica in sola lettura log + `kitchen_payments`. Se torna 401 → STOP e nuova diagnosi (c).
- **I-2 Fix 401.** Con (a) confermata: nessuna modifica server. Opzionale (raccomandato, `src/hooks/useOrderPaymentFlow.js`, non protetto): `missing_session`/`invalid_session` → messaggio "App aggiornata: ricarica la pagina e riprova" invece del generico. Vale solo per i client futuri. Commit `fix:` separato.
- **I-3 Sblocco "unknown"** (`api/`, area protetta, commit separato). In `api/kitchen-cancel-with-payment-check.js` e `api/kitchen-staff-sumup-close-for-counter.js`: leggere anche `checkout_claim_at`; se `provider_ref` NULL **e** `checkout_claim_at` NULL **e** List SumUp `not_found` → procedere con l'RPC atomica (cancel / close_unpaid). Tutto il resto invariato e fail-closed (lookup_failed, ambiguous, claim presente). Test prima del codice in `api/kitchen-cancel-with-payment-check.test.js` e `api/kitchen-staff-sumup-close-for-counter.test.js` (casi del report §3). Race residua sub-secondo documentata; chiusura completa via migration insieme a S2.
- **I-4 Ordine di prova** `order-da11d648-…`: dopo il deploy di I-3, ANNULLA dalla UI staff. Nessuna scrittura DB manuale.
- **I-5 Smoke post-deploy** (nuovo file `scripts/post-deploy-smoke.mjs`, approvazione nel piano): contro l'URL di produzione, a costo zero: `GET /`, `/kitchen`, pagine staff e `/kitchen/tv` → 200; bundle JS servito contiene `Authorization` verso `/api/kitchen-sumup-create-checkout`; POST create-checkout senza header → 401 `missing_session`; con token finto → 401 `invalid_session` (mai 500 `server_configuration_error`); stesso schema per cancel/close-for-counter/reconcile. Nessuna scrittura, nessun checkout. Commit `test:` separato.
- File toccati: `src/hooks/useOrderPaymentFlow.js` (I-2), i 2 handler `api/` + 2 test (I-3), `scripts/post-deploy-smoke.mjs` (I-5).
- Test: `node --test api/*.test.js src/lib/*.test.js tests/unit/cancel-with-payment-check.test.mjs`, lint sui file toccati, build con override.
- Gate irreversibili (Eros): prova dal telefono (I-1, eventuali soldi reali), ogni esecuzione dello smoke contro produzione (fetch esterno), commit, push su main = deploy.
- NEEDS_DECISION (non bloccante): attempt con claim vecchia (> 10 min) e List `not_found` vanno sbloccati anche loro? Default: no.

Modello/effort: I-1 e I-3 Opus high (soldi reali) · I-2 e I-5 Sonnet medium.

- I-1 FATTO (2026-10-12, verificato log + DB): dopo chiusura/riapertura app, create-checkout 200 (23:56:19 UTC). Causa (a) CONFERMATA. Ordine `order-8fa10d8f-…` pagato 1 € (webhook 200, charge `succeeded`) e rimborsato: `kitchen-sumup-refund` 200, riga refund `succeeded`, SumUp ref `fe879336-…` (il codice conferma solo dopo 2xx dal `POST /me/refund` di SumUp). Ordine `cancelled`, `payment_status` `refunded`.
- I-4 FATTO di fatto: `order-da11d648-…` ora `cancelled`, attempt `failed` `staff_closed_for_counter` (dalla app nuova era partito un checkout `1a46a981-…`, chiuso al banco con verifica SumUp alle 23:57:11). Nota: il suo `payment_status` resta `pending_counter_payment` su ordine annullato (cosmetico, da valutare).
- Passo 3 COMMITTATO (`885324d`, 2026-10-12, no push).
- PUSH FATTO (2026-10-12, approvato da Eros): branch e `main` `0ae5c14..885324d` fast-forward (Passi 1, 2, 3). Deploy Vercel automatico partito.
- SMOKE POST-DEPLOY PASS (2026-10-12, approvato da Eros): deploy Vercel `dpl_BuE1Hg84…` (`885324d`) READY; `node scripts/post-deploy-smoke.mjs https://walbox-from-zero-v2.vercel.app` → 17/17 PASS (5 pagine 200, bundle `index-BlaCV9xB.js` con Authorization, 6 endpoint 401 `missing_session`, 5 endpoint 401 `invalid_session`, nessun 500).
- Prossimo passo: eventuale prova di pagamento dal telefono (🔒 Eros, soldi reali, facoltativa). Poi: Fase 2.

### Piano post-incidente (approvato da Eros 2026-10-12, ordine deciso)

Obiettivo: un'app vecchia aperta sul telefono non deve più bloccare un pagamento né lasciare ordini appesi.
Regola per ogni passo: audit read-only breve → test prima del codice dove c'è logica → codice → lint file toccati + unit pertinenti + build con override → report in `ai-ops/reports/` → 🔒 Eros approva diff e commit. Push su main = deploy = 🔒 separato.

**Passo 1 — I-6 + I-2 (frontend, nessuna area protetta). Sonnet medium.**
- I-6 "app sempre aggiornata". Fatti verificati: nessun meccanismo di versione oggi; `public/sw.js` esiste solo per Web Push (registrato in `src/hooks/useWebPushSubscription.js`), non fa cache.
  - Approccio previsto (senza toccare Vite né `src/App.jsx`, entrambi protetti): il client confronta lo script del suo bundle (`/assets/index-*.js` caricato) con quello dichiarato in `index.html` scaricato con `cache: 'no-store'`. Diverso = versione nuova.
  - Quando controllare: al ritorno in primo piano della pagina (`visibilitychange`) e **subito prima di avviare un pagamento online** (in `useOrderPaymentFlow.js`).
  - Cosa fare se c'è una versione nuova: prima del pagamento → ricarica e il cliente riprova; altrimenti ricarica solo se non perde nulla. L'audit verifica se il carrello sopravvive a un reload (es. sessionStorage); se non sopravvive → NEEDS_DECISION a Eros su quando ricaricare.
  - File previsti: nuova logica pura in `src/lib/` con `*.test.js` accanto + un piccolo hook in `src/hooks/`, montato nelle pagine cliente (punto esatto deciso dall'audit, mai in `src/App.jsx`). Pagine staff e TV: valutare nell'audit (anche la TV resta aperta per giorni).
- I-2: in `src/hooks/useOrderPaymentFlow.js`, `missing_session`/`invalid_session` → "App aggiornata: ricarica la pagina e riprova" (o ricarica diretta se I-6 lo copre) al posto del messaggio generico.
- Edge case da coprire nei test: fetch di `index.html` fallito/offline (non ricaricare, non bloccare il pagamento); `index.html` senza script riconoscibile (nessuna azione); loop di ricarica (al massimo 1 reload per versione); dev server Vite (nessun hash → controllo disattivato).
- Commit proposti: `feat:` (I-6) e `fix:` (I-2), separati.

> **Passo 1 FATTO in locale (2026-10-12), non committato.** Report `ai-ops/reports/passo1-i6-i2-app-aggiornata-2026-10-12.md`. Lint pulito, 163/163, build OK. 🔒 In attesa: Eros approva diff e 2 commit (`feat` I-6, `fix` I-2). Poi Passo 2.

> **Passo 1 COMMITTATO in locale** (`feat`, `fix`, 2026-10-12, no push).
> **Passo 2 FATTO in locale, non committato:** report `ai-ops/reports/passo2-smoke-post-deploy-2026-10-12.md`. 🔒 Eros: approva commit `test:`; ogni esecuzione contro produzione.
> **Passo 2 COMMITTATO** (`db71ae2`, no push).
> **Passo 3 FATTO in locale, non committato (2026-10-12):** report `ai-ops/reports/passo3-i3-sblocco-unknown-2026-10-12.md`. 205/205 unit, lint solo errori preesistenti, build OK. NEEDS_DECISION claim vecchie: default NO applicato. 🔒 Eros: approva diff + commit `fix:`; poi push su main = deploy (🔒 separato) + smoke.

**Passo 2 — I-5 smoke post-deploy. Sonnet medium.**
- Come scritto sopra in I-5 (`scripts/post-deploy-smoke.mjs`, solo GET e POST senza token o con token finto, nessuna scrittura, nessun checkout).
- Aggiungere il controllo di versione: l'`index.html` servito punta a un bundle che contiene `Authorization` verso create-checkout.
- Scrivere ed eseguire in locale è libero; **ogni esecuzione contro produzione = 🔒 Eros**. Commit `test:`.

**Passo 3 — I-3 sblocco "unknown" (`api/`, area protetta, soldi reali). Opus high.**
- Come scritto sopra in I-3: test prima del codice, condizione a tre controlli (`provider_ref` NULL + `checkout_claim_at` NULL + SumUp List `not_found`), tutto il resto fail-closed.
- NEEDS_DECISION (non bloccante, default no): sbloccare anche le claim vecchie (> 10 min) con `not_found`.
- Commit `fix:` separato; deploy 🔒; dopo il deploy smoke (Passo 2) + eventuale prova di pagamento dal telefono 🔒.

**Dopo il piano:** si riprende la **Fase 2** (piano eseguibile "Pagamento app separato").
Da valutare a parte (cosmetico): `payment_status` `pending_counter_payment` su ordine `cancelled` (`order-da11d648-…`).

Ripartenza: `/clear` → `/model sonnet` + `/effort medium` → "riprendi da ai-ops/current/KITCHEN_RECOVERY_PLAN.md, vai Passo 1".
Modello/effort: Passo 1 e 2 Sonnet medium · Passo 3 Opus high.

Modello/effort: Fase A e Fase 0 Sonnet medium · Fase B e Fase 2 Opus high · Fase 3 Sonnet medium (implementazione) + Opus high (audit e review).
