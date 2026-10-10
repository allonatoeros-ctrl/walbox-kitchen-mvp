# MEMORY — Walbox (conoscenza stabile)

Solo regole e decisioni che devono valere in ogni sessione. Ogni voce cita la fonte.

**Qui sì:** regole di prodotto, vincoli tecnici stabili, procedure operative, decisioni durature.
**Qui no:** stato del task, TODO, checkpoint, hash di commit di una fase, risultati temporanei,
note di una singola sessione. Lo stato vive in `CHECKPOINT.md`; le decisioni nate dalle run in
`ai-ops/memory/`.

Regola di manutenzione: se una voce cambia, si aggiorna la voce esistente (con data), non se ne
aggiunge una seconda. Se una regola ha già una fonte nel repo (CLAUDE.md, SECURITY_POLICY.md),
qui si mette solo il rimando, non una copia.

## 1. Regole di prodotto

- **Kitchen, descrizioni dei taglieri:** niente peso di salumi e formaggi; gli ingredienti restano;
  si dice che il tagliere è per due, con tono creativo.
  _Fonte: correzione di Eros, sessione `1e5512b9` 2026-09-15 · CL `cand-20261010-1da2a9eb`._

## 2. Vincoli tecnici stabili

- **Supabase produzione: le migration si applicano solo con `npx supabase db push --linked`**, dopo
  aver verificato il progetto linked e `npx supabase migration list --linked`. Mai
  `apply_migration` (MCP) né query manuali. Fonte unica della regola: `ai-ops/SECURITY_POLICY.md §5.1`.
  _Fonte: DB GATE di Eros, sessione `2f8b68c2` 2026-09-23 · CL `cand-20261010-c368a5c5`._

## 3. Procedure operative

- **Commit: cosa non entra.** Nei commit di codice non vanno `CHECKPOINT.md` né `.playwright-mcp/`
  (oltre a `ai-ops/reports/`, già in `.gitignore`), salvo richiesta esplicita di Eros.
  `CHECKPOINT.md` si committa solo in un commit dedicato al checkpoint, quando Eros lo chiede.
  _Fonte: esclusione ripetuta da Eros, sessioni `889e6dbf` e `2f8b68c2` 2026-09-23 · CL `cand-20261010-c118f72b`._

## 4. Decisioni durature
