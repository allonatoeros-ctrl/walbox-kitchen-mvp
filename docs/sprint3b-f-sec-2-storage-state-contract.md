# F-SEC-2 — Storage State Contract (Kitchen staff guard)

Fonte: `ai-ops/reports/kitchen-staff-auth-stable-gate-audit.md` (2026-09-09, VERDICT
READY_TO_STANDARDIZE). Questo doc fissa il contratto operativo per far girare la suite F-SEC-2
(`tests/e2e/f-sec-2-kitchen-guard.spec.js`) in modo deterministico, senza mai mettere credenziali
o sessioni nel repo.

## Account canonico

- **`staff87`** — account staff di test esistente (creato 2026-07-27), riga in
  `kitchen_staff_members` per `venue_id='walrus-main'`, `role='staff'`. Email confermata, non
  anonimo, non bannato, già usato per login in passato.
- Nessun nuovo utente va creato per questo harness. Se `staff87` viene invalidato/ruotato, il
  nuovo account deve rispettare gli stessi requisiti (vedi `ACCOUNT_TEST_REQUIREMENTS`
  nell'audit citato sopra).
- Password/credenziali `staff87`: vivono solo nel secret manager del team / nella testa di chi
  esegue il login manuale. Mai in git, mai in log, mai in chat.

## Due harness separati, non intercambiabili

- `playwright.config.js` (suite principale, `npm run test:e2e`): inietta
  `VITE_E2E_BYPASS_STAFF_AUTH=true` e **esclude** `f-sec-2-kitchen-guard.spec.js` via
  `testIgnore`. Non esegue mai il guard reale — per design, non è il suo scopo.
- `playwright.fsec2.config.js`: **unico harness F-SEC-2**, nessun bypass auth, `testMatch`
  limitato allo stesso spec file. Porta dedicata (5194) per non collidere con un dev server
  già in esecuzione sotto il config principale (5174).

Esecuzione dedicata:

```bash
npx playwright test --config=playwright.fsec2.config.js
```

## Come generare `FSEC2_STORAGE_STATE` (locale, senza password nel repo)

`FSEC2_STORAGE_STATE` è una variabile d'ambiente che punta a un file JSON di storageState
Playwright (sessione Supabase salvata: cookie + localStorage), letto da
`tests/e2e/f-sec-2-kitchen-guard.spec.js`. Il file **non va mai committato**.

1. Avvia il dev server target della suite F-SEC-2 (porta 5194, stessa del config):
   ```bash
   npm run dev -- --host 127.0.0.1 --port 5194
   ```
2. In un terminale separato, apri un browser Playwright interattivo con salvataggio dello
   storageState puntato alla cartella locale ignorata da git:
   ```bash
   npx playwright codegen --save-storage=tests/e2e/.auth/staff87.json http://127.0.0.1:5194/kitchen/login
   ```
3. Nel browser che si apre, fai login **manualmente** con le credenziali reali di `staff87`
   (mai digitate in comandi shell, mai salvate in file di testo). Verifica di atterrare su
   `/kitchen/solo` con `SOLO SERVICE MODE` visibile.
4. Chiudi il browser: Playwright scrive lo storageState (sessione, non la password) in
   `tests/e2e/.auth/staff87.json`. Questo path è in `.gitignore` — resta locale.
5. Esegui la suite F-SEC-2 puntando l'env var al file appena creato:
   ```bash
   FSEC2_STORAGE_STATE="$(pwd)/tests/e2e/.auth/staff87.json" \
     npx playwright test --config=playwright.fsec2.config.js
   ```

Lo storageState va rigenerato (ripetendo i passi sopra) solo quando scade o viene invalidato
(es. logout globale, rotazione password) — non richiede un nuovo audit ogni volta.

## Comportamento senza `FSEC2_STORAGE_STATE`

Per design (fail-closed, nessuna auth reale richiesta in sandbox/CI senza credenziali):

- **T1** e **P1** (guard anonimo, nessuna sessione) girano sempre, con o senza
  `FSEC2_STORAGE_STATE` — verificano il fail-closed di base.
- **T2**, **T3**, **T4** (richiedono una sessione, staff o non-staff) fanno
  `test.skip(!STORAGE_STATE, '<motivo esplicito>')` quando l'env var è assente o vuota: risultato
  Playwright `skipped`, motivo visibile nel report (`list` reporter), mai un falso PASS né un
  errore silenzioso.

Non serve modificare lo spec per rendere questo comportamento esplicito: il messaggio di skip è
già descrittivo (`storageState staff non fornito (FSEC2_STORAGE_STATE)` /
`storageState non-staff non fornito (FSEC2_STORAGE_STATE)`).

## Regola operativa

Un risultato F-SEC-2 è significativo solo se letto dal config giusto:

- Suite principale verde con T1/P1 **assenti** (esclusi via `testIgnore`) → normale, non è un
  falso positivo.
- Suite F-SEC-2 dedicata: T1/P1 devono essere PASS sempre; T2/T3/T4 sono PASS con
  `FSEC2_STORAGE_STATE` valido, `skipped` (motivo esplicito) senza — mai un fallimento silenzioso
  o un PASS senza aver eseguito nulla.
