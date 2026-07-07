Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: micro-fix (prompt_mode = micro_fix_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)

QUESTO È UN MICRO-FIX, NON UN'IMPLEMENTAZIONE AMPIA:
- Modifica SOLO i file chiaramente necessari per risolvere il task indicato.
- Niente refactor, redesign, cleanup generico o modifiche opportunistiche
  anche se "già che ci sei" sembrano comode.
- Niente rinomina di file/variabili, niente riorganizzazione di cartelle,
  niente aggiornamento di dipendenze.
- Se durante il lavoro scopri che il fix richiede toccare file non previsti
  o si allarga oltre lo scope iniziale: FERMATI, non continuare, e scrivi
  subito il report finale spiegando cosa hai trovato e perché serve
  un'approvazione più ampia.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN (esegui solo quelli pertinenti al fix):
{{QUALITY_GATE}}

SILENT REPORT CONTRACT (CLAUDE.md §0.5):
- full report in result.md o ai-ops/reports/<slug>.md
- chat max 8 righe
- vietato incollare report lunghi salvo richiesta esplicita "print full report"

FINAL REPORT (obbligatorio, in italiano):
- File toccati (lista esatta)
- Diff summary (cosa è cambiato, in breve)
- Test/build eseguiti e risultato
- Rischi residui
- CHECKPOINT.md da aggiornare: sì/no (solo patch suggerita, mai scrittura diretta)

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Stop dopo il final report.
