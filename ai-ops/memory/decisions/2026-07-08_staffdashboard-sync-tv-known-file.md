---
name: staffdashboard-sync-tv-known-file
type: decision_note
date: 2026-07-08
source_run: ai-ops/runs/2026-07-07_walbox_walbox-audit-read-only-verifica-il-badge-sync-tv-in-staffdas/
---

# Decision: Known File mapping ha guidato correttamente al file giusto

## Evidenza (da run #6, `result.md` completo, esito pass)

Audit read-only ha verificato dove si trova il badge "Sync TV" in `StaffDashboard.jsx`, usando il
"Known files" di `context.md` come punto di partenza invece di esplorazione libera del repo. Il
badge è stato localizzato interamente in `src/pages/StaffDashboard.jsx`, righe 784-801 (span con
testo condizionale "Sync TV OK" / "Sync TV interrotta (Ns fa)" / "Sync TV assente", basato su
`playbackStale`/`remotePlayback`/`playbackAgeSec`), con un singolo grep mirato, primo tentativo.

## Decisione

**Il mapping Known file → path ha funzionato in un caso reale**: dato il file suggerito, Claude
Code ha trovato il codice corretto senza dover esplorare il repo. Questo conferma la validità
pratica della decisione presa in
[2026-07-08_context-pack-known-files.md](2026-07-08_context-pack-known-files.md) — il pattern
Known files riduce concretamente l'esplorazione libera necessaria.

## Nota importante

Il badge "Sync TV" **esisteva già nel codice** prima di questa run — non è stato creato da questa
sessione né da altre run del 2026-07-07. Due run correlate (`walbox-micro-task-...-aggiungi-un-
badge-vi` e `walbox-ui-audit-...-verifica-visivamente-lo-stato-del`) partivano dall'assunzione
errata che il badge andasse ancora aggiunto/verificato come novità: quella premessa è superata dai
fatti di questa run e le due run correlate non sono mai state eseguite (nessun `result.md`), quindi
non generano memoria propria — vedi `archive-index.md`.

Nessuna modifica di codice è stata fatta o richiesta da questa nota: è solo evidenza a supporto
della decisione di design sul Context Pack.
