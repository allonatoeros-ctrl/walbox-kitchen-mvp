# WALBOX — IF CLEANUP SPRINT PLAN
> Usare solo se l'audit decide CLEANUP.  
> Obiettivo: rendere il repo attuale leggibile e pronto per V1 vendibile senza riscrivere tutto.

---

## Principio

Cleanup non significa refactor globale.

Cleanup significa:

```text
ridurre confusione → proteggere ciò che funziona → isolare legacy → rendere chiaro cosa è prodotto V1
```

---

## Fase C0 — Safety snapshot

Prima di modificare:

- `git status`;
- build;
- test principali;
- screenshot/preview delle route principali;
- lista file modificati/untracked.

Output richiesto:

```md
## Safety snapshot
- branch
- uncommitted files
- build status
- test status
- route verificate
```

Stop condition: se build o test falliscono già, non pulire prima di aver documentato il baseline.

---

## Fase C1 — Route map

Obiettivo: capire quali route sono vive.

Produrre tabella:

| Route | Componente | Stato | Note |
|---|---|---|---|
| `/kitchen` | | active/legacy/unknown | |
| `/kitchen/status` | | active/legacy/unknown | |
| `/staff` o equivalente | | active/legacy/unknown | |
| `/tv` / `/tv-poster` | | active/legacy/unknown | |

Regola: non modificare `App.jsx` senza approvazione.

---

## Fase C2 — File ownership map

Obiettivo: sapere quali file sono core V1.

Categorie:

### Core V1 Kitchen

- customer menu;
- order status;
- staff dashboard;
- kitchen orders;
- menu availability;
- hooks ordini/menu;
- Supabase services.

### Experience / TV

- live screen;
- poster TV;
- jukebox/mood se presenti.

### Legacy / archive candidates

- vecchie versioni TV;
- vecchi mock;
- pagine demo non collegate;
- asset duplicati.

---

## Fase C3 — Archive legacy, non delete

Obiettivo: non cancellare materiale utile.

Strategia:

```text
references/archive/YYYYMMDD_cleanup_candidates/
```

Prima di spostare file:

- elencare candidati;
- spiegare perché;
- chiedere approvazione.

Stop condition: non spostare file importati da route attive.

---

## Fase C4 — Normalize docs root

Obiettivo: lasciare in root solo i file utili a sviluppo.

Consigliati:

- `CHECKPOINT.md`;
- `WALBOX_CLAUDE_SPRINT_CONTEXT.md`;
- `README.md` se esiste;
- eventuale `project_supabase_v1_plan.md`.

Da archiviare se troppo lunghi o superati:

- prompt vecchi;
- piani duplicati;
- screenshot temporanei;
- file generati solo per una sessione.

---

## Fase C5 — Build/test verification

Dopo ogni micro-cleanup:

```bash
npm run build
```

Se esistono test mirati:

```bash
npx playwright test tests/e2e/customer-kitchen-flow.spec.js
```

Non fare commit senza diff review.

---

## Fase C6 — Productization gap list

Solo dopo cleanup minimo, creare gap V1:

| Gap | Priorità | File probabili | Rischio | Fase |
|---|---:|---|---|---|

Gap tipici V1:

- varianti/modificatori;
- QR tavolo/zona/bancone;
- report giornaliero base;
- receipt non fiscale;
- pagamento al banco più chiaro;
- fallback operativo;
- dashboard valore base.

---

## Prompt operativo per Claude — Cleanup Phase 1

```md
Modalità CLEANUP PHASE 1.
Leggi `00_CLAUDE_START_HERE.md`, `02_DECISION_MATRIX.md` e questo file.
Non modificare codice.
Produci route map + file ownership map + legacy candidates.
Non toccare `App.jsx`, Supabase, auth, env o test.
Output breve con tabella e microfase successiva.
```
