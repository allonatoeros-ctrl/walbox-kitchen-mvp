-- Kitchen Payment Hub V1 — BUG A fix: source of truth server-side per "questo ordine non può più
-- essere pagato online".
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Nessun `supabase db push`/`db query -f`/apply_migration
-- in questo task. Apply remoto resta una decisione separata di Eros (vedi §5.1 SECURITY_POLICY.md).
--
-- Problem this fixes: dopo "PASSA AL BANCO" (kitchen_payment_attempt_close_unpaid, migration
-- 20260923100000) l'attempt SumUp viene chiuso lato server, ma l'ordine non porta nessun segnale
-- che impedisca al cliente di riavviare un nuovo checkout online — il bivio cliente
-- (useOrderPaymentFlow) decide oggi PAGA ONLINE vs PAGA IN CASSA solo da una scelta salvata in
-- localStorage (walbox_kitchen_payment_choice_<orderId>), device-locale e non autoritativa: se il
-- cliente non ha ancora scelto, o cambia device/pulisce lo storage, può ancora vedere ed usare
-- PAGA ONLINE su un ordine che lo staff ha già esplicitamente dirottato al banco.
--
-- online_payment_disabled: singola colonna boolean, kitchen_orders come unica fonte di verità
-- server-side (non uno stato derivato lato client da kitchen_payments). Default false: nessun
-- impatto su ordini esistenti/normali, che restano interamente invariati. Diventa true una volta
-- sola, in modo atomico, dentro kitchen_payment_attempt_close_unpaid (prossima migration) quando lo
-- staff esegue "PASSA AL BANCO" — mai scritta da altrove in questo task. Consumata da
-- kitchen_payment_attempt_start (guardia server-side su nuovi attempt online) e da
-- useOrderPaymentFlow (bivio cliente forzato su banco, CTA PAGA ONLINE mai mostrata).
--
-- Nessuna migrazione dati necessaria: tutte le righe esistenti hanno payment_method/payment_status
-- già validi indipendentemente da questa colonna, DEFAULT false le lascia invariate.

ALTER TABLE public.kitchen_orders
  ADD COLUMN online_payment_disabled boolean NOT NULL DEFAULT false;
