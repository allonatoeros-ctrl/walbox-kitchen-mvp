# FantaWalrus — Supabase Schema Pack V1 (Local Only)

Run: 2026-08-02, worktree `fantawalrus-product-flow`, branch `feat/fantawalrus-product-flow`.
Modalità: AUTONOMOUS SUPABASE SCHEMA PACK V1 — LOCAL ONLY. Nessuna migration remota applicata,
nessun `supabase db push`, nessuna connessione a Supabase, nessuna service role usata, nessun
secret letto/stampato/modificato.

Decisioni approvate da Eros usate come vincoli di design: 1 account = 1 squadra; una sola lega
Walrus V1, max 60 squadre; nessun pagamento interno V1; deadline = inizio prima partita della
giornata; override solo admin; Sala VAR persistente e auditata.

---

## FASE 0 — Precheck

- Branch `feat/fantawalrus-product-flow`, allineato a `origin/feat/fantawalrus-product-flow`.
- Untracked pre-esistente: `ai-ops/reports/fantawalrus-backend-contract-audit.md` (letto, non
  modificato).
- Nessun secret letto/toccato; `.env.local` non aperto.
- Baseline: `node --test src/fanta/**/*.test.js` → **130/130 PASS**. `npm run build` → **PASS**
  (stesso warning chunk >500kB preesistente, non bloccante).

## FASE 1-3 — Schema, RLS, funzioni

Basati su `ai-ops/reports/fantawalrus-backend-contract-audit.md` (§1-§4) e sulle decisioni sopra.
14 tabelle create in `supabase/migrations/0001_fanta_schema_v1.sql`, RLS in
`0003_fanta_rls_v1.sql`, funzioni/trigger in `0002_fanta_functions_v1.sql`. Nessuna logica di
scoring/validazione formazione duplicata nel DB: resta nel motore puro
(`src/fanta/engine/scoreEngine.js`), invariato.

## FASE 4 — Seed locale

`supabase/seed/0001_fanta_seed_v1.sql`: 1 lega, 1 admin placeholder (via `auth.users`, solo per
`supabase start` locale — mai per remoto), 2 squadre demo, 1 round, 1 fixture. Nessun dato
personale reale.

## FASE 5 — Adapter contract

`src/fanta/adapters/supabaseSchemaContractV1.js`: solo JSDoc + costanti (stesso stile di
`contracts.js` esistente), nessun import di client Supabase, nessuna chiamata. Documenta lo shape
di ingestion output, lineup snapshot, team score, standings row, VAR adjustment.

## FASE 6 — Test e review

- `node --test src/fanta/**/*.test.js` (dopo aggiunta adapter contract) → **130/130 PASS**
  (invariato, nessun test rotto/aggiunto — nessuna logica eseguibile nel nuovo file).
- `npm run build` → **PASS**.
- Parentesi bilanciate in tutti i file SQL (controllo automatico: open==close su 4 file).
- Nessun `psql`/`supabase` CLI disponibile in locale per un lint SQL diretto: verifica fatta a
  mano file-per-file (ordine dipendenze FK, unique, check, RLS).
- Ordine tabelle verificato: nessun riferimento FK in avanti (ogni tabella referenzia solo
  tabelle già create sopra di essa nello stesso file).

---

## REPORT FINALE

```
SCHEMA_CREATED: sì (locale, non applicato)
TABLES: fanta_leagues, fanta_teams, fanta_team_members, fanta_rosters, fanta_lineups,
  fanta_rounds, fanta_fixtures, fanta_player_snapshots, fanta_events, fanta_votes,
  fanta_ingestion_runs, fanta_team_scores, fanta_standings, fanta_var_adjustments (14/14)
RLS_POLICIES: 14 tabelle con RLS enabled; utente = read pubblico su dati oggettivi
  (leghe pubblicate, squadre, giocatori, round, fixtures, eventi, voti, score, classifica,
  rettifiche VAR) + read/write solo sulle proprie righe (team/roster/lineup via
  fanta_team_members); admin = full write via claim fanta_is_admin() (app_metadata.fanta_role);
  fanta_ingestion_runs = nessun accesso utente finale, solo admin
FUNCTIONS: fanta_is_admin() (claim JWT), fn_set_updated_at() (trigger generico),
  fn_enforce_max_teams() (trigger insert su fanta_teams, blocca oltre max_teams lega),
  fn_enforce_lineup_deadline() (trigger insert/update su fanta_lineups, blocca dopo
  deadline_at salvo fanta_is_admin())
CONSTRAINTS: UUID pk ovunque, FK espliciti (nessun riferimento in avanti), unique
  (league_id,name) su teams, unique(user_id) su team_members (1 account = 1 squadra),
  unique(team_id,round_id) su lineups/team_scores, unique(fixture_id,idempotency_key) su
  ingestion_runs, unique(round_id,player_id) su votes con check XOR base_vote/no_vote_reason,
  unique(fixture_id,player_id,event_type,minute) su events (chiave naturale idempotente),
  check status enum su leagues/rounds/fixtures/ingestion_runs, check max_teams<=60
SEED: 1 lega attiva, 1 admin placeholder (auth.users, solo local dev), 2 squadre demo,
  1 round (deadline +7gg), 1 fixture — nessun dato reale
ADAPTER_CONTRACT: src/fanta/adapters/supabaseSchemaContractV1.js — solo tipi/JSDoc, zero I/O,
  zero import Supabase, coerente con contracts.js esistente
TEST: 130/130 PASS (invariato rispetto a baseline, nessun test rotto)
BUILD: PASS (vite build, warning chunk >500kB preesistente non bloccante)
SECURITY_REVIEW: nessuna service role nel client, nessuna policy globale permissiva
  ("authenticated can read/write all" evitata su tabelle scrivibili), fanta_var_adjustments
  append-only (nessuna policy update/delete → immutabile per costruzione), secret/.env mai
  letti o toccati
MIGRATION_FILES:
  supabase/migrations/0001_fanta_schema_v1.sql
  supabase/migrations/0002_fanta_functions_v1.sql
  supabase/migrations/0003_fanta_rls_v1.sql
  supabase/seed/0001_fanta_seed_v1.sql
FILES_CHANGED:
  supabase/migrations/0001_fanta_schema_v1.sql (nuovo)
  supabase/migrations/0002_fanta_functions_v1.sql (nuovo)
  supabase/migrations/0003_fanta_rls_v1.sql (nuovo)
  supabase/seed/0001_fanta_seed_v1.sql (nuovo)
  src/fanta/adapters/supabaseSchemaContractV1.js (nuovo)
  ai-ops/reports/fantawalrus-supabase-schema-pack-v1.md (nuovo, questo report)
COMMITS: nessuno ancora — proposti sotto, in attesa di approvazione Eros
BLOCKERS: nessuno (0 tentativi falliti, nessuna escalation necessaria)
DECISIONS_REQUIRED:
  (1) RISOLTO in fantawalrus-supabase-schema-hardening-v1.md (2026-08-02): aggiunta
      create_fanta_team_v1() RPC (SECURITY DEFINER, 0002) che crea team+membership in modo
      atomico e mai fidandosi di user_id lato client; rimossa la policy fanta_teams_owner_insert
      (`with check (true)`) e la policy fanta_team_members_insert_self — nessun insert diretto
      resta possibile per `authenticated` su nessuna delle due tabelle.
  (2) fanta_is_admin() assume un claim app_metadata.fanta_role — dipende dalla decisione D1 del
      backend contract audit (modello utenti/auth) non ancora presa da Eros; se il modello auth
      cambia, il claim va rinominato in questa stessa migration prima di applicarla. Confermato
      in hardening v1: claim assegnabile solo server-side, nessun client può promuoversi, service
      role mai esposta (vedi fantawalrus-supabase-schema-hardening-v1.md FASE 3).
  (3) RISOLTO in fantawalrus-supabase-schema-hardening-v1.md (2026-08-02): la policy
      fanta_lineups_select_own_or_public ora richiede che il lettore sia owner della lineup
      OPPURE membro di una squadra della STESSA lega del round (join fanta_rounds → fanta_teams →
      fanta_team_members), non più "qualunque utente autenticato" — comportamento confermato da
      Eros come voluto (§FASE 2 del prompt di hardening).
REMOTE_APPLY_COMMAND_PROPOSED: supabase db push --linked (NON eseguito — richiede STOP
  esplicito rimosso da Eros, progetto Supabase collegato, e revisione DECISIONS_REQUIRED sopra
  prima di qualunque esecuzione)
```

---

## STOP

Fermato come richiesto prima di: `supabase db push`, migration remota, accesso progetto Supabase,
service role, env, deploy, push Git, merge, dati reali utenti, cancellazioni/reset/stash,
modifiche a `main`. Nessun commit creato — proposti sotto in attesa di approvazione Eros:

```
git add supabase/migrations/0001_fanta_schema_v1.sql supabase/migrations/0002_fanta_functions_v1.sql
git commit -m "feat(fanta): add Supabase schema pack v1"

git add supabase/migrations/0003_fanta_rls_v1.sql
git commit -m "security(fanta): add RLS policies for league v1"

git add supabase/seed/0001_fanta_seed_v1.sql src/fanta/adapters/supabaseSchemaContractV1.js ai-ops/reports/fantawalrus-supabase-schema-pack-v1.md
git commit -m "docs(fanta): record Supabase schema pack v1"
```
