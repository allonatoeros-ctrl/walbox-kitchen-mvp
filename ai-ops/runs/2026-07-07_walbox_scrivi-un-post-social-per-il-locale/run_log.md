# AI FACTORY RUN LOG — Scrivi un post social per il locale

## 1. Raw task

Scrivi un post social per il locale

## 2. Generated metadata

- Date: 2026-07-07
- Slug: scrivi-un-post-social-per-il-locale
- Categories: unclassified (triage umano)
- Matched keywords: nessuna keyword riconosciuta
- Risk level: medium
- nessuna categoria riconosciuta → rischio minimo medium, richiede revisione umana
- Recommended executor: manual approval required
- Confidence: low
- Recommended skill: context-health-reset
- Prompt mode: handoff_prompt
- Skill/mode reason: Task non classificato: contesto incerto, reset/handoff e triage umano (cascata V1.3 regola 10).


- Requires approval: yes

Project state e state sources: vedi context.md in questa run pack.

## 3. Routing decision

Categoria non riconosciuta dal classificatore V1: serve triage umano di Eros.

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 4. Recommended scope

Allowed files/dirs:
- nessuno finché Eros non definisce lo scope nel Plan

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- tutto, in attesa di triage umano

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

- git diff --stat ai-ops/   # run docs/ai-ops only
- git status --short ai-ops/   # include file nuovi non tracciati

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
