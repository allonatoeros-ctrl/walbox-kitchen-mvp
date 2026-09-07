-- Sprint 3B.2: enable Supabase Realtime on public.kitchen_orders only.
-- No RLS/schema/Payment Hub/frontend changes. kitchen_order_items intentionally excluded.

alter publication supabase_realtime add table public.kitchen_orders;
