# ai-factory-runner V1.1 — Walbox AI Business Factory

Runner locale che trasforma un task raw in un **ticket/run log** dentro `ai-ops/tickets/`.
Zero dipendenze esterne, zero API, zero LLM: solo Node.js e keyword locali.

È la prima implementazione concreta del "router" descritto in [`../SECURITY_POLICY.md`](../SECURITY_POLICY.md)
(che finora era un riferimento preparatorio). Il runner **non esegue nulla**: genera solo
il ticket con classificazione, routing, scope, quality gate e prompt pronto. L'esecuzione
resta al workflow umano di `ai-ops/README.md` (Gate 1 / Gate 2 di Eros).

## Novità V1.1

Il runner ora legge **CHECKPOINT.md in modalità read-only** e include nel ticket
(sezione 3, "Project state snapshot from CHECKPOINT.md") un estratto sintetico di
STABLE / DONE / OPEN ISSUES / NEXT STEP, così ogni ticket porta con sé lo stato del
progetto al momento del run, senza dover aprire CHECKPOINT.md a parte.

- Il parsing è basato su heading Markdown `## ` con match sul nome della sezione
  (case-insensitive, `startsWith`): non è un parser Markdown completo.
- Ogni sezione è troncata a un massimo di 6 righe non vuote (con nota "righe omesse"
  se il contenuto è più lungo) — mai il contenuto integrale di CHECKPOINT.md.
- Se `CHECKPOINT.md` non esiste, il runner non crasha: scrive `CHECKPOINT.md not found`
  in ogni campo dello snapshot e continua a generare il ticket normalmente.
- Il runner non scrive mai su CHECKPOINT.md (SECURITY_POLICY.md regola 8): resta,
  come prima, solo patch suggerita nella sezione "Checkpoint decision" del ticket.

## Uso

```bash
node ai-ops/runner/run.js "Verifica TV Poster sync"
```

Output: un file `ai-ops/tickets/YYYY-MM-DD_<slug>.md` (con suffisso `-2`, `-3`… se esiste già)
e in console il path del ticket generato.

## Cosa genera il ticket

1. Task raw
2. Metadata: data, slug, categorie, rischio, executor consigliato, requires approval
3. Project state snapshot da CHECKPOINT.md (STABLE/DONE/OPEN ISSUES/NEXT STEP, letto read-only — V1.1)
4. Fonti di stato da leggere (CHECKPOINT.md, CLAUDE.md, ai-ops/README.md, SECURITY_POLICY.md)
5. Routing decision (perché quel esecutore — dettaglio agenti: CLAUDE.md §2, non duplicato)
6. Scope consigliato (allowed / forbidden / out of scope)
7. Security reminders (richiami alle regole 1-10 di SECURITY_POLICY.md, non duplicata)
8. Quality gate coerente con le categorie
9. Prompt Claude Code pronto da copiare
10. Checkpoint decision (solo patch suggerita, mai update automatico)
11. Next step per Eros

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

## Limiti V1.1 (manuale per ora)

- La classificazione è keyword-based: Eros deve validarla nel ticket prima del Gate 1.
  Lo snapshot da CHECKPOINT.md non influenza la classificazione/rischio: è solo contesto
  informativo aggiunto al ticket.
- Lo snapshot di CHECKPOINT.md è un'estrazione per heading (`## `), non un parser Markdown
  robusto: se una sezione viene rinominata o ristrutturata in modo molto diverso, il match
  `startsWith` sul titolo potrebbe non trovarla (il ticket riporterà "sezione non trovata").
- Nessuna esecuzione automatica del prompt: copia/incolla manuale.
- Sync manuale tra `run.js` e `rules/task_classifier_rules.md`.
