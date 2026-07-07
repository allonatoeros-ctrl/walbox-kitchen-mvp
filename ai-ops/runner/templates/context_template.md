# RUN CONTEXT — {{TITLE}}

## Project state snapshot (CHECKPOINT.md, read-only)

Snapshot sintetico, letto in read-only da CHECKPOINT.md (max 6 righe per sezione).
Fonte completa e autorevole: CHECKPOINT.md nella root del repo.

- STABLE:
{{CHECKPOINT_STABLE}}
- DONE:
{{CHECKPOINT_DONE}}
- OPEN ISSUES:
{{CHECKPOINT_OPEN_ISSUES}}
- NEXT STEP:
{{CHECKPOINT_NEXT_STEP}}

## State sources to read

- CHECKPOINT.md (stato corrente, NEXT STEP — snapshot sopra, dettaglio completo nel file)
- CLAUDE.md (§2 routing agenti, §5 aree protette, §15 formato report)
- ai-ops/README.md (pipeline e gate)
- ai-ops/SECURITY_POLICY.md (regole 1-10 del router)

## Known files for this task

Mapping statico keyword -> path noto (ai-ops/runner/context_map.json, no RAG/embedding).

{{KNOWN_FILES}}
