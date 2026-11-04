# Food Club V1 — RESUME (punto di ripresa)

- Branch di sviluppo: `feat/food-club-v1` (locale, NON pubblicato). Base: `origin/docs/food-club-pwa` (6d8c2e2) + merge di `origin/main` (595f639, fix #13 Paga al banco).
- DB di test: Postgres 16 nativo, cluster in `/var/lib/postgresql/fcpg`, porta 54329, socket `/tmp`.
  Avvio: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/fcpg -o '-p 54329 -k /tmp' -l /var/lib/postgresql/fcpg.log start"`
  Migration: `PGHOST=/tmp PGPORT=54329 tests/db/apply-migrations.sh` (shim Supabase in `tests/db/supabase-shim.sql`).
- Stato: FASE 0 completata, FASE 1 in corso.
