Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: handoff / session-start / context reset (prompt_mode = handoff_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

Tratta questo run come una nuova sessione o un passaggio di mano: non dare
per scontato nessun contesto pregresso non scritto nei file di stato.

PRIMA DI PROPORRE QUALSIASI AZIONE, ricostruisci lo stato leggendo in ordine:
- CHECKPOINT.md — fonte primaria per stato corrente, DONE, STABLE, OPEN
  ISSUES, NEXT STEP
- CLAUDE.md — regole operative, routing agenti (§2), aree protette (§5)

Distingui sempre lo stato REALE del repo (file, git status, git log) da
vecchie fonti, assunzioni o memoria di conversazioni precedenti: se un file
o una funzione citata altrove non esiste più o è cambiata, fidati di quello
che vedi ora nel repo.

RICOSTRUISCI E DICHIARA, prima di agire:
- File/aree coinvolti nel task
- Livello di rischio
- Executor o skill consigliata (in base a CLAUDE.md §2 e allo stato letto)
- Quality gate pertinente

REGOLE DI SICUREZZA PER QUESTA FASE:
- Non modificare codice in questa prima fase, a meno che lo scope consentito
  sotto non autorizzi esplicitamente una write.
- Non creare ticket, non fare commit, non fare push.
- Se dall'analisi emerge qualsiasi modifica non banale, non procedere:
  chiedi approvazione umana esplicita prima di implementare.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN:
{{QUALITY_GATE}}

PRODUCI UN PIANO OPERATIVO con micro-fasi numerate (A, B, C...), ciascuna
con obiettivo minimo e file coinvolti, e una sezione esplicita "cosa NON
toccare".

CHIUSURA OBBLIGATORIA (in italiano):
- Stato letto (sintesi da CHECKPOINT.md/CLAUDE.md)
- Routing decision (executor/skill e perché)
- Piano (micro-fasi A/B/C)
- Rischi
- CHECKPOINT.md da aggiornare: sì/no (solo patch suggerita)
- Prossimo prompt consigliato

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Stop dopo aver presentato piano e stato.
