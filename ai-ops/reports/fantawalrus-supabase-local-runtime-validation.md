# FantaWalrus — Supabase Local Runtime Validation

Data: 2026-08-02
Branch: `feat/fantawalrus-product-flow` (ahead 6 su origin, nessun push/deploy eseguito)
Scope: validazione runtime REALE (non code-review) dello schema Supabase FantaWalrus contro uno stack locale `supabase start`, esecuzione effettiva dei 12 scenari di hardening, fix chirurgici degli errori reali trovati, test Node e build.

## Obiettivo

Precedenti report (`fantawalrus-supabase-schema-hardening-v1.md`, `fantawalrus-supabase-schema-pack-v1.md`) erano basati su code review: nessuna istanza Postgres/Supabase CLI locale era disponibile per eseguire davvero `supabase/tests/fanta_hardening_v1_checklist.sql`. Questo run colma quel gap: stack locale reale, migration + seed applicati, tutti e 12 gli scenari eseguiti per davvero con asserzioni automatiche PASS/FAIL.

## Setup

- `npx supabase@latest init` — mancava `supabase/config.toml`, necessario per `supabase start`. Creati `supabase/config.toml` e `supabase/.gitignore` (nessun secret: le chiavi locali sono generate a runtime da `supabase start`, non salvate su disco).
- `npx supabase@latest start` — stack Docker locale avviato (Postgres 17.6, PostgREST, GoTrue, Studio, Realtime, Storage, ecc.). Migration `0001_fanta_schema_v1.sql`, `0002_fanta_functions_v1.sql`, `0003_fanta_rls_v1.sql` applicate automaticamente all'avvio.
- Seed: `supabase/seed/0001_fanta_seed_v1.sql` NON viene raccolto automaticamente da `supabase start` (il CLI cerca `supabase/seed.sql` per default, warning `no files matched pattern: supabase/seed.sql`). Applicato manualmente via `docker exec ... psql < supabase/seed/0001_fanta_seed_v1.sql` — 5 insert, tutti riusciti. Non è un errore di schema: è solo un percorso file non allineato alla convenzione CLI, fuori dallo scope "fix in migrations/tests" richiesto (nessuna modifica a `config.toml` per questo).

## Errori reali trovati e corretti

Tre classi di errore reale emerse eseguendo davvero la checklist (oltre a due bug nelle mie stesse asserzioni di test, corretti nello stesso file). Tutte le classi risolte entro 2 tentativi.

### 1. `supabase/tests/fanta_hardening_v1_checklist.sql` — non era eseguibile
Il file originale era un "checklist copy-paste" con gli step 7–12 commentati (richiedeva sostituzione manuale di `<team_id_from_step_1>`). Riscritto come script realmente eseguibile e **auto-verificante**: ogni scenario asserisce il proprio esito atteso con `RAISE EXCEPTION` in caso di mismatch; i team id vengono catturati in una temp table di sessione (`test_vars`) invece di variabili client psql, per evitare i limiti di interpolazione `\gset` dentro blocchi `DO $$ ... $$`.

### 2. `test_vars` senza GRANT per i ruoli simulati (tentativo 1/2)
`create temporary table` è owned da `postgres`; dopo `set local role authenticated` il ruolo simulato non aveva permessi di insert. Fix: `grant select, insert, update, delete on test_vars to authenticated, anon;` subito dopo la creazione della tabella (file test, non schema).

### 3. Fixture utente mancanti in `auth.users` (tentativo 2/2)
`fanta_team_members.user_id` ha una FK reale verso `auth.users(id)`. La checklist simulava solo il JWT claim (`request.jwt.claims`) senza righe utente reali → `insert or update on table "fanta_team_members" violates foreign key constraint`. Fix: insert dei 5 utenti simulati (`11111111...`, `22222222...`, `33333333...`, `44444444...`, `99999999...` admin) in `auth.users` come fixture prima degli scenari (file test).

### 4. Mancano i GRANT di base tabella per `authenticated` su tutte le `fanta_*` — **bug reale nello schema** (`supabase/migrations/0003_fanta_rls_v1.sql`)
Verificato via `information_schema.role_table_grants`: al ruolo `authenticated` risultavano concessi solo `TRIGGER`/`REFERENCES`/`TRUNCATE` su ogni tabella `fanta_*`, mai `SELECT`/`INSERT`/`UPDATE`/`DELETE`. Le RLS policy da sole non bastano: Postgres nega l'accesso a livello di GRANT tabella **prima** di valutare le policy RLS. Riscontrato concretamente nello scenario 7 (`insert into fanta_lineups` come `authenticated` → `permission denied for table fanta_lineups`, nonostante la policy `fanta_lineups_write_own` fosse corretta).

Su un progetto Supabase gestito questo GRANT viene seminato automaticamente al bootstrap del progetto; una repo locale from-scratch (`supabase init` + migration) non lo eredita. **Fix applicato in migration**: aggiunto un blocco `grant select, insert, update, delete on <tutte le tabelle fanta_*> to authenticated;` in `0003_fanta_rls_v1.sql`, subito dopo il blocco `enable row level security`. Nessun grant aggiunto per `anon` (per design nessuna policy è `to anon` su nessuna tabella fanta_*; l'assenza di grant lo rende ancora più esplicito).

Dopo il fix: `npx supabase@latest db reset` (ricostruisce il DB locale dalle migration aggiornate, drop+recreate — nessun impatto su ambienti remoti) + re-seed manuale.

### Bug nelle mie asserzioni di test (non nello schema)
- Scenario 5 (atomicità): il probe riusava la lega già a `max_teams=2`, quindi falliva su `fn_enforce_max_teams` prima ancora di raggiungere il rollback forzato. Fix: lega dedicata con capienza (`Atomicity Probe League`, max_teams=10).
- Scenario 11 (anon legge lineup): mi aspettavo 0 righe via filtro RLS; il comportamento reale è `permission denied` a livello di GRANT (più stringente, corretto dopo il fix #4). Asserzione aggiornata per accettare entrambi gli esiti equivalenti.
- Scenario 12a (admin legge tutte le lineup): mi aspettavo 2 righe; solo 1 lineup esiste realmente nel dataset di test (lo scenario 8 blocca correttamente il secondo insert per deadline scaduta). Conteggio atteso corretto a 1.

## Esito 12 scenari (esecuzione reale, ultimo run)

Tutti PASS, eseguiti in un'unica transazione con `rollback` finale (nessun dato di test persistito nel DB locale — verificato: dopo il run, `fanta_leagues`=1 riga, `fanta_teams`=2 righe, esattamente i dati del seed).

1. Creazione primo team → PASS
2. Secondo team stesso utente → FAIL atteso `FANTA_USER_ALREADY_HAS_TEAM` → PASS
3. Lega piena → FAIL atteso `FANTA_LEAGUE_FULL` → PASS
4. Team+membership sempre creati insieme (2 team, 1 owner ciascuno) → PASS
5. Atomicità rollback su fallimento membership (probe reale con funzione scratch che forza l'eccezione dopo l'insert su `fanta_teams`, conteggio team invariato) → PASS
6. Anon non può creare team (`permission denied` per funzione) → PASS
7. Owner scrive lineup pre-deadline → PASS
8. Owner bloccato post-deadline (`FANTA_LINEUP_LOCKED`) → PASS
9. Membro stessa lega legge lineup dopo round locked → PASS
10. Utente di lega diversa non legge la lineup anche se locked (0 righe) → PASS
11. Anon non legge nessuna lineup (`permission denied`, più stringente del filtro RLS) → PASS
12a. Admin legge tutte le lineup indipendentemente dallo stato round → PASS
12b. Admin non ha esenzione dalla regola one-team-per-user (bloccato da `FANTA_LEAGUE_FULL` come chiunque) → PASS

## Test Node e build

- `node --test src/fanta/**/*.test.js`: **130/130 PASS**, 0 fail, 0 cancelled.
- `npm run build`: **PASS** (`vite build`, build in 655ms). Unico warning non bloccante: chunk `index-*.js` >500kB (pre-esistente, fuori scope di questo task).

## File modificati (scope rispettato)

- `supabase/migrations/0003_fanta_rls_v1.sql` — aggiunto blocco GRANT base tabella per `authenticated` (bug reale corretto).
- `supabase/tests/fanta_hardening_v1_checklist.sql` — riscritto da checklist manuale a script eseguibile e auto-verificante; fix fixture (`test_vars` grant, `auth.users`, lega dedicata atomicità) e correzione di 2 asserzioni errate.
- `supabase/config.toml`, `supabase/.gitignore` — generati da `supabase init`, necessari per `supabase start` locale; nessun secret (le chiavi locali sono generate a runtime, non salvate).

Nessuna modifica a `supabase/migrations/0001_fanta_schema_v1.sql` o `0002_fanta_functions_v1.sql`: nessun errore reale riscontrato lì durante l'esecuzione.

## Rischi residui

- Il GRANT aggiunto in `0003` va riapplicato a qualunque progetto Supabase remoto che abbia già ricevuto le migration 0001-0003 in una versione precedente (senza il GRANT), altrimenti lo stesso `permission denied` si presenterebbe in produzione al primo insert/update client-side su una tabella `fanta_*`. Questo run non ha toccato alcun ambiente remoto (nessuna connessione remota, nessun `.env.local` letto, nessun push/deploy) — la migration aggiornata è pronta ma non applicata altrove.
- Il seed FantaWalrus non è raccolto automaticamente da `supabase start`/`db reset` per via del percorso non-standard (`supabase/seed/0001_fanta_seed_v1.sql` invece di `supabase/seed.sql`); da valutare se allineare la convenzione in un task dedicato (fuori scope qui, nessuna modifica a `config.toml` fatta per questo).
- Scenario 5 (atomicità) usa una funzione scratch temporanea creata/droppata dentro la transazione di test — nessun residuo nello schema dopo il `rollback`, verificato.

## Commit locali

Eseguiti solo perché il risultato finale è PASS su tutti i gate (checklist 12/12, test Node 130/130, build OK). Nessun push, nessun merge, nessun deploy.
