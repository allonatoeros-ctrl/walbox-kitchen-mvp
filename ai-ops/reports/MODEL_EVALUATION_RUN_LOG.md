# MODEL EVALUATION RUN LOG — Walbox

Regola: append-only, un record per task significativo concluso (no micro-task banali).
Valutazione finale: FREE_OK | ESCALATE | CLAUDE_NEEDED.
Tipo errore: [R] = ragionamento, [T] = strumentale/tool.
Costo: solo "costo modello dichiarato" (es. $0 free); mai stima non verificabile.
Soglia escalation (vedi retrospettiva P0-1): >=2 errori [T] o [R] in un task, o area protetta,
o refactor cross-file, o build/test non verificabili in locale → ESCALATE/CLAUDE_NEEDED.

## 2026-07

### P0-1 CustomerRequest.jsx — falsa-conferma invio — PATCH_APPLIED_PASS
- Obiettivo: mostrare successo solo dopo insertRequest riuscita (bug: successo anche su fallimento)
- Modello: tencent/hy3:free (Hermes/Nous, effort high)
- Skill/agent: gated-readonly-audit (applicato manualmente, read-only)
- Tool realmente eseguiti: read_file, search_files, terminal (git diff/status, node --check), patch x3
- File letti: src/pages/CustomerRequest.jsx, src/hooks/useSongRequests.js
- File modificati: src/pages/CustomerRequest.jsx (1 file, unico)
- Iterazioni/correzioni: 1 errore [T] (patch tool match non univoco → duplicò `isSubmitting` vicino a venueSettings) → riparato stesso turno (STATE_BLOCK_REPAIRED)
- Errori di ragionamento [R]: 0
- Gate superati: syntax OK (node --check su handleSubmitRequest); diff == approvato; nessun file protetto toccato
- Gate falliti/non eseguiti: build completa non eseguita (node_modules assente, per vincolo nessun npm ci)
- Supervis. Eros richiesta: Gate1 approvazione patch (APPROVA PATCH CUSTOMER REQUEST); Gate2 commit pendente
- Costo modello dichiarato: $0 (free)
- Tempo operativo: n/d
- Risultato finale: PATCH_APPLIED_PASS — diff identico a FINAL_DIFF_READY_FOR_APPROVAL, fermato prima del commit
- Valutazione: FREE_OK (1 errore strumentale, sotto soglia escalation; da monitorare ripetizione)

### P0-2-R1 Walbox RLS — static review (Claude Code, read-only)
- Obiettivo: audit read-only RLS Supabase dal codice app (inventario operazioni, guard lato client, rischio)
- Modello: claude -p (Claude Code v2.1.211, Hermes VPS), effort high
- Skill/agent: claude-code (delegato da orchestratore Hermes)
- Tool realmente eseguiti: read_file, search_files, terminal (claude -p, git status)
- File letti: src/hooks/useSongRequests.js, useVenueSettings.js, useKitchenOrders.js,
  useKitchenMenu.js, src/pages/StaffDashboard.jsx, LiveTvScreenWalrusPoster.jsx,
  src/lib/supabaseClient.js, supabaseAuth.js
- File modificati: nessuno
- run_status: PARTIAL
- live_rls: NOT_EXECUTED (nessun accesso a Supabase live; 0 file .sql/migration nel repo)
- Supabase MCP: NON VERIFICATO prima della delega (assunto assente, mai controllato)
- Output: troncato (head -80 sul pipe); report rls-audit-CLAUDE.md ricostruito da evidence
  incompleta (Claude non ha salvato il file, sintesi ripresa da stdout troncato)
- Finding CRIT/HIGH: da considerare CONDIZIONALI, NON vulnerabilità confermate
  (dipendono interamente da policy RLS live non verificabili da qui)
- Iterazioni/correzioni: 0
- Errori [R]/[T]: 0
- Gate superati: read-only confermato; 0 repo/0 query write/0 migration
- Gate falliti/non eseguiti: verifica RLS live (BLOCKED_TOOLING)
- Supervis. Eros richiesta: verificare RLS live su Supabase (credenziali sue) o abilitare MCP
- Costo: Hermes = modello free; Claude Code = €0 marginali, quota Claude Pro consumata
- Risultato finale: PARTIAL (statica completa, live non eseguita)
- Classificazione: CLAUDE + SUPABASE_MCP NEEDED
- Valutazione: FREE_OK (statica entro scope; live bloccata da tooling, non da errore Hermes)

### P0-2-R2 Claude Code env audit (Supabase MCP readiness) — PASS
- Obiettivo: determinare se Claude Code (Hermes/VPS) puo' usare Supabase MCP per RLS live Walbox
- Modello: claude -p + terminal Hermes (env read-only), effort high
- Tool realmente eseguiti: whoami, claude --version, claude mcp list, claude mcp get supabase,
  claude auth status --text, lettura ~/.claude.json, git status
- File letti: ~/.claude.json, ~/.claude/settings.json, git status
- File modificati: nessuno
- run_status: PASS (audit ambiente eseguito e completo)
- capability_status: BLOCKED (Claude Code NON puo' raggiungere RLS live: Supabase MCP assente,
  nessuna credenziale Supabase in VPS)
- gap: Supabase MCP assente (claude mcp list -> solo "claude.ai Gmail"; mcpServers {} in ~/.claude.json)
- VPS vs Mac: ambienti diverso (UNKNOWN sul Mac); qui VPS Linux, Claude v2.1.211 nativo
- Iterazioni/correzioni: 0
- Errori [R]/[T]: 0
- Gate superati: read-only confermato; 0 repo/config/Supabase/env modificato
- Gate falliti/non eseguiti: nessun probe MCP (nessun Supabase MCP presente)
- Supervis. Eros richiesta: abilitare Supabase MCP remoto ufficiale (OAuth, read_only) — vedi target
- Costo: Hermes = modello free; Claude Code = €0 marginali, quota Claude Pro consumata
- Risultato finale: PASS (audit) / BLOCKED (capability)
- Classificazione: CLAUDE + SUPABASE_MCP NEEDED
- Valutazione: FREE_OK

### P0-2-R3 Walbox RLS — live probe (Supabase MCP remoto, read-only)
- Obiettivo: verifica live RLS Supabase su tabelle usate dall'app (song_requests, venue_settings,
  playback_state, kitchen_*) tramite Supabase Hosted Remote MCP, solo metadata/policy
- Modello: claude -p (Claude Code v2.1.211, Hermes VPS), effort high, --allowedTools mcp__supabase__*
- Skill/agent: claude-code + Supabase MCP remoto ufficiale (HTTP, scope local, read_only=true)
- Tool realmente eseguiti: list_tables, execute_sql su pg_policies/pg_class (sola lettura metadata)
- File letti: nessuno dal repo (verifica live su Supabase); git status invariato
- File modificati: nessuno
- run_status: PASS (probe eseguito e completo)
- capability_status: OK (Supabase MCP connesso, tool list_tables/execute_sql disponibili)
- security_verdict: FAIL (3 finding statici CONFIRMED: scritture anon senza autorizzazione reale)
- evidence_source: Supabase live via MCP remoto read-only
- Classificazione: CLAUDE + SUPABASE_MCP NEEDED
- Evidenze live (pg_policies, integrale):
  - RLS ENABLED su TUTTE le 13 tabelle public verificate; force_rls=false ovunque
  - song_requests: UPDATE/INSERT/SELECT ruolo {authenticated}, using/with_check = true (no is_anonymous check)
  - venue_settings: UPDATE ruolo {authenticated}, using/with_check = (id='main') (no is_anonymous check)
  - playback_state: INSERT/UPDATE/SELECT ruolo {public}, using/with_check = true (aperto anche senza JWT)
  - kitchen_orders: INSERT ruolo {authenticated}, with_check = customer_id=auth.uid() AND venue_id='walrus-main'
  - live_settings/live_submissions/party_ferie_*: pattern corretto is_anonymous IS FALSE / ownership auth.uid()
- Confronto finding statici P0-2-R1:
  1. song_requests — CONFIRMED: UPDATE consentito senza vera autorizzazione staff
     (ruolo authenticated ma using/with_check true, sessione anonima Supabase = ruolo PG authenticated)
  2. venue_settings — CONFIRMED: UPDATE consentito senza filtro is_anonymous=false
  3. playback_state — CONFIRMED: policy troppo larga su ruolo {public} (INSERT/UPDATE senza JWT)
  4. kitchen_orders — DISPROVED: policy live coerenti con ownership/controlli previsti (no falla)
- Evidenze chiave:
  - RLS ENABLED su tutte le tabelle verificate
  - RLS abilitata NON equivale a policy sicure (3 tabelle critiche con using/with_check=true)
  - nessuna riga letta; nessun write database; nessuna modifica repo/config
  - output live completo, non ricostruito
  - 3 finding CONFIRMED, 1 DISPROVED
- Azioni prioritarie:
  1. hardening UPDATE song_requests e venue_settings con controllo non-anonymous
     (es. AND COALESCE((auth.jwt()->>'is_anonymous')::boolean, true) IS FALSE, pattern gia' in live_settings_staff_update)
  2. restringere playback_state ad authenticated non-anonymous (ruolo {public} -> {authenticated} + is_anonymous IS FALSE)
  3. nessuna modifica a kitchen_orders (finding disproved)
- Costo: Hermes = modello free; Claude Code = quota Claude Pro consumata; Supabase MCP = tooling necessario
- Risultato finale: run PASS / capability OK / security FAIL (3 CONFIRMED, 1 DISPROVED)
- Valutazione: CLAUDE + SUPABASE_MCP NEEDED

### P0-2-R4 Piano hardening RLS Jukebox staff — F0/F4/F5 (read-only, approvato Gate 1)
- Obiettivo: piano SQL per rendere sicuro il Jukebox staff dopo commit 8f45431 (gate /staff + write autenticate)
- Modello: Claude Code + Supabase MCP remoto (read-only), Hermes coordina. Nessun DB write eseguito.
- File/codice modificati: nessuno (solo piano). Commit frontend Gate 2 = 8f45431 (separato).
- Verifiche live effettuate (Supabase MCP, metadata/definizioni, 0 righe lette):
  - is_staff_for_venue(p_venue_id): SECURITY DEFINER, STABLE, search_path fissato,
    corpo EXISTS(SELECT 1 FROM public.kitchen_staff_members WHERE user_id=auth.uid() AND venue_id=p_venue_id)
  - kitchen_staff_members: user_id(PK,FK auth.users), venue_id(PK), role CHECK(staff/manager), created_at default now();
    RLS enabled; 1 policy staff_select_own_member_record (SELECT, authenticated, user_id=auth.uid()) -> nessun client auto-promuove staff
  - song_requests/venue_settings: UPDATE policy {authenticated} using/with_check true (vulnerabili)
  - playback_state: INSERT/SELECT/UPDATE {public} using/with_check true (vulnerabile)
  - auth.users: 254 totali, 2 non-anonimi/non-test (candidati staff, nessuna email letta)
  - jukebox_staff_members: NON esiste
- Decisione riuso kitchen_staff_members: il commit 8f45431 riusa is_staff_for_venue + kitchen_staff_members
  (venue_id='walrus-main'). NESSUNA nuova tabella/funzione (coerente CLAUDE.md §7: stesso registro per
  locale, non duplicazione struttura Jukebox). F0 = nessuna DDL (tabella+policy SELECT own gia' corrette).
- SQL F4 (completo, NON eseguito):
  DROP POLICY IF EXISTS song_requests_allow_authenticated_update ON song_requests;
  CREATE POLICY song_requests_staff_update ON song_requests FOR UPDATE TO authenticated
    USING ( is_staff_for_venue('walrus-main') ) WITH CHECK ( is_staff_for_venue('walrus-main') );
  DROP POLICY IF EXISTS venue_settings_allow_authenticated_update ON venue_settings;
  CREATE POLICY venue_settings_staff_update ON venue_settings FOR UPDATE TO authenticated
    USING ( id='main' AND is_staff_for_venue('walrus-main') )
    WITH CHECK ( id='main' AND is_staff_for_venue('walrus-main') );
  DROP POLICY IF EXISTS "playback_state upsert" ON playback_state;
  DROP POLICY IF EXISTS "playback_state update" ON playback_state;
  CREATE POLICY playback_state_staff_write ON playback_state FOR INSERT TO authenticated
    WITH CHECK ( is_staff_for_venue('walrus-main') );
  CREATE POLICY playback_state_staff_update ON playback_state FOR UPDATE TO authenticated
    USING ( is_staff_for_venue('walrus-main') ) WITH CHECK ( is_staff_for_venue('walrus-main') );
- Bootstrap F5 (placeholder, operazione Eros su Supabase):
  INSERT INTO kitchen_staff_members (user_id, venue_id, role)
    VALUES ('<AUTH_UID_STAFF>', 'walrus-main', 'staff');
- Revoca F5:
  DELETE FROM kitchen_staff_members WHERE user_id='<AUTH_UID_STAFF>' AND venue_id='walrus-main';
- Ordine operativo: F4 -> F5 (mai F5 prima di F4: evita finestra staff-in-tabella ma policy true/true)
- Test 5 scenari:
  T1 anonymous JWT (is_anonymous=true): UPDATE song_requests -> 42501 bloccato
  T2 authenticated NON-staff: UPDATE -> 42501 bloccato
  T3 staff autorizzato (in kitchen_staff_members walrus-main): UPDATE/upsert -> OK
  T4 cliente pubblico: INSERT song_requests (anon) -> OK
  T5 TV read-only: SELECT playback_state da anon/public -> OK invariato
- Rollback completo:
  DROP POLICY IF EXISTS song_requests_staff_update ON song_requests;
  CREATE POLICY song_requests_allow_authenticated_update ON song_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS venue_settings_staff_update ON venue_settings;
  CREATE POLICY venue_settings_allow_authenticated_update ON venue_settings FOR UPDATE TO authenticated USING (id='main') WITH CHECK (id='main');
  DROP POLICY IF EXISTS playback_state_staff_write ON playback_state;
  DROP POLICY IF EXISTS playback_state_staff_update ON playback_state;
  CREATE POLICY "playback_state upsert" ON playback_state FOR INSERT TO public USING (true) WITH CHECK (true);
  CREATE POLICY "playback_state update" ON playback_state FOR UPDATE TO public USING (true) WITH CHECK (true);
- Rischi residui:
  R1 F-SEC-1 (getStaffSession autorizza qualsiasi non-anonimo) resta nel frontend, ma DOPO F4 la policy DB
     blocca le write se non staff -> backstop reale. Sistema sicuro SOLO dopo F4+F5.
  R2 bootstrap richiede utente Auth reale (tra i 2 candidati o nuovo): operazione Supabase Auth, fuori codice.
  R3 finestra vulnerabile se F5 prima di F4 -> evitata da ordine F4->F5.
  R4 riuso kitchen_staff_members mescola Jukebox/Kitchen nello stesso registro locale (accettabile per venue unico).
  F-SEC-2 (Kitchen gate debole getStaffSession) resta finding separato, da trattare a parte.
- Costo: Hermes free; Claude Code quota Claude Pro consumata; Supabase MCP tooling necessario.
- Stato Gate 1: PASS (piano completo, read-only, modello riuso verificato live, policy distinguono staff reale da account generico, rollback pronto, ordine sicuro).
- Stato Gate 2: PENDING (frontend 8f45431 committato; sicurezza end-to-end in attesa di F0/F4/F5 DB su approvazione Eros).
- Valutazione: CLAUDE + SUPABASE_MCP NEEDED
