# AI Business Factory — Walbox

> Questo è il bus operativo del progetto. Tutto lo stato dei task passa da qui.
> Repo: walbox-from-zero-v2 · Stack: React/Vite

---

## Come funziona in 3 righe

1. Ogni task apre **un ticket** in `tickets/` copiando il template.
2. Ogni strumento (Claude, Antigravity, Claude Code) **legge e scrive sul ticket** — nessuno riceve contesto incollato a mano.
3. Eros approva **due volte soltanto**: dopo il Plan (Gate 1) e prima del commit (Gate 2).

---

## Struttura

```
ai-ops/
├── README.md              ← sei qui
├── templates/
│   └── ticket.md          ← copia questo per ogni nuovo task
├── tickets/               ← ticket attivi (uno per task)
├── reports/               ← report archiviati a task chiuso
└── knowledge/             ← lezioni apprese, riutilizzabili
```

---

## Aprire un nuovo ticket

```bash
cp ai-ops/templates/ticket.md ai-ops/tickets/$(date +%Y-%m-%d)-<nome-task>.md
```

Esempio:
```bash
cp ai-ops/templates/ticket.md ai-ops/tickets/2026-06-17-kitchen-asset-audit.md
```

Poi apri il file, compila Obiettivo e Scope, e inizia la pipeline.

---

## Pipeline standard

| Fase | Chi | Come |
|---|---|---|
| Research | Claude (chat) | legge il ticket, scrive `## Research` |
| Audit | Antigravity | `/asset-inventory-audit` o `/repo-readonly-audit` → scrive `## Audit` |
| Plan | Claude (chat) | scrive `## Plan` |
| **GATE 1** | **Eros** | approva il plan nel ticket |
| Act | Antigravity | implementa scope approvato → scrive `## Act` |
| Verify | Claude Code | build + anti-troncamento → scrive `## Verify` |
| Quality Gate | Claude Code | `/quality-gate` |
| Diff Risk | Claude Code | `/diff-risk-review` |
| **GATE 2** | **Eros** | approva il commit |
| Commit | Claude Code / Eros | commit con messaggio dal ticket |
| Knowledge | Claude / Eros | lezioni → `ai-ops/knowledge/` |

---

## Workflow disponibili (Antigravity)

| Comando | Quando usarlo |
|---|---|
| `/asset-inventory-audit` | Mappare asset di una pagina prodotto prima del layout polish |
| `/repo-readonly-audit` | Audit generale read-only di file in scope |

---

## Regole sempre attive (Antigravity)

Vivono in `.agents/rules/scope-discipline.md`.
Non vanno ripetute nei prompt: Antigravity le legge da solo.

Riassunto: default read-only · solo file in scope · no auth/db/env/deploy · output in italiano · stop se fuori scope.

---

## Gate umani (non automatizzabili)

- **Gate 1 — Plan:** Eros legge il piano e spunta `[ ] Plan approvato` nel ticket.
- **Gate 2 — Commit:** Eros legge Verify + Diff Risk e spunta `[ ] Pronto al commit`.

Niente va in produzione senza questi due gate.
