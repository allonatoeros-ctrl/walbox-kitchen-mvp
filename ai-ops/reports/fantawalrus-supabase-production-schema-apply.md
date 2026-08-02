# FantaWalrus — Supabase Production Schema Apply

Progetto: **Walbox** — ref `pcrqfdzipotprqtuemso`
Branch: `feat/fantawalrus-product-flow`
Data: 2026-08-02
Autorizzazione: Eros — push su feat/fantawalrus-product-flow, apply remoto migration 0001/0002/0003, seed vietato, merge main/deploy vietati.

## GIT_PUSH

- Precheck: branch `feat/fantawalrus-product-flow`, working tree pulito (solo `ai-ops/reports/fantawalrus-supabase-remote-migration-audit.md` untracked, non incluso nel push), 8 commit locali avanti a origin.
- Nessun file sensibile in scope (`.env.local`, secret, Docker, package-lock, package.json): verificato via `git diff --stat` — solo file FantaWalrus/Supabase/report.
- Test locali pre-push: `node --test src/fanta/**/*.test.js` → **130/130 PASS**.
- Build pre-push: `npm run build` → **PASS**.
- `git push origin feat/fantawalrus-product-flow` → PASS.
- `LOCAL_HEAD = REMOTE_HEAD = 07ebdd9add3c94e53bd60974b53574c75b6cf41d` → confermato.

## PRE_APPLY_STATE

Rivalidato subito prima dell'apply (FASE 3): zero tabelle, funzioni o policy `fanta_*` sul progetto Walbox remoto. **CASE A confermato invariato.**

## MIGRATIONS_APPLIED

Applicate in ordine via `apply_migration`, tutte `{"success":true}`:

1. `0001_fanta_schema_v1` — 14 tabelle base (leagues, teams, team_members, player_snapshots, rosters, rounds, fixtures, lineups, ingestion_runs, events, votes, team_scores, standings, var_adjustments)
2. `0002_fanta_functions_v1` — `fanta_is_admin()`, trigger `updated_at`, `fn_enforce_max_teams()`, `fn_enforce_lineup_deadline()`, RPC `create_fanta_team_v1()` (SECURITY DEFINER)
3. `0003_fanta_rls_v1` — RLS enable su tutte le 14 tabelle + GRANT base `authenticated` + policy

Nessuna migration 0004 necessaria (confermato in ingresso).

## TABLES_CREATED

14/14 tabelle `fanta_*` presenti in `public`, tutte a 0 righe. Verificato via `list_tables`.

## RPC_VERDICT

`create_fanta_team_v1(uuid, text)` presente, `security_type = DEFINER`. `search_path` pinnato a `public` (in definizione, mitiga hijacking). PASS.

## RLS_VERDICT

RLS `rowsecurity = true` su tutte le 14 tabelle `fanta_*` (verificato via `pg_class.relrowsecurity`). Policy count per tabella coerente con 0003 (2-3 policy/tabella, nessuna tabella priva di policy). Policy lineup (owner + league-mate solo post-lock) e no-insert-diretto su `fanta_teams`/`fanta_team_members` confermate presenti come da 0003. PASS.

## BASE_GRANTS

`GRANT select, insert, update, delete ... to authenticated` presente su tutte le 14 tabelle (verificato via `information_schema.role_table_grants`). PASS.

## SEED_SKIPPED

`supabase/seed/**` non applicato. Nessun dato inserito: tutte le 14 tabelle a 0 righe post-apply. PASS.

## ANON_ACCESS

`information_schema.role_table_grants` per `grantee='anon'` su tabelle `fanta_*` → **risultato vuoto**: anon zero grant a livello tabella, quindi zero accesso a lineup e a tutto lo schema Fanta, indipendentemente dalle policy (che comunque sono tutte `to authenticated`). PASS.

## EXISTING_WALBOX_SCHEMA_UNTOUCHED

`list_tables` post-apply mostra tutte le tabelle preesistenti (kitchen_*, song_requests, playback_state, venue_settings, live_submissions, live_settings, party_ferie_requests, party_ferie_assets) intatte, invariate, a 0 righe come da stato pre-apply. Nessuna migration ha toccato oggetti non-Fanta. `road-to-wao-` non toccato (nessun riferimento nelle migration).

## POST_APPLY_TEST

`node --test src/fanta/**/*.test.js` → **130/130 PASS** (rieseguito post-apply, nessuna scrittura permanente su production).

## BUILD

`npm run build` → **PASS** (rieseguito post-apply).

## PRODUCTION_STATUS

Schema FantaWalrus V1 (14 tabelle + 1 RPC + RLS completa) è live su Supabase production (Walbox, ref `pcrqfdzipotprqtuemso`), vuoto, senza dati reali, senza seed. Nessun utente reale creato. Nessuna service role key usata lato client.

## RESIDUAL_RISKS

Security advisors (WARN, non bloccanti, pattern preesistente nel resto del DB Walbox):

- `function_search_path_mutable` su `fanta_is_admin`, `fn_set_updated_at`, `fn_enforce_max_teams`, `fn_enforce_lineup_deadline` (search_path non pinnato esplicitamente su queste 4; `create_fanta_team_v1` invece lo pinna già). Stesso pattern già presente su funzioni Kitchen/Walbox preesistenti (es. `_walbox_set_updated_at`).
- `anon_security_definer_function_executable` su `create_fanta_team_v1`: la funzione è SECURITY DEFINER e l'EXECUTE grant è verso `authenticated` (`revoke all ... from public; grant execute ... to authenticated`), ma l'advisor segnala comunque la route REST come raggiungibile — la funzione stessa blocca a runtime con `FANTA_AUTH_REQUIRED` se `auth.uid()` è null, quindi anon non autenticato non può creare team. Stesso pattern già presente su `is_staff_for_venue`.
- `auth_allow_anonymous_sign_ins`: warning informativo sulle policy (i ruoli target includono nozioni di anonymous sign-in a livello Auth, non di grant tabella) — già presente su tutte le tabelle Walbox esistenti, non specifico di Fanta.
- `auth_leaked_password_protection`: impostazione globale progetto, non specifica di questo apply.

Nessun rischio bloccante rilevato per questo scope (schema-only, zero dati, zero auth UI).

## NEXT_RECOMMENDED_SPRINT

- Pinnare esplicitamente `search_path` sulle 4 funzioni non-DEFINER rimanenti (allineamento con `create_fanta_team_v1`), micro-task dedicato.
- Decisione su claim shape reale per `fanta_is_admin()` (`app_metadata.fanta_role`) prima di introdurre auth UI/utenti reali.
- Non avviare auth UI, ingestion API-Football schedulata, o service role nel client senza task dedicato e approvazione esplicita.
