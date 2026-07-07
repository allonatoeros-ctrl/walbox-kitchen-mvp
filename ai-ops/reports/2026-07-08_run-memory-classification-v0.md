# Run Memory Classification V0 — Audit read-only

Data: 2026-07-08
Ambito: `ai-ops/runs/` (9 run pack trovate, tutte datate 2026-07-07). Nessuna modifica a file. Nessun commit.

## Metodo

Per ogni run pack letti: `runner.json`, `claude_prompt.md` (head), `result.md` (se presente), `run_log.md` (tail). Le run senza `result.md` sono state trattate come "pack generato ma mai eseguito da un esecutore" (nessuna evidenza di lavoro reale svolto).

---

## 1. `ai-factory_ai-factory-audit-read-only-progettare-context-pack-lite-v0-v`

- **Progetto:** ai-factory
- **Tipo:** audit
- **Esito:** pass
- **Valore:** high
- **Classificazione:** `evidence` + `decision_note_candidate`
- **Motivo:** Result.md completo e concreto. Spiega come `run.js` genera oggi `context.md` (solo `CHECKPOINT.md`, nessun grep/RAG), propone come dato minimo un "Known files" mapping statico keyword→path (`context_map.json`), e raccomanda esplicitamente questo come primo micro-step. Decisione aperta per Eros: procedere o no col micro-step. Val la pena tradurlo in un ticket/decision note perché è un piano azionabile, non solo osservazione.

## 2. `ai-factory_ai-factory-audit-read-only-verifica-che-il-run-pack-contenga`

- **Progetto:** ai-factory
- **Tipo:** audit/test
- **Esito:** pass
- **Valore:** low
- **Classificazione:** `archive`
- **Motivo:** Verifica puramente strutturale (i 5 file del Run Pack esistono). Conferma il funzionamento del runner ma non produce nessuna decisione o azione nuova. Valore residuo solo come test di regressione one-off, non da conservare come nota.

## 3. `ai-factory_verifica-come-run-js-genera-context-md-e-se-serve-un-context`

- **Progetto:** ai-factory
- **Tipo:** planning (dichiarato `review_prompt`, mai eseguito)
- **Esito:** unknown
- **Valore:** low
- **Classificazione:** `ignore`
- **Motivo:** `result.md` è ancora il placeholder "TBD" in ogni sezione — il task non è mai stato eseguito da un esecutore. Contenuto duplica esattamente lo scopo della run #1, che invece è stata completata con esito reale. Nessuna evidenza da estrarre.

## 4. `walbox_scrivi-un-post-social-per-il-locale`

- **Progetto:** walbox
- **Tipo:** planning/handoff (classificatore: `unclassified`, triage umano richiesto)
- **Esito:** unknown
- **Valore:** low
- **Classificazione:** `ignore`
- **Motivo:** `result.md` mai compilato (placeholder TBD). Task di comunicazione/marketing, non tecnico — fuori perimetro ai-factory/CHECKPOINT. Nessun contenuto reale generato in questa run pack.

## 5. `walbox_sistema-il-layout-della-staffdashboard-spaziatura-pulsanti`

- **Progetto:** walbox
- **Tipo:** implementation (pianificata, mai eseguita)
- **Esito:** unknown
- **Valore:** low
- **Classificazione:** `archive`
- **Motivo:** `result.md` è ancora TBD: nessuna modifica applicata a `StaffDashboard.jsx`. Se il fix layout/spaziatura pulsanti è ancora desiderato, va riaperto come ticket nuovo (non c'è nulla da recuperare da questa run, solo l'intento originale).

## 6. `walbox_walbox-audit-read-only-verifica-il-badge-sync-tv-in-staffdas`

- **Progetto:** walbox
- **Tipo:** audit
- **Esito:** pass
- **Valore:** high
- **Classificazione:** `evidence` + `decision_note_candidate`
- **Motivo:** Result.md completo: conferma che il badge "Sync TV" esiste già in `src/pages/StaffDashboard.jsx` (righe 784-801, con i 3 stati OK/interrotta/assente) e che il "Known files" di `context_map.json` ha localizzato il file corretto al primo grep. È evidenza diretta a supporto della decisione della run #1 (il micro-step "keyword→path mapping" funziona quando applicato). Nota: questo badge risulta **già presente nel codice**, non introdotto da questa sessione — le run #7/#8/#9 sotto (che presupponevano di doverlo creare/testare) sono quindi verosimilmente superate da questo fatto.

## 7. `walbox_walbox-micro-task-in-staffdashboard-jsx-aggiungi-un-badge-vi`

- **Progetto:** walbox
- **Tipo:** implementation (pianificata via `/phase-plan`, mai eseguita)
- **Esito:** stale
- **Valore:** low
- **Classificazione:** `archive`
- **Motivo:** Nessun `result.md` presente nel run pack (nessuna esecuzione avvenuta). Il task chiedeva di *aggiungere* il badge Sync TV, ma la run #6 mostra che il badge esiste già nel codice — la richiesta è quindi obsoleta/superata dai fatti.

## 8. `walbox_walbox-test-audit-read-only-esamina-il-test-spotify-search-u`

- **Progetto:** walbox
- **Tipo:** audit (dichiarato read-only, mai eseguito)
- **Esito:** stale
- **Valore:** low
- **Classificazione:** `archive`
- **Motivo:** Nessun `result.md`: run pack generato ma non eseguito. Task legittimo (2 test falliti su `spotify-search-ui.spec.js` + bottone RICONTROLLA) ma senza alcuna evidenza raccolta — se ancora rilevante va rilanciato, non recuperato da qui.

## 9. `walbox_walbox-ui-audit-read-only-verifica-visivamente-lo-stato-del`

- **Progetto:** walbox
- **Tipo:** audit visivo (dichiarato read-only, mai eseguito)
- **Esito:** stale
- **Valore:** low
- **Classificazione:** `archive`
- **Motivo:** Nessun `result.md`. Dipendeva dall'assunzione che il badge fosse "nuovo" (introdotto dalla run #7, mai eseguita): la premessa non è mai stata verificata perché il badge esiste già da prima (vedi run #6). Se serve ancora un audit visivo reale del badge, va rifatto da capo con screenshot/browser.

---

## Riepilogo numerico

| Classificazione | Count | Run |
|---|---|---|
| evidence | 2 | #1, #6 |
| decision_note_candidate | 2 | #1, #6 (stesse due, doppio tag) |
| checkpoint_patch_candidate | 0 | — |
| archive | 5 | #2, #5, #7, #8, #9 |
| ignore | 2 | #3, #4 |

**Osservazione trasversale:** 3 run su 9 (#7, #8, #9) sono pack generati dal runner ma **mai eseguiti** (nessun `result.md`) — segnale che il loop "genera ticket → Eros approva → esecutore lavora → result.md" si interrompe spesso dopo la generazione. Utile per Review/Decision Loop V0: distinguere "run pack creato" da "run pack eseguito" come metrica.

**Nessun checkpoint_patch_candidate**: nessuna delle run con esito reale (pass) tocca uno stato/decisione già riportato in CHECKPOINT.md STABLE/DONE — sono audit di tooling interno (ai-factory-runner), non feature applicative.
