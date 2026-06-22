# CHECKPOINT — Walbox
Aggiornato: 2026-06-22 18:30
Fase: V1-Competitive-Gap P1→P5 completate + E2E fix. Build PASS. Playwright 21/21 PASS.

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
Commit finale V1-P2→P5 + E2E fix (se non già fatto), poi Supabase V1 S11 o staging deploy.

## RESTART PROMPT
"Walbox — V1-Competitive-Gap completata (P2 allergeni, P3 demo dates, P4 orderCode, P5 sold-out, E2E fix porta 5174). Playwright 21/21 PASS, build PASS. Prossimo: commit pulizia package.json/SKILL.md oppure Supabase S11. File caldi: CustomerKitchenMenu.jsx, kitchenMockData.js, playwright.config.js."
