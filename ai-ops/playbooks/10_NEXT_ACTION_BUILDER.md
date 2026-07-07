# 10 — Next Action Builder

**Data:** 2026-07-08
**Stato:** playbook operativo proposto
**Progetto:** AI Factory Orchestrator — Reality Sprint
**Uso:** dato un `result.md`, produce la prossima azione operativa in formato eseguibile
**Relazione:** applica **dopo** `09_REVIEW_DECISION_MEMORY_PIPELINE.md` (review/decision/memory) —
questo playbook si concentra solo sul **next step**, non ridefinisce tassonomia PASS/PARTIAL/FAIL né
le regole memoria/checkpoint già coperte da `09`.

---

## 1. Purpose

Trasformare ogni `result.md` (o report finale di Claude Code) nella prossima azione operativa,
save-token, senza che Eros debba rileggere tutto il run e riscrivere il prompt a mano.

```text
result.md → review.md → decision.md → next_action_prompt.md → approval_needed.md
```

Non genera codice, non applica fix, non fa commit. Genera solo il **prossimo prompt** e la
**decisione su chi deve approvarlo**.

---

## 2. Input

- `result.md` (obbligatorio)
- `run_log.md` (se presente)
- `runner.json` (se presente)
- `git status -sb` / `git diff --stat` / output test (se presenti nel result.md)

Se `result.md` manca o è vuoto: non generare next action, produrre solo `decision.md` con
`decision_type: no_action` e motivo.

---

## 3. Output

Per ogni run:

```text
review.md
decision.md
next_action_prompt.md
approval_needed.md
```

`review.md` e `decision.md` seguono i formati già definiti in `09_REVIEW_DECISION_MEMORY_PIPELINE.md`
(non riscriverli qui). Questo playbook aggiunge `next_action_prompt.md` e `approval_needed.md`.

---

## 4. Decision types

Classificazione primaria della prossima azione (diversa dalla `decision_class` di `09`, che
classifica la run passata — qui classifichiamo l'azione futura):

| decision_type | quando |
|---|---|
| `no_action` | result.md vuoto/incompleto, o nessuna azione utile emerge |
| `ask_human` | ambiguità bloccante, decisione di prodotto, o risposta solo di Eros |
| `run_readonly_audit` | serve altro audit prima di poter agire (scope non ancora chiaro) |
| `run_scoped_fix` | bug reale confermato, area non protetta, fix chirurgico possibile |
| `run_docs_update` | serve solo aggiornare documentazione/playbook, non codice |
| `run_checkpoint_patch` | la run cambia stato ufficiale progetto, serve patch CHECKPOINT.md |
| `prepare_commit` | fix già applicato e verificato, serve solo preparare commit/push (mai eseguirli) |
| `protected_design_required` | fix tocca area protetta (Supabase/Spotify/Auth/Routing/env) — serve design/proposal, non fix diretto |
| `archive_ignore` | run completa ma senza azione successiva utile |

---

## 5. Approval rules

| tipo azione | approval |
|---|---|
| read-only (audit, review) | nessuna — può proporre next prompt direttamente |
| docs update (playbook, memoria, report) | leggera — Eros conferma con un sì |
| scoped code fix (file non protetto) | esplicita — Eros approva prompt + file target prima del run |
| commit / push / deploy / env / db / Supabase schema | forte — Eros approva ogni singolo comando, mai proposto come batch |

Regola fissa: se la run coinvolge **Supabase schema, auth, Spotify, routing o env/secrets**, non
generare mai `run_scoped_fix`. Generare sempre `protected_design_required` con un prompt di design/
proposal (no diff diretto), coerente con CLAUDE.md §5 (Protected Areas).

---

## 6. Prompt levels

- **MINI** (max 120 parole): audit puntuale, docs update, singolo file non protetto.
- **STANDARD** (max 250 parole): scoped fix con più file o contesto da riportare (schema mapping,
  file coinvolti, comportamento atteso).
- **FULL**: solo per git push/deploy/env/db/Supabase/refactor multi-file rischiosi — include sempre
  richiamo esplicito a `SECURITY_POLICY.md` e CLAUDE.md §5/§12.

Default: se il decision_type è `run_readonly_audit` o `run_docs_update` → MINI. Se
`run_scoped_fix` → STANDARD. Se `protected_design_required` o `prepare_commit` → FULL.

---

## 7. Output format obbligatorio — `next_action_prompt.md` + `approval_needed.md`

```markdown
# Next Action — <run_id>

## Decisione
<decision_type>

## Motivo
<perché questa è la prossima azione corretta, 1-3 righe>

## Rischio
<basso | medio | alto — cosa può andare storto>

## Approval needed
sì/no — <tipo: nessuna | leggera | esplicita | forte>

## Next action prompt
<prompt MINI/STANDARD/FULL pronto da incollare a Claude Code>

## Stop condition
<quando questo next step deve fermarsi e tornare a chiedere a Eros>
```

`approval_needed.md` può essere lo stesso blocco `## Approval needed` estratto come file separato
quando serve un checkpoint di approvazione isolato (es. per batch di più run).

---

## 8. Esempio reale A — Reality Sprint 01

```text
result.md: audit CustomerRequest.jsx → bug reale localStorage/Supabase confermato,
file non protetto, fix chirurgico chiaro.

decision_type: run_scoped_fix
approval: esplicita (scoped code fix)
prompt level: STANDARD

Next action prompt (STANDARD, sintesi):
"Applica il fix in CustomerRequest.jsx: sostituisci la lettura da localStorage con la
chiamata Supabase già esposta da useSongRequests.js. Non toccare altri file. Build PASS
richiesto prima di riportare fatto. Nessun commit."
```

Esito reale confermato: fix scoped → build PASS → commit/push approvato da Eros → test Vercel PASS.

---

## 9. Esempio reale B — Reality Sprint 02

```text
result.md: audit queuePaused/venueSettings → bug reale confermato (localStorage-only,
non sync cross-device), ma fix richiede nuova tabella Supabase (venue_settings) + hook
realtime → area protetta.

decision_type: protected_design_required
approval: forte (Supabase schema)
prompt level: FULL

Next action prompt (FULL, sintesi):
"Non applicare fix diretto. Prepara una design proposal (solo documento, no codice):
schema tabella venue_settings (colonna queue_paused boolean), hook useVenueSettings()
analogo a useRealtimeRequests, punti di sostituzione in StaffDashboard.jsx e
CustomerRequest.jsx. Nessuna modifica a src/, nessuna migrazione eseguita. Richiede
approvazione esplicita di Eros su schema prima di qualunque implementazione."
```

Nessun fix diretto generato: la run 02 resta `protected_design_required`, in attesa di
approvazione sullo schema Supabase prima che `run_scoped_fix` diventi possibile.

---

## 10. Cosa NON fa questo playbook

- Non ridefinisce PASS/PARTIAL/FAIL/BLOCKED né decision_class (`09` è la fonte).
- Non promuove automaticamente a memoria o checkpoint (resta compito di `09`).
- Non applica mai il next action prompt da solo: lo prepara, Eros lo lancia.
- Non genera prompt per aree protette senza marcarli `protected_design_required` + approval forte.
