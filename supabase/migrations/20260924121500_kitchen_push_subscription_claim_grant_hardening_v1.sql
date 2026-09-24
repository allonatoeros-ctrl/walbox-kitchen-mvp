-- kitchen_push_subscription_claim_grant_hardening_v1 — F6 Phase 1 RPC grant hardening (2026-09-24).
--
-- Versiona in repo un hardening già applicato manualmente in produzione (pcrqfdzipotprqtuemso),
-- registrato nel ledger remoto come migration `kitchen_push_subscription_claim_revoke_anon_v1`
-- (version 20260924092719). La migration Phase 1 (20260924120000_kitchen_push_subscriptions_v1.sql,
-- NON modificata da questo file) fa già `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO
-- authenticated;` sulla RPC, ma i default privileges dello schema public di Supabase ri-concedono
-- EXECUTE ad `anon` alla CREATE FUNCTION — un GRANT esplicito a un ruolo non è un GRANT a PUBLIC,
-- quindi REVOKE ALL FROM PUBLIC non lo annulla. Il security advisor di Supabase ha confermato: la
-- RPC SECURITY DEFINER risultava eseguibile anche da `anon`, non solo da `authenticated` come da
-- intento dichiarato nel file Phase 1.
--
-- Idempotente: REVOKE su un grant assente e GRANT già presente non falliscono e non alterano lo
-- stato oltre al risultato finale voluto. Applicarlo su un DB dove l'hardening è già stato
-- eseguito manualmente (come su produzione oggi) è un no-op sicuro.

REVOKE EXECUTE ON FUNCTION public.kitchen_push_subscription_claim(text, text, text, text, text) FROM anon;

-- Riconferma idempotente (Phase 1 la fa già, ripetuta qui per rendere questo file autosufficiente
-- come snapshot dello stato grant voluto sulla RPC).
REVOKE ALL ON FUNCTION public.kitchen_push_subscription_claim(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_push_subscription_claim(text, text, text, text, text) TO authenticated;
