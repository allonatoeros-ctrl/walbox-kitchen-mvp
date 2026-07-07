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
- Non scrivere spiegazioni intermedie: nessun commento tra un'azione e
  l'altra, il report finale è l'unico output testuale.
- Usa grep/rg per localizzare prima di leggere: non aprire un file se una
  ricerca mirata basta a rispondere.
- Non leggere file interi se basta un range di righe: usa offset/limit o
  sed -n sulla porzione rilevante.
- Max 200 righe lette per file, salvo approvazione esplicita di Eros per
  quel file.
- Il report va scritto SOLO alla fine del run, non a step intermedi.

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
