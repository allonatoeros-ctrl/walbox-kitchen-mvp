# CHECKPOINT — Walbox Kitchen
Aggiornato: 2026-10-14 (working copy unica, vecchie cartelle in archivio; prima: checkout V2 in produzione 2026-10-13). Storico completo fino a oggi: `docs/checkpoints/archive-2026-10.md`.

Regole di questo file: solo stato corrente. Niente cronologia (va nell'archivio), niente regole stabili
(vanno in `ai-ops/knowledge/MEMORY.md`), un solo NEXT STEP. Lavoro in corso multi-fase: il file di stato
indicato nel NEXT STEP (oggi `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`).

## FASE
- Kitchen Recovery (piano `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`): riordino linea, onboarding, poi
  "Pagamento app separato" (S2…S7).
- **Working copy (2026-10-14):** `walbox-kitchen-release` è l'unica cartella operativa, repo git normale e
  locale (nessun worktree, `node_modules` vero). Branch `feat/anniversario-15-anni`, HEAD `7ac6878` =
  `origin/feat/anniversario-15-anni`, status pulito. Le vecchie cartelle (`walbox-fanta-preview`,
  `walbox-kitchen-deploy-cb27d56`, `walbox-p1-sync`, `walbox-p2-base`) e i backup stanno solo in
  `~/_ARCHIVIO_WALBOX/2026-10-14_phase1/` e `…_phase2/`; il backup con i pagamenti reali e il dataset locale
  ignorato da Git non vanno ripristinati nella working copia attiva. Nulla è stato cancellato definitivamente.
  Verifica: `src/lib` + `api/_lib` = 173 PASS, 1 SKIP atteso (test opzionale che dipende dal dataset locale
  ignorato da Git), 0 FAIL; build PASS.
- `main` pushato fino a `661df75` (2026-10-13), dichiarato allora HEAD = `origin/main`.
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
- **RPC EXECUTE grants:** `anon` aveva EXECUTE su `kitchen_promo_pass_redeem_for_order`,
  `kitchen_payment_attempt_start`, `kitchen_payment_confirm` (rilevato 2026-10-09; le funzioni hanno guardie
  interne, gravità non determinata). La migration `20261009130000` è committata in locale; stato remoto da
  verificare in sola lettura (Fase 1).
- **S2 Migration A** (`20261009140000`, stati `pending_online_payment`/`payment_abandoned`, `client_request_id`):
  committata in locale, non applicata. Apply = gate di Eros.
- **F6 Web Push:** prova reale su telefono mai fatta; chiavi VAPID su Vercel dichiarate da Eros, non verificate.
  Il commento della edge function dice "version 1", il remoto era v3: da correggere.
- **Ambiente locale:** `.env.local` punta alla produzione Supabase; il guard di `vite.config.js` blocca dev/build.
  Per buildare: `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build`.
- **Test rossi preesistenti:** `tests/unit/sumup-payment-reliability.test.mjs` (3) e
  `tests/unit/kitchen-analytics-service-night-selector.test.mjs` (1, data fissa). Riconfermati il 2026-10-14
  sulla working copy finale: `tests/unit` = 344 pass, 4 fail (non dovuti allo spostamento delle cartelle). E2E non rieseguiti dopo Fase 0
  (al 2026-09-22 c'erano 16 fail preesistenti non correlati).
- **Da vedere a video:** Storico UX del 2026-10-10 (chip pagamento, filtro, annullati barrati).
- Cassa `recentPayments` usa i 30 pagamenti più recenti globali: può perdere attempt ancora rilevanti (follow-up).
- Storico: possibile limite 1000 righe PostgREST su periodi molto ampi (noto, non risolto).
- F-SEC-2: T2–T4 saltati finché non esiste lo storage state reale di `staff87`
  (`docs/sprint3b-f-sec-2-storage-state-contract.md`).
- Beer Sprint V1 Fase F (analytics) rimandata per decisione di Eros. Le decisioni prodotto aperte il 2026-09-14
  (formato Krombacher, pairing, foto birre) non sono state riconfermate: vedi archivio.

## NEXT STEP
Completare la pulizia Git dei branch locali/remoti obsoleti, senza toccare main o produzione.
