Non scrivere testo tra i tool call. Solo report finale.

SST — Save Token Strict Mode. Repo: walbox-from-zero-v2.

TASK: Walbox audit read-only: verifica il badge Sync TV in StaffDashboard usando i Known files del context.md come punto di partenza. Obiettivo: controllare se context.md aiuta a localizzare il file corretto. Non modificare file.
Categoria: qa, design, tv · Rischio: medium

REGOLE:
- Leggi solo i file nello scope. Niente esplorazione libera del repo.
- Niente /phase-plan, niente audit non richiesto.
- Task ambiguo su cosa leggere/modificare → 1 domanda mirata, poi stop.
- Usa grep/rg per localizzare, non aprire file interi se basta un range.

SCOPE CONSENTITO:
- lettura repo (nessuna scrittura consentita): il task dichiara esplicitamente audit/read-only
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

SCOPE VIETATO:
- QUALSIASI modifica o scrittura di file: il task dichiara esplicitamente audit/read-only — nessun fix va applicato, anche se una keyword nel testo (es. "fix" in "non fare fix") suggerirebbe altrimenti (V1.5-D)
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

QUALITY GATE:
- git status --short
- nessuna modifica a src/

REPORT FINALE (max 10 righe): cosa letto, cosa fatto, rischi, cosa approva Eros.

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Nessun commit. Nessun push.
