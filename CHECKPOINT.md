# CHECKPOINT — Walbox Kitchen
Aggiornato: 2026-10-12 (compattazione Fase B). Storico completo fino a oggi: `docs/checkpoints/archive-2026-10.md`.

Regole di questo file: solo stato corrente. Niente cronologia (va nell'archivio), niente regole stabili
(vanno in `ai-ops/knowledge/MEMORY.md`), un solo NEXT STEP. Lavoro in corso multi-fase: il file di stato
indicato nel NEXT STEP (oggi `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`).

## FASE
- Kitchen Recovery (piano `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`): riordino linea, onboarding, poi
  "Pagamento app separato" (S2…S7).
- Branch `kitchen-clean-baseline-v2-phase-a` (worktree `walbox-kitchen-release`): linea Kitchen più completa.
  Commit locali di Fase A, Fase 0 e Fase B **non pushati**.
- Produzione (Vercel, branch `main` = `origin/main` `74e7f88`): frontend/API **senza** S0.5 F1–F7, F6 Web Push
  frontend, Storico UX del 10/10. `origin/main` non ha nulla che HEAD non abbia (audit 2026-10-12).
- DB produzione `pcrqfdzipotprqtuemso`: migration F1 applicata (2026-10-09). Grant `20261009130000`: stato remoto
  da verificare. S2 `20261009140000`: **non applicata**.

## DONE
Lo storico è in `docs/checkpoints/archive-2026-10.md`. Qui al massimo 5 voci recenti, una riga ciascuna;
oltre, si spostano in archivio.
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
**Fase 2 del piano `ai-ops/current/KITCHEN_RECOVERY_PLAN.md`:** Eros approva `docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md`
(piano eseguibile S3→S7), poi Fase 3 = S3 (RPC e state machine DB). Fase 1 e incidente SumUp 401: chiusi (stato nel
file del piano).
