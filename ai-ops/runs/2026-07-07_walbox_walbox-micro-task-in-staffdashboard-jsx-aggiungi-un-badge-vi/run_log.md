# AI FACTORY RUN LOG — Walbox micro-task: in StaffDashboard.jsx aggiungi un badge visibile che indica se il collegamento TV è aggiornato o fermo da X secondi, usando remotePlayback.updated_at. Modifica solo StaffDashboard.jsx. Mantieni il comportamento esistente.

## 1. Raw task

Walbox micro-task: in StaffDashboard.jsx aggiungi un badge visibile che indica se il collegamento TV è aggiornato o fermo da X secondi, usando remotePlayback.updated_at. Modifica solo StaffDashboard.jsx. Mantieni il comportamento esistente.

## 2. Generated metadata

- Date: 2026-07-07
- Slug: walbox-micro-task-in-staffdashboard-jsx-aggiungi-un-badge-vi
- Categories: coding-plan, design, tv
- Matched keywords: coding-plan: micro-task · design: tv · tv: tv
- Risk level: low

- Recommended executor: walbox-dev
- Confidence: medium
- Recommended skill: /phase-plan
- Prompt mode: phase_plan_prompt
- Skill/mode reason: Piano esplicito o coding multi-segnale/incerto → spezzare in micro-fasi con /phase-plan (cascata V1.3 regola 8).
- Warnings:
  - segnali misti: più categorie rilevate insieme (coding-plan, design, tv) — verificare che il classificatore non abbia sovrastimato

- Requires approval: yes

Project state e state sources: vedi context.md in questa run pack.

## 3. Routing decision

Task di implementazione/piano/visual sul repo → agente walbox-dev (o Antigravity se visual-browser, vedi CLAUDE.md §2), sempre dopo Gate 1. Vince su qa quando entrambe le categorie sono presenti nello stesso task (V1.2-F).

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 4. Recommended scope

Allowed files/dirs:
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- refactor non richiesti, file non elencati nel Plan

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

- npm run build
- npx playwright test
- git diff --stat   # verificare che compaiano SOLO i file approvati

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
