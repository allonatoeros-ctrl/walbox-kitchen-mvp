---
name: session-start
description: Ripristina il contesto di lavoro in pochi secondi dopo un /clear o una nuova sessione. Fonte primaria: CHECKPOINT.md. Supporto: git log + memoria in contesto. Zero lettura codebase.
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
  1. `CHECKPOINT.md` → fonte primaria: fase attuale, NEXT STEP, DONE, STABLE, OPEN ISSUES
  2. `git log --oneline -15` → supporto: attività recente, file caldi
  3. File di memoria in contesto (MEMORY.md + collegati) → solo se CHECKPOINT.md è assente o incompleto
- Se manca qualcosa, dichiararlo invece di cercarlo nel codebase.

---

## Step by step

### Step 1 — Leggi CHECKPOINT.md

Esegui Read su `CHECKPOINT.md` (root del progetto).

Estrai:
- `## NEXT STEP` → prossimo step ufficiale (una riga esatta)
- `## DONE` → lavoro completato recentemente
- `## OPEN ISSUES` → blocchi aperti
- `## STABLE` → aree da non toccare
- `## RESTART PROMPT` → prompt di ripristino pronto (se presente)

Se CHECKPOINT.md non esiste o è vuoto, passa direttamente al Step 2 e dichiaralo nel briefing.

### Step 2 — Git log + memoria a supporto

Esegui:
```bash
git log --oneline -15
```

Identifica i file caldi dai commit recenti (solo nomi, senza aprirli).

Usa i file di memoria già in contesto solo per colmare gap non coperti da CHECKPOINT.md:
- `MEMORY.md` → indice generale
- `project_kitchen_current_state.md` → stato implementato
- `project_kitchen_phase_plan.md` → fasi e roadmap
- `project_kitchen_remaining_phases.md` → fasi rimanenti

### Step 3 — Costruisci il briefing

Compila mentalmente queste 5 voci:

1. **Ultimo lavoro** — cosa dicono gli ultimi 3-5 commit in parole semplici
2. **Stato progetto** — fase attuale, modulo attivo (Jukebox / Kitchen / TV Poster)
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
Modulo attivo: [Jukebox / Kitchen / TV Poster / misto]
Fase: [nome fase da memoria]
Avanzamento: [▓▓▓▓░░░░░░ X%] — stima da fasi completate/totali

FILE CALDI
- [file dai commit recenti]
- [...]

PROSSIMO STEP SUGGERITO
[da memoria — una riga]

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
- Se la memoria è parziale o stale, dichiararlo esplicitamente nel briefing
- Il briefing deve stare in massimo 20 righe
- **Il NEXT STEP deve venire solo da CHECKPOINT.md.** Non sovrascrivere con inferenze da memoria o git log.

---

## Output atteso

Un briefing compatto che permette a Eros di dare il task diretto al prossimo messaggio, senza ulteriori domande di orientamento.
