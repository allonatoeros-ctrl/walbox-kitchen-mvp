# AI FACTORY RUN LOG — {{TITLE}}

## 1. Raw task

{{RAW_TASK}}

## 2. Generated metadata

- Date: {{DATE}}
- Slug: {{SLUG}}
- Categories: {{CATEGORIES}}
- Matched keywords: {{MATCHED_KEYWORDS}}
- Risk level: {{RISK}}
{{RISK_REASONS}}
- Recommended executor: {{EXECUTOR}}
- Confidence: {{CONFIDENCE}}
- Recommended skill: {{RECOMMENDED_SKILL}}
- Prompt mode: {{PROMPT_MODE}}
- Skill/mode reason: {{RECOMMENDED_SKILL_WHY}}
{{WARNINGS_BLOCK}}
{{DOC_ROLE_LINE}}
- Requires approval: {{REQUIRES_APPROVAL}}

Project state e state sources: vedi context.md in questa run pack.

## 3. Routing decision

{{ROUTING_WHY}}

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 4. Recommended scope

Allowed files/dirs:
{{SCOPE_ALLOWED}}

Forbidden files/dirs:
{{SCOPE_FORBIDDEN}}

Out of scope:
{{SCOPE_OUT}}

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

{{QUALITY_GATE}}

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
