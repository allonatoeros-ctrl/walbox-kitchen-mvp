---
name: memory-update
description: Aggiorna lo stato operativo di Walbox dopo una fase significativa. Mantiene CHECKPOINT.md come fonte affidabile per /session-start e /weekly-report. Zero lettura codebase.
---

# Memory Update

## Quando usare

Invoca con `/memory-update` dopo aver completato una fase, un task significativo, o prima di fare `/clear`.
Non aspettare troppo: più aspetti, più il checkpoint invecchia.

---

## Regole di economia — RISPETTARE SEMPRE

- **Non aprire file sorgente.** Zero `cat`, zero `Read` su `.jsx/.ts/.css`.
- **Non scansionare il repo.**
- **Fonti consentite — solo queste due:**
  1. `git log --oneline -10` → cosa è cambiato
  2. `git status --short` → cosa è staged o modificato ma non committato
- Il resto viene dalla conversazione corrente e dalle risposte di Eros.
- **Non dare per scontato che la memoria Claude sia aggiornata.** Questa skill esiste proprio perché non lo è sempre.

---

## Step by step

### Step 1 — Leggi lo stato git

Esegui in parallelo:
```bash
git log --oneline -10
git status --short
```

Ricava:
- ultimi 10 commit → cosa è stato fatto
- file modificati non committati → lavoro in sospeso

### Step 2 — Fai le domande necessarie

Se il contesto della conversazione non è sufficiente a rispondere con certezza, chiedi a Eros **una sola domanda compatta**:

```
Per aggiornare il checkpoint ho bisogno di conferma su:
1. Questa fase è stabile e testata? sì / no / parziale
2. C'è qualcosa di rotto o in sospeso?
3. Qual è il prossimo step?
```

Non fare domande separate. Una sola battuta, tre punti.
Se il contesto è già chiaro, salta questo step.

### Step 3 — Costruisci il checkpoint

Compila le 5 sezioni obbligatorie (stesse di `CHECKPOINT.md`):

**FASE** — branch, cosa è in produzione, cosa è solo locale
**DONE** — max 5 voci recenti, una riga ciascuna; le più vecchie si spostano in archivio
**STABLE** — cosa è in produzione e verificato, da non toccare senza approvazione
**OPEN ISSUES** — problemi noti, bug, verifiche mancanti
**NEXT STEP** — un solo step, azionabile; se il lavoro è multi-fase, rimanda al file in `ai-ops/current/`

Le aree protette stanno in `CLAUDE.md §5`, non nel checkpoint. Niente RESTART PROMPT: dopo `/clear` si usa
la skill `session-start`.

### Step 4 — Scrivi CHECKPOINT.md

Aggiorna solo le righe cambiate di `CHECKPOINT.md` (root del progetto). Prima di scrivere:
- le voci DONE oltre la quinta e i blocchi superati si **spostano**, copiati esatti, in fondo a
  `docs/checkpoints/archive-YYYY-MM.md` (mese corrente; crealo con un'intestazione se manca);
- niente cronologia, hash di ogni passaggio o regole stabili (quelle vanno in `ai-ops/knowledge/MEMORY.md`).

**Formato obbligatorio — max 60 righe:**

```markdown
# CHECKPOINT — Walbox Kitchen
Aggiornato: [YYYY-MM-DD]. Storico: `docs/checkpoints/archive-YYYY-MM.md`.

## FASE
- [bullet compatto]

## DONE
- [YYYY-MM-DD] — [una riga]

## STABLE — in produzione e verificato (non toccare senza approvazione)
- [componente / flusso]

## OPEN ISSUES
- [problema noto o verifica mancante]
oppure: Nessuno.

## NEXT STEP
[una riga sola — azionabile]
```

### Step 5 — Niente memory di Claude

Lo stato del progetto vive solo nei file del repo (`CHECKPOINT.md`, `ai-ops/current/`). Non scrivere stato in
`~/.claude/projects/.../memory/`. Se dalla fase è emersa una regola stabile (non stato), proponila per
`ai-ops/knowledge/MEMORY.md` con la fonte.

### Step 6 — Conferma

Stampa in chat:
```
CHECKPOINT aggiornato: CHECKPOINT.md
Fase: [nome]
Stato: stabile / parziale / issues aperte
Prossimo step: [una riga]
Archivio: [voci spostate in docs/checkpoints/ / nessuna]
```

---

## Vincoli

- Non modificare file del codebase applicativo
- Non toccare App.jsx, routing, Supabase, Spotify, env, package.json
- Non inventare stati non confermati da git o dalla conversazione
- Se qualcosa è incerto, scrivere "da verificare" invece di inventare
- Il CHECKPOINT.md deve essere leggibile da chiunque, anche dopo settimane

---

## Relazione con altre skill

- `/session-start` legge CHECKPOINT.md come fonte primaria se presente
- `/weekly-report` usa CHECKPOINT.md + memoria per il report ai proprietari
- Invoca `/memory-update` **prima** di `/clear` per non perdere il contesto
