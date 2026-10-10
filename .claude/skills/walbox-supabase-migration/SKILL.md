---
name: walbox-supabase-migration
description: Passi operativi per creare e applicare una migration Supabase di Walbox in produzione (migration locale, precheck del ledger, apply solo con `npx supabase db push --linked`, postcheck). Usala solo dentro un task approvato (Gate 1) che tocca `supabase/migrations/`.
---

# Walbox — migration Supabase

Fonti uniche, da non duplicare qui: regola di apply → `ai-ops/SECURITY_POLICY.md §5.1`;
ciclo e gate → `CLAUDE.md §3`; Supabase è area protetta → `CLAUDE.md §5`.
Questa skill aggiunge solo i passi concreti.

## 1. Migration locale (dopo Gate 1)
- Una sola migration nuova in `supabase/migrations/`, con timestamp successivo all'ultima presente.
- Test locali previsti dal task (es. `node --test` sul `.test.js` della migration, build).
- Non applicare la migration. Nessun commit.

## 2. Review (prima del Gate 2)
- Diff file per file (skill `diff-risk-reviewer`): aderenza al design, invarianti, nessun file extra
  senza motivo.

## 3. Apply remoto — solo con OK esplicito di Eros per questa migration
Precheck, tutti obbligatori. Se uno fallisce: STOP, nessun apply.
1. Branch = quello indicato nel task o in `CHECKPOINT.md`.
2. Progetto linked = progetto Walbox atteso (confronto con il riferimento dato da Eros nel task).
3. `npx supabase migration list --linked`: la migration nuova è l'unica pending, zero righe remote-only.

Apply: solo `npx supabase db push --linked`.
Mai `mcp__supabase__apply_migration`, mai `supabase db query --linked -f <file>`.

Postcheck (sola lettura):
- `npx supabase migration list --linked` → zero pending, zero remote-only.
- Gli oggetti attesi (tabelle, RPC, policy) esistono sul DB live.

## 4. Runtime test
Solo su sandbox o dati di test: niente denaro reale, nessun cleanup sul DB di produzione.
Report in `ai-ops/reports/`.

## 5. Commit (dopo Gate 2)
Solo i file del cambiamento (migration, test, codice collegato). Mai report `ai-ops`, `CHECKPOINT.md`,
`.playwright-mcp/`. Nessun push né deploy.

## Stop
- Pending o remote-only inattese → STOP: la riconciliazione del ledger è un task a parte (SECURITY_POLICY §5.1).
- Progetto linked o branch diversi da quelli attesi → STOP.
- `db push` fallisce → STOP, nessun secondo tentativo con altri canali.
