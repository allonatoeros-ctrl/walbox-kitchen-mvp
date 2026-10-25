-- Kitchen Payment Hub — viste di reporting in security_invoker (fix avvisi Supabase "Security Definer View").
--
-- LOCAL ONLY — NOT APPLIED TO REMOTE. Apply solo con `npx supabase db push --linked` (gate di Eros).
--
-- Problema: kitchen_payments_daily_summary, kitchen_payments_order_reconciliation e
-- kitchen_payments_provider_drift_candidates appartengono a postgres e girano con i suoi privilegi
-- (security definer implicito), quindi bypassano la RLS delle tabelle sottostanti. L'unica difesa era il
-- predicato is_staff_for_venue(venue_id) nel WHERE di ogni vista. In piu' anon/authenticated/service_role
-- hanno tutti i privilegi (arwdDxtm) sulle viste per i default privileges di Supabase.
--
-- Correzione:
--   1) security_invoker = true: le viste girano con i privilegi di chi le interroga e la RLS di
--      kitchen_orders / kitchen_payments si applica. Il predicato is_staff_for_venue() resta nel WHERE
--      (non si tocca la logica delle viste): lo staff vede gli stessi dati di prima, niente di piu'.
--      Le policy staff_select_venue_orders / staff_select_venue_payments usano lo stesso predicato; le
--      policy cliente (customer_select_own_*) non allargano nulla perche' il WHERE esclude comunque chi
--      non e' staff del locale.
--   2) Privilegi minimi: solo SELECT, solo a authenticated (staff, via JWT) e service_role (server).
--      anon e PUBLIC perdono ogni accesso (prima vedevano 0 righe, ora ricevono permission denied):
--      la migration 20260828100600 dichiarava gia' "no anon access". INSERT/UPDATE/DELETE/TRUNCATE
--      ecc. sulle viste non servono a nessuno (order_reconciliation e' auto-updatable).
--   Nessuna modifica alle tabelle, alle policy, a is_staff_for_venue(), alle RPC o ai webhook.
--
-- Nota per le migration future (verificato in locale): CREATE OR REPLACE VIEW azzera security_invoker
-- (reloptions torna vuoto). Ogni migration che ridefinisce una di queste viste deve ripetere
-- `ALTER VIEW ... SET (security_invoker = true)` subito dopo; i grant restano.
--
-- ROLLBACK (non eseguire in automatico):
--   ALTER VIEW public.<vista> RESET (security_invoker);
--   GRANT ALL ON public.<vista> TO anon, authenticated, service_role;
--   per ciascuna delle tre viste.

ALTER VIEW public.kitchen_payments_daily_summary SET (security_invoker = true);
ALTER VIEW public.kitchen_payments_order_reconciliation SET (security_invoker = true);
ALTER VIEW public.kitchen_payments_provider_drift_candidates SET (security_invoker = true);

REVOKE ALL ON public.kitchen_payments_daily_summary FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.kitchen_payments_order_reconciliation FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.kitchen_payments_provider_drift_candidates FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.kitchen_payments_daily_summary TO authenticated, service_role;
GRANT SELECT ON public.kitchen_payments_order_reconciliation TO authenticated, service_role;
GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated, service_role;
