# AI FACTORY RUN RESULT — AI Factory audit read-only: progettare Context Pack Lite V0. Verifica come viene generato oggi context.md, quali dati minimi può includere senza RAG, e proponi il micro-step implementativo. Non modificare file.

## 0. Metadata

- Date: 2026-07-07
- Slug: ai-factory-audit-read-only-progettare-context-pack-lite-v0-v

## 1. Obiettivo

Audit read-only: capire come oggi il runner genera `context.md`, quali dati minimi
potrebbe includere un "Context Pack Lite V0" senza RAG, e proporre il micro-step
implementativo. Nessuna modifica a file.

## 2. File letti

- ai-ops/runner/run.js (righe 1-140, 850-1340 — parsing CHECKPOINT.md e rendering context.md)
- ai-ops/runner/templates/context_template.md (template completo)
- ai-ops/runs/.../context.md (output generato in questa run)
- ai-ops/runs/.../claude_prompt.md (per verifica scope)

## 3. File modificati

Nessuno.

## 4. Modifiche effettuate

Nessuna (task read-only).

## 5. Comandi eseguiti

- `node ai-ops/runner/run.js --project=ai-factory --sst --write-run-pack -- "..."` (genera il run pack)
- `git status --short` (nessuna modifica inattesa)

## 6. Come viene generato context.md oggi

`run.js` legge `CHECKPOINT.md` in sola lettura (`readCheckpointSnapshot()`, riga 899):
parsing markdown semplice via regex su heading `## `, cerca le sezioni il cui titolo
inizia (case-insensitive) con "STABLE", "DONE", "OPEN ISSUES", "NEXT STEP"
(`findSectionByKeyword`, riga 881), e tronca ciascuna sezione a max 6 righe non vuote
(`summarizeSection`, `CHECKPOINT_SECTION_MAX_LINES = 6`, riga 886).

Il risultato viene iniettato nel template `context_template.md` (placeholder
`{{CHECKPOINT_STABLE}}`, `{{CHECKPOINT_DONE}}`, `{{CHECKPOINT_OPEN_ISSUES}}`,
`{{CHECKPOINT_NEXT_STEP}}`) insieme a un blocco statico fisso "State sources to read"
che elenca 4 file da leggere manualmente (CHECKPOINT.md, CLAUDE.md, ai-ops/README.md,
ai-ops/SECURITY_POLICY.md) — non il loro contenuto, solo il pointer.

Nessuna lettura di codice sorgente, nessun grep del repo, nessun embedding/RAG: è uno
snapshot statico di un solo file (CHECKPOINT.md), sempre identico a prescindere dal
task richiesto. Se `CHECKPOINT.md` manca, il fallback è `"CHECKPOINT.md not found"`
per ogni sezione (nessun crash).

## 7. Dati minimi per Context Pack Lite V0 (senza RAG)

Il vincolo "senza RAG" esclude retrieval semantico/embedding: quindi la fonte deve
restare deterministica e a costo quasi zero (grep/regex su file noti, non ricerca).
Candidati realistici, in ordine di ritorno/costo:

1. **Task-aware file targeting**: se il task menziona keyword note (es. "Poster TV",
   "Spotify", "Supabase", "Kitchen"), aggiungere al context.md un blocco con i path
   noti da CLAUDE.md §9 (es. `LiveTvScreenWalrusPoster.jsx`) — mapping statico
   keyword→path, non ricerca libera.
2. **Ultimi N commit rilevanti**: `git log -5 --oneline -- <area>` filtrato per area
   toccata (se determinabile dal task/categoria), non l'intero log.
3. **Protected areas rilevanti**: invece del blocco fisso CLAUDE.md §5 intero,
   estrarre solo le sezioni pertinenti alla categoria del task (es. task "spotify"
   → solo paragrafo Spotify di §5), riducendo il rumore nel prompt.
4. **Stato build/test noto**: se esiste un ultimo risultato Playwright/build in
   CHECKPOINT.md STABLE, è già coperto dallo snapshot attuale — nessun dato nuovo
   necessario qui.

Tutti questi dati sono già presenti nel repo (CHECKPOINT.md, CLAUDE.md, git log) e
recuperabili con grep/regex deterministici: nessun bisogno di indicizzazione o
similarity search, coerente col vincolo "no RAG".

## 8. Micro-step implementativo consigliato

Partire dal punto a più alto ritorno/più basso rischio: **keyword→path mapping
statico** (punto 1). Motivo: CLAUDE.md §9 già elenca un mapping keyword→file noto
("Poster TV" → `LiveTvScreenWalrusPoster.jsx`, ecc.); serve solo trasformarlo in una
tabella dati (es. `ai-ops/runner/context_map.json`) e una funzione che, dato il testo
task, cerchi le keyword e aggiunga una sezione `## Known files for this task` al
context.md — stesso pattern già usato per CHECKPOINT_* (nessuna nuova dipendenza,
nessun accesso a rete, resta puramente sincrono e deterministico).

Non proporre in questo step: git log filtrato per area (richiede prima definire il
mapping categoria→path glob, dipendenza dal punto 1) né estrazione selettiva di §5
(rischio di omettere per errore un'area protetta rilevante — da trattare con più
cautela in uno step successivo con revisione dedicata).

## 9. Quality Gates

- Scope gate: PASS — solo lettura, nessun file modificato
- Code gate: N/A (nessuna modifica di codice)
- UI gate: N/A
- Data/logic gate: N/A
- Build/test gate: N/A — non richiesto per audit read-only

## 10. Diff Risk Review

Nessun diff: nessun file del repo modificato. Unica scrittura è questo `result.md`
dentro `ai-ops/runs/` (fuori da CLAUDE.md §5 aree protette, previsto dal workflow
Run Pack).

## 11. Rischi residui

- Nessuno identificato per questo audit. Il micro-step proposto (punto 8) tocca solo
  `ai-ops/runner/` (non protetto da CLAUDE.md §5) ma richiede comunque approvazione
  esplicita di Eros prima di qualsiasi scrittura, come da workflow.

## 12. Cosa deve approvare Eros

- Se procedere con il micro-step "keyword→path mapping statico" come prossimo task
  di implementazione (fuori scope di questo audit).
- Se questo risultato va riportato in CHECKPOINT.md → NEXT STEP.

## 13. CHECKPOINT.md da aggiornare

No — audit read-only senza impatto su stato corrente. Se Eros approva il micro-step
come prossimo lavoro, andrà aggiunto a NEXT STEP in un secondo momento (dopo commit).
