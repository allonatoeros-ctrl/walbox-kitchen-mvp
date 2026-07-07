Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: SST — STOP (prompt_mode = sst_stop_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner): {{CATEGORIES}} · rischio {{RISK}}

Il runner non è riuscito a classificare questo task con sufficiente
sicurezza (nessuna categoria riconosciuta). In modalità SST questo NON è
un invito a esplorare il repo per capire cosa fare.

AZIONE RICHIESTA:
- NON leggere file oltre a quelli già indicati nel task, se presenti.
- NON produrre un piano, un audit o un'implementazione.
- Fai UNA sola domanda mirata a Eros per sbloccare l'ambiguità, oppure
  fermati dichiarando esplicitamente cosa manca per procedere.

SILENT REPORT CONTRACT (CLAUDE.md §0.5): chat max 8 righe, nessun report
lungo da incollare in questa modalità.

REPORT FINALE — MASSIMO 8 RIGHE:
1. STOP CONDITION TRIGGERED
2. Motivo (ambiguità rilevata)
3. Domanda mirata (se una sola è sufficiente) oppure cosa manca

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Non esplorare il repo.
