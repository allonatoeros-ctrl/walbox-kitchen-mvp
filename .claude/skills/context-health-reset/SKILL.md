---
name: context-health-reset
description: Controllo read-only di pulizia, salute del contesto e allineamento progetto prima di continuare a lavorare — ispeziona /context, /memory, /skills, /agents, /mcp, verifica CLAUDE.md↔CHECKPOINT.md e rileva rischi di contesto.
---

# Context Health Reset

## 1. Quando usare questa skill

Usa `/context-health-reset` prima di riprendere lavoro reale su Walbox, in particolare quando:

- riprendi dopo una pausa lunga o un `/clear`;
- hai il sospetto che memoria, skill o agenti si siano accumulati in modo disordinato;
- vuoi sapere se CLAUDE.md e CHECKPOINT.md sono ancora allineati;
- vuoi sapere se un vecchio track (es. Kitchen) è davvero archiviato o rischia di confondere la sessione corrente;
- prima di avviare un nuovo blocco di sprint importante;
- non hai un motivo specifico ma vuoi un check di igiene generale del contesto.

Questa skill non sostituisce `/session-start` (che serve a ripristinare velocemente il contesto operativo). `context-health-reset` è più ampia: audita anche skill, agenti, MCP e la coerenza tra i documenti di governance.

Regola madre:

```text
Questa skill osserva e riporta. Non ripara nulla da sola.
```

---

## 2. Quando NON usarla

Non usare questa skill per:

- eseguire un task di prodotto (fix, feature, UI);
- fare diff review di un commit (usa `diff-risk-reviewer`);
- verificare il completamento di un task specifico (usa `quality-gate-verifier`);
- ripristinare rapidamente il contesto a inizio sessione (usa `session-start`);
- aggiornare CHECKPOINT.md (usa `memory-update` o una patch approvata separata);
- modificare CLAUDE.md, CHECKPOINT.md, MEMORY.md, agenti o skill.

Questa skill produce solo un audit e raccomandazioni. Le patch, se richieste, vanno approvate esplicitamente da Eros in un ciclo separato.

---

## 3. File sempre protetti

Durante questa skill non si modifica **mai** nulla. In particolare sono protetti:

```text
- codice applicativo (tutto src/, tutto il resto del repo applicativo)
- .agents/
- .claude/agents/
- .claude/skills/
- MEMORY.md
- CLAUDE.md
- CHECKPOINT.md
```

Se durante l'audit emerge la necessità di una modifica, questa skill si ferma e propone la patch a Eros. Non la applica.

---

## 4. Input richiesti

Raccogli, nell'ordine, gli output di:

```text
1. /context
2. /memory
3. /skills
4. /agents
5. /mcp
```

Se uno di questi comandi non è disponibile o non produce output, dichiaralo esplicitamente nel report invece di ometterlo o inventarlo.

Fonti aggiuntive da leggere (solo lettura):

```text
- CHECKPOINT.md (root del progetto)
- CLAUDE.md (root del progetto)
- MEMORY.md (memoria auto)
- git log --oneline -15
- git status
```

Non leggere codice applicativo, salvo il caso in cui CHECKPOINT.md o CLAUDE.md citino un file/path che va verificato per esistenza (es. un file dichiarato "protetto" o "stabile" che potrebbe non esistere più).

---

## 5. Procedura operativa read-only

```text
1. Esegui /context — nota uso token, categorie pesanti, eventuale bloat.
2. Esegui /memory — elenca le memory attive in contesto.
3. Esegui /skills — elenca le skill disponibili, cerca duplicati/sovrapposizioni.
4. Esegui /agents — elenca gli agenti custom disponibili.
5. Esegui /mcp — elenca i server MCP connessi.
6. Leggi CHECKPOINT.md — estrai Fase, DONE, STABLE, DO NOT TOUCH, OPEN ISSUES, NEXT STEP.
7. Leggi CLAUDE.md — verifica se rimanda a CHECKPOINT.md come fonte primaria (Sezione 0 o equivalente) e se ha una tabella di routing agenti.
8. Leggi MEMORY.md — separa memoria attiva da memoria archiviata (cerca note tipo "archiviato", "fase completata", "archive/").
9. git log --oneline -15 — verifica se l'ultimo commit rilevante per CLAUDE.md/CHECKPOINT.md è riflesso nei rispettivi DONE.
10. git status — verifica file untracked o modifiche pendenti non spiegate.
11. Incrocia tutto e classifica ogni area di rischio (Sezione 7).
12. Assegna il verdetto finale (Sezione 8).
13. Proponi solo raccomandazioni read-only e micro-patch minime (Sezione 9).
```

Non eseguire altri comandi oltre a quelli elencati sopra. Se serve un comando aggiuntivo per chiarire un dubbio, dichiaralo come "verifica non eseguita" invece di eseguirlo senza motivo.

---

## 6. Classificazione memoria e track

### 6.1 Memoria

Per ogni voce trovata in `/memory` o `MEMORY.md`, classifica:

```text
- ATTIVA — riferita al track corrente (da CHECKPOINT.md → Fase)
- STALE — riferita a un track passato ma non marcata come archiviata, rischio di confondere la sessione
- ARCHIVIATA — chiaramente marcata come chiusa/archiviata (es. "Kitchen-era memory... archiviati in archive/")
```

Segnala come rischio ogni memoria STALE (non ancora archiviata ma non più rilevante).

### 6.2 Track di progetto

Da CHECKPOINT.md e MEMORY.md, identifica:

```text
- Track corrente (es. Jukebox/Spotify reale, prep Shuffle Night)
- Track completati/fuori scope (es. Kitchen)
```

Verifica che ogni track fuori scope sia:

```text
- marcato esplicitamente come completato/fuori scope in CHECKPOINT.md (sezione DONE o DO NOT TOUCH);
- non presente come priorità attiva in CLAUDE.md.
```

Se un track chiuso appare ancora come priorità attiva in un qualunque documento, segnala rischio almeno MEDIO.

---

## 7. Controlli di allineamento e rischio

### 7.1 CLAUDE.md ↔ CHECKPOINT.md

Verifica:

```text
- CLAUDE.md dichiara esplicitamente che CHECKPOINT.md è la fonte primaria dello stato corrente?
- CHECKPOINT.md ha una data di aggiornamento recente rispetto agli ultimi commit rilevanti?
- L'ultimo commit di allineamento CLAUDE.md/CHECKPOINT.md (se esiste) è riflesso in DONE?
```

### 7.2 DONE confermato vs implementato-non-verificato

Verifica che CHECKPOINT.md distingua:

```text
- lavoro fatto E verificato (test/QA/build passati);
- lavoro implementato ma senza evidenza di verifica (nessun test E2E, nessun walbox-qa-serata).
```

Se il DONE elenca feature senza alcun caveat di verifica e OPEN ISSUES conferma l'assenza di test, segnala rischio MEDIO: rischio che una sessione futura tratti il lavoro come demo-pronto senza rieseguire QA.

### 7.3 Track archiviati

Verifica che vecchi track (es. Kitchen) siano:

```text
- marcati "completato"/"fuori scope" in CHECKPOINT.md;
- non citati come priorità attiva in CLAUDE.md;
- le loro memory marcate come archiviate in MEMORY.md.
```

### 7.4 Rischi di contesto generali

Controlla e segnala se presenti:

```text
- file di configurazione untracked in `git status` (es. .claude/agents/*.md non ancora committati);
- agenti custom presenti in /agents senza una riga di routing chiara in CLAUDE.md;
- skill in /skills che si sovrappongono fortemente per scopo (possibile duplicazione/confusione su quale usare);
- server MCP connessi in /mcp che non sono mai citati da nessun task recente (potenziale rumore/contesto sprecato, non necessariamente un problema da correggere);
- memoria vecchia (STALE, non archiviata) che potrebbe portare la sessione a assumere uno stato non più vero;
- bloat di contesto evidente da /context (es. una singola categoria che consuma una quota sproporzionata senza motivo chiaro).
```

Per ognuno, assegna severità: BASSA / MEDIA / ALTA.

---

## 8. Verdetto finale

Assegna un solo verdetto:

```text
GOOD
```
Nessun rischio rilevante. CLAUDE.md e CHECKPOINT.md allineati, memoria pulita, track chiari, nessuna azione richiesta.

```text
OK
```
Allineamento sostanzialmente corretto, ma con piccoli gap (es. una data non aggiornata, un track da marcare più chiaramente, una memoria stale isolata). Non urgente.

```text
RISKY
```
Almeno un rischio MEDIO o ALTO: es. CHECKPOINT.md disallineato da commit recenti, DONE che non distingue verificato/non verificato, track chiuso ancora trattato come attivo, oppure agenti/skill duplicati senza routing chiaro che possono portare a scelte sbagliate nella sessione corrente.

---

## 9. Output format obbligatorio

```text
## Context Health Reset — Report

### 1. Verdetto
GOOD / OK / RISKY

### 2. Snapshot /context
- Uso token: ...
- Categorie pesanti: ...
- Bloat evidente: SÌ/NO — nota

### 3. Snapshot /memory
- Memoria attiva: ...
- Memoria stale (non archiviata): ...
- Memoria archiviata: ...

### 4. Snapshot /skills
- Skill totali: N
- Possibili duplicati/sovrapposizioni: ...

### 5. Snapshot /agents
- Agenti totali: N
- Agenti senza routing chiaro in CLAUDE.md: ...

### 6. Snapshot /mcp
- Server MCP connessi: ...
- Server mai usati di recente: ...

### 7. Track di progetto
- Track corrente: ...
- Track completati/fuori scope: ...
- Track chiusi trattati ancora come attivi: SÌ/NO — dove

### 8. Allineamento CLAUDE.md ↔ CHECKPOINT.md
- CLAUDE.md rimanda a CHECKPOINT.md come fonte primaria: SÌ/NO
- CHECKPOINT.md aggiornato rispetto agli ultimi commit: SÌ/NO — nota
- DONE separa confermato da non verificato: SÌ/NO — nota

### 9. Rischi rilevati
- Rischio: ...
  - Severità: BASSA/MEDIA/ALTA
  - Dove: ...
  - Impatto se ignorato: ...

### 10. Raccomandazioni read-only
- ...

### 11. Micro-patch proposte (NON applicate)
- File: ...
  - Modifica proposta: ...
  - Rischio se applicata: BASSO/MEDIO/ALTO

### 12. Prossimo step sicuro
[una sola azione concreta, es. "chiedere approvazione a Eros per la micro-patch N. X"]
```

Regole del formato:

```text
- una sola voce in "Verdetto";
- nessuna modifica applicata durante questa skill, in nessun caso;
- le micro-patch sono proposte, non eseguite;
- se manca un input (es. /mcp non disponibile), dichiaralo esplicitamente invece di ometterlo.
```

---

## 10. Stop conditions

Interrompi e segnala subito se trovi:

```text
- CHECKPOINT.md assente;
- CLAUDE.md assente;
- conflitto diretto tra CLAUDE.md e CHECKPOINT.md sulla priorità corrente (es. CLAUDE.md indica un track che CHECKPOINT.md dichiara chiuso);
- un file protetto (Sezione 3) che sembra necessitare modifica urgente.
```

In questi casi, il verdetto è `RISKY` per definizione e il prossimo step è "richiedere decisione esplicita a Eros" — non tentare correzioni automatiche.

---

## 11. Esempio di utilizzo

```text
/context-health-reset
```

Nessun parametro richiesto. La skill raccoglie da sola gli output di /context, /memory, /skills, /agents, /mcp e i file di governance del progetto.

---

## 12. Regola finale

```text
Questa skill è un check di igiene, non un agente di modifica.
Osserva, classifica, propone. Non tocca mai codice applicativo, agenti, skill o i tre documenti di governance (CLAUDE.md, CHECKPOINT.md, MEMORY.md).
Ogni patch richiede approvazione esplicita di Eros in un ciclo separato.
```
