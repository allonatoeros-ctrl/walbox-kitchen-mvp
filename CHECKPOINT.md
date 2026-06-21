# CHECKPOINT — Walbox
Aggiornato: 2026-06-21
Fase: Supabase V1 — S10d hotfix committato. Menu cliente anonimo funzionante. Prossimo: S11 o nuova feature.

---

## DONE
- S1→S5: setup client, schema, auth anonima, dual-write ordine, staff login (tutti committati)
- S6 (dashboard): RLS is_staff_for_venue() + policy 6 tabelle — APPLICATA e verificata ✅
- S7b (commit 508eda7): SELECT kitchen_orders+items da Supabase per staff — fallback localStorage
- S8b (commit 6981f12): UPDATE fire-and-forget su 4 funzioni (updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote)
- S9b: INSERT kitchen_action_log fire-and-forget — action log per updateOrderStatus, confirmPayment, cancelOrder
- S9b-fix (commit 4e96d0e): metadata ?? {} — kitchen_action_log.metadata è NOT NULL
- S10b+c (commit 5ba8b42): useKitchenMenu.js — SELECT + upsert kitchen_menu_availability
- S10d hotfix (commit c8dac05): rimosso guard is_anonymous dal SELECT — menu leggibile da clienti anonimi ✅
- S10d SQL: policy RLS anon_select_menu_availability (SELECT TO anon WHERE venue_id='walrus-main') ✅
- QA manuale PASS cross-session: staff disattiva item-001 → incognito /kitchen refresh → sparisce ✅

## STABLE — non toccare senza approvazione
- src/hooks/useKitchenOrders.js — dual-write+reads+updates Supabase, localStorage primary
- src/hooks/useKitchenMenu.js — SELECT aperto ad anon, upsert protetto da is_anonymous guard
- src/lib/supabaseClient.js — client Supabase
- src/lib/supabaseAuth.js — signInWithEmail, signOut, getStaffSession
- src/pages/KitchenLogin.jsx — form login staff
- src/pages/KitchenStaffDashboard.jsx — 5 tab, auth guard, badge
- src/pages/CustomerKitchenMenu.jsx — flusso ordine cliente
- src/pages/CustomerOrderStatus.jsx — timeline ordine
- tests/e2e/customer-kitchen-flow.spec.js — 17 test QA

## DO NOT TOUCH
- useCustomerSession.js — condiviso jukebox+kitchen, non toccare
- src/data/kitchenMockData.js — dati demo stabili
- .env / .env.local / package.json — sempre protetti
- Jukebox / Poster TV — non toccare

## SUPABASE V1 STATUS
| Fase | Stato |
|---|---|
| S1–S5 | ✅ committati |
| S6 — RLS reale staff | ✅ applicata su dashboard |
| S7b — reads Supabase staff | ✅ commit 508eda7 |
| S8b — writes Supabase staff | ✅ commit 6981f12 |
| S9b — actionLog INSERT | ✅ committato |
| S9b-fix — metadata NOT NULL | ✅ commit 4e96d0e |
| S10b+c — menu availability | ✅ commit 5ba8b42 |
| S10d — anon read + RLS policy | ✅ commit c8dac05 + SQL dashboard |
| S11 — cleanup localStorage writes | ⏳ dopo verifica cross-device stabile |

## OPEN ISSUES
- orderCode collision risk: Date.now() % 900 — mitigabile con DB unique constraint
- E2E bypass VITE_E2E_BYPASS_STAFF_AUTH=true attivo solo con Playwright server
- S11: localStorage writes ancora attivi (cleanup dipende da verifica cross-device stabile)

## NEXT STEP
S11 — cleanup localStorage writes (solo dopo verifica cross-device stabile su produzione).
Oppure: nuova feature Kitchen o Jukebox/Poster — a scelta Eros.

## RESTART PROMPT
Walbox Kitchen — Supabase V1 quasi completo. S1→S10d committati e validati.
Menu cliente funziona in incognito (anon RLS policy applicata su dashboard). QA manuale PASS cross-session.
S11 cleanup localStorage pianificato ma non urgente. Prossima decisione: S11 o nuova feature.
