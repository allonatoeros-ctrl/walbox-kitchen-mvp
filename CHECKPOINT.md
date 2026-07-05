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
walbox-dev legge docs/PILOT_NIGHT_CHECKLIST.md + stato attuale Jukebox/Spotify e propone piano di micro-task per arrivare a demo-stabile per la Shuffle Night (fix coda, E2E reali, verifica auto-advance sotto stress).

## RESTART PROMPT
"Walbox — Kitchen stabile e completa (V1-P6). Track attivo: Jukebox/Spotify reale per Shuffle Night (auto-advance, TV sync, ricerca), 39 commit dal 24/6 al 3/7. Prossimo step: walbox-dev fa piano da PILOT_NIGHT_CHECKLIST.md per chiudere fino a demo-stabile."
