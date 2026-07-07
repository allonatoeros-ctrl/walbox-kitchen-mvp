Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: piano a fasi (prompt_mode = phase_plan_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)

QUESTO RUN È SOLO PIANIFICAZIONE, NON IMPLEMENTAZIONE:
- Se disponibile, usa la skill `/phase-plan`; altrimenti produci un piano
  equivalente seguendo la stessa struttura (audit → micro-fasi → rischi →
  approvazione).
- Fai solo audit in lettura: nessuna modifica a nessun file.
- Non creare ticket in ai-ops/tickets/.
- Non fare commit, non fare push, non installare pacchetti.

IL PIANO DEVE CONTENERE:
- Micro-fasi numerate (es. A, B, C...), ciascuna con un obiettivo chiaro e
  minimo, preferibilmente un file per fase.
- Per ogni fase: file coinvolti (da modificare vs. solo da leggere).
- Rischi specifici per fase (non generici).
- Quality gate per fase (cosa verificare prima di considerarla chiusa).
- Una sezione esplicita "Cosa NON toccare" per fase o per l'intero piano.

SCOPE CONSENTITO (per l'audit di questo run):
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN (audit/piano, non implementazione):
{{QUALITY_GATE}}

SILENT REPORT CONTRACT (CLAUDE.md §0.5):
- full report in result.md o ai-ops/reports/<slug>.md
- chat max 8 righe
- vietato incollare report lunghi salvo richiesta esplicita "print full report"
- TERMINAL SILENT MODE: non stampare in chat output lunghi di bash/git/rg/cat; se un comando produce >20 righe, redirigi/riassumi nel report; vietato incollare git show -p, diff lunghi, rg estesi, cat di file interi; in chat solo comando, esito, righe/commit rilevanti, report path

CHIUSURA OBBLIGATORIA:
Termina il piano chiedendo esplicitamente l'approvazione di Eros prima di
implementare qualsiasi fase. Non procedere all'implementazione in questo
run, nemmeno per la prima micro-fase.

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Stop dopo aver presentato il piano.
