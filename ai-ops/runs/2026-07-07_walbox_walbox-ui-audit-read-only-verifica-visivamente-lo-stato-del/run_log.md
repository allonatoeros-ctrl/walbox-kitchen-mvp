# AI FACTORY RUN LOG — Walbox UI audit read-only: verifica visivamente lo stato del nuovo badge Sync TV in StaffDashboard.jsx. Obiettivo: controllare se è leggibile, non rompe layout header e comunica bene OK/interrotta/assente. Non cambiare file.

## 1. Raw task

Walbox UI audit read-only: verifica visivamente lo stato del nuovo badge Sync TV in StaffDashboard.jsx. Obiettivo: controllare se è leggibile, non rompe layout header e comunica bene OK/interrotta/assente. Non cambiare file.

## 2. Generated metadata

- Date: 2026-07-07
- Slug: walbox-ui-audit-read-only-verifica-visivamente-lo-stato-del
- Categories: qa, design, tv
- Matched keywords: qa: verifica, sync · design: layout, ui, tv · tv: tv
- Risk level: medium
- categoria "qa" → medium
- Recommended executor: Claude Code (audit read-only — nessuna implementazione)
- Confidence: medium
- Recommended skill: none
- Prompt mode: sst_prompt
- Skill/mode reason: SST: task dichiarato read-only → evitato /phase-plan (anche via fallback audit_prompt), prompt diretto corto (V1.5-D).
- Warnings:
  - task dichiara esplicitamente audit/read-only: NON modificare alcun file, executor non deve implementare (V1.5-D)
  - segnali misti: più categorie rilevate insieme (qa, design, tv) — verificare che il classificatore non abbia sovrastimato

- Requires approval: yes

Project state e state sources: vedi context.md in questa run pack.

## 3. Routing decision

Il task dichiara esplicitamente audit/read-only (V1.5-D): la cascata avrebbe instradato su walbox-dev per keyword tipo "fix"/"piano", ma nessun esecutore deve implementare o modificare file. Override di sicurezza.

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 4. Recommended scope

Allowed files/dirs:
- lettura repo (nessuna scrittura consentita): il task dichiara esplicitamente audit/read-only
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

Forbidden files/dirs:
- QUALSIASI modifica o scrittura di file: il task dichiara esplicitamente audit/read-only — nessun fix va applicato, anche se una keyword nel testo (es. "fix" in "non fare fix") suggerirebbe altrimenti (V1.5-D)
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- qualsiasi implementazione o fix, anche minimo: questo run produce solo un report/audit
- refactor non richiesti, file non elencati nel Plan
- modifiche al codice di prodotto (i fix passano da un ticket separato)

## 5. Security reminders

Da ai-ops/SECURITY_POLICY.md (fonte completa lì, qui solo il richiamo operativo):

- Read-only di default (regola 1)
- Write solo su scope approvato da Eros al Gate 1 (regola 2)
- No git push automatico (regola 3)
- No deploy automatico (regola 4)
- No database write automatico (regola 5)
- No lettura/modifica env e secrets (regola 6)
- CHECKPOINT.md solo come patch suggerita (regola 8)
- Massimo una execution pass per run (regola 9)
- Stop obbligatorio dopo il final report (regola 10)

## 6. Quality gate

- git status --short
- nessuna modifica a src/

## 7. Claude Code prompt

Vedi claude_prompt.md in questa run pack — testo pronto da incollare, non duplicato qui.

## 8. Checkpoint decision

- CHECKPOINT.md da aggiornare: no / maybe / yes → **da valutare a fine run**
- Solo patch suggerita nel final report, mai update automatico (SECURITY_POLICY.md regola 8)

## 9. Next step

1. Eros legge run_log.md e context.md, corregge classificazione/scope se il classificatore ha sbagliato.
2. Eros approva (Gate 1) o scarta il run.
3. Se approvato: copiare il prompt da claude_prompt.md nell'esecutore consigliato.
4. A fine run: quality gate (sez. 6), diff risk review, Gate 2 prima di ogni commit.
