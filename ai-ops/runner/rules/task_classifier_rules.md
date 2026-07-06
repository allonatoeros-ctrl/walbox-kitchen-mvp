# Task Classifier Rules — ai-factory-runner V1.3 (+ template V1.4)

> Documentazione umana delle regole di classificazione implementate in `../run.js`.
> **Fonte eseguibile: `run.js`** (costanti `CATEGORY_RULES`, `HIGH_RISK_KEYWORDS`,
> `ALWAYS_HIGH_KEYWORDS`, `WRITE_VERBS`, `RISK_BY_CATEGORY`, funzione `detectDocRole`;
> V1.3: `SKILL_DIFF_TRIGGERS`, `SKILL_CONTEXT_TRIGGERS`, `SKILL_APPROVAL_TRIGGERS`,
> `MICRO_FIX_TRIGGERS`, `MICRO_FIX_EXCLUDERS`, funzione `recommendSkillAndMode`;
> V1.4: `resolvePromptTemplate` — sceglie il template del prompt in base a
> `prompt_mode`, non cambia nessuna delle costanti di classificazione sopra).
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
| coding-plan | piano, plan, prepara piano, micro-task, spec, progetta, prossimo step |
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

## Negazione mirata sulla keyword "codice" (`isNegatedCodice`, V1.4.1-B)

La keyword `codice` (categoria `coding`) viene ignorata se **ogni** sua
occorrenza nel task è preceduta a breve distanza (~30 caratteri) da una di
queste frasi di negazione: `senza toccare`, `senza modificare`,
`senza cambiare`, `non toccare`, `non modificare`. Esempio: "Aggiorna
CHECKPOINT.md dopo il push V1.4, senza toccare codice." non assegna più
`coding` (Caso O).

Questo è **scoped al minimo indispensabile**, non un meccanismo generale di
negazione:
- vale solo per la keyword `codice` della categoria `coding`, nessun'altra
  keyword o categoria è interessata;
- **non tocca `HIGH_RISK_KEYWORDS`/`assessRisk`**: "non toccare Spotify" deve
  continuare a segnalare rischio/area protetta a prescindere dalla negazione
  — è una scelta di sicurezza deliberata (meglio sovrastimare il rischio),
  non un bug da correggere insieme a questo.
- se compare anche una sola occorrenza di "codice" non preceduta da una di
  queste frasi, la keyword conta normalmente (nessun rischio di sopprimere
  un match legittimo in un task con più menzioni miste).

## Dominio QA: tooling interno vs app (`detectQaDomain`, V1.4.1-C)

Fino a V1.4.1-B, qualunque task con categoria `qa` finiva sempre su
`walbox-qa-serata` — un subagente pensato per il collaudo runtime della app
Walbox/Jukebox (QR cliente → staff → TV/Spotify), non per validare un tool
Node/CLI interno come `ai-ops/runner`. Esempio reale che ha motivato il fix:
"Verifica se V1.4 è pronta per push su origin/main." otteneva correttamente
`review_prompt`, ma un executor non adatto (Caso P).

`detectQaDomain(rawTask, categories)` guarda due liste di keyword (stesso
match di `matchesKeyword`: parola intera per singole, frase contenuta per
keyword con spazi) più le categorie già assegnate, e ritorna `'tooling'` /
`'app'` / `'mixed'` / `null`:

| Costante | Keyword |
|---|---|
| `TOOLING_QA_KEYWORDS` | runner, ai-ops, ai-factory-runner, ai-factory, classificatore, golden set, run.js, task_classifier, ticket, origin/main, push, branch, repo, commit |
| `APP_QA_KEYWORDS` | jukebox, cliente, customer, staff, pub, locale, tavolo, richiesta, dedica, nickname, coda, queue |
| `APP_QA_CATEGORIES` | tv, spotify, supabase, design (se già assegnate dal classificatore, contano come segnale app) |

Logica (`isApp = hasAppCategory || hasAppKeyword`):

- keyword tooling presente **e nessun** segnale app → `'tooling'`
- segnale app **e** keyword tooling presenti insieme → `'mixed'`
- solo segnale app → `'app'`
- nessuno dei due → `null`

`qaDomain` viene calcolato in `main()` (non dentro `recommendExecutor`) subito
dopo `detectExplicitAgents`, e passato sia a `recommendExecutor` che a
`buildWarnings`.

Effetto sull'executor (solo dentro il ramo `qa` di `recommendExecutor`,
vedi cascata executor sotto):

- `qaDomain === 'tooling'` → executor diventa
  `Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)`
  (nessun subagente in CLAUDE.md §2 è pensato per QA di tooling interno).
- `'app'`, `'mixed'` o `null` → **invariato**, resta `walbox-qa-serata`
  (default prudente: si cambia executor solo quando il segnale tooling è
  netto e non ambiguo).
- `qaDomain === 'mixed'` aggiunge in più un warning: "dominio qa misto
  app+tooling: verificare a mano l'executor nel ticket" (`buildWarnings`).

Puramente additivo: non tocca `CATEGORY_RULES`, `assessRisk`,
`HIGH_RISK_KEYWORDS`, `EXPLICIT_AGENTS` né `recommendSkillAndMode` — skill e
prompt_mode restano identici a prima del fix (verificato: Caso P ottiene
`quality-gate-verifier` + `review_prompt`, invariati rispetto a un ipotetico
run pre-V1.4.1-C).

Limite noto: euristica **keyword-based**, non comprende il contesto. Un task
QA sull'app che nomina per caso solo parole come "branch"/"commit"/"push"
senza nessuna delle `APP_QA_KEYWORDS` (né categorie tv/spotify/supabase/
design) risulterebbe classificato come dominio `tooling` anche se in realtà
riguarda la app — Eros deve validare l'executor nel ticket prima del Gate 1,
come per gli altri limiti già noti del classificatore.

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
4. `coding` o `coding-plan` o `design` → **walbox-dev** — **vince su `qa` se presenti insieme** (V1.2-F: l'ordine dei controlli in `recommendExecutor` valuta coding/coding-plan/design prima di qa; un task con categorie `coding, qa` va a walbox-dev, non a walbox-qa-serata. Prima di V1.2-F valeva il contrario — vedi Caso F nel golden set)
5. `qa` (e nessuna delle categorie sopra) → **walbox-qa-serata**, tranne quando
   `detectQaDomain` ritorna `'tooling'` (dominio ai-ops/runner interno, nessun
   segnale app): in quel caso l'executor è
   `Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)`
   — vedi sezione dedicata "Dominio QA: tooling interno vs app" sopra (V1.4.1-C)
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

## Recommended skill e prompt mode (V1.3, `recommendSkillAndMode` in `run.js`)

Dal V1.3 ogni run calcola due campi aggiuntivi, riportati nel ticket sezione 2
e a console: **Recommended skill** e **Prompt mode**, con motivazione
(`Skill/mode reason`). Questi campi sono **puramente additivi**: non influenzano
categorie, rischio, executor, confidence o warnings — la classificazione V1.2
resta identica (verificato sul golden set A–F, zero regressioni).

Valori possibili:

- `recommended_skill`: `/phase-plan`, `quality-gate-verifier`, `diff-risk-reviewer`,
  `context-health-reset`, `none`
- `prompt_mode`: `handoff_prompt`, `approval_prompt`, `phase_plan_prompt`,
  `micro_fix_prompt`, `checkpoint_prompt`, `review_prompt`

### Trigger lessicali (stesso match delle altre keyword: parola intera, frasi contenute, accenti normalizzati)

| Costante | Trigger |
|---|---|
| `SKILL_DIFF_TRIGGERS` | diff, review diff, rivedi diff, diff risk, rischi prima del commit, pre-commit, prima del commit, valuta rischi, git diff |
| `SKILL_CONTEXT_TRIGGERS` | clear conversation, nuova chat, ripartiamo puliti, contesto sporco, fonti stale, fonti non aggiornate, handoff, riallinea contesto, context reset |
| `SKILL_APPROVAL_TRIGGERS` | approvato, già approvato, piano approvato, procedi con il piano, procedi con, vai con, continua da, implementa il piano, fase già approvata |
| `MICRO_FIX_TRIGGERS` | typo, testo, label, titolo, copy, micro-fix, piccolo fix, fix piccolo, classe css, spacing, margin, padding, colore |
| `MICRO_FIX_EXCLUDERS` | refactor, feature, implementa, piano, più file, multipli file |

### Cascata (precedenza dall'alto — la prima regola che matcha vince)

| # | Condizione | recommended_skill | prompt_mode |
|---|---|---|---|
| 1 | trigger `SKILL_DIFF_TRIGGERS` | diff-risk-reviewer | review_prompt |
| 2 | trigger `SKILL_CONTEXT_TRIGGERS` | context-health-reset | handoff_prompt |
| 3 | trigger `SKILL_APPROVAL_TRIGGERS` | none | approval_prompt |
| 4 | rischio `high` **o** categoria `deploy` | none | approval_prompt |
| 5 | `qa` o `security`, **senza `coding` e senza `coding-plan`** | quality-gate-verifier | review_prompt |
| 6 | `checkpoint` **o** doc role `docs-as-target` | none | checkpoint_prompt |
| 7 | trigger `MICRO_FIX_TRIGGERS` **e nessun** `MICRO_FIX_EXCLUDERS` | none | micro_fix_prompt |
| 8 | `coding-plan` **oppure** `coding` + (più categorie **o** confidence ≠ high) | /phase-plan | phase_plan_prompt |
| 9 | `coding` a categoria singola con confidence high | none | micro_fix_prompt |
| 10 | 0 categorie (`unclassified`) | context-health-reset | handoff_prompt |
| 11 | fallback (research/product/docs/design puri) | none | handoff_prompt |

### Assunzione approvata sulla regola 5 (Gate 2, 2026-07-05)

La regola 5 esclude **anche `coding-plan`**, non solo `coding`: un task di piano
che cita anche "verifica" (es. Caso A del golden set) deve andare a
`/phase-plan` + `phase_plan_prompt` (regola 8), non a `review_prompt`.
È la stessa logica della precedenza executor V1.2-F, dove
coding/coding-plan/design vincono su qa.

### Limite noto: trigger frasali rigidi

I trigger con spazi sono cercati come **frase contenuta letterale** (dopo
normalizzazione): l'ordine delle parole e le parole intermedie contano.
Esempio reale (Caso K del golden set): "le fonti **sono** stale" **non** matcha
il trigger `fonti stale` — il caso ha funzionato solo grazie al trigger
parallelo `handoff` presente nella stessa frase. Se la frase riformula il
concetto senza nessun trigger esatto, la regola non scatta: la cascata
prosegue e il campo va corretto a mano da Eros nel ticket, come per le
categorie. Nessun tentativo di fuzzy matching: coerente con il resto del
classificatore V1, prevedibile e deterministico.

### Golden set V1.3 — skill/mode attesi (rieseguiti in `--dry-run` il 2026-07-05)

Casi A–F: campi V1.2 (categorie/risk/executor/confidence) **invariati**, vedi
la tabella "Golden set regressione" più sotto. Skill/mode attesi per tutti i 16 casi:

| Caso | Task raw | recommended_skill | prompt_mode | prompt_template (V1.4) | Regola |
|---|---|---|---|---|---|
| A | Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md | /phase-plan | phase_plan_prompt | phase_plan | 8 |
| B | Fix TV Poster preview | /phase-plan | phase_plan_prompt | phase_plan | 8 |
| C | Aggiorna CHECKPOINT dopo S1 | none | checkpoint_prompt | checkpoint | 6 |
| D | Verifica Supabase realtime con 2 client | quality-gate-verifier | review_prompt | review | 5 |
| E | Studia benchmark social jukebox | none | handoff_prompt | handoff | 11 |
| F | Fix e verifica TV Poster preview bloccata dopo cambio traccia | /phase-plan | phase_plan_prompt | phase_plan | 8 |
| G | Prepara piano refactor coda staff su più file | /phase-plan | phase_plan_prompt | phase_plan | 8 |
| H | Fixa il typo nel titolo della TV Poster | none | micro_fix_prompt | micro_fix | 7 (trigger typo/titolo vince sul multi-categoria) |
| I | Verifica regressione smoke E2E senza modificare file | quality-gate-verifier | review_prompt | review | 5 |
| J | Rivedi il diff V1.3 e valuta rischi prima del commit | diff-risk-reviewer | review_prompt | review | 1 (categorie `unclassified`: skill corretta ma serve comunque triage umano) |
| K | Ripartiamo puliti da handoff perché le fonti sono stale | context-health-reset | handoff_prompt | handoff | 2 (matcha solo `handoff`, non `fonti stale` — vedi limite trigger frasali) |
| L | Procedi con il piano V1.3-B già approvato | none | approval_prompt | approval | 3 (vince su coding-plan/regola 8) |
| M | xyzabc task senza senso | context-health-reset | handoff_prompt | handoff | 10 |
| N | Progetta il prossimo step per migliorare il Runner dopo V1.4, senza implementare. | /phase-plan | phase_plan_prompt | phase_plan | 8 (V1.4.1-A: `coding-plan` riconosce ora "progetta"/"prossimo step") |
| O | Aggiorna CHECKPOINT.md dopo il push V1.4, senza toccare codice. | none | checkpoint_prompt | checkpoint | 6 (V1.4.1-B: "senza toccare codice" non assegna più `coding` — vedi `isNegatedCodice` in `run.js`) |
| P | Verifica se V1.4 è pronta per push su origin/main. | quality-gate-verifier | review_prompt | review | 5 (V1.4.1-C: skill/mode invariati — cambia solo l'**executor**, da `walbox-qa-serata` a `Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)`, perché `detectQaDomain` rileva dominio `tooling` puro via keyword `push`/`origin/main`, nessun segnale app) |

Se un futuro run su questi 16 task raw produce skill/mode diversi (o campi
V1.2 diversi sui casi A–F), è una regressione: fermarsi e riportare, non
correggere inline il classificatore senza revisione. Il campo `prompt_template`
(colonna aggiunta in V1.4-C3, puramente documentale) non fa parte della
classificazione: è solo l'esito di `resolvePromptTemplate(promptMode)` — se
uno dei 6 template in `templates/prompts/` venisse rimosso, quella riga
tornerebbe a `base (fallback)` senza che sia una regressione del classificatore.

## Template dei prompt Claude per prompt_mode (V1.4, `resolvePromptTemplate` in `run.js`)

Dal V1.4 il prompt Claude embeddato nel ticket (sezione 9) non è più sempre lo
stesso file: `resolvePromptTemplate(promptMode)` cerca
`templates/prompts/claude_prompt_<mode>.md` (dove `<mode>` è `prompt_mode`
senza il suffisso `_prompt`); se il file esiste lo usa, altrimenti fallback
totale a `templates/claude_prompt_template.md`. Tutti e 6 i modi hanno oggi un
template dedicato — nessun fallback residuo nel golden set A–M.

| prompt_mode | Template | Quando si usa |
|---|---|---|
| `micro_fix_prompt` | `claude_prompt_micro_fix.md` | fix diretto e localizzato: 1-2 file chiari, niente refactor/redesign, si ferma se lo scope si allarga |
| `phase_plan_prompt` | `claude_prompt_phase_plan.md` | solo piano/audit read-only, nessuna modifica; usa `/phase-plan` se disponibile, propone micro-fasi A/B/C |
| `review_prompt` | `claude_prompt_review.md` | QA/diff-risk/audit read-only: usa `diff-risk-reviewer` o `quality-gate-verifier`, chiude con verdetto accept/needs changes/split into next phase |
| `checkpoint_prompt` | `claude_prompt_checkpoint.md` | aggiornamento documentale (tipicamente CHECKPOINT.md): scrive solo se lo scope lo autorizza esplicitamente, altrimenti solo patch suggerita |
| `approval_prompt` | `claude_prompt_approval.md` | corto: un piano/audit è già stato prodotto nella sessione corrente, il task è il delta/via libera da applicare — si ferma se il piano non è in contesto |
| `handoff_prompt` | `claude_prompt_handoff.md` | lungo: nuova sessione o contesto non affidabile, ricostruisce lo stato da CHECKPOINT.md/CLAUDE.md prima di proporre qualsiasi azione |

Nota operativa: il Runner **non esegue Claude**. Genera solo il ticket con il
prompt già pronto (sezione 9) — copiare/incollare in Claude Code resta un
passo manuale del workflow umano (`ai-ops/README.md`, Gate 1/Gate 2).

## Dry-run mode

**Implementato in V1.2-F.** Flag `--dry-run` (in qualsiasi posizione tra gli argomenti):
`run.js` esegue l'intera classificazione/routing come sempre, ma **non crea la
cartella `ai-ops/tickets/` né scrive alcun file** — stampa solo il riepilogo a
console (task, categorie, rischio, executor, confidence, warnings, doc role).
Il flag viene rimosso dagli argomenti prima di ricostruire `rawTask`, quindi
non entra nel testo classificato né nello slug. Uso:

```bash
node ai-ops/runner/run.js "Verifica TV Poster sync" --dry-run
```

Richiesto da Eros dopo i test di V1.2-A per validare il classificatore
(inclusi i golden case) senza dover cancellare manualmente i ticket generati.

## Golden set regressione (V1.2-C, esteso in V1.2-F; skill/mode V1.3 nella sezione dedicata sopra)

6 task di riferimento, tutti rieseguiti in `--dry-run` il 2026-07-05 dopo il
fix di precedenza executor V1.2-F (coding/coding-plan/design vince su qa) e
di nuovo dopo V1.3-A (recommendSkillAndMode): tutti PASS, nessuna regressione
sui campi di questa tabella. I casi G–M e i valori attesi di
recommended_skill/prompt_mode per tutti i 13 casi sono nella sezione
"Golden set V1.3" sopra.

| Caso | Task raw | Categorie | Risk | Executor | Confidence | Note |
|---|---|---|---|---|---|---|
| A | Prepara piano walbox-dev basato su docs/PILOT_NIGHT_CHECKLIST.md | product, coding-plan, qa | medium | walbox-dev | medium (2 warning) | doc role docs-as-source; invariato: già vinceva walbox-dev per agente esplicito citato nel testo |
| B | Fix TV Poster preview | coding, design, tv | medium | walbox-dev | medium (1 warning) | categorie multiple attese (design+tv si sovrappongono di proposito) |
| C | Aggiorna CHECKPOINT dopo S1 | checkpoint | low | docs/checkpoint operator | high (0 warning) | categoria singola, nessuna ambiguità |
| D | Verifica Supabase realtime con 2 client | qa, supabase | medium | walbox-qa-serata | medium (1 warning) | escalation condizionale V1.2-A: sola lettura → medium, non high; nessuna categoria coding presente → qa vince correttamente |
| E | Studia benchmark social jukebox | research | low | ChatGPT research/product/review | high (0 warning) | invariato rispetto al V1.1 |
| F | Fix e verifica TV Poster preview bloccata dopo cambio traccia | coding, qa, design, tv | medium | walbox-dev | medium (1 warning) | **caso di regressione mirato per V1.2-F**: coding+qa senza agente esplicito — prima del fix vinceva walbox-qa-serata, ora vince walbox-dev |

Se un futuro run su questi 6 task raw produce un output diverso, è una regressione: fermarsi e riportare, non correggere inline il classificatore senza revisione.

## Limiti noti del V1

- Classificazione puramente lessicale: nessuna comprensione del contesto ("non toccare Spotify" matcha comunque `spotify` → high). Falsi positivi accettati per prudenza: meglio sovrastimare il rischio.
- Keyword generiche come `sync`, `tv`, `test` possono aggiungere categorie in eccesso — Eros corregge in sezione 2 del ticket prima del Gate 1.
- La sync tra questo file e `run.js` è manuale.
