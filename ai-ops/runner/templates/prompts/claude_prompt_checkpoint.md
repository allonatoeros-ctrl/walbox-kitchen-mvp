Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: documentale / checkpoint, non implementativa (prompt_mode = checkpoint_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)

QUESTO È UN AGGIORNAMENTO DOCUMENTALE, NON CODICE:
- Non modificare codice applicativo per nessun motivo.
- Non toccare Supabase, Spotify, .env/.env.local, package.json, src/.
- Non fare commit, non fare push.
- Aggiorna CHECKPOINT.md direttamente SOLO se lo scope consentito sotto lo
  autorizza esplicitamente. In caso contrario, produci esclusivamente una
  patch suggerita (testo pronto da incollare) senza scrivere sul file.
- Se scrivi su CHECKPOINT.md, tocca solo le sezioni pertinenti al task
  (tipicamente DONE e/o NEXT STEP): non riscrivere sezioni non collegate
  (STABLE, DO NOT TOUCH, OPEN ISSUES) a meno che il task non lo richieda
  esplicitamente.
- Mantieni DONE e NEXT STEP coerenti tra loro: se aggiungi una voce a DONE
  che chiude o cambia il focus corrente, aggiorna anche NEXT STEP di
  conseguenza nello stesso run.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN:
{{QUALITY_GATE}}

SILENT REPORT CONTRACT (CLAUDE.md §0.5):
- full report in result.md o ai-ops/reports/<slug>.md
- chat max 8 righe
- vietato incollare report lunghi salvo richiesta esplicita "print full report"
- TERMINAL SILENT MODE: non stampare in chat output lunghi di bash/git/rg/cat; se un comando produce >20 righe, redirigi/riassumi nel report; vietato incollare git show -p, diff lunghi, rg estesi, cat di file interi; in chat solo comando, esito, righe/commit rilevanti, report path

FINAL REPORT (obbligatorio, in italiano):
- File modificato (o "nessuno, solo patch suggerita")
- Sezione/i aggiornata/e
- Diff summary
- Rischi residui
- Prossimo step consigliato

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Stop dopo il final report.
