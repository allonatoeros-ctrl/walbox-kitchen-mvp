# CHECKPOINT — Walbox
Aggiornato: 2026-07-05
Fase: Jukebox/Spotify reale in corso (post V1-P6 Kitchen). Preparazione Shuffle Night.

---

## DONE
- **Kitchen (completato 2026-06-23, invariato da allora):** S1→S10d Supabase, Cleanup Sprint, V1-Competitive-Gap, V1-P6 flusso banco/ritiro. Playwright 17/17 PASS, build PASS.
- **Jukebox/Spotify reale (2026-06-24 → 2026-07-03, 39 commit):**
  - Auto-avanzamento coda basato su playback Spotify reale (fine naturale canzone, non solo skip manuale)
  - Fix mismatch progress TV durante auto-advance
  - Setup OAuth Spotify locale documentato
  - Skip to next helper per staff
  - Restore staff Spotify native queue flow
  - TV mostra now-playing reale da Spotify (non più mock)
  - Miglior reattività azioni staff dashboard
  - Subagent Claude Code per workflow prodotto (walbox-hardening, walbox-idea-lab, walbox-product-owner) + doc ricerca Shuffle Night
  - Implemented, but not yet verified with real E2E/QA flow — see OPEN ISSUES.
- CLAUDE.md aligned to current-state source of truth + agent routing — commit f077276, 2026-07-04.
- **QA serata walbox-qa-serata (2026-07-05): PASS WITH RISKS.** Flusso QR→richiesta→staff→coda verificato in locale con 2 client concorrenti su Supabase reale, nessun bug bloccante sul percorso principale. Non verificato: add-to-queue/now-playing con account Spotify Premium reale e device fisico. Bug trovato e fixato lo stesso giorno: approvazione di un brano senza `spotify_uri` (fallback MOCK_SONGS) non avvisava lo staff — vedi OPEN ISSUES per il fix.
- **ai-factory-runner V1 (2026-07-05):** primo router locale della AI Factory in `ai-ops/runner/` (Node ESM, zero dipendenze). Genera ticket/run log in `ai-ops/tickets/` con classificazione keyword, risk level, routing, scope, security reminders e prompt Claude Code pronto. Demo PASS con task `"Verifica TV Poster sync"`. V1 non esegue Claude, non chiama API, non modifica codice app e resta manuale nell'esecuzione.
- **Push su origin/main completato (2026-07-05):** 12 commit pendenti pushati con successo (`778e55e..ba55992`) dopo push readiness audit (PUSH OK WITH RISKS) e micro-patch pre-push (build PASS, rename file Fable, nota checkpoint stabilizzata). Branch `main` allineato a `origin/main`, working tree clean.
- **ai-factory-runner V1.1 (2026-07-05):** aggiunta lettura read-only di `CHECKPOINT.md` con snapshot sintetico (`STABLE` / `DONE` / `OPEN ISSUES` / `NEXT STEP`) incluso in ogni ticket generato nella nuova sezione 3. Zero scritture su `CHECKPOINT.md`, fallback sicuro se il file manca. Demo PASS su task nuovo e su `"Verifica TV Poster sync"`; retrocompatibile con V1.
- **Shuffle Night Jukebox pilot checklist S1 (2026-07-05):** creato `docs/PILOT_NIGHT_CHECKLIST_JUKEBOX.md` come checklist go/no-go dedicata a Jukebox / Shuffle Night. Copre QR cliente, richiesta brano, Staff Dashboard, Spotify reale, TV Poster, Supabase realtime, fallback staff, test manuale venue e template report finale. Commit locale `7a65193`.
- **Fix TV Poster preview/takeover bloccata dopo cambio traccia (2026-07-05):** risolta causa root in `LiveTvScreenWalrusPoster.jsx`: l'effect del takeover dipendeva da `currentRequest`, riferimento instabile con update Supabase Realtime, cancellando il timer di ritorno alla live screen. Patch con `currentRequestRef` e dipendenza solo da `remotePlayback?.spotify_track_uri`. `npm run build` PASS. Confermato manualmente da Eros.
- **ai-factory-runner V1.2-F (2026-07-05):** chiusi i 3 fix residui post-audit: `--dry-run` implementato senza scrittura ticket, precedenza executor corretta (`coding` / `coding-plan` / `design` vince su `qa` quando entrambe presenti), README e `task_classifier_rules.md` riallineati. Golden set esteso a 6 casi; nuovo Caso F conferma routing `coding+qa → walbox-dev`; 0 regressioni sui 5 casi precedenti. Commit locale `ebcc2c4`.
- **ai-factory-runner V1.3 (2026-07-05, commit `f39a2e7`):** aggiunti i campi `recommended_skill` + `prompt_mode` al ticket (nuova funzione pura `recommendSkillAndMode` in `run.js`, cascata a 11 regole: trigger lessicali diff/context/approval, poi condizioni su rischio/categorie/docRole/confidence). Puramente additivo: classificazione V1.2 (categorie/rischio/executor/confidence) invariata. Golden set esteso da 6 a 13 casi (A–M), 13/13 PASS in `--dry-run`. Template e doc (`README.md`, `task_classifier_rules.md`) allineati. Nota operativa: durante l'implementazione si sono verificati due revert esterni dei file del runner (probabile buffer editor stale in VS Code/Antigravity che sovrascriveva il disco al salvataggio) — riapplicati e riverificati prima del commit. Rischio risolto per questo round, ma da tenere a mente: prima di ogni futuro commit su questi file, ricontrollare `git diff --stat` subito prima di `git add`.
- **ai-factory-runner V1.4-A (completata 2026-07-06, committata localmente in `9e5496b`, non ancora pushata):** aggiunto `resolvePromptTemplate()` in `ai-ops/runner/run.js`. Il prompt Claude ora può essere scelto in base a `prompt_mode` (cerca `templates/prompts/claude_prompt_<mode>.md`), con fallback totale a `claude_prompt_template.md` se il template specifico non esiste. Nessun template per-modo ancora creato: output identico a V1.3 in assenza di template specifici. 13/13 golden case PASS in `--dry-run`. Prossimo step: V1.4-B, creare solo `claude_prompt_micro_fix.md` e `claude_prompt_phase_plan.md`.
- **ai-factory-runner V1.4-B (completata 2026-07-06, committata localmente in `9e5496b`, non ancora pushata):** creata la directory `ai-ops/runner/templates/prompts/` con i primi 2 template per-modo: `claude_prompt_micro_fix.md` e `claude_prompt_phase_plan.md`. `micro_fix_prompt` e `phase_plan_prompt` ora usano il template specifico; `checkpoint_prompt`, `handoff_prompt`, `review_prompt`, `approval_prompt` restano sul fallback base. 13/13 golden case PASS in `--dry-run`, zero regressioni sui metadata. Prossimo step: V1.4-C, creare i 4 template rimanenti e poi allineare README/rules.
- **ai-factory-runner V1.4-C1 (completata 2026-07-06, committata localmente in `9e5496b`, non ancora pushata):** creati `claude_prompt_review.md` e `claude_prompt_checkpoint.md` in `ai-ops/runner/templates/prompts/`. `review_prompt` e `checkpoint_prompt` ora usano il template specifico; `approval_prompt` e `handoff_prompt` restano sul fallback base. 13/13 golden case PASS in `--dry-run`, zero regressioni sui metadata. Prossimo step: V1.4-C2, creare `claude_prompt_approval.md` e `claude_prompt_handoff.md`.
- **ai-factory-runner V1.4-C2 (completata 2026-07-06, committata localmente in `9e5496b`, non ancora pushata):** creati `claude_prompt_approval.md` e `claude_prompt_handoff.md`. Tutti e 6 i `prompt_mode` ora hanno template specifico (micro_fix, phase_plan, review, checkpoint, approval, handoff) — nessun fallback base residuo nel golden set. 13/13 golden case PASS in `--dry-run`, zero regressioni sui metadata. V1.4 completa lato implementazione/template. Prossimo step: V1.4-C3, allineare `README.md` e `task_classifier_rules.md`.
- **ai-factory-runner V1.4-C3 (completata 2026-07-06, committata localmente in `9e5496b`, non ancora pushata):** allineati `ai-ops/runner/README.md` e `ai-ops/runner/rules/task_classifier_rules.md`. README aggiornato con sezione V1.4 (mapping dei 6 template e "quando si usa"), rimossa la nota obsoleta sul prompt unico; `task_classifier_rules.md` aggiornato con colonna `prompt_template` nel golden set e nuova sezione mapping — nessun valore golden modificato. 13/13 golden case PASS in `--dry-run`. V1.4 completa: resolver + 6 template + documentazione allineata. Prossimo step: review finale V1.4 e commit selettivo.

## STABLE — non toccare senza approvazione
- **Checkpoint locale salvato (2026-07-05): commit `2f06353` "chore: save ai-ops factory and walbox visual updates"** — contiene ai-ops AI Factory alignment, SECURITY_POLICY.md, reports/knowledge placeholders, modifiche visual/app Walbox, FABLE_WALBOX_CREATIVE_DIRECTION_PACK. Non pushato (vedi OPEN ISSUES).
- src/hooks/useKitchenOrders.js, useKitchenMenu.js — dual-write Supabase+localStorage
- src/lib/supabaseClient.js / supabaseAuth.js
- src/pages/KitchenStaffDashboard.jsx, CustomerKitchenMenu.jsx, CustomerOrderStatus.jsx
- tests/e2e/customer-kitchen-flow.spec.js (17), kitchen-service-pressure.spec.js (4)
- playwright.config.js — porta 5174, reuseExistingServer:false

## DO NOT TOUCH
- useCustomerSession.js — condiviso jukebox+kitchen
- .env / .env.local / package.json — sempre protetti
- App.jsx — routing protetto
- Kitchen (dashboard, hooks, e2e sopra) — stabile, fuori scope track Jukebox attuale

## OPEN ISSUES
- FABLE_WALBOX_CREATIVE_DIRECTION_PACK (introdotto nel commit `2f06353`): tracked but not active — non è la priorità corrente, non cambia il NEXT STEP finché Eros non lo attiva esplicitamente.
- Fix "Sposta Su/Giù" in coda staff rimandato (menzionato in commit 553a86e, da verificare stato)
- Copertura E2E Jukebox parziale: oltre ai 17+4 Playwright Kitchen esistono `smoke.spec.js` e `spotify-search-ui.spec.js` (entry + ricerca/UI Jukebox, 25/25 PASS totali), ma manca ancora E2E reale su approvazione/coda/now-playing con Spotify Premium reale
- FIX APPLICATO (2026-07-05): `StaffDashboard.jsx` → `handleApprove` ora mostra warning esplicito quando il brano approvato non ha `spotify_uri` (non entrerà mai in coda Spotify automaticamente)
- S11 Supabase: localStorage writes ancora attivi — deferred per cross-tab sync
- CHECKPOINT era fermo al 3/7, disallineato dal commit CLAUDE.md f077276 del 4/7 — risolto con questo update (2026-07-05)

## REFERENCES
- Sub-agent routing: see CLAUDE.md section 2. Shuffle Night cascade: see feedback_shuffle_night_pipeline.md.
- Kitchen-era memories are archived; see MEMORY.md. Do not use them for the active Jukebox/Shuffle Night track.

## NEXT STEP
ai-factory-runner V1.4 (A→C3) completa e committata localmente in `9e5496b` (2026-07-06), non ancora pushata — resolver + 6 template + documentazione allineata, 13/13 golden case PASS. Prossimo micro-step runner: decidere se pushare `9e5496b` su origin/main. In parallelo restano aperti: completare il report finale S3 con la sezione 11 di `docs/PILOT_NIGHT_CHECKLIST_JUKEBOX.md`, passare a S4, oppure riprendere le modifiche pendenti su CustomerEntry.jsx/CustomerRequest.jsx.

## RESTART PROMPT
"Walbox — Kitchen stabile e completa (V1-P6). Track attivo: Jukebox/Spotify reale per Shuffle Night (auto-advance, TV sync, ricerca), 39 commit dal 24/6 al 3/7. Prossimo step: walbox-dev fa piano da PILOT_NIGHT_CHECKLIST.md per chiudere fino a demo-stabile."
