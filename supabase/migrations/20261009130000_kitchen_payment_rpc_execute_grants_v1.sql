-- kitchen_payment_rpc_execute_grants_v1 — S0.5 RPC EXECUTE grant hardening (2026-10-09).
--
-- Audit: ai-ops/reports/kitchen-s0-5-rpc-execute-grants-security-audit.md (§8 Option D, §10 Step 1).
-- I default privileges dello schema public di Supabase concedono EXECUTE diretto ad `anon` alla
-- CREATE FUNCTION, e Postgres concede EXECUTE a PUBLIC: un REVOKE ... FROM PUBLIC non toglie il
-- grant diretto ad anon. Con anon `auth.uid()` è NULL e le guardie di ownership di promo_redeem e
-- attempt_start (channel `app`) non sono NULL-safe → vanno chiuse a livello di grant.
--
-- Solo REVOKE/GRANT sulle 3 firme reali (verificate su catalogo Production, nessun overload).
-- Nessuna modifica ai corpi funzione, nessun ALTER DEFAULT PRIVILEGES (finding sistemico sulle altre
-- kitchen_* fuori scope). Idempotente: REVOKE di un grant assente e GRANT già presente sono no-op.

-- Customer owner (anonymous sign-in = authenticated) e staff: restano su authenticated.
REVOKE EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) TO service_role;

-- Unico caller reale: server Vercel con service_role (webhook/reconcile SumUp).
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) TO service_role;
