Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: piano a fasi (prompt_mode = phase_plan_prompt)

TASK:
Walbox micro-task: in StaffDashboard.jsx aggiungi un badge visibile che indica se il collegamento TV è aggiornato o fermo da X secondi, usando remotePlayback.updated_at. Modifica solo StaffDashboard.jsx. Mantieni il comportamento esistente.

CLASSIFICAZIONE (dal runner, da confermare): coding-plan, design, tv · rischio low

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
- SOLO i file src/ elencati e approvati nel Plan (Gate 1) — preferire 1 file

SCOPE VIETATO:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

QUALITY GATE PER QUESTO RUN (audit/piano, non implementazione):
- npm run build
- npx playwright test
- git diff --stat   # verificare che compaiano SOLO i file approvati

CHIUSURA OBBLIGATORIA:
Termina il piano chiedendo esplicitamente l'approvazione di Eros prima di
implementare qualsiasi fase. Non procedere all'implementazione in questo
run, nemmeno per la prima micro-fase.

Non fare commit. Non fare push. Stop dopo aver presentato il piano.
