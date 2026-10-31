# PULIZIA DB — staccare tutto ciò che non è Kitchen — file di stato

## ORA
- Data: 2026-10-30 · Fase: **V4 CHIUSO (R1 + R2 + R3): DB di produzione solo Kitchen, migration in `main`. Prossimo passo: Fase 2 privacy (`PRIVACY_GDPR.md`, utenti anonimi senza dati: NEEDS_DECISION su N giorni).**
- **R3 fatto (30/10, via di Eros "Sì, vai con R3"):** branch `chore/db-pulizia-v4` dal worktree v4, commit `f157e4c` (congela) e `b13c3a9` (drop), contenuto identico a `8ff855d`/`3095d4a`. PR #7, check verdi (local-tests, Vercel), merge `33cb0f1` su `main` (`--match-head-commit b13c3a9`), deploy Vercel produzione `success`. Branch remoto `chore/db-pulizia-v4` lasciato su GitHub.
- **R1 fatto (30/10, via di Eros "Sì, vai con R1"):** `npx supabase --workdir <scratchpad>/v4 db push --linked` → applicate `20261030120000` (congela) e `20261030130000` (drop), guardia passata.
- **R2 postcheck (MCP, sola lettura):** 0/21 tabelle e 0/9 funzioni non-Kitchen; 14 `kitchen_*` presenti; `is_staff_for_venue` e `_walbox_set_updated_at` presenti; Realtime = solo `public.kitchen_orders`; schema `watchdog_obs` presente; 2 cron attivi; `kitchen_orders` 1337 righe (ultimo ordine 30/10 12:50 UTC); `auth.users` 1467 (invariati); `migration list --linked` = nessun pending. Ripristino possibile solo dal backup V2.
- **V4 preparato (30/10, nulla applicato, nessun commit):** worktree temporaneo detached a `origin/main` (`b1be353`) in `<scratchpad sessione 017d9a46>/v4`, con `git cherry-pick -n 8ff855d 3095d4a` (solo i 5 file congela + drop + rollback, in stage, **non committati**) e `supabase/.temp` copiato dal repo (project-ref `pcrqfdzipotprqtuemso`). Verifiche: test 16/16; conteggi guardia su prod (MCP, sola lettura) = backup, 203 righe, nessuna scrittura dopo V2; `migration list --linked` = pending solo `20261030120000` e `20261030130000`; `db push --linked --dry-run` = "Would push" esattamente quelle 2, senza `--include-all`.
- **Piano V4 (gate Eros, in ordine):**
  - R1 (irreversibile, cancella dati): `npx supabase --workdir <scratchpad>/v4 db push --linked`. Se la guardia scatta → nulla cambia, rifare V2.
  - R2 postcheck (MCP, sola lettura): 0 delle 21 tabelle e 0 delle 9 funzioni; 14 tabelle `kitchen_*` presenti; `is_staff_for_venue` e `_walbox_set_updated_at` presenti; publication `supabase_realtime` = solo `kitchen_orders`; `migration list --linked` senza pending; ordine Kitchen leggibile (select su `kitchen_orders` recenti).
  - R3 (gate commit/push/merge): nel worktree v4 branch `chore/db-pulizia-v4`, 2 commit (stessi messaggi di `8ff855d` e `3095d4a`), push, PR verso `main`, merge. Così `main` ha le migration già applicate (niente drift). Vercel ridistribuisce ma il frontend non cambia.
  - Dopo: `feat/restyling-hero` contiene ancora `8ff855d`/`3095d4a`: al prossimo rebase su `main` git li riconosce come già presenti (stesso contenuto). Worktree `pr6` e `v4`: `git worktree prune` quando gli scratchpad spariscono.
- **V3 fatto (30/10, via di Eros "Sì, vai con V3"):** R1 `npx supabase --workdir <scratchpad>/pr6 db push --linked --include-all` da worktree temporaneo detached a `39facce` (dry-run prima: solo le 2 migration PR #6) → applicate `20261028120000` (menu ottobre) e `20261028121000` (pickup_slot). R2 merge PR #6 (`--match-head-commit 39facce`) → merge commit `b1be353` su `main`, deploy Vercel `success`. R3 postcheck (MCP, sola lettura): 10 righe menu con prezzi attesi, nessuna availability che le blocca, colonna `pickup_slot` + vincolo presenti, v3 anon=false/authenticated=true; `migration list --linked` = pending solo `20261030120000` (congela) e `20261030130000` (drop). Il worktree temporaneo resta registrato in git (nello scratchpad della sessione): da togliere con `git worktree prune` quando la cartella sparisce.
- Vincolo che resta: `feat/restyling-hero` ha anche `67a951c`, `5675b4e`, `332f373` (privacy "non pubblicare prima della Fase 2"): **non** vanno in `main` con V4.
- Nota: le righe Schweppes `item-049/050` restano orfane in `kitchen_menu_items` (voluto dalla migration menu): pulizia eventuale con migration dedicata, task separato.
- **V1 fatto (30/10, commit `3095d4a`, non pushato):** `supabase/migrations/20261030130000_drop_non_kitchen_v1.sql` + `.test.js` (7/7; con il congela 16/16). Ordine: guardia → DROP delle 2 funzioni che usano il tipo riga di `party_ferie_requests` (verificato su prod con `pg_depend`) → DROP delle 21 tabelle in un comando → DROP delle altre 7 funzioni. Niente CASCADE, niente IF EXISTS. Guardia: se una tabella ha più righe del backup, `raise exception` e non cancella nulla. **Provato su Postgres locale (OrbStack):** tutte le migration ok; ripristino del backup 203/203 righe, 49 policy, 7 trigger, 9 funzioni; guardia con 1 riga in più → errore e rollback; congela + drop sui dati ripristinati → 0 tabelle/funzioni non-Kitchen, 14 `kitchen_*` intatte, `auth.users` intatta. Stack e OrbStack spenti.
- **V2 fatto (30/10):** backup in `~/Desktop/03_DOCUMENTI/backup/walbox_non_kitchen_2026-10-30.sql` (ripristinabile: tabelle, constraint, indici, 203 insert, FK, funzioni, RLS, policy, trigger; ACL e Realtime come commenti) + `.raw.json` (uscita grezza). Letto con `npx supabase db query --linked -f` (solo SELECT) per scrivere su file senza passare dalla chat: **deroga a `supabase/CLAUDE.md` ("lettura prod: solo MCP o migration list")**, da confermare da Eros. Conteggi = inventario. sha256 .sql `1dbf6cf1…394a`.
- Nota: `_walbox_set_updated_at` non è creata da nessuna migration del repo (esiste solo in prod): drift già presente, non toccato.
- Promemoria V4: la guardia confronta col backup del 30/10. Se prima del push qualcuno scrive in quelle tabelle, il push fallisce (voluto): rifare V2 e aggiornare i numeri nella migration.
- File Passo 2 (commit `8ff855d` su `feat/restyling-hero`, non pushato): `supabase/migrations/20261030120000_freeze_non_kitchen_access_v1.sql` + `.test.js` (9/9 pass), rollback `ai-ops/current/DB_PULIZIA_rollback_congela.sql` (fuori da migrations apposta). Non provati su Postgres locale.
- DECISO (Eros 30/10): **non usa** Jukebox/Shuffle Night, Live Night, Party Ferie, FantaWalrus. Vanno staccati dal DB di produzione (`pcrqfdzipotprqtuemso`), che oggi le contiene insieme a Kitchen.
- Già verificato: il codice Kitchen (`src/`, `api/`, `supabase/functions/`) non usa tabelle Fanta (i "fanta" in `src/` sono la bibita). `node_modules` qui è una cartella vera, non un symlink verso `walbox-fanta-preview`.
- Migration non-Kitchen nel repo: `20260710173930_jukebox_schema_baseline_v1`, `20260710173935_live_night_v0_schema_rls`, `20260722220015_party_ferie_v0_schema_rls`, `20260727011827_p0_2_r4_rls_hardening_f4` (tocca solo `playback_state`, `song_requests`, `venue_settings`), 7 migration `fanta` (20260802…–20260818…).
- Esito inventario: **separazione pulita.** Nessuna FK, trigger, cron o Edge Function di Kitchen dipende da tabelle non-Kitchen. Dati non-Kitchen pochissimi, ultimo uso 20/08. Dettaglio sotto in "Inventario".
- **30/10 apply tentato → STOP al precheck, nulla applicato.** Branch `feat/restyling-hero` e progetto linked `pcrqfdzipotprqtuemso` OK, test 9/9 OK. Ma `migration list --linked` mostra **3 pending, non 1**: `20261028120000` (menu ottobre, prezzi/bibite) e `20261028121000` (ritiro con orario), commit `7bb51b7`, fanno parte della PR #6, non sono in `origin/main`. `db push` le applicherebbe insieme (e senza `--include-all` rifiuta, perché `20261028192100` è già remota). - **DECISO (Eros 30/10): prima rilascio PR #6, poi congela.** OK di Eros all'apply del congela già dato ("apply Passo 2"): vale dopo il rilascio.
- **DECISO (Eros 30/10): strada VELOCE.** Niente settimana di controllo: backup e poi cancellazione vera (DROP) di Jukebox, Fanta, Live Night e Party Ferie. Eros: "voglio un DB solo Kitchen"; il Jukebox, se tornerà, sarà rifatto da zero. Sostituisce i Passi 3-5 dell'opzione 1.
- Piano veloce (prossima sessione, `/effort high`):
  - V1 (locale, nessun gate): nuova migration `<ts>_drop_non_kitchen_v1.sql` + `.test.js`. DROP delle 21 tabelle (policy, trigger, sequence e FK verso `auth.users` se ne vanno con loro) e delle 9 funzioni. **Senza CASCADE**, così se c'è una dipendenza nascosta fallisce invece di trascinare via altro. Il test verifica che non compaiano `kitchen_*`, `is_staff_for_venue`, `_walbox_set_updated_at` né `watchdog_obs`. Prova su Postgres locale se lo stack OrbStack è disponibile. Il congela `20261030120000` resta: va su nello stesso push, è innocuo.
  - V2 (lettura su produzione, autorizzata da "veloce"): backup dati + schema delle 21 tabelle in un file **fuori dal repo** (es. `~/Desktop/03_DOCUMENTI/backup/`), poi controllo che il file contenga le righe dell'inventario.
  - V3 (gate Eros): rilascio PR #6. (R1) db push delle 2 migration PR #6 **da un checkout temporaneo a `39facce`**, senza i file congela/drop → (R2) merge PR #6 subito dopo → (R3) postcheck read-only.
  - V4 (gate Eros): da qui `migration list --linked` = pending solo congela + drop → `npx supabase db push --linked` → postcheck: le 21 tabelle e le 9 funzioni non esistono più, Kitchen ordina (sola lettura).
  - Dopo: utenti anonimi senza dati (947) → Fase 2 privacy (`PRIVACY_GDPR.md`), task separato.
- Vincolo: **non pushare** questo branch prima del merge: i 4 commit locali (`67a951c`, `5675b4e`, `332f373` privacy "non pubblicare prima della Fase 2", `8ff855d` congela) finirebbero nella PR #6.
- Collegamento: finché non è fatto, la Fase 2 privacy (`PRIVACY_GDPR.md`) esclude la cancellazione degli utenti anonimi.

## Opzioni (consigliata la 1)
1. **Congela → controlla → backup → cancella.** Prima si toglie l'accesso dalle app a quelle tabelle (reversibile in un minuto), si aspetta una settimana con Kitchen in uso, poi backup completo e migration che le cancella.
2. **Backup e cancella subito.** Più veloce, ma se qualcosa di nascosto le usava lo scopri in serata.
3. **Lasciarle e basta.** Zero rischio, ma il DB resta pieno di dati e utenti che non usi (peggio per privacy).

## Passi (opzione 1)
1. Inventario read-only sul DB reale (gate "DB reale"): tabelle, funzioni, policy, trigger, job cron, Edge Functions, bucket Storage, Realtime per area; cosa di Kitchen dipende da cosa (FK, funzioni condivise come `is_staff_for_venue`); quanti utenti auth sono solo non-Kitchen.
2. Migration "congela": REVOKE di anon/authenticated sulle tabelle/funzioni non-Kitchen. Gate di Eros per l'apply.
3. 7 giorni di uso normale di Kitchen + controllo log errori.
4. Backup (`pg_dump` degli schemi/tabelle non-Kitchen) salvato fuori dal repo.
5. Migration "cancella" (DROP tabelle/funzioni/policy/job), poi utenti anonimi non-Kitchen. Gate di Eros.
6. Pulizia repo/worktree e CLAUDE.md (§1, §2): Eros decide cosa archiviare.

## Inventario (Passo 1, 30/10, query read-only su `pcrqfdzipotprqtuemso`)
**Tabelle non-Kitchen (21, righe esatte):**
- Fanta (14): `fanta_player_snapshots` 117, `fanta_rosters` 15, `fanta_leagues` 1, `fanta_teams` 1, `fanta_team_members` 1; vuote: `fanta_events`, `_fixtures`, `_ingestion_runs`, `_lineups`, `_rounds`, `_standings`, `_team_scores`, `_var_adjustments`, `_votes`. Ultimo dato 06/08.
- Jukebox: `song_requests` 63 (ultima 20/08), `playback_state` 1, `venue_settings` 1 (ultimo update 07/07).
- Live Night: `live_settings` 1, `live_submissions` 2 (ultima 15/07).
- Party Ferie: `party_ferie_requests` 0, `party_ferie_assets` 0.

**Funzioni non-Kitchen (da togliere):** `create_fanta_team_v1`, `save_fanta_roster_v1`, `fanta_is_admin`, `fn_enforce_lineup_deadline`, `fn_enforce_max_teams`, `fn_set_updated_at` (usata solo dai trigger fanta), `party_ferie_attach_asset`, `party_ferie_is_operator`, `party_ferie_transition_request`. `create_fanta_team_v1` e `save_fanta_roster_v1` sono SECURITY DEFINER eseguibili da `anon`.

**Condivise — NON toccare:** `is_staff_for_venue` (16 policy Kitchen + 4 Jukebox), `_walbox_set_updated_at` (trigger Kitchen). Schema `watchdog_obs` = osservabilità Kitchen, resta.

**Altro:**
- FK: nessuna da Kitchen verso tabelle non-Kitchen. Fanta ha FK verso `auth.users` (`fanta_team_members.user_id`, `fanta_var_adjustments.author_id`): vanno tolte prima di cancellare utenti.
- Trigger: 6 sulle tabelle fanta, nessuno su jukebox/live/party.
- Cron: solo Kitchen (`kitchen-online-abandon-sweep`, `kitchen-cron-history-retention`).
- Edge Functions: solo `send-order-ready-push` e `watchdog-observability` (Kitchen).
- Storage: nessun bucket.
- Realtime: 6 tabelle non-Kitchen nella publication (`song_requests`, `playback_state`, `venue_settings`, `live_settings`, `live_submissions`, `party_ferie_requests`); Kitchen ha solo `kitchen_orders`.
- Codice di questo worktree (`src`, `api`, `supabase/functions`, `scripts`, `tests`): zero riferimenti alle tabelle non-Kitchen.

**Utenti auth:** 1467 totali, 1463 anonimi, 4 non anonimi. 520 hanno dati Kitchen, 1 ha dati Fanta, **947 non hanno dati in nessuna tabella** (946 creati da oltre 30 giorni). Le tabelle Jukebox/Live non salvano l'utente: **non si può dire chi era "solo Jukebox"**. Criterio proposto per la Fase 2 privacy: anonimi senza dati Kitchen e più vecchi di N giorni (NEEDS_DECISION: N).

**Rischio aperto (lo copre la settimana di congelamento):** altri deploy (worktree `walbox-fanta-preview`, eventuali progetti Vercel Jukebox/preview) potrebbero ancora puntare a questo DB. Non verificabile da qui.

## Passo 2 — cosa farà la migration "congela" (bozza, non scritta)
- `REVOKE ALL` da `anon`, `authenticated` sulle 21 tabelle non-Kitchen e `REVOKE EXECUTE` sulle 9 funzioni sopra.
- Toglie le 6 tabelle non-Kitchen dalla publication `supabase_realtime`.
- Niente DROP, niente dati toccati. Rollback = migration inversa con i `GRANT` originali (da preparare insieme).
- Test accanto (`*.test.js`, assert sul testo SQL) che controlla che non compaia nessuna tabella `kitchen_*` né `is_staff_for_venue` / `_walbox_set_updated_at`.

Modello/effort: sessione principale `/effort high` per 1, 2, 5 (DB di produzione); 6 subagent Sonnet medium.
