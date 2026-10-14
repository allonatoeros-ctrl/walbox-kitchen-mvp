# CLAUDE.md — Walbox Kitchen (regole del repo)

Regole permanenti e mappa del progetto. Qui niente stato né cronologia. I numeri di sezione sono anchor stabili
(li citano skill e policy): non rinumerare.
Ordine di lettura per un task non banale: `CHECKPOINT.md` (stato, NEXT STEP) → questo file →
`ai-ops/knowledge/MEMORY.md` (regole stabili con fonte) → `ai-ops/SECURITY_POLICY.md`.
Ciclo di lavoro, lingua, stile delle risposte, modello/effort e divieto di `rm`: valgono le regole globali di Eros,
qui non si ripetono.

## 0. Purpose

Claude esegue in modo controllato in un'app **in produzione con pagamenti reali**. Un task è fatto solo dopo il
ciclo del §3 e l'approvazione di Eros.

## 0.5. Default Output — Silent First

Report completi **su file** (`ai-ops/reports/<slug>.md`, gitignored), mai in chat. Chat: max 8 righe
(PASS/FAIL · file modificati · comandi/test · report path · approvazione sì/no). Niente output di shell >20 righe
in chat. Meccanica: skill **`silent-report`**.

## 1. Project Identity

- Walbox Kitchen per The Walrus Pub: il cliente ordina e paga dal telefono (QR), lo staff gestisce ordini e
  pagamenti, la TV mostra la cucina.
- Questo branch è **solo Kitchen**. Jukebox, Poster TV e FantaWalrus vivono in altri branch.
- Root operativa: `walbox-kitchen-release`, l'unica cartella operativa. È un repo git normale e locale
  (`.git` è una cartella, nessun worktree) e `node_modules` è una cartella vera, non un symlink. Le vecchie
  cartelle (`walbox-fanta-preview`, `walbox-kitchen-deploy-cb27d56`, `walbox-p1-sync`, `walbox-p2-base`) e i
  backup stanno solo in `~/_ARCHIVIO_WALBOX/` (fase 1 e fase 2 del 2026-10-14): non lavorarci e non
  ripristinare backup, stash o branch nella working copy attiva. Il backup con i pagamenti reali e il dataset
  locale ignorato da Git restano esclusivamente nell'archivio.
- Stack: React 19 + Vite 8 (SPA, JS, niente TypeScript) · funzioni Vercel in `api/` · Supabase (Postgres, RLS,
  Realtime, Auth, Edge Functions) · SumUp · Web Push.
- Produzione: Vercel `walbox-from-zero-v2`, deploy automatico dal branch `main`. Supabase `pcrqfdzipotprqtuemso`.
  MCP Supabase di progetto: solo lettura.
- Architettura completa: `docs/ARCHITECTURE_KITCHEN.md`.

## 2. Roles & Subagenti

Eros = product owner e unico approvatore. Claude Code = esecutore (audit, piani, codice, test, git locale).
Subagent di progetto utili al Kitchen: `walbox-dev` (implementazione), `walbox-hardening` (sicurezza, RLS,
abuso), `walbox-qa-serata` (collaudo come una serata vera), `visual-reviewer` (QA visiva), `walbox-product-owner`
(rotta e scope). `walbox-idea-lab`, `rd-shuffle-night`, `shuffle-night-locale`, `walbox-pitch` servono al track
Jukebox/Shuffle Night, non a questo branch.

## 3. Mandatory Workflow

```
Understand → Read-only Audit → Plan → Gate 1: Eros approva → Act → Build/Test →
Quality Gates → Diff Risk Review → Gate 2: Eros approva
```

Nessuna modifica file prima del Gate 1 (un piano approvato da Eros vale come Gate 1). Se salti uno step, il
task non è fatto.

## 4. Scope Control

Modifica solo i file approvati. Un task = un obiettivo. Vietato senza approvazione: nuovi file, refactor, cleanup,
rinomine, cambi di routing/strutture dati/dipendenze/npm script, feature non richieste. Non nascondere errori
togliendo funzionalità. Mai commit o deploy in automatico.

## 5. Protected Areas

Non toccare senza approvazione esplicita e task dedicato:
**`api/` (pagamenti SumUp, soldi reali) · `supabase/migrations/` · `supabase/functions/` · `vercel.json`
(include il cron) · .env\*/secrets · Supabase (schema, RLS, grant) · Auth · Routing (`src/App.jsx`: `/kitchen/*`) ·
package.json/lock/deps/Vite · config deploy/Vercel · `src/data/kitchenMockData.js`**.
Mai stampare/creare/sovrascrivere secrets. Mai applicare migration o deploy: `db push`, `functions deploy`,
`vercel` sono sempre decisione di Eros. Regole di dettaglio: `api/CLAUDE.md`, `supabase/CLAUDE.md`,
`ai-ops/SECURITY_POLICY.md`.

## 6. Save-Token

Lavora chirurgico: file target, grep mirati, diff piccoli, piani e report brevi. Non leggere l'intero repo né
`docs/checkpoints/` (storico) se non serve.

## 7. Priorità corrente

**Non hardcoded qui:** `CHECKPOINT.md` → `NEXT STEP`. Standing rule: non mescolare strutture dati Kitchen e
Jukebox; nessun bridge Kitchen↔Jukebox senza decisione di Eros.

## 8. UI

Tono Walrus: bold, pub, poster, ironico ma leggibile, non SaaS generico.
**Cliente** = mobile-first (390/430), CTA chiara, nessun login. **Staff** = semplice (stato, coda, azioni), non un
CRM. **TV** (`/kitchen/tv`) = leggibile a distanza. Niente asset con fondo bianco/scacchiera/trasparenza rotta.

## 9. File-Specific Guidance

Mappa: `src/pages/` (pagine cliente e staff), `src/components/kitchen/`, `src/hooks/` (`useKitchen*`), `src/lib/`
(regole pure, client Supabase), `api/` (SumUp, protetto), `supabase/` (protetto), `tests/`. Verifica nel repo
prima di dare per scontato che un file esista. Legacy da non riattivare: `ai-ops/runner/` (router fermo da luglio); i vecchi file root `00_*`–`05_*` sono in `docs/archive/`.
Logica di business pura → `src/lib/` con test accanto (`*.test.js`).

## 10-11. Comandi

| Comando | Rischio |
|---|---|
| `npm run lint` · `npm run preview` | sicuro |
| `node --test tests/unit/*.test.mjs` · `node --test src/lib/*.test.js api/_lib/*.test.js` | sicuro (rete mockata) |
| `node --test supabase/migrations/<ts>*.test.js` | sicuro (assert sul testo SQL) |
| `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build` / `npm run dev` | scrive `dist/`; senza override il guard blocca se `.env.local` punta alla produzione |
| `npm run test:e2e` | dev server con bypass auth; alcune spec non mockano la rete |
| `npx playwright test -c playwright.fsec2.config.js` | **account reali**: chiede conferma |
| `scripts/e2e-real-supabase-local.sh` (skill `e2e-real-local`) | Docker/OrbStack, DB solo locale |
| `npm run pilot:check` · `node scripts/kitchen-sumup-reconcile-sweep.mjs` | **live**: chiedere a Eros |
| `npx supabase migration list --linked` | lettura remota |
| `npx supabase db push --linked` · `functions deploy` · `vercel` · push su `main` | **gate di Eros** |
| `npm install` | gate: modifica `node_modules` locale (e lock/deps, area protetta §5) |

`npm test` non esiste. Ricetta di verifica minima: lint + unit pertinenti + build con override. Allowlist completa:
`ai-ops/SECURITY_POLICY.md §7`. Mai senza approvazione: `git add/commit/push`, `git reset/restore`,
`npm install/update`, `rm/mv`, `curl`, `sudo`, `vercel deploy`.

## 12. Stop Conditions

Fermati se: serve un'area protetta, il diff include file non richiesti, il build rompe fuori scope, un micro-fix
diventa refactor, non puoi verificare il risultato, le istruzioni sono in conflitto, o manca il Gate 1. Formato:
`STOP CONDITION / Reason / Files / Risk / Recommended next step / Approval needed`.

## 13. Quality Gates

Prima di dire "fatto": scope, aree protette, minimalità, build/test, sicurezza, rischi residui. Skill
**`quality-gate-verifier`**.

## 14. Diff Risk Review

Dopo ogni modifica: diff file per file (perché, cosa, in scope, rischio, edit inattesi). Skill
**`diff-risk-reviewer`**.

## 15. Final Report Format

Report finale in italiano: Obiettivo, File letti/modificati, Modifiche, Comandi, Quality Gates, Diff Risk Review,
Rischi residui, Cosa approva Eros, CHECKPOINT aggiornato sì/no. Template: skill **`silent-report`**. Mai solo
"Done": sempre evidenze.

## 16-17. Commit & Restore

Mai committare senza approvazione. Proponi `git add <file>` + `git commit -m "..."`: un gruppo logico per commit,
prefisso `feat`/`fix`/`docs`/`test`/`chore` + descrizione in italiano. Mai `git add -A`. Esclusioni: vedi
`ai-ops/knowledge/MEMORY.md §3`. Per annullare: `git restore <file singolo>`, mai `git restore .`.

## 18. Ambiguità

Chiedi solo se la risposta è bloccante; altrimenti assunzione sicura dichiarata. Le decisioni di prodotto sono di
Eros: segnale `NEEDS_DECISION`.

## 19. Large Requests

Richieste ampie ("fixa tutto", "rifai Kitchen"): non iniziare a codare. Spezza in micro-task sicuri e proponi
fase 1 + file + aree protette + approvazione.

## 20. Stato e documenti

`CHECKPOINT.md` = solo stato corrente, un NEXT STEP; lo storico va in `docs/checkpoints/`. Lavoro multi-fase:
file di stato in `ai-ops/current/`. Regole stabili: `ai-ops/knowledge/MEMORY.md`. Le §8-10 di
`ai-ops/SECURITY_POLICY.md` erano per il router ai-ops: per aggiornare lo stato valgono le regole globali.

## 21. Final Principle

Passi controllati, approvati e verificabili. Il progetto vince restando stabile e sotto controllo.

## 22. Repeated Test-Failure Escalation

Se la **stessa classe di errore** persiste dopo **2 tentativi autonomi**: fermati, classifica il failure e
delega a un subagent se la causa non è deterministica. Non aspettare un sollecito di Eros.
