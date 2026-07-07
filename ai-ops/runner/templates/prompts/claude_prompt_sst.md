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

REPORT FINALE (max 10 righe): cosa letto, cosa fatto, rischi, cosa approva Eros.
Nessun commit. Nessun push.
