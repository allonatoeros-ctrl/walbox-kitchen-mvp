# RUN CONTEXT — Verifica come run.js genera context.md e se serve un context pack

## Project state snapshot (CHECKPOINT.md, read-only)

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
  ... (48 righe omesse, vedi CHECKPOINT.md)
- OPEN ISSUES:
  - FABLE_WALBOX_CREATIVE_DIRECTION_PACK (introdotto nel commit `2f06353`): tracked but not active — non è la priorità corrente, non cambia il NEXT STEP finché Eros non lo attiva esplicitamente.
  - Fix "Sposta Su/Giù" in coda staff rimandato (menzionato in commit 553a86e, da verificare stato)
  - Copertura E2E Jukebox parziale: oltre ai 17+4 Playwright Kitchen esistono `smoke.spec.js` e `spotify-search-ui.spec.js` (entry + ricerca/UI Jukebox, 25/25 PASS totali), ma manca ancora E2E reale su approvazione/coda/now-playing con Spotify Premium reale
  - FIX APPLICATO (2026-07-05): `StaffDashboard.jsx` → `handleApprove` ora mostra warning esplicito quando il brano approvato non ha `spotify_uri` (non entrerà mai in coda Spotify automaticamente)
  - S11 Supabase: localStorage writes ancora attivi — deferred per cross-tab sync
  - CHECKPOINT era fermo al 3/7, disallineato dal commit CLAUDE.md f077276 del 4/7 — risolto con questo update (2026-07-05)
- NEXT STEP:
  ai-factory-runner V1.5-B (project profiles) completata (2026-07-07): diff review approvata, golden set A–P 16/16 PASS. Prossimo step: **commit/push V1.5-B**; poi scegliere tra **mini-hardening schema profili** (validazione campi `ai-ops/profiles/*.json`) oppure **tornare a un task reale Walbox/Reality Sprint**. In parallelo restano aperti: completare il report finale S3 con la sezione 11 di `docs/PILOT_NIGHT_CHECKLIST_JUKEBOX.md`, passare a S4, oppure riprendere le modifiche pendenti su CustomerEntry.jsx/CustomerRequest.jsx (attualmente stashed).

## State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP — snapshot sopra, dettaglio completo nel file)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## Known files for this task

Mapping statico keyword -> path noto (ai-ops/runner/context_map.json, no RAG/embedding).

- ai-ops/runner/templates/context_template.md
- ai-ops/runner/run.js
