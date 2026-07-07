# AI FACTORY RUN LOG — Verifica come run.js genera context.md e se serve un context pack

## 1. Raw task

Verifica come run.js genera context.md e se serve un context pack

## 2. Generated metadata

- Date: 2026-07-07
- Slug: verifica-come-run-js-genera-context-md-e-se-serve-un-context
- Categories: qa
- Matched keywords: qa: verifica
- Risk level: medium
- categoria "qa" → medium
- Recommended executor: Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)
- Confidence: high
- Recommended skill: quality-gate-verifier
- Prompt mode: review_prompt
- Skill/mode reason: QA/audit read-only senza coding/coding-plan → verifica quality gate (cascata V1.3 regola 5).


- Requires approval: yes

Project state e state sources: vedi context.md in questa run pack.

## 3. Routing decision

Task QA su dominio tooling/runner interno (ai-ops), non app/Jukebox: walbox-qa-serata è pensato per il collaudo runtime della app (QR/staff/TV/Spotify), non per validare ai-ops/run.js. Nessun subagente dedicato oggi in CLAUDE.md §2 (V1.4.1-C).

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 4. Recommended scope

Allowed files/dirs:
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
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

- node ai-ops/runner/run.js "<golden case>" --dry-run --json  # golden set A-P regression
- nessuna scrittura su codice di prodotto: git status deve restare pulito su ai-ops/runner/

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
