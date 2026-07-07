# AI Factory Orchestrator V0.2 — Architecture

## Stato V0.1 (completata)

V0.1 ha stabilito le fondamenta operative della AI Business Factory:

- **Runner** — esegue un task dentro un run tracciato (`ai-ops/runner/`)
- **Run Pack** — bundle di contesto minimo per un run (`ai-ops/runs/<run>/`)
- **Result Capture** — cattura output/verdict del run in `result.md`, non in chat
- **Context Pack Lite** — contesto ridotto e mirato, non repo-wide
- **Silent (Silent Report Contract)** — report completi su file, chat max 8 righe
- **Memory Loop V0** — memoria persistente cross-sessione (`ai-ops/memory/`)

V0.1 risponde alla domanda "come eseguo un task in modo tracciabile". Non risponde ancora a
"chi decide quale task eseguire, in che ordine, e chi giudica se è andato bene".

## Visione V0.2: control tower sopra Claude Code

V0.2 introduce una torre di controllo che orchestra i run invece di eseguirli soltanto.
Claude Code resta l'esecutore chirurgico (§2-§3 di CLAUDE.md); l'orchestrator decide cosa
dargli da fare, gli costruisce il contesto, legge il risultato, e aggiorna lo stato del
progetto — senza sostituirsi ai gate umani di Eros.

```
Planner → Runner/Work Unit Builder → Context Builder → Claude Code Executor
                                                              │
                                                              ▼
                                                          Reviewer
                                                              │
                                                              ▼
                                                       Decision Maker
                                                         │        │
                                                         ▼        ▼
                                                Memory Manager   Checkpoint Manager
```

## Componenti

### Planner

- **Input:** CHECKPOINT.md (NEXT STEP), backlog/tickets aperti, richiesta di Eros
- **Output:** una Work Unit candidata (obiettivo singolo, scope, file target)
- **Cosa fa:** traduce "cosa serve ora" in un task eseguibile e delimitato
- **Cosa NON fa:** non stima priorità di business, non decide roadmap (quello resta a Eros/
  `walbox-product-owner`), non scrive codice
- **Artefatto:** `ai-ops/runs/<run>/plan.md`

### Runner / Work Unit Builder

- **Input:** Work Unit dal Planner
- **Output:** un run inizializzato con struttura standard (`ai-ops/runs/<run>/`)
- **Cosa fa:** crea lo scaffolding del run, assegna un id, prepara le cartelle di output
- **Cosa NON fa:** non entra nel merito del task, non tocca file di prodotto
- **Artefatto:** cartella run vuota con `plan.md` collegato

### Context Builder

- **Input:** Work Unit + run
- **Output:** Context Pack Lite specifico per quel task
- **Cosa fa:** seleziona solo i file/estratti rilevanti per lo scope della Work Unit
- **Cosa NON fa:** non incolla repo intero, non include aree protette (§5 CLAUDE.md) se non
  esplicitamente richieste
- **Artefatto:** `ai-ops/runs/<run>/context-pack.md`

### Claude Code Executor

- **Input:** Context Pack + Work Unit
- **Output:** modifiche ai file (dopo Gate 1), log dell'esecuzione
- **Cosa fa:** esegue il workflow §3 di CLAUDE.md (Audit→Plan→Act→Build/Test)
- **Cosa NON fa:** non salta i gate, non committa, non decide se il task è "fatto"
- **Artefatto:** diff + `ai-ops/runs/<run>/log.md`

### Reviewer

- **Input:** log del run, diff prodotto
- **Output:** valutazione strutturata (scope rispettato sì/no, quality gate, rischi)
- **Cosa fa:** applica la checklist di `quality-gate-verifier` e `diff-risk-reviewer`
- **Cosa NON fa:** non approva al posto di Eros, non modifica codice
- **Artefatto:** `ai-ops/runs/<run>/review.md`

### Decision Maker

- **Input:** review.md
- **Output:** verdetto (proponi a Eros / richiedi rework / blocca)
- **Cosa fa:** instrada il run verso Gate 2 o verso un ciclo di correzione
- **Cosa NON fa:** non bypassa mai il Gate umano, non esegue commit/push
- **Artefatto:** `ai-ops/runs/<run>/decision.md`

### Memory Manager

- **Input:** decision.md, esiti confermati da Eros
- **Output:** memorie aggiornate (feedback/project/reference)
- **Cosa fa:** scrive solo ciò che è surprising/non-obvious, secondo le regole di Memory Loop V0
- **Cosa NON fa:** non salva log grezzi, non duplica ciò che sta già in CHECKPOINT.md
- **Artefatto:** file in `ai-ops/memory/` (o memoria di sessione)

### Checkpoint Manager

- **Input:** decision.md approvato da Eros (Gate 2)
- **Output:** CHECKPOINT.md aggiornato
- **Cosa fa:** aggiorna fase, done, stable, open issues, NEXT STEP
- **Cosa NON fa:** non aggiorna CHECKPOINT.md prima dell'approvazione di Eros
- **Artefatto:** `CHECKPOINT.md` modificato

## Principio chiave

Ogni agente/componente produce un **file**, non una conversazione lunga. L'orchestrazione
si legge dai file del run, non dalla cronologia della chat. Questo è coerente con il Silent
Report Contract (§0.5 CLAUDE.md): la chat resta un riassunto, il file è la fonte di verità.

## Distinzione: log ≠ report ≠ run ≠ decision ≠ memory

| Concetto | Cosa contiene | Dove vive | Durata |
|---|---|---|---|
| **log** | traccia grezza di cosa è stato eseguito, passo per passo | `ai-ops/runs/<run>/log.md` | vita del run |
| **report** | sintesi leggibile per Eros di un run concluso | `ai-ops/reports/<slug>.md` | archiviato |
| **run** | il contenitore intero di una Work Unit in esecuzione (plan+context+log+review+decision) | `ai-ops/runs/<run>/` | vita del task |
| **decision** | il verdetto strutturato del Decision Maker su un run | `ai-ops/runs/<run>/decision.md` | vita del run, poi archiviato nel report |
| **memory** | fatti/regole persistenti cross-sessione, non ephemeral | `ai-ops/memory/` | permanente finché valida |

## Cosa NON costruire ancora

- MCP complesso dedicato all'orchestrator
- LangGraph o altro framework di grafo per l'orchestrazione
- Un core n8n
- Protocolli A2A (agent-to-agent) automatizzati
- Vector store tipo Pinecone per la memoria

Questi strumenti risolvono problemi che V0.2 non ha ancora: il volume di run è basso, i gate
sono manuali per scelta (§3, §21 CLAUDE.md), e la memoria attuale (file Markdown) è ancora
leggibile e sufficiente.

## Prossimo step

Prima di automatizzare qualunque pezzo della pipeline sopra, costruire una **Review/Decision
pipeline manuale-assistita**: Reviewer e Decision Maker restano compilati a mano (o con
supporto Claude in chat) su run reali, per validare il formato di `review.md` e
`decision.md` prima di scriverne l'automazione.
