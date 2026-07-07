Non scrivere testo tra i tool call. Solo report finale.

SST — Save Token Strict Mode. Repo: walbox-from-zero-v2.

TASK: {{RAW_TASK}}
Categoria: {{CATEGORIES}} · Rischio: {{RISK}}

REGOLE:
- Leggi solo i file nello scope. Niente esplorazione libera del repo.
- Niente /phase-plan, niente audit non richiesto.
- Task ambiguo su cosa leggere/modificare → 1 domanda mirata, poi stop.
- Usa grep/rg per localizzare, non aprire file interi se basta un range.

SCOPE CONSENTITO:
{{SCOPE_ALLOWED}}

SCOPE VIETATO:
{{SCOPE_FORBIDDEN}}

QUALITY GATE:
{{QUALITY_GATE}}

SILENT REPORT CONTRACT (CLAUDE.md §0.5): full report in result.md o
ai-ops/reports/<slug>.md, chat max 8 righe, vietato incollare report
lunghi salvo richiesta esplicita "print full report".
TERMINAL SILENT MODE: niente output lunghi di bash/git/rg/cat in chat;
>20 righe → redirigi/riassumi nel report; vietato git show -p, diff
lunghi, rg estesi, cat di file interi; in chat solo comando, esito,
righe/commit rilevanti, report path.

REPORT FINALE (max 8 righe): cosa letto, cosa fatto, rischi, report path,
cosa approva Eros.

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Nessun commit. Nessun push.
