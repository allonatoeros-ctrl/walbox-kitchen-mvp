# FantaWalrus — Supabase Schema Hardening V1 (Local Only)

Run: 2026-08-02, worktree `fantawalrus-product-flow`, branch `feat/fantawalrus-product-flow`.
Modalità: SUPABASE SCHEMA HARDENING V1 — LOCAL ONLY. Nessuna migration remota applicata, nessun
`supabase db push`, nessuna connessione a Supabase, nessuna service role usata, nessun secret
letto/stampato/modificato.

Decisioni approvate da Eros usate come vincoli di design:
1. Creazione squadra e owner membership tramite RPC atomica.
2. Admin claim: `app_metadata.fanta_role = "admin"`.
3. Le lineup diventano leggibili agli utenti autenticati della lega solo dopo round
   locked/finalized; mai pubbliche anonime.

---

## FASE 0 — Verify

- Worktree: `/Users/erosallonato/Documents/Codex/2026-08-02/ou/work/fantawalrus-product-flow`,
  branch `feat/fantawalrus-product-flow`, HEAD `ccb3635`.
- **Discrepanza chiarita**: il branch è 3 commit locali avanti a `origin/feat/fantawalrus-product-flow`
  (`d6e4212` schema, `db936e5` RLS, `ccb3635` docs) — i commit **esistono localmente**, semplicemente
  non erano ancora pushati. Non è mai stato vero "nessun commit": lo stato reale del branch conferma
  i 3 commit del pack schema v1.
- Un file untracked pre-esistente: `ai-ops/reports/fantawalrus-backend-contract-audit.md` (letto,
  non modificato, poi committato in questo run insieme al resto della documentazione — vedi COMMITS).
- Nessun reset/stash/cancellazione eseguita. Nessuna connessione a Supabase remoto.

## FASE 1 — RPC atomica `create_fanta_team_v1`

Aggiunta in `supabase/migrations/0002_fanta_functions_v1.sql` (in coda alle funzioni esistenti,
stesso stile di `fanta_is_admin()`/`fn_enforce_max_teams()`):

- `security definer`, `set search_path = public` (pinning contro search_path hijacking).
- Richiede `auth.uid()` non nullo → altrimenti `FANTA_AUTH_REQUIRED`.
- Legge lo stato/`max_teams` della lega con `for update` (lock di riga): serializza le creazioni
  concorrenti sulla stessa lega, chiudendo la race condition che il solo trigger
  `fn_enforce_max_teams()` non poteva escludere (due transazioni concorrenti potevano entrambe
  superare il count-check prima di committare).
- Verifica lega attiva → altrimenti `FANTA_LEAGUE_NOT_ACTIVE`.
- Verifica che l'utente non abbia già una `fanta_team_members` → altrimenti
  `FANTA_USER_ALREADY_HAS_TEAM`.
- Verifica il cap `max_teams` → altrimenti `FANTA_LEAGUE_FULL`.
- Inserisce `fanta_teams` poi `fanta_team_members` (role `owner`) nello stesso blocco di funzione →
  stessa transazione implicita: se il secondo insert fallisce, il primo viene annullato
  automaticamente (atomicità garantita da Postgres, nessuna gestione manuale di rollback necessaria).
- Ritorna `team_id` (uuid).
- **Non accetta `user_id` dal client**: usa sempre `auth.uid()` internamente.
- `revoke all ... from public` + `grant execute ... to authenticated`: `anon` non può nemmeno
  chiamare la funzione.

**Rimozione insert diretto** in `supabase/migrations/0003_fanta_rls_v1.sql`:
- Rimossa `fanta_teams_owner_insert` (`with check (true)`) — nessuna policy INSERT resta per
  `authenticated` su `fanta_teams`. L'unica via di scrittura è la RPC (SECURITY DEFINER, bypassa
  RLS come da comportamento standard Postgres per il proprietario della tabella).
- Rimossa anche `fanta_team_members_insert_self` (`with check (user_id = auth.uid())`): lasciarla
  avrebbe comunque permesso a un utente autenticato di auto-inserirsi come owner aggiuntivo su un
  team **già esistente** creato da altri (nessun `unique(team_id)` lo impediva — solo
  `unique(user_id)` e `unique(team_id, user_id)`, che non bloccano un secondo owner sullo stesso
  team). Rientra nello stesso obiettivo di FASE 1 (nessun insert diretto client-side su
  team/membership), non è uno scope creep: è la stessa vulnerabilità di hijack già segnalata nel
  report precedente (`fantawalrus-supabase-schema-pack-v1.md`, DECISIONS_REQUIRED #1).

## FASE 2 — RLS lineup

Aggiornata `fanta_lineups_select_own_or_public` in `0003_fanta_rls_v1.sql`:
- **Owner**: legge/scrive sempre la propria lineup (via `fanta_team_members`), invariato.
- **Membri della stessa lega**: prima la policy leggeva "qualunque utente autenticato" dopo
  `round.status in ('locked','finalized')`. Ora richiede un join esplicito
  `fanta_rounds → fanta_teams (stessa league_id) → fanta_team_members (viewer.user_id = auth.uid())`
  — solo chi ha una squadra nella stessa lega del round può leggere dopo il lock.
- **Anon**: nessuna policy per il ruolo `anon` su `fanta_lineups` → RLS nega di default, zero
  accesso, invariato rispetto a prima (era già corretto, solo verificato).
- **Admin**: `fanta_is_admin()` resta la prima condizione OR → override completo, sempre
  auditabile (claim JWT esplicito, non un bypass silenzioso).

Scrittura lineup (`fanta_lineups_write_own`/`_update_own`) non toccata: già corretta (solo owner,
più il trigger `fn_enforce_lineup_deadline` lato server come seconda linea di difesa).

## FASE 3 — Admin claim

Nessuna modifica di codice: `fanta_is_admin()` (0002) già legge `app_metadata.fanta_role = 'admin'`
dal JWT, come da decisione approvata. Documentato qui esplicitamente:
- Il claim `app_metadata` è scrivibile **solo lato server** (Supabase Admin API / dashboard con
  service role) — mai dal client, mai da `user_metadata` (quello sì scrivibile dal client stesso,
  e per questo mai usato per ruoli).
- Nessun client/utente può promuoversi da solo: non esiste, e non deve mai esistere, una policy o
  una RPC callable da `authenticated` che scriva `app_metadata`.
- La chiave service role necessaria per assegnare il claim non è e non deve mai finire in
  `.env`/bundle client (coerente con CLAUDE.md §5 e SECURITY_POLICY §6).

## FASE 4 — Validazione

Supabase CLI **non disponibile** in questo ambiente (`which supabase` → not found) → nessuna
validazione runtime eseguita, come da istruzione esplicita di non finger la si abbia fatta.
Prodotto invece `supabase/tests/fanta_hardening_v1_checklist.sql`: 12 scenari copy-paste eseguibili
manualmente su uno stack `supabase start` locale o un branch usa-e-getta, PRIMA di qualunque
`supabase db push` reale:

1. Utente crea prima squadra → PASS
2. Stesso utente tenta seconda squadra → FAIL (`FANTA_USER_ALREADY_HAS_TEAM`)
3. Lega piena (`max_teams` raggiunto) → FAIL (`FANTA_LEAGUE_FULL`)
4. Team e membership sempre creati insieme (query di verifica post-insert)
5. Errore membership → rollback team (verificato per costruzione: stessa funzione PL/pgSQL =
   stessa transazione implicita; procedura di prova forzata documentata nel file)
6. Anon non crea squadre → FAIL (`FANTA_AUTH_REQUIRED` o permission-denied, `EXECUTE` non concesso
   ad `anon`)
7. Owner scrive lineup prima della deadline → PASS
8. Owner bloccato dopo la deadline → FAIL (`FANTA_LINEUP_LOCKED`, trigger)
9. Membro stessa lega legge lineup dopo lock → PASS
10. Utente di un'altra lega non legge la lineup, anche se locked → 0 righe (è esattamente la
    regressione che la policy hardenata previene)
11. Anon non legge nessuna lineup → 0 righe
12. Admin override → PASS su lettura lineup di chiunque; nota comportamentale esplicita: il claim
    admin **non** esenta dal limite "1 account = 1 squadra" nella RPC (scelta di design, da
    confermare se è il comportamento voluto)

## FASE 5 — Test e build

```
node --test src/fanta/**/*.test.js  → 130/130 PASS (invariato, nessuna logica applicativa toccata)
npm run build                        → PASS (stesso warning chunk >500kB preesistente, non bloccante)
```

## FASE 6 — Report e commit

Aggiornato `ai-ops/reports/fantawalrus-supabase-schema-pack-v1.md` (DECISIONS_REQUIRED #1 e #3
marcati RISOLTO con riferimento a questo report; #2 confermato/documentato, resta aperto solo per
la decisione D1 più ampia del backend contract audit, fuori scope di questo run).

---

## REPORT FINALE

```
GIT_STATE: branch feat/fantawalrus-product-flow, HEAD ccb3635 prima di questo run,
  3 commit locali già avanti a origin (non pushati) — discrepanza col messaggio "nessun commit"
  chiarita: erano semplicemente non pushati, mai assenti
RPC_CREATED: create_fanta_team_v1(p_league_id uuid, p_team_name text) returns uuid,
  security definer, search_path pinnato, auth.uid()-only, lock riga lega (for update),
  atomica, EXECUTE solo per authenticated — in supabase/migrations/0002_fanta_functions_v1.sql
DIRECT_INSERT_POLICY: rimossa fanta_teams_owner_insert e fanta_team_members_insert_self
  in supabase/migrations/0003_fanta_rls_v1.sql — zero insert diretto client-side residuo su
  team/membership, unica via = RPC
RLS_LINEUPS: fanta_lineups_select_own_or_public ristretta a owner OR membro della stessa lega
  (dopo locked/finalized) OR admin; anon invariato a zero accesso (nessuna policy)
ADMIN_CLAIM: app_metadata.fanta_role='admin' confermato, invariato nel codice, documentato
  esplicitamente (assegnazione solo server-side, no self-promotion, no service role nel client)
VALIDATION: supabase/tests/fanta_hardening_v1_checklist.sql — 12 scenari documentati,
  NON eseguiti a runtime (Supabase CLI non disponibile in questo ambiente)
TEST: 130/130 PASS (node --test src/fanta/**/*.test.js, invariato)
BUILD: PASS (npm run build, stesso warning preesistente non bloccante)
COMMITS: proposti sotto, non ancora eseguiti — in attesa di approvazione Eros
BLOCKERS: Supabase CLI assente → validazione FASE 4 resta su carta/checklist, non runtime
REMOTE_APPLY_READY: NO — nessuna migration applicata/testata su un'istanza Postgres reale,
  nessun accesso a un progetto Supabase in questo run
DECISIONS_REQUIRED:
  (1) FASE 4 punto 12 — l'admin, tramite create_fanta_team_v1(), è comunque soggetto al limite
      "1 account = 1 squadra" (nessuna eccezione codificata per il claim admin nella RPC stessa,
      solo nelle policy di lettura/override lineup). Confermare che sia il comportamento voluto.
  (2) Validazione FASE 4 resta solo su carta finché non è disponibile un'istanza Postgres/Supabase
      locale: prima di un eventuale REMOTE_APPLY_READY=YES, i 12 scenari del checklist vanno
      eseguiti davvero (supabase start o branch Supabase usa-e-getta), non solo letti.
```

---

## STOP

Fermato come richiesto prima di: `supabase db push`, migration remota, accesso progetto Supabase,
service role, env, deploy, push Git, merge, dati reali utenti, cancellazioni/reset/stash, modifiche
a `main`. Nessun commit creato in questo run — proposti sotto in attesa di approvazione Eros:

```
git add supabase/migrations/0002_fanta_functions_v1.sql supabase/migrations/0003_fanta_rls_v1.sql
git commit -m "security(fanta): add atomic team creation RPC"

git add supabase/migrations/0003_fanta_rls_v1.sql
git commit -m "security(fanta): harden lineup visibility policies"

git add supabase/tests/fanta_hardening_v1_checklist.sql \
        ai-ops/reports/fantawalrus-supabase-schema-hardening-v1.md \
        ai-ops/reports/fantawalrus-supabase-schema-pack-v1.md \
        ai-ops/reports/fantawalrus-backend-contract-audit.md
git commit -m "docs(fanta): record schema hardening v1"
```

Nota: il primo commit proposto sopra tocca `0003_fanta_rls_v1.sql` per la sola porzione relativa
all'insert diretto (FASE 1); il secondo tocca lo stesso file per la sola policy lineup (FASE 2) —
richiede uno staging selettivo (`git add -p supabase/migrations/0003_fanta_rls_v1.sql`) per
separare correttamente i due hunk nei due commit, invece di un secondo `git add` sull'intero file
(che non produrrebbe nulla da committare, essendo già incluso nel primo). Eros può scegliere di
collassare i primi due commit in uno solo se preferisce non fare lo split manuale degli hunk.
