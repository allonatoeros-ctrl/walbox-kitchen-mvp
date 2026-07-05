# ai-factory-runner V1 — Walbox AI Business Factory

Runner locale che trasforma un task raw in un **ticket/run log** dentro `ai-ops/tickets/`.
Zero dipendenze esterne, zero API, zero LLM: solo Node.js e keyword locali.

È la prima implementazione concreta del "router" descritto in [`../SECURITY_POLICY.md`](../SECURITY_POLICY.md)
(che finora era un riferimento preparatorio). Il runner **non esegue nulla**: genera solo
il ticket con classificazione, routing, scope, quality gate e prompt pronto. L'esecuzione
resta al workflow umano di `ai-ops/README.md` (Gate 1 / Gate 2 di Eros).

## Uso

```bash
node ai-ops/runner/run.js "Verifica TV Poster sync"
```

Output: un file `ai-ops/tickets/YYYY-MM-DD_<slug>.md` (con suffisso `-2`, `-3`… se esiste già)
e in console il path del ticket generato.

## Cosa genera il ticket

1. Task raw
2. Metadata: data, slug, categorie, rischio, executor consigliato, requires approval
3. Fonti di stato da leggere (CHECKPOINT.md, CLAUDE.md, ai-ops/README.md, SECURITY_POLICY.md)
4. Routing decision (perché quel esecutore — dettaglio agenti: CLAUDE.md §2, non duplicato)
5. Scope consigliato (allowed / forbidden / out of scope)
6. Security reminders (richiami alle regole 1-10 di SECURITY_POLICY.md, non duplicata)
7. Quality gate coerente con le categorie
8. Prompt Claude Code pronto da copiare
9. Checkpoint decision (solo patch suggerita, mai update automatico)
10. Next step per Eros

## Struttura

```
runner/
├── README.md                          ← sei qui
├── run.js                             ← runner (Node, zero deps)
├── templates/
│   ├── ticket_template.md             ← struttura del ticket generato
│   └── claude_prompt_template.md      ← prompt Claude Code embeddato nel ticket
└── rules/
    └── task_classifier_rules.md       ← documentazione keyword/rischio/routing
```

## Rapporto con il resto di ai-ops/

- `../templates/ticket.md` resta il template per la **pipeline manuale** (Research→…→Commit).
  Il ticket del runner è il **run log automatizzato** V1: formati diversi, stesso posto (`tickets/`).
- Routing agenti: fonte unica **CLAUDE.md §2** — qui solo referenziato.
- Regole di sicurezza: fonte unica **`../SECURITY_POLICY.md`** — qui solo richiamata.

## Limiti V1 (manuale per ora)

- La classificazione è keyword-based: Eros deve validarla nel ticket prima del Gate 1.
- Il runner non legge CHECKPOINT.md: lo elenca solo come fonte da leggere per l'esecutore.
- Nessuna esecuzione automatica del prompt: copia/incolla manuale.
- Sync manuale tra `run.js` e `rules/task_classifier_rules.md`.
