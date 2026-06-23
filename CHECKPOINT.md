# CHECKPOINT — Walbox
Aggiornato: 2026-06-23
Fase: V1-P6 completata. Build PASS. Playwright 17/17 PASS.

---

## DONE
- S1→S10d: Supabase dual-write, RLS, auth staff, menu sync — tutti committati ✅
- CL (Cleanup Sprint): root pulita, App.jsx namespaced, StoricoView KPI, Playwright 22/22 ✅
- **V1-Competitive-Gap (2026-06-22):**
  - P2: Badge allergeni visibili nelle card menu cliente (CustomerKitchenMenu.jsx)
  - P3: Date demo dinamiche (minutesAgo) + ordini delivered/cancelled aggiunti a kitchenMockData
  - P4: generateOrderCode() a bassa collisione (base36 + timestamp)
  - P5: Overlay "ESAURITO" + bottone disabilitato per item available:false
  - E2E fix: playwright.config.js porta 5174 dedicata, reuseExistingServer:false → 21/21 PASS
- **V1-P6 — Flusso banco/ritiro esplicito (2026-06-23):**
  - KitchenOrdersView: rimossa action `ready→delivered` — cucina NON chiude più gli ordini, finisce a `ready`
  - CounterOrdersView: unico owner del ritiro (`RITIRATO ✓` → `delivered`)
  - CustomerOrderStatus: label `delivered` → `RITIRATO AL BANCO` in tutta la timeline
  - CustomerOrderStatus: bottom bar condizionale — quando `isReady` mostra `IL TUO ORDINE È PRONTO — VAI AL BANCO ORA` (verde)
  - CustomerKitchenMenu: confirm screen step 4 `CONSEGNATO` → `PRONTO AL BANCO`
  - File toccati: KitchenOrdersView.jsx, CustomerOrderStatus.jsx, CustomerKitchenMenu.jsx (solo stringhe + -1 action)
  - Playwright 17/17 PASS, build PASS

## STABLE — non toccare senza approvazione
- src/hooks/useKitchenOrders.js — dual-write Supabase+localStorage
- src/hooks/useKitchenMenu.js — SELECT aperto anon, upsert protetto
- src/lib/supabaseClient.js / supabaseAuth.js
- src/pages/KitchenStaffDashboard.jsx — 5 tab, auth guard, bypass E2E corretto
- src/pages/CustomerKitchenMenu.jsx — flusso ordine + allergeni + sold-out
- src/pages/CustomerOrderStatus.jsx
- tests/e2e/customer-kitchen-flow.spec.js — 17 test
- tests/e2e/kitchen-service-pressure.spec.js — 4 test
- playwright.config.js — porta 5174, reuseExistingServer:false

## DO NOT TOUCH
- useCustomerSession.js — condiviso jukebox+kitchen
- .env / .env.local / package.json — sempre protetti
- Jukebox / Poster TV — fuori scope Kitchen
- App.jsx — routing protetto

## SUPABASE V1 STATUS
| Fase | Stato |
|---|---|
| S1–S10d | ✅ tutti committati e validati |
| S11 — cleanup localStorage writes | ⏳ deferred (fallback ancora necessario) |

## OPEN ISSUES
- package.json e .claude/skills/phase-plan/SKILL.md modificati non committati (fuori scope feature, da valutare)
- Warning chunk size >500kB in build (pre-esistente, non bloccante)
- S11: localStorage writes ancora attivi — deferred per cross-tab sync

## NEXT STEP
Commit V1-P6 (3 file approvati), poi scegliere uno dei tre sprint candidati:
- **Sprint Q1 — Demo polish**: notifica visiva "pronto" più aggressiva lato cliente (vibrazione + banner fullscreen), CTA Jukebox bridge rimossa quando ready (non pertinente)
- **Sprint Q2 — Supabase S11**: rimuovere localStorage writes residui, sync realtime puro
- **Sprint Q3 — Staging deploy**: Vercel preview branch, smoke test su mobile reale

## RESTART PROMPT
"Walbox — V1-P6 completata (flusso banco/ritiro): cucina finisce a ready, bancone unico owner di delivered, cliente vede CTA verde quando pronto. Playwright 17/17 PASS, build PASS. File caldi: KitchenOrdersView.jsx, CustomerOrderStatus.jsx, CustomerKitchenMenu.jsx. Prossimo sprint candidato: demo polish notifica ready, Supabase S11, o staging deploy."
