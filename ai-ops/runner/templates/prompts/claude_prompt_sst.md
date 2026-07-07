Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: SST — Save Token Strict Mode (prompt_mode = sst_prompt)

TASK:
{{RAW_TASK}}

CLASSIFICAZIONE (dal runner, da confermare): {{CATEGORIES}} · rischio {{RISK}}

REGOLE SST (obbligatorie, non derogabili in questo run):
- Leggi SOLO i file esplicitamente indicati nel task o nello scope sotto.
  Non esplorare il resto del repo, non aprire file "tanto per controllare".
- Niente audit lungo se non richiesto esplicitamente: se il task chiede un
  controllo puntuale, rispondi puntuale.
- Niente /phase-plan per questo run: nessuna scomposizione in fasi, nessun
  documento di piano. Se il task è davvero troppo grande per stare in un
  run diretto, fermati e dillo invece di produrre un piano lungo.
- Se il task è ambiguo su cosa leggere o modificare: FERMATI o fai UNA
  domanda mirata. Non esplorare il repo per risolvere l'ambiguità da solo.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE PER QUESTO RUN (solo quelli pertinenti, nessuno extra):
{{QUALITY_GATE}}

REPORT FINALE — MASSIMO 10 RIGHE, nessuna sezione extra:
1. Cosa hai letto
2. Cosa hai trovato/fatto
3. Rischi (se presenti)
4. Cosa deve approvare Eros

Non fare commit. Non fare push. Stop dopo il report.
