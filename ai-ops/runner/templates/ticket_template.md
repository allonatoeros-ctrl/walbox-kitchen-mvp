# AI FACTORY RUN — {{TITLE}}

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

## 3. Project state snapshot from CHECKPOINT.md

Snapshot sintetico, letto in read-only da CHECKPOINT.md (max 6 righe per sezione).
Fonte completa e autorevole: CHECKPOINT.md nella root del repo.

- STABLE:
{{CHECKPOINT_STABLE}}
- DONE:
{{CHECKPOINT_DONE}}
- OPEN ISSUES:
{{CHECKPOINT_OPEN_ISSUES}}
- NEXT STEP:
{{CHECKPOINT_NEXT_STEP}}

## 4. State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP — snapshot in sezione 3, dettaglio completo nel file)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## 5. Routing decision

{{ROUTING_WHY}}

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 6. Recommended scope

Allowed files/dirs:
{{SCOPE_ALLOWED}}

Forbidden files/dirs:
{{SCOPE_FORBIDDEN}}

Out of scope:
{{SCOPE_OUT}}

## 7. Security reminders

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

## 8. Quality gate

{{QUALITY_GATE}}

## 9. Claude Code prompt

```text
{{CLAUDE_PROMPT}}
```

## 10. Checkpoint decision

- CHECKPOINT.md da aggiornare: no / maybe / yes → **da valutare a fine run**
- Solo patch suggerita nel final report, mai update automatico (SECURITY_POLICY.md regola 8).

## 11. Next step

1. Eros legge questo ticket e corregge classificazione/scope se il classificatore V1 ha sbagliato.
2. Eros approva (Gate 1) o scarta il run.
3. Se approvato: copiare il prompt della sezione 9 nell'esecutore consigliato.
4. A fine run: quality gate (sez. 8), diff risk review, Gate 2 prima di ogni commit.
