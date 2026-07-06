Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: approvazione/continuazione (prompt_mode = approval_prompt)

DELTA/APPROVAL DA APPLICARE:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

Questo NON è un handoff: nella sessione corrente esiste già un piano o audit
appena prodotto. Non ricostruire il contesto da zero e non rileggere tutto
CHECKPOINT.md/CLAUDE.md come se fosse una nuova sessione.

Se il piano/audit approvato NON è presente nel contesto corrente: fermati
subito e chiedi chiarimento invece di procedere a indovinare cosa è stato
approvato.

Se il piano è presente: tratta {{RAW_TASK}} come approvazione o delta da
applicare a quel piano. Procedi solo sulla fase/scope già discussi.

REGOLE RIGIDE:
- Rispetta esattamente lo scope consentito e vietato sotto, senza espanderlo.
- Non fare refactor, redesign o cleanup opportunistici, anche se comodi.
- Esegui solo il quality gate indicato per questo run, niente di più.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN:
{{QUALITY_GATE}}

FINAL REPORT (breve, in italiano):
- Cosa è stato approvato/eseguito
- File toccati
- Diff summary
- Test/build
- Rischi
- CHECKPOINT.md da aggiornare: sì/no (solo patch suggerita se non autorizzata)

Tono: breve, operativo, zero spiegoni. Non fare commit. Non fare push.
