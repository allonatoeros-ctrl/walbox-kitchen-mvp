---
name: phase-plan
description: Dopo un audit read-only con piano multi-fase, spezza il piano in micro-task e salva piano + prompt brevi in un file di stato del repo (ai-ops/current/), mai nella memory di Claude. NON stampare i prompt in chat.
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

### Step 3 — Scrivi il file di stato nel repo

Crea o aggiorna un file in:
```
ai-ops/current/[NOME_PIANO].md
```

Lo stato di un task vive nei file del repo, **mai** in `~/.claude/projects/.../memory/` (regola globale:
lo stato del task non va in memory). Il file deve bastare a ripartire dopo `/clear`.

Struttura del file:
```markdown
# [Nome piano]

Creato [data]. Fonte unica dello stato di questo lavoro. Dopo `/clear`: "riprendi da ai-ops/current/[NOME_PIANO].md".

## Obiettivo
[una o due righe]

[Architettura target in forma di albero o tabella — max 15 righe]

---

## Cosa modificare per ogni fase

[Per ogni fase: titolo, file coinvolti, cosa estrarre/aggiungere/rimuovere — bullet compatti]

---

## Prompt brevi per attivazione fasi

[Un blocco di codice per fase nel formato standard sotto]

## STATO

- Fase corrente: [nessuna iniziata]
- Fatto: —
- Decisioni aperte: [NEEDS_DECISION, se ci sono]
- Prossimo passo: [fase 1]

Modello/effort: [per fase]
```

### Step 4 — Collega il piano a CHECKPOINT.md

Il `## NEXT STEP` di `CHECKPOINT.md` deve rimandare a questo file (una riga). Non creare voci in
`ai-ops/knowledge/MEMORY.md`: lì vanno solo regole stabili, non piani.

---

## Vincoli

- Non modificare codice durante questa skill — solo read + write del file di stato (e la riga NEXT STEP di CHECKPOINT.md)
- Non toccare App.jsx, routing, Supabase, Spotify, env
- Se il piano non è ancora definito, fermati e chiedi a Eros di completare prima l'audit
- Ogni prompt deve essere autosufficiente: chi lo legge sa esattamente cosa fare senza rileggere il piano

---

## Output finale atteso

Una sola riga in chat:

```
Piano salvato: ai-ops/current/[NOME_PIANO].md — N fasi pronte.
```

Niente prompt in chat. I prompt sono già nel file .md — Eros li legge da lì.
