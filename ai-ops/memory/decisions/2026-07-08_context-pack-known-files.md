---
name: context-pack-known-files
type: decision_note
date: 2026-07-08
source_run: ai-ops/runs/2026-07-07_ai-factory_ai-factory-audit-read-only-progettare-context-pack-lite-v0-v/
---

# Decision: Context Pack Lite V0 — Known Files statico come primo micro-step

## Evidenza (da run #1, `result.md` completo, esito pass)

Audit read-only ha verificato che oggi `ai-ops/runner/run.js` genera `context.md` leggendo
**solo** `CHECKPOINT.md` (sezioni STABLE/DONE/OPEN ISSUES/NEXT STEP, troncate a 6 righe) più un
blocco statico fisso di 4 file da leggere manualmente. Nessun grep del repo, nessun embedding/RAG,
output identico a prescindere dal task richiesto.

Candidati valutati per un "Context Pack Lite V0" senza RAG (in ordine di ritorno/costo):
1. Task-aware file targeting: mapping statico keyword→path (es. "Poster TV" →
   `LiveTvScreenWalrusPoster.jsx`), derivato da CLAUDE.md §9.
2. `git log -5` filtrato per area toccata.
3. Estrazione selettiva delle sezioni pertinenti di CLAUDE.md §5 (aree protette).
4. Stato build/test — già coperto dallo snapshot CHECKPOINT.md STABLE esistente.

## Decisione

Il run ha raccomandato di partire dal punto 1 (mapping statico keyword→path, "Known files") come
micro-step a più alto ritorno/più basso rischio. Questa decisione è **validata**: la run #6
(vedi [2026-07-08_staffdashboard-sync-tv-known-file.md](2026-07-08_staffdashboard-sync-tv-known-file.md))
ha dimostrato che il mapping, applicato a un caso reale, ha guidato correttamente Claude Code al
file giusto (`StaffDashboard.jsx`) al primo tentativo, senza esplorazione libera del repo.

**Decisione presa:** il meccanismo "Known files" statico (keyword→path, no RAG, no ricerca
semantica) è il pattern da mantenere per Context Pack Lite V0.

## Limite

Il mapping è **statico e manuale**: va mantenuto a mano man mano che il repo cambia (nuovi file,
nuove keyword rilevanti) e va validato periodicamente contro run reali, non assunto corretto per
sempre. Non copre ancora: git log filtrato per area (dipende dal mapping categoria→path glob) né
estrazione selettiva di CLAUDE.md §5 (rischio di omettere per errore un'area protetta — da
trattare con più cautela, revisione dedicata).

Non è ancora deciso se/come tradurre questo in codice (`ai-ops/runner/context_map.json` +
funzione di lookup): resta un'implementazione futura da approvare separatamente (Gate 1), questa
nota registra solo la decisione di design, non autorizza modifiche a `ai-ops/runner/`.
