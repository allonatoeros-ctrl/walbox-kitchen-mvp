# Food Club V1 — RESUME (punto di ripresa)

## Git
- Branch: `feat/food-club-v1` (locale, NON pushato). Base: `origin/docs/food-club-pwa` (6d8c2e2) + merge `origin/main` (595f639).
- Commit Food Club (dal più vecchio): b81d5c5 F1/F2 DB · ddde640 F3/F5/F7 DB · 12517e3 strato dati client · a22ee7e PWA ·
  e851ea4 pagine cliente · 2fdd791 staff + rotte · 19407d3 menu/sacco/stato ordine · (commit docs finale).

## File principali
- Migration (NON applicate): `supabase/migrations/20261105100000_food_club_v1_schema.sql`, `…101000_food_club_v1_order_payment.sql`,
  `…102000_food_club_v1_identity_api.sql`, `…103000_food_club_v1_staff_analytics.sql` (+ `20261105100000_…schema.test.js`).
- Edge Function (mai deployata): `supabase/functions/send-food-club-push/` · runbook `RUNBOOK-push-food-club.md`.
- Client: `src/lib/foodClub*.js`, `installInvite.js`, `pwaInstall.js`, `spaNavigate.js`; `src/hooks/useFoodClub*.js`, `useInstallState.js`;
  `src/pages/FoodClubPage.jsx`, `FoodClubStaffPage.jsx`; `src/components/foodclub/*`.
- Modificati: `App.jsx`, `main.jsx`, `useKitchenOrders.js` (v4 + ricarica al cambio uid), `useWebPushSubscription.js` (riclaim, scope club),
  `CustomerKitchenMenu.jsx`, `CustomerCheckout.jsx`, `CustomerOrderStatus.jsx`, `NotificationOptIn.jsx`, `KitchenSoloService.jsx/.css`,
  `KitchenPrivacy.jsx`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, test f6 start_url.
- Test DB: `tests/db/` (shim, runner, scenari SQL, concorrenza).

## Comandi per riprendere (cloud o Mac)
```
# Postgres locale di test (cloud): cluster in /var/lib/postgresql/fcpg, porta 54329
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/fcpg -o '-p 54329 -k /tmp' -l /var/lib/postgresql/fcpg.log start"
PGHOST=/tmp PGPORT=54329 tests/db/apply-migrations.sh          # rifiuta host non locali
node --test tests/db/*.test.mjs                                  # 44 scenari SQL + 4 concorrenza
node --test src/lib/foodClubRules.test.js src/lib/installInvite.test.js tests/unit/food-club-pwa-assets.test.mjs supabase/functions/send-food-club-push/logic.test.js
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_FOOD_CLUB_ENABLED=true npm run build
```
Sul Mac (Docker/OrbStack): stack Supabase locale + skill `e2e-real-local` per provare migration, RLS e OTP di test veri.

## Prossimo task prioritario
Revisione 2026-11-04 fatta (`REVIEW-2026-11-04.md`, §"cosa manca" nel report). Ordine:
1. Gate Eros: adottare `proposed/20261105104000_food_club_v1_review_fixes.sql` (P1 doppio uso buono) + decisioni D-3/D-5/D-14/D-2/D-13.
2. Sul Mac: `WITH_FIXES=1 docs/food-club/implementation/proposed/harness/run-local-review.sh` + Edge Function in locale.
3. Produzione (gate): "Confirm phone" ON + provider SMS, poi migration, poi deploy Edge Function/cron, poi prova su telefono (I-7).
