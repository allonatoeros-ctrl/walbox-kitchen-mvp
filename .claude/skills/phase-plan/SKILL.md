---
name: phase-plan
description: Dopo un audit read-only con piano multi-fase, spezza il piano in micro-task, salva i prompt brevi in memoria e li stampa pronti per copia-incolla.
---

# Phase Plan

## Quando usare

Dopo un audit read-only che ha prodotto un piano con 3+ fasi o 3+ file coinvolti.

Invoca con `/phase-plan` alla fine dell'audit, prima di iniziare qualsiasi modifica.

---

## Cosa fare step by step

### Step 1 — Leggi il piano corrente

Se esiste un plan file in `.claude/plans/`, leggilo.
Altrimenti usa il contesto della conversazione corrente.

### Step 2 — Identifica le fasi

Per ogni fase individua:
- **nome breve** (es. "estrai MenuView")
- **file approvati** da modificare (solo quelli esistenti)
- **file da creare** (solo se necessari, uno per fase)
- **cosa fare** in una riga

Regole di granularità:
- Una fase = un file nuovo oppure una modifica isolata a file esistente
- Non unire fasi che toccano aree diverse
- Se una fase tocca più di 3 file, spezzala

### Step 3 — Scrivi il file di memoria

Crea o aggiorna un file in:
```
~/.claude/projects/[project-slug]/memory/project_[nome-piano].md
```

Struttura del file:
```markdown
---
name: [nome-piano]
description: "[una riga: cosa fa questo piano e perché]"
metadata:
  type: project
---

[Architettura target in forma di albero o tabella — max 15 righe]

---

## Cosa modificare per ogni fase

[Per ogni fase: titolo, file coinvolti, cosa estrarre/aggiungere/rimuovere — bullet compatti]

---

## Prompt brevi per attivazione fasi

[Un blocco di codice per fase nel formato standard sotto]
```

### Step 4 — Stampa i prompt brevi

Formato standard per ogni prompt:
```
Fase [ID] — [nome breve].
File approvati: [file1.jsx, file2.css]
Crea: [src/pages/NuovoFile.jsx]   ← solo se serve, altrimenti ometti la riga
Vai.
```

Stampa tutti i prompt in sequenza, numerati, pronti per copia-incolla.

### Step 5 — Aggiorna MEMORY.md

Aggiungi una riga in `MEMORY.md` che punta al file creato.

---

## Vincoli

- Non modificare codice durante questa skill — solo read + write memory
- Non toccare App.jsx, routing, Supabase, Spotify, env
- Se il piano non è ancora definito, fermati e chiedi a Eros di completare prima l'audit
- Ogni prompt deve essere autosufficiente: chi lo legge sa esattamente cosa fare senza rileggere il piano

---

## Output finale atteso

```
Piano salvato in memoria: project_[nome].md

Fasi identificate: N

--- PROMPT BREVI ---

Fase 1 — ...
File approvati: ...
Vai.

Fase 2 — ...
...
```
