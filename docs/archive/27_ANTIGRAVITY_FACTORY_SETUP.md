# 27_ANTIGRAVITY_FACTORY_SETUP.md

Versione: 1.0  
Data creazione: 2026-06-02  
Area: AI Business Factory / Antigravity Operational Setup  
Completezza stimata: 91%

## Scopo

Trasformare la **AI Business Factory V1** da documentazione `.md` a setup operativo dentro Google Antigravity.

Obiettivo:

```text
AI Business Factory V1
↓
selezione dei file core
↓
.agents structure in Antigravity
↓
rules + workflows + skills + references
↓
uso su Walbox / nuovi clienti / nuovi MVP
```

## Sintesi brutale

La AI Business Factory V1 è il cervello.  
Antigravity è il braccio operativo.

Non caricare tutti i file in ogni progetto. Porta solo:

```text
1. regole sempre attive
2. workflow riutilizzabili
3. skills on-demand
4. references sintetiche
5. esempi buoni/cattivi
```

Regola centrale:

> In Antigravity non va messa tutta la biblioteca. Va messo il sistema operativo compatto.

## ChatGPT Project vs Antigravity

```text
ChatGPT Project = regia.
Antigravity = esecuzione codice/progetto.
```

ChatGPT serve per strategia, ricerca, business, pitch, prompt, roadmap, analisi, asset e file `.md`.  
Antigravity serve per codice, file, terminale, build, workspace, agents, skills e workflow.

## Struttura consigliata `.agents`

```text
.agents/
├── rules/
│   ├── factory-core.md
│   ├── safe-coding.md
│   ├── business-first.md
│   └── walbox-core.md
├── workflows/
│   ├── new-project-setup.md
│   ├── safe-ui-edit.md
│   ├── bugfix-readonly-first.md
│   ├── walbox-clone-workflow.md
│   ├── client-pitch-workflow.md
│   └── checkpoint-workflow.md
├── skills/
│   ├── project-context-builder/SKILL.md
│   ├── walbox-dev/SKILL.md
│   ├── walbox-clone-adapter/SKILL.md
│   ├── pitch-builder/SKILL.md
│   ├── qa-review/SKILL.md
│   ├── token-saver/SKILL.md
│   └── checkpoint-writer/SKILL.md
├── references/
│   ├── factory-short-manual.md
│   ├── factory-final-index.md
│   ├── prompt-library-core.md
│   ├── project-context-template.md
│   ├── walbox-case-study.md
│   └── walbox-next-action-plan.md
└── examples/
    ├── bad-vs-good-prompts.md
    ├── safe-ui-edit-example.md
    ├── walbox-clone-example.md
    └── checkpoint-example.md
```

Nota: per coerenza col progetto Walbox usa `.agents/`. Se Antigravity riconosce `.agent/`, adatta il nome cartella.

## Rules minime

### `rules/factory-core.md`

```md
# Factory Core Rules

1. Business before code.
2. One task at a time.
3. Context minimum, output concrete.
4. MVP before roadmap.
5. Read-only before risky changes.
6. Patch minimum.
7. Test before checkpoint.
8. Never expose secrets.
9. Never modify critical files without explicit confirmation.
10. Close important steps with checkpoint.

Before acting:
- identify task type;
- choose workflow;
- list files likely involved;
- state risks;
- propose one next step.
```

### `rules/safe-coding.md`

```md
# Safe Coding Rules

- Start with read-only analysis for risky tasks.
- Modify one file or one area at a time.
- Use minimal patch.
- Do not add dependencies unless explicitly approved.
- Do not touch env/secrets.
- Do not run destructive commands.
- Run build/test after changes when relevant.

Ask before editing:
- App/root state files;
- API/services;
- database schema;
- auth;
- payment;
- env;
- deployment config;
- package.json.
```

### `rules/business-first.md`

```md
# Business First Rules

1. Start from problem, target, MVP, demo, feedback.
2. Do not propose large builds before validation.
3. Separate now / next / later.
4. Create assets before code when the bottleneck is sales.
5. Sell value, not technology.
```

### `rules/walbox-core.md`

```md
# Walbox Core Rules

Walbox is a working pilot/demo.

Walbox is a social experience for venues, not just a jukebox.

Do not edit without explicit confirmation:
- src/App.jsx
- src/services/walboxDb.js
- src/services/spotifyApi.js
- api/search.js
- vercel.json
- package.json
- Supabase schema
- Spotify auth flow
- ManagerDashboard.jsx

Current priority:
Commercial assets and controlled demo preparation before new code.
```

## Workflows minimi

### `workflows/safe-ui-edit.md`

```md
# Workflow — Safe UI Edit

Use when the user asks for visual/UI/copy/layout changes.

Rules:
- Modify only the requested file/component.
- Do not touch backend/API/routing/state unless explicitly required.
- Do not add dependencies.
- Keep existing brand.
- Make minimal patch.

Prompt pattern:
"Modifica solo @FileName. Fai solo [specific change]. Non modificare altri file. Non toccare backend/API/routing/state. Dopo dimmi come testare."
```

### `workflows/bugfix-readonly-first.md`

```md
# Workflow — Bugfix Read-only First

1. Read-only analysis.
2. Identify likely files.
3. Explain root cause hypothesis.
4. Propose minimal patch.
5. Wait for approval.
6. Apply patch only to approved files.
7. Run test/build.
8. Create checkpoint.
```

## Anti-caos

1. Non dare prompt generici.
2. Non caricare tutta la Factory.
3. Non chiedere “crea tutto”.
4. Non usare modello forte per micro edit.
5. Non accettare modifiche senza review.
6. Non far toccare file critici.
7. Non aprire più agenti sugli stessi file.
8. Non fare refactor durante feature.
9. Non mettere segreti nel prompt.
10. Non passare alla build prima di avere contesto.

Prompt anti-caos:

```text
Prima di agire, identifica:
1. task type;
2. workflow da usare;
3. file target;
4. file da non toccare;
5. rischio;
6. modello/modalità consigliata;
7. primo step singolo.

Non modificare file finché non approvo.
```

## Fast vs Planning

```text
Fast = so cosa voglio.
Planning = devo capire prima di agire.
```

Fast per micro UI, testo, spacing, copy, piccoli CSS, un file.  
Planning per nuove feature, bug non chiari, multi-file, Supabase, Spotify, routing, architettura, clone progetto.

## Modelli consigliati

```text
Gemini 3 Flash Low = micro edit
Gemini 3 Flash Medium = default un file
Gemini 3 Flash High = logica React/bug moderati
Pro/Thinking = architettura, multi-file, debug complesso
```

## Setup minimo

```text
.agents/rules/factory-core.md
.agents/rules/safe-coding.md
.agents/workflows/safe-ui-edit.md
.agents/workflows/checkpoint-workflow.md
.agents/skills/walbox-dev/SKILL.md
.agents/skills/pitch-builder/SKILL.md
.agents/references/factory-short-manual.md
.agents/references/walbox-next-action-plan.md
```
