-- FantaWalrus Supabase Schema Pack V1 — league bootstrap
-- Idempotente: crea una sola lega di test se non esiste già.
INSERT INTO fanta_leagues (id, name, season, status, max_teams)
VALUES ('10000000-0000-0000-0000-000000000001', 'FantaWalrus 2026', '2026', 'active', 60)
ON CONFLICT (id) DO NOTHING;
