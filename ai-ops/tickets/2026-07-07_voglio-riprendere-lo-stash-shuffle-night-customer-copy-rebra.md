# AI FACTORY RUN — Voglio riprendere lo stash Shuffle Night customer copy rebrand, ma prima voglio solo un piano read-only per capire cosa contiene, che rischio ha e come riprenderlo senza rompere il Runner o Walbox.

## 1. Raw task

Voglio riprendere lo stash Shuffle Night customer copy rebrand, ma prima voglio solo un piano read-only per capire cosa contiene, che rischio ha e come riprenderlo senza rompere il Runner o Walbox.

## 2. Generated metadata

- Date: 2026-07-07
- Slug: voglio-riprendere-lo-stash-shuffle-night-customer-copy-rebra
- Categories: product, coding-plan, qa
- Matched keywords: product: shuffle night · coding-plan: piano · qa: shuffle night
- Risk level: medium
- categoria "qa" → medium
- Recommended executor: walbox-dev
- Confidence: medium
- Recommended skill: /phase-plan
- Prompt mode: phase_plan_prompt
- Skill/mode reason: Piano esplicito o coding multi-segnale/incerto → spezzare in micro-fasi con /phase-plan (cascata V1.3 regola 8).
- Warnings:
  - segnali misti: più categorie rilevate insieme (product, coding-plan, qa) — verificare che il classificatore non abbia sovrastimato
  - dominio qa misto app+tooling: verificare a mano l'executor nel ticket

- Requires approval: yes

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
  ... (29 righe omesse, vedi CHECKPOINT.md)
- OPEN ISSUES:
  - FABLE_WALBOX_CREATIVE_DIRECTION_PACK (introdotto nel commit `2f06353`): tracked but not active — non è la priorità corrente, non cambia il NEXT STEP finché Eros non lo attiva esplicitamente.
  - Fix "Sposta Su/Giù" in coda staff rimandato (menzionato in commit 553a86e, da verificare stato)
  - Copertura E2E Jukebox parziale: oltre ai 17+4 Playwright Kitchen esistono `smoke.spec.js` e `spotify-search-ui.spec.js` (entry + ricerca/UI Jukebox, 25/25 PASS totali), ma manca ancora E2E reale su approvazione/coda/now-playing con Spotify Premium reale
  - FIX APPLICATO (2026-07-05): `StaffDashboard.jsx` → `handleApprove` ora mostra warning esplicito quando il brano approvato non ha `spotify_uri` (non entrerà mai in coda Spotify automaticamente)
  - S11 Supabase: localStorage writes ancora attivi — deferred per cross-tab sync
  - CHECKPOINT era fermo al 3/7, disallineato dal commit CLAUDE.md f077276 del 4/7 — risolto con questo update (2026-07-05)
- NEXT STEP:
  ai-factory-runner V1.4.1 completata e pushata su origin/main (2026-07-07): commit `9ff6c0f`/`bc67c6a`/`081c8ec` (A/B/C) allineati con origin, working tree pulito, stash customer/visual intatto. V1.4.1 chiusa. Prossimo step: **progettare V1.5** del Runner (via `/phase-plan`, no implementazione diretta). In parallelo restano aperti: completare il report finale S3 con la sezione 11 di `docs/PILOT_NIGHT_CHECKLIST_JUKEBOX.md`, passare a S4, oppure riprendere le modifiche pendenti su CustomerEntry.jsx/CustomerRequest.jsx (attualmente stashed).

## 4. State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP — snapshot in sezione 3, dettaglio completo nel file)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## 5. Routing decision

Task di implementazione/piano/visual sul repo → agente walbox-dev (o Antigravity se visual-browser, vedi CLAUDE.md §2), sempre dopo Gate 1. Vince su qa quando entrambe le categorie sono presenti nello stesso task (V1.2-F).

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 6. Recommended scope

Allowed files/dirs:
- ai-ops/ (ticket, report, knowledge)
- docs/ solo se esplicitamente approvato nel plan
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- codice app (src/)
- refactor non richiesti, file non elencati nel Plan
- modifiche al codice di prodotto (i fix passano da un ticket separato)

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
- npm run build   # solo se il run tocca davvero codice app
- git diff --stat   # verificare che compaiano SOLO i file approvati
- test pertinenti con scope dichiarato (es. npx playwright test <spec in scope>)
- nessuna scrittura su codice di prodotto: git status deve restare pulito su src/

## 9. Claude Code prompt

```text
Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: piano a fasi (prompt_mode = phase_plan_prompt)

TASK:
Voglio riprendere lo stash Shuffle Night customer copy rebrand, ma prima voglio solo un piano read-only per capire cosa contiene, che rischio ha e come riprenderlo senza rompere il Runner o Walbox.

CLASSIFICAZIONE (dal runner, da confermare): product, coding-plan, qa · rischio medium

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)

QUESTO RUN È SOLO PIANIFICAZIONE, NON IMPLEMENTAZIONE:
- Se disponibile, usa la skill `/phase-plan`; altrimenti produci un piano
  equivalente seguendo la stessa struttura (audit → micro-fasi → rischi →
  approvazione).
- Fai solo audit in lettura: nessuna modifica a nessun file.
- Non creare ticket in ai-ops/tickets/.
- Non fare commit, non fare push, non installare pacchetti.

IL PIANO DEVE CONTENERE:
- Micro-fasi numerate (es. A, B, C...), ciascuna con un obiettivo chiaro e
  minimo, preferibilmente un file per fase.
- Per ogni fase: file coinvolti (da modificare vs. solo da leggere).
- Rischi specifici per fase (non generici).
- Quality gate per fase (cosa verificare prima di considerarla chiusa).
- Una sezione esplicita "Cosa NON toccare" per fase o per l'intero piano.

SCOPE CONSENTITO (per l'audit di questo run):
- ai-ops/ (ticket, report, knowledge)
- docs/ solo se esplicitamente approvato nel plan
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

SCOPE VIETATO:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

QUALITY GATE PER QUESTO RUN (audit/piano, non implementazione):
- git diff --stat ai-ops/   # run docs/ai-ops only
- git status --short ai-ops/   # include file nuovi non tracciati
- npm run build   # solo se il run tocca davvero codice app
- git diff --stat   # verificare che compaiano SOLO i file approvati
- test pertinenti con scope dichiarato (es. npx playwright test <spec in scope>)
- nessuna scrittura su codice di prodotto: git status deve restare pulito su src/

CHIUSURA OBBLIGATORIA:
Termina il piano chiedendo esplicitamente l'approvazione di Eros prima di
implementare qualsiasi fase. Non procedere all'implementazione in questo
run, nemmeno per la prima micro-fase.

Non fare commit. Non fare push. Stop dopo aver presentato il piano.
```

## 10. Checkpoint decision

- CHECKPOINT.md da aggiornare: no / maybe / yes → **da valutare a fine run**
- Solo patch suggerita nel final report, mai update automatico (SECURITY_POLICY.md regola 8).

## 11. Next step

1. Eros legge questo ticket e corregge classificazione/scope se il classificatore V1 ha sbagliato.
2. Eros approva (Gate 1) o scarta il run.
3. Se approvato: copiare il prompt della sezione 9 nell'esecutore consigliato.
4. A fine run: quality gate (sez. 8), diff risk review, Gate 2 prima di ogni commit.
