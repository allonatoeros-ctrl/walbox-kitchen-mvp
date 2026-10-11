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

- Fase corrente: **Fase B FATTA in locale (2026-10-12), in attesa del Gate di Eros (diff + 4 commit). Nessun commit, nessun push.** Fase A e Fase 0 committate in locale (`0f8d864`, `f62f800`…`34516e3`), non pushate.
- Fatto Fase B: CHECKPOINT compattato (117 KB → 56 righe, storico copiato esatto in `docs/checkpoints/archive-2026-10.md`); `CLAUDE.md` Kitchen (163 righe, anchor conservati); nuovi `api/CLAUDE.md`, `supabase/CLAUDE.md`, `docs/ARCHITECTURE_KITCHEN.md`; skill `session-start`, `phase-plan`, più `memory-update` e `context-health-reset` (fuori lista, motivo nel report). Report e commit proposti: `ai-ops/reports/kitchen-fase-b-onboarding-2026-10-12.md`.
- Da sapere: `CLAUDE.md §20` dichiara che SECURITY_POLICY §8-10 (router ai-ops) non governano più l'aggiornamento dello stato. Se Eros non è d'accordo, si toglie la riga.
- Attenzione (invariato): `.env.local` punta alla produzione Supabase; per buildare `VITE_SUPABASE_URL=http://127.0.0.1:54321`. Commento edge function "version 1" vs v3 da correggere.
- Decisioni aperte: nessuna. D1–D4 decise.
- Prossimo passo: Gate di Eros sui 4 commit di Fase B, poi Fase 1 (preflight → gate push).

Modello/effort: Fase A e Fase 0 Sonnet medium · Fase B e Fase 2 Opus high · Fase 3 Sonnet medium (implementazione) + Opus high (audit e review).
