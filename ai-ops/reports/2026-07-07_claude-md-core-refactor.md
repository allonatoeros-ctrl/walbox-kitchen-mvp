# CLAUDE.md Core Refactor — Report

**Data:** 2026-07-07
**Tipo:** Refactor controllato (slim CLAUDE.md), da audit `2026-07-07_claude-md-optimization-audit.md`
**Esito:** PASS parziale accettato da Eros (Opzione A: 873 parole, sopra il target 500-700 ma approvato)

---

## 1. Obiettivo

Ridurre CLAUDE.md a un "Core" breve, spostando checklist/formati già duplicati in skill/policy
esistenti, senza perdere regole e senza rompere i riferimenti di sezione usati altrove nel repo.

## 2. Word count

| | Parole |
|---|---|
| Prima | 3668 |
| Dopo | 873 |
| Riduzione | −76% |
| Target dichiarato | 500-700 |
| Esito | sopra target di ~170 parole — **accettato da Eros come Opzione A**, nessun ulteriore taglio |

## 3. Anchor di sezione

Mantenuti tutti i 21 anchor (`## 0`, `## 0.5`, `## 1`…`## 21`), inclusi `## 10-11` e `## 16-17`
(accorpati ma con numerazione originale preservata per non rompere i rimandi esterni). Verificato
via grep che §0.5, §2, §3, §5, §9, §11, §12, §13, §14, §15, §16 restano risolvibili dai
riferimenti esistenti in skill, template Runner e `ai-ops/SECURITY_POLICY.md`.

## 4. File modificati

- `CLAUDE.md` — riscritto in versione Core: contenuto di §13 (Quality Gates) e §14 (Diff Risk
  Review) sostituito da rimando alle skill `quality-gate-verifier`/`diff-risk-reviewer`; §0.5 e §15
  ridotti a principio + rimando a `silent-report`; §10-11 ridotti a rimando a
  `SECURITY_POLICY.md §7`; §9/§20 (Poster TV) deduplicati; nessuna regola rimossa, solo spostata.

## 5. File creati

- `ai-ops/reports/2026-07-07_claude-md-optimization-audit.md` (audit read-only precedente)
- `ai-ops/reports/2026-07-07_claude-md-core-refactor.md` (questo file)

## 6. Fuori scope — non toccato

`src/`, `.env`/secrets, Supabase, `package.json`/lock/deps, config deploy/Vercel: nessun file in
queste aree è stato letto o modificato in questo task.

## 7. Rischi residui

- Word count (873) resta sopra il range 500-700 dichiarato nel piano — accettato esplicitamente
  da Eros, non è un difetto da correggere in questo task.
- I template prompt del Runner (`ai-ops/runner/templates/prompts/*.md`) e
  `ai-ops/SECURITY_POLICY.md` continuano a citare le stesse sezioni CLAUDE.md per numero: essendo
  gli anchor invariati, restano validi, ma non sono stati riletti riga per riga in questo task —
  verifica di dettaglio raccomandata alla prossima modifica di quei template.
- Nessun `npm run build`/test eseguito: il task tocca solo documentazione (`.md`), non codice
  applicativo, quindi non applicabile.

## 8. Comandi git suggeriti (nessuno eseguito)

```bash
git add CLAUDE.md ai-ops/reports/2026-07-07_claude-md-optimization-audit.md ai-ops/reports/2026-07-07_claude-md-core-refactor.md
git commit -m "Slim CLAUDE.md to Core, move checklists to skills/policy (audit + refactor reports)"
```

Commit e push restano decisione di Eros (CLAUDE.md §16-17, non eseguiti in questo task).
