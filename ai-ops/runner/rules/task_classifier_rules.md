# Task Classifier Rules — ai-factory-runner V1.2

> Documentazione umana delle regole di classificazione implementate in `../run.js`.
> **Fonte eseguibile: `run.js`** (costanti `CATEGORY_RULES`, `HIGH_RISK_KEYWORDS`,
> `ALWAYS_HIGH_KEYWORDS`, `WRITE_VERBS`, `RISK_BY_CATEGORY`, funzione `detectDocRole`).
> Se modifichi le keyword in un posto, aggiorna anche l'altro — la sincronizzazione resta manuale.

## Come funziona il match

- Il task raw viene normalizzato: minuscole, accenti rimossi.
- Keyword singole: match per **parola intera** ("ui" non matcha "guida").
- Keyword con spazi (es. "analizza mercato"): match per **frase contenuta**.
- Un task può ricevere **più categorie**.
- Zero categorie riconosciute → `unclassified`, rischio minimo `medium`, executor `manual approval required`.

## Categorie e keyword

| Categoria | Keyword (IT/EN) |
|---|---|
| research | studia, ricerca, ricerche, benchmark, analizza mercato, analisi mercato, competitor, research, esplora, indaga |
| product | roadmap, priorità, priorita, monetizzazione, prodotto, strategia, sprint, backlog, vision, pricing, shuffle night, checklist, pilota |
| coding-plan | piano, plan, prepara piano, micro-task, spec |
| checkpoint | checkpoint |
| coding | fix, fixa, bug, implementa, codice, refactor, hook, componente, feature, funzione, errore, crash, code |
| qa | verifica, verificare, test, testa, qa, stabile, controlla, collauda, e2e, regressione, smoke, sync, stress, shuffle night, checklist, pilota |
| design | visual, layout, ui, poster, design, grafica, stile, css, estetica, tv, schermo, mobile |
| tv | tv, poster, tv-poster, live tv, schermo |
| spotify | spotify |
| supabase | supabase |
| docs | readme, documenta, documentazione, fonte, fonti, markdown, doc, docs, changelog, appunti |
| deploy | deploy, vercel, produzione, hosting, release, pubblica, rilascio |
| security | security, sicurezza, secrets, secret, env, policy, permissions, permessi, rls, abuso, hardening, spam |

`tv`/`spotify`/`supabase` sono nuove categorie V1.2: prima esistevano solo come
keyword protette (`HIGH_RISK_KEYWORDS`, sempre attive) o dentro `design`
(`tv`). Un task può avere più categorie contemporaneamente (es. `design` +
`tv`): non è un conflitto. L'executor per queste 3 categorie non è ancora
definito (`recommendExecutor` resta invariato) — arriva con V1.2-B.

## Ruolo dei riferimenti a documenti (`detectDocRole`, V1.2)

Se il task menziona un percorso `docs/` o un file `.md`, la funzione guarda le
parole che lo precedono per capire se il file è materiale di partenza o
l'oggetto da scrivere:

| Trigger prima del path | Ruolo | Effetto |
|---|---|---|
| basato su, leggendo, da, secondo, usando | `docs-as-source` | non assegna la categoria `docs` (il file è input, non output) |
| aggiorna, scrivi, crea, documenta, modifica | `docs-as-target` | nessun effetto sulla categoria (il file resta l'oggetto della modifica) |

Se compaiono trigger di entrambi i tipi prima del path, vince il trigger più
vicino al path (l'ultimo incontrato leggendo da sinistra a destra). Se nessun
trigger è presente, `detectDocRole` ritorna `null` e non ha effetto.

## Risk level

Rischio base per categoria (vince il più alto tra le categorie assegnate):

| Categoria | Rischio base |
|---|---|
| research, product, design, docs, coding-plan, checkpoint, tv, spotify, supabase | low |
| coding, qa | medium |
| deploy, security | high |

**Escalation su keyword di aree protette** (CLAUDE.md §5), a prescindere dalla categoria:

```
supabase, spotify, auth, login, routing, route, env, database, db,
token, secret, secrets, deploy, vercel, produzione, package.json,
migrazione, rls
```

V1.2 introduce un'**escalation condizionale** (in precedenza sempre `high`):

- Se la keyword protetta è tra `deploy, vercel, produzione, package.json, migrazione`
  (`ALWAYS_HIGH_KEYWORDS`) → resta sempre `high`, nessuna eccezione.
- Altrimenti, se il task contiene anche un verbo di scrittura
  (`WRITE_VERBS`: aggiorna, scrivi, crea, modifica, cambia, elimina, cancella,
  installa, sovrascrivi, sposta, rinomina, implementa, fix, fixa, aggiungi,
  rimuovi) → `high`.
- Altrimenti (sola lettura/verifica, es. "verifica Supabase realtime") →
  il rischio sale solo a `medium` (mai declassato sotto un rischio di
  categoria già più alto), con un motivo esplicito in `RISK_REASONS` che
  segnala l'assenza del verbo di scrittura. Questo è uno dei segnali che
  alimentano `warnings[]` solo indirettamente (il motivo resta in
  `RISK_REASONS`, non in `Warnings` — vedi sezione dedicata sotto).

## Executor consigliato (precedenza dall'alto, `recommendExecutor` in `run.js`)

1. rischio `high` **o** categoria `deploy` → **manual approval required** (nessun esecutore automatico, SECURITY_POLICY.md regole 3-6)
2. esattamente **un** agente citato esplicitamente nel task (`EXPLICIT_AGENTS`: `walbox-dev`, `walbox-qa-serata`, `walbox-hardening`, `walbox-product-owner`) → **quell'agente**, a meno che il punto 1 non l'abbia già deciso
3. `security` → **walbox-hardening**
4. `qa` → **walbox-qa-serata** — **vince su `coding`/`coding-plan`/`design` se presenti insieme** (l'ordine dei controlli in `recommendExecutor` valuta `qa` prima; un task con categorie `coding, qa` va comunque a walbox-qa-serata, non a walbox-dev)
5. `coding` o `coding-plan` o `design` (e nessuna `qa`) → **walbox-dev**
6. `checkpoint` **o** doc role `docs-as-target` → **docs/checkpoint operator** (patch suggerita, mai scrittura diretta su CHECKPOINT.md — SECURITY_POLICY.md regola 8)
7. `research` / `product` / `docs` (nessuna delle categorie sopra) → **ChatGPT research/product/review**
8. nessuna categoria riconosciuta (`unclassified`) → **manual approval required**, triage umano

Il routing dettagliato agenti/subagenti **non è duplicato qui**: fonte unica CLAUDE.md §2.
La lista `EXPLICIT_AGENTS` in `run.js` va tenuta manualmente in sync con quella di CLAUDE.md §2: un subagente nuovo non presente lì non attiva mai l'override, anche se il suo nome compare nel task raw.

## Confidence e Warnings (V1.2-B, `computeConfidence`/`buildWarnings` in `run.js`)

Ogni run calcola due campi aggiuntivi, riportati nel ticket sezione 2:

- **Confidence** (`high` / `medium` / `low`), deterministica:
  - 0 categorie riconosciute → `low`
  - esattamente 1 categoria → `high`
  - 2 o più categorie → `medium`
  - se `warnings[]` non è vuoto, la confidence non può superare `medium` anche se il calcolo sopra darebbe `high` (un warning declassa sempre, mai il contrario).
- **Warnings** (array, vuoto di default — nel ticket compare solo se non vuoto), popolato quando:
  1. **segnali misti**: più di una categoria è stata assegnata allo stesso task;
  2. **docs-as-source**: il riferimento a doc rilevato da `detectDocRole` è materiale di partenza, non l'oggetto della modifica;
  3. **agente esplicito ignorato**: nel task è citato esattamente un agente (`EXPLICIT_AGENTS`) ma l'executor calcolato è diverso (tipicamente perché il rischio è `high`/`deploy` e il punto 1 della cascata ha vinto);
  4. **dominio senza azione**: è presente una categoria di dominio protetto (`tv`, `spotify`, `supabase`) ma nessuna categoria di azione (`coding`, `coding-plan`, `qa`, `security`, `deploy`) — il task nomina un'area sensibile senza dire cosa farci.

## Dry-run mode

**Non implementato.** `run.js` non ha nessun flag `--dry-run` (verificato via grep su `run.js`/README/questo file): ogni esecuzione scrive sempre un ticket in `ai-ops/tickets/`. È stato richiesto da Eros dopo i test di V1.2-A per evitare di dover cancellare manualmente i ticket dei golden case, ma resta fuori scope per ogni fase V1.2-A→E già approvata (tutte limitavano le modifiche a file che non includono questa feature in `run.js`). Se Eros vuole aggiungerlo, serve un ticket dedicato che tocchi `run.js` (fuori scope per questo fix documentale, che modifica solo `rules/task_classifier_rules.md`).

## Golden set regressione (V1.2-C)

5 task di riferimento eseguiti manualmente il 2026-07-05 con `node ai-ops/runner/run.js "<task>"` dopo V1.2-A/B, per verificare che l'hardening non abbia rotto i casi noti. Tutti PASS.

| Caso | Task raw | Categorie | Risk | Executor | Confidence | Note |
|---|---|---|---|---|---|---|
| A | Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md | product, coding-plan, qa | medium | walbox-dev | medium (2 warning) | doc role docs-as-source; fix del bug V1.1 (prima classificato solo `docs`) |
| B | Fix TV Poster preview | coding, design, tv | medium | walbox-dev | medium (1 warning) | categorie multiple attese (design+tv si sovrappongono di proposito) |
| C | Aggiorna CHECKPOINT dopo S1 | checkpoint | low | docs/checkpoint operator | high (0 warning) | categoria singola, nessuna ambiguità |
| D | Verifica Supabase realtime con 2 client | qa, supabase | medium | walbox-qa-serata | medium (1 warning) | escalation condizionale V1.2-A: sola lettura → medium, non high |
| E | Studia benchmark social jukebox | research | low | ChatGPT research/product/review | high (0 warning) | invariato rispetto al V1.1 |

Se un futuro run su questi 5 task raw produce un output diverso, è una regressione: fermarsi e riportare, non correggere inline il classificatore senza revisione.

## Limiti noti del V1

- Classificazione puramente lessicale: nessuna comprensione del contesto ("non toccare Spotify" matcha comunque `spotify` → high). Falsi positivi accettati per prudenza: meglio sovrastimare il rischio.
- Keyword generiche come `sync`, `tv`, `test` possono aggiungere categorie in eccesso — Eros corregge in sezione 2 del ticket prima del Gate 1.
- La sync tra questo file e `run.js` è manuale.
