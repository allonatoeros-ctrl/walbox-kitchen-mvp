# REPORT FINALE — AI Factory Runner V1.6.1: Known Files Hardening

## 1. Obiettivo
Rendere i "Known files" del runner (`context_map.json` → `buildKnownFiles()`) verificati contro il filesystem reale, distinguendo `valid` da `stale`, con warning visibile in `context.md` e nel payload `--json`.

## 2. File letti (audit read-only)
- `ai-ops/SECURITY_POLICY.md`
- `ai-ops/runner/run.js` (funzione `buildKnownFiles`, uso in run-pack e payload `--json`)
- `ai-ops/runner/context_map.json`
- `ai-ops/runner/templates/context_template.md` (solo lettura — non in scope di modifica)
- `ai-ops/runner/README.md`
- `git log --all` per i 4 path stale, per verificare se esisteva un rinominato ovvio

## 3. File modificati
- `ai-ops/runner/run.js`
- `ai-ops/runner/context_map.json`
- `ai-ops/runner/README.md`

Nessun altro file toccato.

## 4. Modifiche effettuate

### `run.js`
- `buildKnownFiles(rawTask, projectName)`: ora valida ogni path candidato con `fs.existsSync(path.join(REPO_ROOT, entry.path))` e ritorna `{ valid, stale }` invece di un array piatto.
- La chiamata a `buildKnownFiles()` è stata spostata **prima** del branch `if (json)`/`--write-run-pack`: prima veniva calcolata solo dentro `--write-run-pack`, quindi era invisibile con `--dry-run --json` senza run pack. Ora è sempre calcolata (costo trascurabile: poche `fs.existsSync`).
- Payload `--json` (e `runner.json` della run pack): aggiunti i campi `known_files` (valid) e `stale_known_files`.
- `context.md`: la sezione "Known files for this task" elenca solo i `valid`; se ci sono `stale`, sotto compare un blocco `⚠️ Known files stale (...)` con l'elenco dei path non trovati.
- `RUNNER_VERSION`: `'V1.6'` → `'V1.6.1'`.

### `context_map.json`
Rimosse 4 entry stale (nessun rinominato ovvio trovato in `git log --all`, quindi rimozione anziché correzione):
- `src/pages/LiveTvScreen.jsx` (cancellato nel commit `8575c0d`, non rinominato)
- `src/pages/ManagerDashboard.jsx` (mai esistito nella storia del repo)
- `src/pages/CustomerJukeboxOldOrange.jsx` (mai esistito nella storia del repo)
- `src/pages/CustomerEntryWalrusUpgrade.jsx` (mai esistito nella storia del repo)

### `README.md`
Aggiunta sezione `## Novità V1.6.1 — Known files hardening` (stesso stile delle sezioni precedenti), nessuna modifica al resto del file.

## 5. Comandi eseguiti
```bash
node ai-ops/runner/run.js "Verifica layout ManagerDashboard" --dry-run --json
node ai-ops/runner/run.js "Verifica StaffDashboard" --dry-run --json
node ai-ops/runner/run.js "Scrivi un post social per il locale" --dry-run --json   # keyword senza known file
node --check ai-ops/runner/run.js
python3 -c "import json; json.load(open('ai-ops/runner/context_map.json'))"
git diff --stat
git status -sb
```
Inoltre, verifica mirata del path `stale` (non richiesta esplicitamente ma necessaria per validare il meccanismo, non solo la pulizia dati): aggiunta temporanea di un'entry fittizia con path inesistente, run con `--write-run-pack --json`, controllo di `stale_known_files` e del warning in `context.md`, poi rimozione dell'entry e della run pack generata. Nessuna traccia residua.

`npm run build`/`npm test` non eseguiti: la modifica non tocca `src/`, nessun impatto sul build applicativo.

## 6. Comportamento prima/dopo

| | Prima | Dopo |
|---|---|---|
| `buildKnownFiles()` | ritorna array piatto di path, nessuna verifica filesystem | ritorna `{ valid, stale }`, verificato con `fs.existsSync` |
| `--dry-run --json` | non calcolava mai i known files (solo dentro `--write-run-pack`) | riporta sempre `known_files` e `stale_known_files` |
| `context.md` | elencava ciecamente i path anche se non esistenti | elenca solo i `valid`; warning esplicito se ci sono `stale` |
| `context_map.json` | 4 entry puntavano a file inesistenti | rimosse (nessun rinominato ovvio disponibile) |

## 7. Known files validi/stale nel JSON (evidenza test)

**Test "Verifica layout ManagerDashboard"** (keyword ora rimossa da context_map.json):
```json
"known_files": [],
"stale_known_files": []
```

**Test "Verifica StaffDashboard"** (keyword valida):
```json
"known_files": ["src/pages/StaffDashboard.jsx"],
"stale_known_files": []
```

**Test "Scrivi un post social per il locale"** (nessuna keyword nota):
```json
"known_files": [],
"stale_known_files": []
```

**Test verifica meccanismo stale (entry temporanea, poi rimossa)**:
```json
"known_files": [],
"stale_known_files": ["src/pages/DoesNotExist.jsx"]
```
`context.md` generato mostrava correttamente:
```
⚠️ Known files stale (path non trovato sul filesystem — verificare/aggiornare ai-ops/runner/context_map.json):
- src/pages/DoesNotExist.jsx
```

## 8. Entry rimosse/corrette
Nessuna corretta (nessun rinominato ovvio trovato). 4 rimosse — vedi punto 4.

## 9. git diff --stat / git status -sb (solo file in scope)
```
ai-ops/runner/README.md        | 30 ++++++++++++++++++++++++++++++
ai-ops/runner/context_map.json |  4 ----
ai-ops/runner/run.js           | 42 ++++++++++++++++++++++++++++++++----------
3 files changed, 62 insertions(+), 14 deletions(-)
```
Nessuna scrittura fuori scope. `ai-ops/runs/` contiene solo run pack pre-esistenti da sessioni precedenti (untracked, non toccati da questo task oltre al test temporaneo, ripulito).

## 10. Diff Risk Review

| File | Motivo | In scope | Rischio | Modifiche inattese |
|---|---|---|---|---|
| `ai-ops/runner/run.js` | Hardening `buildKnownFiles`, esposizione JSON, warning `context.md` | sì | basso | no |
| `ai-ops/runner/context_map.json` | Rimozione 4 entry stale | sì | basso | no |
| `ai-ops/runner/README.md` | Documentazione V1.6.1 | sì | basso | no |

## 11. Rischi residui
- **Fuori dal mio scope**: `git diff --stat` sull'intero repo mostra anche `CLAUDE.md` e 6 file in `ai-ops/runner/templates/` (`claude_prompt_template.md` + 5 prompt) modificati con l'introduzione di un `## 0.5 Default Output Mode — Silent First` (Silent Report Contract). **Questi file non sono stati toccati da me** in questo task — erano già presenti come modifiche non committate nel working tree prima/durante questa sessione (presumibilmente lavoro di Eros o di un'altra sessione in parallelo, coerente con l'istruzione "Applica Silent Report Contract" ricevuta in approvazione). Segnalo per trasparenza secondo CLAUDE.md §14, ma non li ho modificati, letti in dettaglio oltre la verifica del diff, né li ho revertiti.
- I 4 path stale sono stati rimossi senza sostituto: se in futuro serve un "Known file" per ManagerDashboard/CustomerJukeboxOldOrange/CustomerEntryWalrusUpgrade/LiveTvScreen (se ricreati), va aggiunta una nuova entry manuale in `context_map.json` con il path corretto.
- Nessun test automatico esiste per `buildKnownFiles()` — la verifica è stata manuale (vedi punto 5); un futuro test unitario ridurrebbe il rischio di regressioni silenziose.

## 12. Cosa deve approvare Eros
- Diff dei 3 file (`run.js`, `context_map.json`, `README.md`)
- Se procedere a commit (non ancora fatto, come richiesto)
- Se serve chiarire lo stato di CLAUDE.md/templates modificati fuori da questo task (vedi punto 11)

## 13. CHECKPOINT.md da aggiornare
Non modificato direttamente (SECURITY_POLICY.md regola 8). Patch suggerita, sezione **NEXT STEP**:
> AI Factory Runner V1.6.1 (Known files hardening) completata (2026-07-07): `buildKnownFiles()` valida contro il filesystem, `context.md`/`--json` mostrano `known_files`/`stale_known_files`, 4 entry stale rimosse da `context_map.json`. In attesa di commit.
