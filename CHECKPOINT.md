# CHECKPOINT — Walbox Kitchen
Aggiornato: 2026-10-31. Storico completo fino a oggi: `docs/checkpoints/archive-2026-10.md`.

**ORA (31/10):** produzione (`main` = `eb96ee7`, deploy Vercel success) = restyling (PR #6), DB solo Kitchen (#7),
prezzi di prima 19/20/20 e Pulled Pork sul panino (#8, #9), **PR #10 mergiata 31/10**: font self-hosted, retention privacy
(job 31/10 succeeded), log SumUp puliti, header sicurezza (CSP Report-Only), pagina `/kitchen/privacy` con dati titolare
(Ci.Na. S.n.c. di Nanni Marco & C., P.IVA 07521420963, Via Monte Grappa 5/7 Melegnano, thewalrus.melegnano@gmail.com: da
Virgilio/Pagine Gialle, nessuna visura → farli confermare al gestore), avvisi alcol/allergeni, disattiva notifiche, blocklist.
Verificato online: privacy ok, header attivi, 0 richieste Google. **Non provato:** un ordine reale completo col checkout nuovo.
**PR #11 mergiata 31/10** (`main` = `e304139`, deploy Vercel success): allergeni Box Pulled Pork uguali al panino, verificati.
Non visto a video sul telefono. **PR #12 mergiata 31/10** (`main` = `6485cbe`, deploy Vercel success, verificato online: 0 "+" su Garpez/Box): branch `fix/aggiungi-garpez-box` (da `origin/main`,
worktree `scratchpad/aggiungi` della sessione da0fa721): Garpez e Box senza "+", con barra "AGGIUNGI PANINO · 15 €" /
"AGGIUNGI BOX · 11,50 €"; solo `PesiMassimiSection.jsx`; lint/build ok, verificato a 390 (aggiunta al sacco ok).
Worktree `scratchpad/allergeni` della sessione 31/10: rimovibile.
`feat/restyling-hero` locale è superato: non pusharlo. Worktree `rilascio` in scratchpad: rimovibile (`git worktree remove`, decide Eros).
NEXT STEP: smoke di un ordine reale al banco in serata (checkout con avviso alcol). Le sezioni sotto sono in parte vecchie. Il branch `feat/restyling-hero` locale è superato: non pusharlo. Le sezioni sotto sono in parte vecchie.

Regole di questo file: solo stato corrente. Niente cronologia (va nell'archivio), niente regole stabili
(vanno in `ai-ops/knowledge/MEMORY.md`), un solo NEXT STEP. Lavoro in corso multi-fase: il file di stato
indicato nel NEXT STEP (oggi `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`).

## FASE
- Kitchen Recovery (piano `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`): riordino linea, onboarding, poi
  "Pagamento app separato" (S2…S7).
- **Working copy (2026-10-24):** `walbox-kitchen-release` è l'unica cartella operativa (repo git normale).
  Branch `feat/restyling-menu`, creato da `origin/main` = `f5bfd74` (verificato 2026-10-24), non pushato.
  `.claude/settings.json` (hook guard), `.claude/hooks/`, `.claude/launch.json` e `ai-ops/current/RESTYLING_MENU.md`
  sono non committati (scelta di Eros: `.claude/*` fuori dai commit).
- **Festa 15 anni passata (16/10):** modalità evento spenta in `main` (`f5bfd74`), Garpez resta nel menu PESI MASSIMI;
  tab EVENTO nella cassa. Migration catalogo `item-059` (Garpez) `c000295` in `main`: stato remoto non verificato.
- **Non in `main`:** il branch `feat/anniversario-15-anni` ha 2 commit locali non pushati e la pulizia repo Phase 4
  (`b084970`, `56245b1`, `2af89fb`, `2810688`, `3c034a6`: codice morto, asset non usati, docs legacy, README, ESLint).
  Decisione di Eros su push/merge: aperta.
- Il resto di questa sezione (Kitchen Recovery, checkout V2, DB) è dello stato del 2026-10-13, non riverificato.
- **Checkout V2 in produzione dal 2026-10-13** (merge `d1fe37e` di `claude/customer-experience-v2`):
  nome, dove lo mangi, note cucina e corsia di pagamento su una schermata sola, al posto del flusso a tre
  passaggi; rimosso il codice promo dal carrello. Collaudo con baseline in
  `ai-ops/reports/anniversario-fase0-collaudo-v2.md`. **Smoke post-deploy a video: da fare.**
- Produzione (Vercel, branch `main` = `9417066`): include fix incidente SumUp 401, S3, S4 (endpoint paga al banco,
  inerte finché S5 non crea ordini POP) e S6 (API sweep `kitchen-online-abandon-sweep`, 10 Vercel Functions).
  Smoke post-deploy PASS 21/21.
- DB produzione `pcrqfdzipotprqtuemso`: migration F1 applicata (2026-10-09). Grant `20261009130000`: stato remoto
  da verificare. S2 `20261009140000` + S3 `20261012100000`: **applicate** (db push 2026-10-12).
  S6 cron `20261012120000`: **applicata** (db push 2026-10-12); job `kitchen-online-abandon-sweep` (ogni minuto) e
  `kitchen-cron-history-retention` attivi; 5 tick `succeeded`, 0 HTTP (nessun ordine scaduto).

## DONE
Lo storico è in `docs/checkpoints/archive-2026-10.md`. Qui al massimo 5 voci recenti, una riga ciascuna;
oltre, si spostano in archivio.
- 2026-10-12 — S6 chiusura automatica a 5 min: 5 commit (`f0737ce`…`9417066`), secret Vercel+Vault, deploy, db push cron.
- 2026-10-12 — Fase A (protezioni) + Fase 0 (9 commit atomici) + Fase B (onboarding: CLAUDE.md, architettura,
  CHECKPOINT compattato, skill). Dettaglio nel file di stato del piano.

## STABLE — in produzione e verificato (non toccare senza approvazione)
- Kitchen live dal 2026-09-18: menu cliente, ordine, pagamento al banco e online SumUp, `/kitchen/status`.
- `/kitchen/solo` è l'unica UI staff; `/kitchen/staff` è solo redirect; `/kitchen/cassa` ordine assistito.
- Payment recovery: PASSA AL BANCO (`online_payment_disabled`), RIMBORSA → verifica → ANNULLA. Chiusi in locale reale
  il 2026-09-23.
- Storico V1 (2026-09-22). F6 Web Push backend: edge function `send-order-ready-push` attiva (v3 al 2026-09-24).
- Migration: si applicano solo con `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md §5.1`).

## OPEN ISSUES
- **Verificato in sola lettura 31/10:** migration remote = locali fino a `20261030160000` (compresi grant
  `20261009130000`, S2 `20261009140000`, Garpez `20261016100000`). `anon` non ha più EXECUTE sulle 3 RPC di
  pagamento. Garpez `item-059` presente in DB a 15 €, uguale al catalogo frontend.
- **F6 Web Push:** prova reale su telefono mai fatta; chiavi VAPID su Vercel dichiarate da Eros, non verificate.
  Il commento della edge function dice "version 1", il remoto era v3: da correggere.
- **Ambiente locale:** `.env.local` punta alla produzione Supabase; il guard di `vite.config.js` blocca dev/build.
  Per buildare: `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build`.
- **Test rossi preesistenti:** `tests/unit/sumup-payment-reliability.test.mjs` (3) e
  `tests/unit/kitchen-analytics-service-night-selector.test.mjs` (1, data fissa). E2E non rieseguiti dopo Fase 0
  (al 2026-09-22 c'erano 16 fail preesistenti non correlati).
- **Da vedere a video:** Storico UX del 2026-10-10 (chip pagamento, filtro, annullati barrati).
- Cassa `recentPayments` usa i 30 pagamenti più recenti globali: può perdere attempt ancora rilevanti (follow-up).
- Storico: possibile limite 1000 righe PostgREST su periodi molto ampi (noto, non risolto).
- F-SEC-2: T2–T4 saltati finché non esiste lo storage state reale di `staff87`
  (`docs/sprint3b-f-sec-2-storage-state-contract.md`).
- Beer Sprint V1 Fase F (analytics) rimandata per decisione di Eros. Le decisioni prodotto aperte il 2026-09-14
  (formato Krombacher, pairing, foto birre) non sono state riconfermate: vedi archivio.

## NEXT STEP
**Merge della PR #6 (`feat/restyling-hero` → `main`) = deploy produzione, decide Eros.** Branch pushato e allineato
(2026-10-30), 59 commit avanti a `main`. Prima: guardare la Preview Vercel (env Preview con DB/pagamenti reali: non
pagare) e far controllare al cuoco `ai-ops/reports/allergeni-bozza.md`. **Prima del merge: db push delle 2 migration
della PR #6** (menu ottobre, ritiro con orario), poi merge subito; dopo, congela non-Kitchen (`ai-ops/current/DB_PULIZIA.md`). Stato dettagliato (blocco `## ORA`):
`ai-ops/current/RESTYLING_HERO.md`.
