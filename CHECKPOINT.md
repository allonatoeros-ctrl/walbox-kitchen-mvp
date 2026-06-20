# CHECKPOINT — Walbox
Aggiornato: 2026-06-20 (sessione R2→R4)
Fase: Kitchen Staff OS — R3 e R4 completate, non committate

---

## DONE
- UX-8a→d: 5 tab (BANCONE/CUCINA/MENU/STORICO/ALERT) in KitchenStaffDashboard ✓
- R1 ✓ committed — summary aggregati StoricoView (count/totale/media)
- R2 ✓ committed — orderCode W40/W41/W43 verificati nei mock
- R3 ✓ non committata — actionLog[] in useKitchenOrders + chip timeline in StoricoView
- R4 ✓ non committata — timer 30s dashboard, badge MENU tab, "appena pronto" in CounterOrdersView

## STABLE — non toccare senza approvazione
- AlertView.jsx — urgency (10/15 min) + allergen detection funzionanti
- KitchenOrdersView.jsx — cucina cards e transizioni stato
- MenuView.jsx — toggle disponibilità
- CustomerOrderStatus.jsx — timeline cliente real-time
- CustomerKitchenMenu.jsx — menu + cart + upsell
- kitchenMockData.js — orderCode corretti, non riaprire
- Jukebox / Poster TV — non toccare

## DO NOT TOUCH
- App.jsx — routing protetto
- Supabase / Spotify / .env / package.json — sempre protetti
- src/pages/LiveTvScreenWalrusPoster.jsx — Poster stabile

## OPEN ISSUES
- 4 file modificati non ancora committati: useKitchenOrders.js, StoricoView.jsx, KitchenStaffDashboard.jsx, CounterOrdersView.jsx
- actionLog non retroattivo su ordini già in localStorage (by design, accettabile)
- R5 (PIN gate staff) non approvata — decidere prima del servizio reale

## NEXT STEP
Commit bundle R3+R4: git add 4 file + commit "Add action log and QA polish to kitchen staff OS"

## RESTART PROMPT
"Walbox Kitchen — R3+R4 completate, non committate.
File caldi: useKitchenOrders.js, StoricoView.jsx, KitchenStaffDashboard.jsx, CounterOrdersView.jsx.
Prossimo step: commit bundle, poi decidere R5 (PIN gate staff, opzionale)."
