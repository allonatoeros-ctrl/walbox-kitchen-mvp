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

## STABLE — non toccare senza approvazione
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
- Fix "Sposta Su/Giù" in coda staff rimandato (menzionato in commit 553a86e, da verificare stato)
- Nessun test E2E reale sul flusso Jukebox/Spotify (i 17+4 Playwright coprono solo Kitchen)
- S11 Supabase: localStorage writes ancora attivi — deferred per cross-tab sync
- CHECKPOINT era fermo al 3/7, disallineato dal commit CLAUDE.md f077276 del 4/7 — risolto con questo update (2026-07-05)

## REFERENCES
- Sub-agent routing: see CLAUDE.md section 2. Shuffle Night cascade: see feedback_shuffle_night_pipeline.md.
- Kitchen-era memories are archived; see MEMORY.md. Do not use them for the active Jukebox/Shuffle Night track.

## NEXT STEP
walbox-dev legge docs/PILOT_NIGHT_CHECKLIST.md + stato attuale Jukebox/Spotify e propone piano di micro-task per arrivare a demo-stabile per la Shuffle Night (fix coda, E2E reali, verifica auto-advance sotto stress).

## RESTART PROMPT
"Walbox — Kitchen stabile e completa (V1-P6). Track attivo: Jukebox/Spotify reale per Shuffle Night (auto-advance, TV sync, ricerca), 39 commit dal 24/6 al 3/7. Prossimo step: walbox-dev fa piano da PILOT_NIGHT_CHECKLIST.md per chiudere fino a demo-stabile."
