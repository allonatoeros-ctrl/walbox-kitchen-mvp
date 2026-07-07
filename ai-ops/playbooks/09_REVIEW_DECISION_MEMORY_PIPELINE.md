# 09 — Review / Decision / Memory Pipeline V0.2

**Data:** 2026-07-08  
**Stato:** fonte operativa proposta  
**Progetto:** AI Factory Orchestrator — Academy & Build Lab  
**Uso:** pipeline manuale-assistita da applicare dopo ogni run reale di Claude Code  
**Direzione:** control tower sopra Claude Code, non mega-agente autonomo

---

## 1. Perché esiste questo file

La V0.2 dell’AI Factory Orchestrator chiarisce che il Runner non è il prodotto finale.

Il ciclo operativo validato è:

```text
task grezzo
→ Runner / Work Unit Builder
→ Run Pack
→ Claude Code
→ result.md
→ Review
→ Decision
→ Memory
→ Checkpoint
```

Il problema non è più solo generare un buon prompt per Claude.

Il problema vero è decidere, dopo l’esecuzione:

```text
cosa è successo,
se è valido,
se va ricordato,
se aggiorna lo stato progetto,
o se va archiviato/ignorato.
```

Questa pipeline serve a trasformare ogni `result.md` in una decisione controllata.

---

## 2. Principio guida

```text
Non tutto ciò che viene generato diventa memoria.
```

Solo una run:

- eseguita;
- verificabile;
- revisionata;
- utile per il futuro;
- non contraddetta da evidenze successive;

può diventare memoria o checkpoint.

Questa regola evita:

- echo chamber;
- memoria sporca;
- documenti contraddittori;
- checkpoint aggiornati troppo presto;
- fiducia cieca nei report di Claude.

---

## 3. Quando usare questa pipeline

Usarla dopo ogni run Claude Code che produce almeno uno di questi output:

- `result.md`;
- diff di codice;
- report finale;
- run log;
- quality gate;
- proposta checkpoint;
- decisione tecnica;
- modifica documentale importante.

Non usarla per:

- micro-chat esplorative;
- bozze non eseguite;
- prompt mai lanciati;
- task abbandonati prima dell’esecuzione;
- output senza evidenza.

---

## 4. Input della pipeline

Input minimo:

```text
ai-ops/runs/<run_id>/result.md
```

Input consigliati:

```text
ai-ops/runs/<run_id>/runner.json
ai-ops/runs/<run_id>/claude_prompt.md
ai-ops/runs/<run_id>/context.md
ai-ops/runs/<run_id>/run_log.md
git diff --stat
git status -sb
output quality gate
```

Se mancano gli input essenziali, la run non può diventare memoria.

---

## 5. Output della pipeline

Per ogni run reale, la Factory deve produrre o proporre:

```text
review.md
decision.md
memory_candidate.md
checkpoint_patch.md
archive_note.md
```

Non tutti gli output sono sempre necessari.

Regola:

```text
Ogni run deve avere review + decision.
Memory e checkpoint solo se giustificati.
```

---

## 6. Tassonomia decisionale

Ogni run riceve una classificazione primaria.

### 6.1 `evidence`

La run contiene evidenza utile, ma non cambia ancora memoria o checkpoint.

Usare quando:

- il risultato è interessante;
- il task è parziale;
- servono altre prove;
- il dato può aiutare una decisione futura.

### 6.2 `decision_note`

La run produce una decisione operativa valida.

Usare quando:

- abbiamo deciso una direzione;
- abbiamo escluso una strada;
- abbiamo validato un pattern;
- abbiamo risolto una contraddizione.

### 6.3 `memory_candidate`

La run contiene una regola o conoscenza riusabile.

Usare quando:

- il risultato cambierà prompt futuri;
- evita errori ricorrenti;
- descrive uno stato progetto stabile;
- è utile in più task simili.

### 6.4 `checkpoint_patch`

La run cambia lo stato ufficiale del progetto.

Usare quando:

- un bug reale è stato risolto;
- una feature è stata completata;
- una milestone è stata validata;
- una decisione architetturale diventa vincolante.

Il checkpoint non si aggiorna automaticamente.

Si produce solo una patch proposta.

### 6.5 `archive`

La run è completa ma non merita memoria attiva.

Usare quando:

- è un task tecnico puntuale;
- non cambia regole future;
- non modifica stato progetto;
- serve solo tracciabilità.

### 6.6 `ignore`

La run non va promossa.

Usare quando:

- output vuoto;
- task fallito senza evidenza utile;
- result.md incompleto;
- report contraddittorio;
- scope drift;
- mancano diff/test/log minimi.

---

## 7. Stati qualità

Ogni review assegna anche uno stato qualità.

```text
PASS
PARTIAL
FAIL
BLOCKED
```

### PASS

La run ha rispettato scope, qualità e sicurezza.

Può diventare decisione, memoria o checkpoint se utile.

### PARTIAL

La run ha prodotto valore ma non è completa.

Può diventare evidence, ma di norma non checkpoint.

### FAIL

La run non è affidabile.

Non diventa memoria.

Può generare una lesson learned solo se ben documentata.

### BLOCKED

La run si è fermata correttamente per mancanza di permessi, ambiguità, rischio o input.

Può diventare evidence positiva se il blocco ha evitato danni.

---

## 8. Checklist di review

Ogni `review.md` deve rispondere a queste domande:

```text
1. Il task originale era chiaro?
2. Claude ha rispettato lo scope?
3. Ha letto solo file autorizzati o giustificati?
4. Ha modificato solo ciò che era previsto?
5. Ha eseguito i quality gate richiesti?
6. Il report è coerente con diff e log?
7. Ci sono rischi residui?
8. Il risultato è riusabile come memoria?
9. Serve patch al CHECKPOINT.md?
10. Serve approval umana prima di procedere?
```

Se una risposta è incerta, segnare `PARTIAL` o `BLOCKED`, non `PASS`.

---

## 9. Regole Memory Manager

Una run può diventare memoria solo se supera queste condizioni:

```text
- è stata eseguita davvero;
- ha evidenza leggibile;
- non è solo un’intenzione;
- non è rumore operativo;
- non duplica memoria già esistente;
- non contiene dati sensibili non necessari;
- è utile per decisioni future;
- è stata approvata da Eros o da review esplicita.
```

Non salvare in memoria:

- ogni ticket Runner;
- ogni prompt generato;
- result.md vuoti;
- log intermedi;
- audit non recepiti;
- output di Claude non verificati;
- dettagli temporanei senza valore futuro.

---

## 10. Regole Checkpoint Manager

`CHECKPOINT.md` è fonte viva e va protetta.

La pipeline può solo proporre:

```text
CHECKPOINT PATCH PROPOSAL
```

Non deve aggiornare automaticamente il checkpoint.

Una patch checkpoint è ammessa solo se:

- cambia stato reale del progetto;
- descrive una milestone verificata;
- cita evidenze della run;
- è breve;
- non include rumore tecnico inutile;
- non sostituisce decisioni non approvate.

---

## 11. Regole di sicurezza

La pipeline non deve promuovere run che violano:

- `SECURITY_POLICY.md`;
- `CLAUDE.md`;
- `.claude/settings.json`;
- policy su env/secrets;
- policy su deploy;
- policy su database;
- policy su git push / force push;
- policy su cancellazioni irreversibili.

Azioni che richiedono approval forte:

```text
env/secrets
database
Supabase auth/storage
production deploy
git push
git force push
file delete massivi
script distruttivi
automazioni esterne
```

Una run che ha eseguito o proposto queste azioni senza approval non può essere `PASS`.

---

## 12. Formato `review.md`

```markdown
# Review — <run_id>

## Verdict
- quality_status: PASS | PARTIAL | FAIL | BLOCKED
- decision_class: evidence | decision_note | memory_candidate | checkpoint_patch | archive | ignore
- reviewer: ChatGPT / Eros / Claude-assisted
- date: YYYY-MM-DD

## Original task
<riassunto breve>

## Evidence checked
- result.md: yes/no
- diff: yes/no
- tests: yes/no
- run_log: yes/no
- git status: yes/no

## Scope review
- expected scope:
- actual scope:
- scope drift: yes/no

## Quality gates
- gates required:
- gates executed:
- result:

## Risk review
- security risk:
- data risk:
- git/deploy/db risk:
- residual risk:

## Reviewer notes
<osservazioni brevi>

## Recommendation
<prossima azione>
```

---

## 13. Formato `decision.md`

```markdown
# Decision — <run_id>

## Decision
<decisione operativa in 3-7 righe>

## Why
<perché questa decisione è corretta>

## Evidence
- <file/log/diff/test usato come evidenza>

## Classification
- decision_class:
- quality_status:
- promote_to_memory: yes/no
- checkpoint_patch_needed: yes/no
- archive: yes/no

## Next step
<una sola prossima mossa>
```

---

## 14. Formato `memory_candidate.md`

```markdown
# Memory Candidate — <run_id>

## Proposed memory
<testo breve, stabile, riusabile>

## Why it matters
<perché cambierà task futuri>

## Applies to
- project:
- workflows:
- files/areas:

## Evidence
- source run:
- result:
- tests/diff:

## Sensitivity
- shareable_with: chatgpt | claude | fable | none
- contains_client_data: yes/no
- contains_secrets: no

## Approval
- approved_by_eros: yes/no
- promoted: yes/no
```

---

## 15. Formato `checkpoint_patch.md`

```markdown
# CHECKPOINT PATCH PROPOSAL — <run_id>

## Target file
CHECKPOINT.md

## Patch type
append | replace section | no update

## Proposed text
<testo breve da aggiungere>

## Evidence
- run_id:
- result.md:
- diff/tests:

## Why checkpoint-worthy
<perché cambia lo stato ufficiale del progetto>

## Approval required
Yes — Eros must approve before applying.
```

---

## 16. Formato `archive_note.md`

```markdown
# Archive Note — <run_id>

## Reason
<perché la run viene archiviata o ignorata>

## Keep for traceability
yes/no

## Do not promote because
- <motivo 1>
- <motivo 2>

## Future relevance
none | low | medium | high
```

---

## 17. Workflow manuale-assistito

### Step 1 — Claude completa la run

Claude produce:

```text
result.md
report finale
diff/test se previsti
```

### Step 2 — Eros o ChatGPT avvia review

Input minimo:

```text
Leggi result.md e, se disponibili, run_log/diff/test.
Applica 09_REVIEW_DECISION_MEMORY_PIPELINE.md.
```

### Step 3 — La Factory classifica

Output:

```text
PASS/PARTIAL/FAIL/BLOCKED
+
evidence/decision_note/memory_candidate/checkpoint_patch/archive/ignore
```

### Step 4 — Si decide promozione

Possibili esiti:

```text
archive only
memory candidate
checkpoint patch proposal
follow-up task
manual approval required
```

### Step 5 — Solo dopo approval si aggiorna memoria/checkpoint

Nessuna promozione automatica.

---

## 18. Prompt MINI per review di una run

```text
Usa 09_REVIEW_DECISION_MEMORY_PIPELINE.md.
Leggi solo questa run: <RUN_PATH>.
Input prioritari: result.md, run_log.md, runner.json, claude_prompt.md, context.md. Se disponibili, controlla git diff --stat e output test riportati.
Produci: review.md, decision.md e solo se giustificato memory_candidate.md / checkpoint_patch.md / archive_note.md.
Non aggiornare CHECKPOINT.md. Non modificare memoria. Non fare commit. Classifica PASS/PARTIAL/FAIL/BLOCKED e decision_class.
```

---

## 19. Prompt STANDARD per review con diff

```text
Usa 09_REVIEW_DECISION_MEMORY_PIPELINE.md e CLAUDE.md.
Revisiona la run <RUN_PATH>.
Leggi: result.md, run_log.md, runner.json, claude_prompt.md, context.md. Poi verifica solo i file modificati dal diff.
Obiettivo: capire se la run è PASS/PARTIAL/FAIL/BLOCKED e se diventa evidence, decision_note, memory_candidate, checkpoint_patch, archive o ignore.
Output richiesto dentro la run: review.md, decision.md, e solo se necessario memory_candidate.md/checkpoint_patch.md/archive_note.md.
Non applicare patch. Non aggiornare CHECKPOINT.md. Non fare commit/push.
```

---

## 20. Prompt FULL solo per casi rischiosi

Usare solo se la run coinvolge:

- git push / force push;
- deploy;
- database;
- env/secrets;
- Supabase auth/storage;
- cancellazioni;
- refactor multi-file rischiosi.

```text
Usa CLAUDE.md, SECURITY_POLICY.md e 09_REVIEW_DECISION_MEMORY_PIPELINE.md.
Review read-only della run <RUN_PATH> con focus rischio.
Leggi result.md, run_log.md, runner.json, claude_prompt.md, context.md e solo i file coinvolti dal diff. Verifica se sono state toccate aree protette: env/secrets, db, deploy, git push, delete, auth/storage.
Produci review.md e decision.md. Se serve, proponi checkpoint_patch.md o memory_candidate.md, ma non applicare nulla.
Se trovi azioni irreversibili senza approval, classifica FAIL/BLOCKED e spiega remediation.
```

---

## 21. Applicazione ai progetti reali

### Walbox

Usare la pipeline per:

- bugfix reali;
- shuffle night;
- Spotify sync;
- TV Poster QA;
- Kitchen flow;
- checkpoint post-run;
- decisioni su product scope.

### Borgo Vivo

Usare la pipeline per:

- playtest kit;
- carte;
- questionari;
- decisioni di core loop;
- esclusione di sviluppo digitale prematuro.

### AI Factory

Usare la pipeline per:

- Runner;
- Context Builder;
- manifest;
- memory rules;
- source governance;
- quality gates.

---

## 22. Metriche per Reality Sprint

Ogni review dovrebbe aggiornare o leggere queste metriche:

```text
project:
task:
run_id:
time_raw_to_ticket:
time_ticket_to_claude_prompt:
time_to_result:
manual_copy_paste_count:
errors_avoided:
scope_drift_seen:
quality_gates_run:
checkpoint_patch_needed:
value_verdict: useful | neutral | annoying
```

Queste metriche servono a decidere dopo 10-20 run cosa automatizzare davvero.

---

## 23. Cosa NON automatizzare ancora

Non automatizzare ora:

- promozione automatica in memoria;
- aggiornamento automatico checkpoint;
- review LLM-to-LLM senza controllo;
- auto-commit;
- auto-push;
- ingest massivo di result.md;
- classificazione cieca di tutti i ticket Runner.

Prima servono 10-20 run reali validate.

---

## 24. Definition of Done

Questa pipeline è pronta quando:

- ogni run reale produce almeno `review.md` e `decision.md`;
- le run inutili vengono archiviate senza entrare in memoria;
- le run importanti generano `memory_candidate.md` o `checkpoint_patch.md`;
- Eros approva manualmente le promozioni;
- dopo 10-20 run sappiamo quali passaggi sono ripetitivi;
- la Factory riduce confusione invece di aumentarla.

---

## 25. Decisione finale

La V0.2 non deve costruire subito un altro motore.

Deve rendere affidabile il ciclo:

```text
result.md
→ review
→ decision
→ memory candidate
→ checkpoint patch
→ approval
```

Questa è la differenza tra:

```text
Claude che produce output
```

e

```text
AI Factory che governa il lavoro.
```
