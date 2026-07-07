# Archive Index — Run non promosse a memory

Fonte: `ai-ops/reports/2026-07-08_run-memory-classification-v0.md`. Elenca le run classificate
`archive` o `ignore` durante il Memory Loop V0 e il motivo per cui **non** sono diventate una
decision note. Regola: nessuna run con `result.md` mancante o ancora ai segnaposto `TBD` viene
promossa — vedi `README.md` § Regola di promozione.

| Run | Classificazione | Motivo |
|---|---|---|
| `ai-factory_ai-factory-audit-read-only-verifica-che-il-run-pack-contenga` | archive | Verifica puramente strutturale (i 5 file del Run Pack esistono). Nessuna decisione o azione nuova, solo conferma che il runner funziona. |
| `ai-factory_verifica-come-run-js-genera-context-md-e-se-serve-un-context` | ignore | `result.md` mai compilato (placeholder TBD in ogni sezione). Duplica lo scopo della run promossa `context-pack-known-files`, che invece è stata completata con esito reale. |
| `walbox_scrivi-un-post-social-per-il-locale` | ignore | `result.md` mai compilato. Task di comunicazione/marketing, fuori perimetro tecnico ai-factory/CHECKPOINT. |
| `walbox_sistema-il-layout-della-staffdashboard-spaziatura-pulsanti` | archive | `result.md` mai compilato: nessuna modifica applicata. Se il fix è ancora desiderato va riaperto come ticket nuovo. |
| `walbox_walbox-micro-task-in-staffdashboard-jsx-aggiungi-un-badge-vi` | archive | Nessun `result.md` nel run pack (mai eseguita). Presupponeva di dover *creare* il badge Sync TV, ma il badge esiste già (vedi `staffdashboard-sync-tv-known-file.md`) — richiesta superata dai fatti. |
| `walbox_walbox-test-audit-read-only-esamina-il-test-spotify-search-u` | archive | Nessun `result.md` (mai eseguita). Task legittimo (2 test falliti su `spotify-search-ui.spec.js`) ma senza alcuna evidenza raccolta: se ancora rilevante va rilanciato da capo. |
| `walbox_walbox-ui-audit-read-only-verifica-visivamente-lo-stato-del` | archive | Nessun `result.md` (mai eseguita). Dipendeva dall'assunzione che il badge fosse "nuovo" (introdotto dalla run sopra, mai eseguita): premessa falsa, il badge esiste già da prima. |

**Promemoria:** una run in questa tabella può essere ripescata in futuro solo se viene rieseguita e
produce un `result.md` completo con esito verificabile — a quel punto rientra nel flusso normale di
classificazione (`ai-ops/reports/<timestamp>_run-memory-classification-v0.md` o successivo), non
va copiata qui dentro come memory diretta.
