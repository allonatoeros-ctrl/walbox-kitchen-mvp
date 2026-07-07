# Memory Loop V0 — creazione (2026-07-08)

## 1. Obiettivo

Creare una memoria curata (non automatica) per AI Factory Orchestrator, partendo dalle run reali
già classificate in `ai-ops/reports/2026-07-08_run-memory-classification-v0.md`. Solo lettura di
`ai-ops/runs/`; nessuna modifica a src/, env, Supabase, package, deploy o codice app.

## 2. File letti

- `ai-ops/reports/2026-07-08_run-memory-classification-v0.md`
- `ai-ops/runs/2026-07-07_ai-factory_ai-factory-audit-read-only-progettare-context-pack-lite-v0-v/result.md`
- `ai-ops/runs/2026-07-07_walbox_walbox-audit-read-only-verifica-il-badge-sync-tv-in-staffdas/result.md`
- CLAUDE.md, `.claude/skills/silent-report/SKILL.md`, `ai-ops/SECURITY_POLICY.md` (per formato/policy)

## 3. File creati

- `ai-ops/memory/README.md` — spiega il ciclo run pack created → executed → validated → memory e la
  regola di promozione (solo `result.md` completo, non `TBD`).
- `ai-ops/memory/decisions/2026-07-08_context-pack-known-files.md` — decision note dalla run #1
  (Context Pack Lite V0, Known files statico come micro-step validato).
- `ai-ops/memory/decisions/2026-07-08_staffdashboard-sync-tv-known-file.md` — decision note dalla
  run #6 (Known file ha guidato al file corretto; nota che il badge Sync TV esisteva già).
- `ai-ops/memory/archive-index.md` — elenco delle 7 run classificate archive/ignore con motivo
  breve, nessuna promossa a memory.

Nessun file fuori da questa lista toccato. Nessuna modifica a file esistenti.

## 4. Modifiche effettuate

Solo creazione di file nuovi in `ai-ops/memory/` (directory nuova) e di questo report in
`ai-ops/reports/`. Nessuna modifica a codice, config, CHECKPOINT.md o aree protette.

## 5. Comandi eseguiti

- `find ai-ops/memory -type f` — verifica dei 4 file creati
- `grep -rl "decision_note" ai-ops/memory/` — conferma frontmatter `type: decision_note` sulle 2
  decision note
- `git diff --stat` — nessun output (nessun file esistente modificato, solo file nuovi non tracciati)
- `git status -sb` — `ahead 2` invariato rispetto a origin/main; unici untracked:
  `ai-ops/memory/` e il report di classificazione precedente

## 6. Quality Gates

- Scope gate: PASS — solo i 4 file ammessi creati, nessun altro toccato
- Code gate: N/A — nessuna modifica a codice
- UI gate: N/A
- Data/logic gate: PASS — nessuna regola di promozione violata (nessuna run TBD promossa)
- Build/test gate: N/A — task non tocca build/app

## 7. Diff Risk Review

- `ai-ops/memory/README.md` — nuovo file, solo documentazione. Rischio: nessuno.
- `ai-ops/memory/decisions/2026-07-08_context-pack-known-files.md` — nuovo file, decision note
  basata su evidenza già validata (run #1, result.md completo). In scope: sì. Rischio: nessuno.
- `ai-ops/memory/decisions/2026-07-08_staffdashboard-sync-tv-known-file.md` — nuovo file, idem
  (run #6). In scope: sì. Rischio: nessuno.
- `ai-ops/memory/archive-index.md` — nuovo file, solo indice/motivazioni, nessuna promozione
  indebita di run incomplete. Rischio: nessuno.
- Nessuna modifica a `src/`, `.env`, Supabase, package, deploy, CHECKPOINT.md.

## 8. Rischi residui

Nessuno identificato. Le due decision note dipendono da evidenza reale (run con `result.md`
completo); l'archive-index documenta esplicitamente perché le altre 7 run non sono state promosse,
evitando che informazioni non validate entrino nella memoria curata.

## 9. Cosa deve approvare Eros

- Se la struttura `ai-ops/memory/` (README + decisions/ + archive-index) va adottata come formato
  stabile per i prossimi Memory Loop.
- Se procedere con l'implementazione del "Known files" statico
  (`ai-ops/runner/context_map.json`) descritta come limite aperto nella prima decision note — non
  autorizzato da questo task, resta task separato con Gate 1 dedicato.
- Se le 5 run archiviate/ignorate (in particolare le 3 mai eseguite su badge Sync TV) vanno chiuse
  definitivamente o rilanciate.

## 10. CHECKPOINT.md da aggiornare

No — memoria interna di ai-ops, nessun impatto su stato applicativo. Se Eros approva l'adozione
del formato memory come pratica stabile, valutare una riga in NEXT STEP in un secondo momento.
