# CHECKPOINT — Walbox
Aggiornato: 2026-06-21
Fase: Supabase V1 completo (S1→S10d). Audit Kitchen TV screen completato. Prossimo: Phase 1 KitchenTvScreen.jsx.

---

## DONE
- S1→S5: setup client, schema, auth anonima, dual-write ordine, staff login (tutti committati)
- S6: RLS is_staff_for_venue() + policy 6 tabelle — APPLICATA e verificata ✅
- S7b (commit 508eda7): SELECT kitchen_orders+items da Supabase per staff — fallback localStorage
- S8b (commit 6981f12): UPDATE fire-and-forget su 4 funzioni
- S9b+fix (commit 4e96d0e): INSERT kitchen_action_log, metadata ?? {} NOT NULL
- S10b+c (commit 5ba8b42): useKitchenMenu.js — SELECT + upsert kitchen_menu_availability
- S10d hotfix (commit c8dac05): anon read menu abilitato — RLS policy + guard rimosso ✅
- QA manuale PASS cross-session: staff disattiva item → incognito refresh → sparisce ✅
- AUDIT Kitchen TV (2026-06-21): data shape confermata, status values mappati, piano 3 fasi pronto

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
- App.jsx — routing Kitchen TV da aggiungere solo in Phase 3 dopo approvazione

## SUPABASE V1 STATUS
| Fase | Stato |
|---|---|
| S1–S10d | ✅ tutti committati e validati |
| S11 — cleanup localStorage writes | ⏳ dopo verifica cross-device stabile |

## KITCHEN TV SCREEN — Piano Approvazione Pendente
- Nuovi file: `src/pages/KitchenTvScreen.jsx` + `KitchenTvScreen.css`
- Hook: `useKitchenOrders` (read-only — solo `orders`, nessuna mutazione)
- Status da mostrare: `received`, `preparing`, `ready`
- Phase 1: struttura JSX + filtro ordini
- Phase 2: CSS desktop/TV-first + colori per status
- Phase 3: route `/kitchen/tv` in App.jsx (solo dopo approvazione)

## OPEN ISSUES
- orderCode collision risk: Date.now() % 900 — mitigabile con DB unique constraint
- S11: localStorage writes ancora attivi (cleanup dipende da verifica cross-device)
- Kitchen TV sync cross-device: richiede Supabase Realtime subscription (fuori scope Phase 1)

## NEXT STEP
Eros approva piano Kitchen TV → Phase 1: creare `src/pages/KitchenTvScreen.jsx` con struttura JSX + filtro ordini attivi.

## RESTART PROMPT
Walbox Kitchen TV — audit dati completato. Data shape confermata: useKitchenOrders espone orders con orderCode/nickname/table/items/status.
Piano 3 fasi pronto (Phase 1: JSX, Phase 2: CSS TV-first, Phase 3: routing App.jsx).
Prossimo step: approvazione Eros → Phase 1 KitchenTvScreen.jsx. File caldo: src/hooks/useKitchenOrders.js.
