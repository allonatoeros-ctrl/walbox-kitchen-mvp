Sei Claude Code nel progetto Walbox / Walrus Social Jukebox (repo walbox-from-zero-v2).

MODALITÀ: review / QA / diff-risk, read-only (prompt_mode = review_prompt)

TASK:
Verifica come run.js genera context.md e se serve un context pack

CLASSIFICAZIONE (dal runner, da confermare): qa · rischio medium

PRIMA DI AGIRE, leggi in ordine:
- CHECKPOINT.md (stato corrente e NEXT STEP)
- CLAUDE.md §2 (routing), §5 (aree protette), §15 (formato report)

QUESTO È UN REVIEW/AUDIT, NON UN FIX:
- Se disponibili, usa le skill `diff-risk-reviewer` o `quality-gate-verifier`
  (scegli quella pertinente al task; se nessuna delle due è pertinente,
  procedi comunque in modalità read-only equivalente).
- Non modificare codice, in nessun file, per nessun motivo.
- Non creare ticket in ai-ops/tickets/.
- Non fare commit, non fare push.
- Analizza SOLO lo scope autorizzato indicato sotto: non allargare l'audit
  ad aree non elencate, anche se sembrano collegate.
- Esegui build/test solo se richiesti esplicitamente dal quality gate di
  questo run: un review non deve lanciare comandi non pertinenti.

SCOPE CONSENTITO (per l'audit):
- lettura repo + esecuzione test in scope dichiarato (run read-only)
- report di verdetto in ai-ops/reports/ se richiesto

SCOPE VIETATO:
- .env / .env.local / secrets (SECURITY_POLICY.md regola 6)
- package.json / package-lock.json / config deploy (CLAUDE.md §5)
- CHECKPOINT.md (solo patch suggerita, SECURITY_POLICY.md regola 8)
- Supabase / Spotify / auth / routing senza approvazione esplicita (CLAUDE.md §5)

QUALITY GATE PER QUESTO RUN:
- node ai-ops/runner/run.js "<golden case>" --dry-run --json  # golden set A-P regression
- nessuna scrittura su codice di prodotto: git status deve restare pulito su ai-ops/runner/

VERDETTO OBBLIGATORIO:
Chiudi il review con uno di questi tre verdetti espliciti:
- accept
- needs changes
- split into next phase

FINAL REPORT (obbligatorio, in italiano):
- Verdetto (uno dei tre sopra) con motivazione
- File/aree coinvolti nella review
- Rischi rilevati
- Test/build eseguiti e non eseguiti (con motivo)
- CHECKPOINT.md da aggiornare: sì/no (solo patch suggerita, mai scrittura diretta)

Se stai lavorando da una run folder ai-ops/runs/<run>/ e result.md esiste,
compila result.md con il report finale seguendo CLAUDE.md §15.

Non fare commit. Non fare push. Stop dopo il final report.
