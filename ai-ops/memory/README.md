# AI Factory Memory — V0

Memoria **curata**, non automatica. Nessun processo scrive qui da solo: ogni file in questa
cartella è stato letto e selezionato a mano da una run reale in `ai-ops/runs/`, seguendo il
report `ai-ops/reports/2026-07-08_run-memory-classification-v0.md`.

## Le 4 fasi di una run (e perché non sono la stessa cosa)

```
run pack created  →  run executed  →  run validated  →  memory
```

- **run pack created**: `ai-ops/runner/run.js` ha generato `runner.json` + `claude_prompt.md` +
  `context.md` + `run_log.md` (+ eventuale `result.md` placeholder). Non significa che qualcuno
  abbia lavorato sul task — solo che il ticket esiste.
- **run executed**: un esecutore (Claude Code o subagente) ha effettivamente letto il prompt e
  compilato `result.md` con contenuto reale (non `TBD`).
- **run validated**: il `result.md` compilato ha un esito chiaro (pass/partial/fail) e Eros lo ha
  considerato attendibile — non basta che esista, deve reggere a una lettura critica.
- **memory**: solo dopo la validazione una run può diventare una decision note qui dentro. Una
  memory non è un riassunto della run, è la decisione/limite che ne deriva per il futuro.

## Regola di promozione

**Solo le run con `result.md` completo (non placeholder, non `TBD`) possono diventare memory.**

Conseguenze pratiche:
- Run senza `result.md`, o con `result.md` ancora ai segnaposto del template → restano
  `archive`/`ignore`, non entrano mai qui. Vedi `archive-index.md`.
- Una memory qui dentro deve poter linkare al run pack sorgente (path in `ai-ops/runs/`) come
  prova, così resta verificabile in futuro.
- Se una decisione qui registrata viene smentita da una run successiva, si aggiorna il file
  esistente (non se ne crea uno duplicato) e si annota la data della revisione.

## Indice decisioni

- [2026-07-08 — Context Pack: Known Files statico](decisions/2026-07-08_context-pack-known-files.md)
- [2026-07-08 — StaffDashboard: Known File ha guidato al file corretto](decisions/2026-07-08_staffdashboard-sync-tv-known-file.md)

## Run scartate

Vedi [archive-index.md](archive-index.md) per l'elenco delle run classificate `archive`/`ignore`
e il motivo per cui non sono state promosse.
