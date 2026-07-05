# AI FACTORY RUN — Verifica TV Poster sync

## 1. Raw task

Verifica TV Poster sync

## 2. Generated metadata

- Date: 2026-07-05
- Slug: verifica-tv-poster-sync
- Categories: qa, design
- Matched keywords: qa: verifica, sync · design: poster, tv
- Risk level: medium
- categoria "qa" → medium
- Recommended executor: Claude QA/hardening
- Requires approval: yes

## 3. State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## 4. Routing decision

Task di verifica/collaudo → agente walbox-qa-serata o QA read-only, vedi CLAUDE.md §2.

Il routing degli agenti/subagenti non è duplicato qui: la fonte è CLAUDE.md §2.

## 5. Recommended scope

Allowed files/dirs:
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

Forbidden files/dirs:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

Out of scope:
- refactor non richiesti, file non elencati nel Plan
- modifiche al codice di prodotto (i fix passano da un ticket separato)

## 6. Security reminders

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

## 7. Quality gate

- npm run build   # solo se il run tocca davvero codice app
- git diff --stat   # verificare che compaiano SOLO i file approvati
- test pertinenti con scope dichiarato (es. npx playwright test <spec in scope>)
- nessuna scrittura su codice di prodotto: git status deve restare pulito su src/

## 8. Claude Code prompt

```text
Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

TASK:
Verifica TV Poster sync

CLASSIFICAZIONE (dal runner V1, da confermare): qa, design · rischio medium

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)
- ai-ops/SECURITY_POLICY.md (regole 1-10)

WORKFLOW OBBLIGATORIO (CLAUDE.md §3):
Understand → Read-only Audit → Plan → Approvazione Eros (Gate 1) → Act → Build/Test → Quality Gates → Diff Risk Review → Approvazione finale Eros (Gate 2).
Non modificare nulla prima del Gate 1.

SCOPE CONSENTITO:
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

SCOPE VIETATO:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

SECURITY REMINDERS (SECURITY_POLICY.md):
- Read-only di default; write solo su scope approvato al Gate 1
- No git push automatico, no deploy automatico, no database write automatico
- No lettura/modifica env e secrets
- CHECKPOINT.md solo come patch suggerita nel report finale
- Massimo una execution pass in questo run; stop dopo il final report

QUALITY GATE PER QUESTO RUN:
- npm run build   # solo se il run tocca davvero codice app
- git diff --stat   # verificare che compaiano SOLO i file approvati
- test pertinenti con scope dichiarato (es. npx playwright test <spec in scope>)
- nessuna scrittura su codice di prodotto: git status deve restare pulito su src/

FINAL REPORT:
Usa il formato REPORT FINALE di CLAUDE.md §15 (in italiano), inclusa la voce
"CHECKPOINT.md da aggiornare: sì/no" con eventuale patch suggerita.
```

## 9. Checkpoint decision

- CHECKPOINT.md da aggiornare: no / maybe / yes → **da valutare a fine run**
- Solo patch suggerita nel final report, mai update automatico (SECURITY_POLICY.md regola 8).

## 10. Next step

1. Eros legge questo ticket e corregge classificazione/scope se il classificatore V1 ha sbagliato.
2. Eros approva (Gate 1) o scarta il run.
3. Se approvato: copiare il prompt della sezione 8 nell'esecutore consigliato.
4. A fine run: quality gate (sez. 7), diff risk review, Gate 2 prima di ogni commit.
