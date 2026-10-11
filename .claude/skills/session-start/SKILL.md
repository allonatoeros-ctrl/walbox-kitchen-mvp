---
name: session-start
description: Ripristina il contesto di lavoro in pochi secondi dopo un /clear o una nuova sessione. Fonte primaria: CHECKPOINT.md (solo FASE, OPEN ISSUES, NEXT STEP) e il file di stato in ai-ops/current/ a cui rimanda. Supporto: git status/log. Zero lettura codebase, zero memory.
---

# Session Start

## Quando usare

Invoca con `/session-start` all'inizio di ogni sessione, specialmente dopo `/clear`.
Nessun parametro richiesto.

---

## Regole di economia — RISPETTARE SEMPRE

- **Non aprire file sorgente.** Zero `cat`, zero `Read` su `.jsx/.ts/.css`.
- **Non scansionare il repo.** Non serve per orientarsi.
- **Fonti consentite — in ordine di priorità:**
  1. `CHECKPOINT.md` → fonte primaria: solo `## FASE`, `## OPEN ISSUES`, `## NEXT STEP`
  2. Se il NEXT STEP rimanda a un file di stato in `ai-ops/current/`: solo la sua sezione `## STATO`
  3. `git status --short` + `git log --oneline -5` → supporto: branch, file sporchi, attività recente
- **Mai** leggere `docs/checkpoints/` (archivio storico) né la memory di Claude per ricostruire lo stato:
  lo stato vive solo nei file del repo.
- Se manca qualcosa, dichiararlo invece di cercarlo nel codebase.

---

## Step by step

### Step 1 — Leggi CHECKPOINT.md

Leggi da `CHECKPOINT.md` (root del progetto) solo le sezioni `## FASE`, `## OPEN ISSUES`, `## NEXT STEP`
(es. `sed -n '/^## FASE/,/^## DONE/p;/^## OPEN ISSUES/,$p' CHECKPOINT.md`).

Estrai:
- `## NEXT STEP` → prossimo step ufficiale (una riga esatta)
- `## FASE` → branch, cosa è in produzione
- `## OPEN ISSUES` → blocchi aperti

Se il NEXT STEP cita un file in `ai-ops/current/`, leggi solo la sua sezione `## STATO`.
Se CHECKPOINT.md non esiste, è vuoto o supera ~150 righe (non compattato), dichiaralo nel briefing e
suggerisci la compattazione (skill `memory-update`) invece di leggerlo tutto.

### Step 2 — Git a supporto

Esegui:
```bash
git status --short && git log --oneline -5
```

Identifica branch, file sporchi e file caldi dai commit recenti (solo nomi, senza aprirli).
Se git contraddice CHECKPOINT.md (es. commit dichiarati "non fatti" che esistono), prevale il repo:
segnalalo negli AVVISI.

### Step 3 — Costruisci il briefing

Compila mentalmente queste 5 voci:

1. **Ultimo lavoro** — cosa dicono gli ultimi 3-5 commit in parole semplici
2. **Stato progetto** — fase attuale e branch (questo repo è Kitchen)
3. **File caldi** — file toccati di recente dai commit (solo nomi, senza aprirli)
4. **Prossimo step** — sezione `## NEXT STEP` di CHECKPOINT.md — una riga esatta. Non inferire dalla memoria se CHECKPOINT.md ha questo campo.
5. **Avvisi** — aree protette coinvolte, rischi noti, blocchi aperti

### Step 4 — Stampa il briefing

Formato obbligatorio:

```
SESSION START — [data da git log o contesto]

ULTIMO LAVORO
[bullet compatti dai commit recenti — linguaggio diretto]

STATO PROGETTO
Branch: [branch corrente]
Fase: [da CHECKPOINT.md → FASE, o dal file di stato in ai-ops/current/]

FILE CALDI
- [file dai commit recenti]
- [...]

PROSSIMO STEP
[da CHECKPOINT.md → NEXT STEP — una riga]

AVVISI
[aree protette coinvolte, blocchi aperti, rischi noti]
oppure: Nessun avviso.

---
Pronto. Dimmi cosa vuoi fare.
```

---

## Vincoli

- Non modificare nessun file
- Non aprire il codebase (CHECKPOINT.md è un meta-file di controllo, non codebase)
- Non fare proposte elaborate — solo orientamento
- Se CHECKPOINT.md è parziale o stale rispetto a git, dichiararlo esplicitamente nel briefing
- Il briefing deve stare in massimo 20 righe
- **Il NEXT STEP deve venire solo da CHECKPOINT.md** (o dal file di stato a cui rimanda). Non sovrascrivere con inferenze da memoria o git log.

---

## Output atteso

Un briefing compatto che permette a Eros di dare il task diretto al prossimo messaggio, senza ulteriori domande di orientamento.
