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

Compila le 6 sezioni obbligatorie:

**DONE** — cosa è stato completato e funziona
**STABLE** — componenti/schermate che non vanno toccate
**DO NOT TOUCH** — file o aree protette con motivo esplicito
**OPEN ISSUES** — problemi noti, bug, comportamenti inattesi
**NEXT STEP** — un solo step, azionabile al prossimo messaggio
**RESTART PROMPT** — prompt breve pronto per riprendere da zero dopo /clear

### Step 4 — Scrivi CHECKPOINT.md

Scrivi o sovrascrivi il file nella root del progetto:
```
CHECKPOINT.md
```

**Formato obbligatorio — max 40 righe:**

```markdown
# CHECKPOINT — Walbox
Aggiornato: [YYYY-MM-DD HH:MM]
Fase: [nome fase attuale]

---

## DONE
- [bullet compatto]
- [bullet compatto]

## STABLE — non toccare senza approvazione
- [componente / schermata / file]

## DO NOT TOUCH
- [file o area] — [motivo in 5 parole]

## OPEN ISSUES
- [problema noto o bug aperto]
oppure: Nessuno.

## NEXT STEP
[una riga sola — azionabile]

## RESTART PROMPT
[prompt breve pronto per copia-incolla dopo /clear — max 3 righe]
Esempio:
"Walbox — [modulo]. Ultima cosa fatta: [X]. Prossimo step: [Y]. File caldo: [Z]."
```

### Step 5 — Aggiorna i file di memoria Claude

Se il task ha cambiato lo stato di Kitchen o del progetto, aggiorna anche:
- `project_kitchen_current_state.md` → se lo stato Kitchen è cambiato
- `project_kitchen_remaining_phases.md` → se una fase è stata completata

Aggiorna solo le righe che sono effettivamente cambiate. Non riscrivere tutto.
Se nulla è cambiato nei file di memoria, salta questo step.

### Step 6 — Conferma

Stampa in chat:
```
CHECKPOINT aggiornato: CHECKPOINT.md
Fase: [nome]
Stato: stabile / parziale / issues aperte
Prossimo step: [una riga]
Memoria Claude: aggiornata / invariata
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
