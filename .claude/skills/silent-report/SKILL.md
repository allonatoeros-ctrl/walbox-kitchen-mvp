---
name: silent-report
description: Applica il Silent Report Contract (CLAUDE.md §0.5) — full report in Markdown, chat max 8 righe — a qualsiasi audit, run, review o implementazione, sostituendo l'output lungo in chat con una sintesi operativa.
---

# Silent Report

## 1. Quando usare questa skill

Usa questa skill ogni volta che un task produce un report (audit, run pack,
review, diff risk review, quality gate, implementazione) e non è stato
esplicitamente richiesto di stampare il report completo in chat con la
frase "print full report" / "stampa report completo".

Questo è il default permanente del progetto (CLAUDE.md §0.5), non
un'opzione.

## 2. Regola

```text
Full report → file Markdown
Chat/terminal → sintesi max 8 righe
```

Destinazione del report completo:

* `ai-ops/runs/<run>/result.md`, se il task gira da una run pack esistente;
* `ai-ops/reports/<slug>.md`, se non esiste una run folder.

Il report completo segue comunque il Final Report Format di CLAUDE.md §15
(o il formato specifico della skill invocata, es. `diff-risk-reviewer`,
`quality-gate-verifier`) — questa skill non cambia il contenuto del
report, solo dove viene mostrato.

## 3. Sintesi in chat (max 8 righe)

```text
PASS/FAIL
File modificati: [lista breve o "nessuno"]
Test/comandi eseguiti: [lista breve o "non eseguiti: motivo"]
Report path: [path del file .md]
Approval needed: sì/no [+ cosa]
```

Non aggiungere altro testo prima o dopo questo blocco, a meno che non sia
uno STOP CONDITION (CLAUDE.md §12), che resta prioritario e va comunque
tenuto entro poche righe.

## 4. Eccezione

Se Eros scrive esplicitamente "print full report" o "stampa report
completo" per quel task, incolla il contenuto del file Markdown in chat
per quella singola risposta. Il default silenzioso riprende dal task
successivo.
