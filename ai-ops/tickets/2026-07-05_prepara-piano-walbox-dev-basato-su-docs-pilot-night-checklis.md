# AI FACTORY RUN — Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md per Shuffle Night

## 1. Raw task

Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md per Shuffle Night

## 2. Generated metadata

- Date: 2026-07-05
- Slug: prepara-piano-walbox-dev-basato-su-docs-pilot-night-checklis
- Categories: docs
- Matched keywords: docs: docs
- Risk level: low

- Recommended executor: ChatGPT research/product/review
- Requires approval: yes (Gate 1 comunque, run atteso read-only)

## 3. Project state snapshot from CHECKPOINT.md

Snapshot sintetico, letto in read-only da CHECKPOINT.md (max 6 righe per sezione).
Fonte completa e autorevole: CHECKPOINT.md nella root del repo.

- STABLE:
  - **Checkpoint locale salvato (2026-07-05): commit `2f06353` "chore: save ai-ops factory and walbox visual updates"** — contiene ai-ops AI Factory alignment, SECURITY_POLICY.md, reports/knowledge placeholders, modifiche visual/app Walbox, FABLE_WALBOX_CREATIVE_DIRECTION_PACK. Non pushato (vedi OPEN ISSUES).
  - src/hooks/useKitchenOrders.js, useKitchenMenu.js — dual-write Supabase+localStorage
  - src/lib/supabaseClient.js / supabaseAuth.js
  - src/pages/KitchenStaffDashboard.jsx, CustomerKitchenMenu.jsx, CustomerOrderStatus.jsx
  - tests/e2e/customer-kitchen-flow.spec.js (17), kitchen-service-pressure.spec.js (4)
  - playwright.config.js — porta 5174, reuseExistingServer:false
- DONE:
  - **Kitchen (completato 2026-06-23, invariato da allora):** S1→S10d Supabase, Cleanup Sprint, V1-Competitive-Gap, V1-P6 flusso banco/ritiro. Playwright 17/17 PASS, build PASS.
  - **Jukebox/Spotify reale (2026-06-24 → 2026-07-03, 39 commit):**
  - Auto-avanzamento coda basato su playback Spotify reale (fine naturale canzone, non solo skip manuale)
  - Fix mismatch progress TV durante auto-advance
  - Setup OAuth Spotify locale documentato
  - Skip to next helper per staff
  ... (10 righe omesse, vedi CHECKPOINT.md)
- OPEN ISSUES:
  - FABLE_WALBOX_CREATIVE_DIRECTION_PACK (introdotto nel commit `2f06353`): tracked but not active — non è la priorità corrente, non cambia il NEXT STEP finché Eros non lo attiva esplicitamente.
  - Fix "Sposta Su/Giù" in coda staff rimandato (menzionato in commit 553a86e, da verificare stato)
  - Copertura E2E Jukebox parziale: oltre ai 17+4 Playwright Kitchen esistono `smoke.spec.js` e `spotify-search-ui.spec.js` (entry + ricerca/UI Jukebox, 25/25 PASS totali), ma manca ancora E2E reale su approvazione/coda/now-playing con Spotify Premium reale
  - FIX APPLICATO (2026-07-05): `StaffDashboard.jsx` → `handleApprove` ora mostra warning esplicito quando il brano approvato non ha `spotify_uri` (non entrerà mai in coda Spotify automaticamente)
  - S11 Supabase: localStorage writes ancora attivi — deferred per cross-tab sync
  - CHECKPOINT era fermo al 3/7, disallineato dal commit CLAUDE.md f077276 del 4/7 — risolto con questo update (2026-07-05)
- NEXT STEP:
  walbox-dev legge docs/PILOT_NIGHT_CHECKLIST.md + stato attuale Jukebox/Spotify e propone piano di micro-task per arrivare a demo-stabile per la Shuffle Night (fix coda, E2E reali, verifica auto-advance sotto stress).

## 4. State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP — snapshot in sezione 3, dettaglio completo nel file)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## 5. Routing decision

Task di ricerca/prodotto/documentazione → strategia e framing al GPT Operator, vedi CLAUDE.md §2.

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 6. Recommended scope

Allowed files/dirs:
- ai-ops/ (ticket, report, knowledge)
- docs/ solo se esplicitamente approvato nel plan

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- codice app (src/)

## 7. Security reminders

Da ai-ops/SECURITY_POLICY.md (fonte completa lì, qui solo il richiamo operativo):

- Read-only di default (regola 1)
- Write solo su scope approvato da Eros al Gate 1 (regola 2)
- No git push automatico (regola 3)
- No deploy automatico (regola 4)
- No database write automatico (regola 5)
- No lettura/modifica env e secrets (regola 6)
- CHECKPOINT.md solo come patch suggerita (regola 8)
- Massimo una execution pass per run (regola 9)
- Stop obbligatorio dopo il final report (regola 10)

## 8. Quality gate

- git diff --stat ai-ops/   # run docs/ai-ops only
- git status --short ai-ops/   # include file nuovi non tracciati

## 9. Claude Code prompt

```text
Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

TASK:
Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md per Shuffle Night

CLASSIFICAZIONE (dal runner V1, da confermare): docs · rischio low

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)
- ai-ops/SECURITY_POLICY.md (regole 1-10)

WORKFLOW OBBLIGATORIO (CLAUDE.md §3):
Understand → Read-only Audit → Plan → Approvazione Eros (Gate 1) → Act → Build/Test → Quality Gates → Diff Risk Review → Approvazione finale Eros (Gate 2).
Non modificare nulla prima del Gate 1.

SCOPE CONSENTITO:
- ai-ops/ (ticket, report, knowledge)
- docs/ solo se esplicitamente approvato nel plan

SCOPE VIETATO:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

SECURITY REMINDERS (SECURITY_POLICY.md):
- Read-only di default; write solo su scope approvato al Gate 1
- No git push automatico, no deploy automatico, no database write automatico
- No lettura/modifica env e secrets
- CHECKPOINT.md solo come patch suggerita nel report finale
- Massimo una execution pass in questo run; stop dopo il final report

QUALITY GATE PER QUESTO RUN:
- git diff --stat ai-ops/   # run docs/ai-ops only
- git status --short ai-ops/   # include file nuovi non tracciati

FINAL REPORT:
Usa il formato REPORT FINALE di CLAUDE.md §15 (in italiano), inclusa la voce
"CHECKPOINT.md da aggiornare: sì/no" con eventuale patch suggerita.
```

## 10. Checkpoint decision

- CHECKPOINT.md da aggiornare: no / maybe / yes → **da valutare a fine run**
- Solo patch suggerita nel final report, mai update automatico (SECURITY_POLICY.md regola 8).

## 11. Next step

1. Eros legge questo ticket e corregge classificazione/scope se il classificatore V1 ha sbagliato.
2. Eros approva (Gate 1) o scarta il run.
3. Se approvato: copiare il prompt della sezione 9 nell'esecutore consigliato.
4. A fine run: quality gate (sez. 8), diff risk review, Gate 2 prima di ogni commit.
