# Architettura — Walbox Kitchen

Com'è fatto il Kitchen, ricavato dal codice (audit onboarding 2026-10-12 §5, liste verificate sul branch
`kitchen-clean-baseline-v2-phase-a`). Solo struttura stabile: lo stato (cosa è in produzione, cosa manca) sta in
`CHECKPOINT.md`. Se il codice contraddice questo file, vale il codice e questo file va corretto.

## 1. Pezzi e flusso

```
Cliente (telefono, QR)          Staff (tablet/PC)              TV cucina
   │  React SPA (Vite) su Vercel  ── stesso bundle ──             │
   ▼                                                              ▼
Supabase Postgres  ◄── RPC kitchen_* (client, RLS) ──  Realtime su kitchen_orders
   ▲                                                              │
   │ service role                                                 │ trigger SQL + Vault → net.http_post
Funzioni Vercel api/ (Node) ◄──► SumUp REST                 Edge function send-order-ready-push (Deno)
   ▲                                                              │
   └── cron Vercel 03:00 → /api/kitchen-sumup-reconcile-sweep     └──► Web Push (VAPID) al cliente
```

## 2. Frontend

- React 19 + Vite 8, SPA **senza router**: `switch (pathname)` in `src/App.jsx`. Avvio: `index.html` →
  `src/main.jsx` → `src/App.jsx`. Rewrite di tutte le path su `index.html` in `vercel.json`.
- Route cliente: `/` e `/kitchen/entry` e `/kitchen/promo` (→ `CustomerKitchenEntry`), `/kitchen` (menu),
  `/kitchen/payment` (scelta e pagamento), `/kitchen/status` (stato ordini). Path sconosciuta → entry.
- Route staff: `/kitchen/solo` (`KitchenSoloService`, unica UI operativa: ordini, pagamenti, storico, altro),
  `/kitchen/cassa` (`CounterAssistedOrder`, ordine assistito al banco), `/kitchen/prep` (Prep Board),
  `/kitchen/tv` (schermo cucina), `/kitchen/login`, `/kitchen/staff` (solo redirect a `/kitchen/solo`).
- Route demo/training (fixture locali, niente DB): `/kitchen/solo-demo`, `/kitchen/staff-payments-demo`,
  `/kitchen/prep-demo`, `/kitchen/training`.
- Cartelle:
  - `src/pages/` pagine e viste staff (`StoricoView`, `PaymentsView`, `MenuView`, `AlertView`) + fixture demo.
  - `src/components/kitchen/` componenti condivisi.
  - `src/hooks/` stato e dati: `useKitchenOrders` (ordini + sync), `useKitchenPayments`, `useKitchenMenu`,
    `useKitchenServiceState`, `useKitchenOrderHistory`, `useOrderPaymentFlow` (flusso pagamento cliente),
    `useSelectedServiceNight`, `usePromoPassIssue`, `useWebPushSubscription`, `useKitchenAudio`,
    `useCustomerSession`, `useFullscreenToggle`.
  - `src/lib/` regole pure e client: `kitchenServiceRules` (orari, gruppi pagamento, stati operativi),
    `kitchenCart`, `kitchenAllergens`, `kitchenOrderCode`, `kitchenPrepAggregation`, `kitchenCloseForCounter`,
    `kitchenStaffLabels`, `supabaseClient`, `supabaseAuth`, `webPush`.
  - `src/data/kitchenMockData.js`: catalogo menu usato davvero dall'app (nonostante il nome). Area protetta.
- PWA: `public/sw.js` + manifest (notifiche "ordine pronto").
- Legacy non montato da nessuna route: `src/pages/KitchenPayments.jsx`, `src/pages/KitchenPromo.jsx`.

## 3. Backend

- **Funzioni Vercel `api/`** (Node, service role Supabase, tutte SumUp):
  `kitchen-sumup-create-checkout`, `kitchen-sumup-webhook` (lo stato si verifica rileggendo SumUp, non ci si
  fida del payload), `kitchen-sumup-reconcile` (cliente), `kitchen-staff-sumup-reconcile`,
  `kitchen-sumup-refund`, `kitchen-cancel-with-payment-check`, `kitchen-staff-sumup-close-for-counter`,
  `kitchen-sumup-reconcile-sweep` (cron). Helper in `api/_lib/`. Regole: `api/CLAUDE.md`.
- **Edge function Supabase** `supabase/functions/send-order-ready-push` (Deno, web-push): chiamata da un
  trigger SQL quando l'ordine diventa pronto, autenticata con un secret in Vault.

## 4. Database (Supabase Postgres)

- Tabelle Kitchen: `kitchen_orders`, `kitchen_order_items`, `kitchen_payments`,
  `kitchen_payment_webhook_events`, `kitchen_menu_items`, `kitchen_menu_availability`, `kitchen_service_state`,
  `kitchen_service_order_counters`, `kitchen_staff_members`, `kitchen_customer_sessions`, `kitchen_promo_passes`,
  `kitchen_promo_analytics_events`, `kitchen_push_subscriptions`, `kitchen_action_log`.
- View di reporting: `kitchen_payments_daily_summary`, `kitchen_payments_order_reconciliation`,
  `kitchen_payments_provider_drift_candidates`.
- Le migration contengono anche tabelle di altri moduli (`fanta_*`, `song_requests`, `live_*`, `party_ferie_*`):
  non sono usate da questo branch.
- Stati ordine (`kitchen_orders.status`): `pending_counter_payment`, `received`, `preparing`, `ready`,
  `delivered`, `cancelled`. La migration S2 aggiunge `pending_online_payment` e `payment_abandoned`
  (stato di applicazione: `CHECKPOINT.md`).
- RPC principali (`kitchen_*`): creazione ordine (`customer_create_order`), pagamenti
  (`payment_attempt_start`, `payment_attempt_claim_checkout`, `payment_attempt_set_provider_ref`,
  `payment_confirm`, `payment_fail`, `payment_attempt_close_unpaid`, `payment_record_cash`,
  `payment_record_counter`, `payment_webhook_ingest`), rimborsi (`payment_refund*`), annullo
  (`order_cancel`, `order_cancel_with_payment_attempt`), promo (`promo_pass_issue`, `promo_pass_redeem_for_order`,
  `promo_analytics_record`), push (`push_subscription_claim`, trigger `orders_ready_push_dispatch`).
- Realtime su `kitchen_orders`. RLS staff tramite `is_staff_for_venue('walrus-main')`.
- Chi scrive: il browser solo via RPC/RLS; `api/` con service role; le RPC "solo server" hanno guardie
  `service_role_only` o `auth.uid()`.

## 5. Auth

- Staff: email + password Supabase, poi `is_staff_for_venue('walrus-main')`.
- Cliente: `signInAnonymously()`, nessun login richiesto.
- E2E: `VITE_E2E_BYPASS_STAFF_AUTH=true` nel config Playwright principale (mai in produzione).

## 6. Servizi esterni e ambienti

| Cosa | Dove |
|---|---|
| Hosting + funzioni + cron | Vercel, progetto `walbox-from-zero-v2`; Production = branch `main` |
| DB / Auth / Realtime / Edge | Supabase produzione `pcrqfdzipotprqtuemso` (MCP di progetto in sola lettura) |
| Pagamenti | SumUp REST, solo da `api/` |
| Notifiche | Web Push VAPID (`VITE_WEB_PUSH_VAPID_PUBLIC_KEY` lato client) |
| Repo | `github.com/allonatoeros-ctrl/walbox-kitchen-mvp` (remote `origin` e `origin-write`) |

Guard di sicurezza: `src/lib/supabaseClient.js` (dev) e `vite.config.js` (build/preview fuori da Vercel)
bloccano l'avvio se `VITE_SUPABASE_URL` punta alla produzione.

## 7. Test

- Unit: `tests/unit/*.test.mjs` (21 file, `node --test`), `src/lib/*.test.js`, `api/*.test.js`.
  Fetch e Supabase mockati, nessuna rete.
- Migration: `supabase/migrations/*.test.js`, assert statiche sul testo SQL (nessun DB).
- E2E: `tests/e2e/` con `playwright.config.js` (dev server porta 5174, bypass auth staff). Config dedicati:
  `playwright.fsec2.config.js` (account reali), `playwright.notif.config.js`, `playwright.real-local.config.js`
  (Supabase locale in Docker via `scripts/e2e-real-supabase-local.sh`, test in `tests/e2e-real/`).
- Comandi e loro rischio: `CLAUDE.md §10-11`.
