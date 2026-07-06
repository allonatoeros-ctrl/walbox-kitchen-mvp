# ai-factory-runner V1.4 — Walbox AI Business Factory

Runner locale che trasforma un task raw in un **ticket/run log** dentro `ai-ops/tickets/`.
Zero dipendenze esterne, zero API, zero LLM: solo Node.js e keyword locali.

È la prima implementazione concreta del "router" descritto in [`../SECURITY_POLICY.md`](../SECURITY_POLICY.md)
(che finora era un riferimento preparatorio). Il runner **non esegue nulla**: genera solo
il ticket con classificazione, routing, scope, quality gate e prompt pronto. L'esecuzione
resta al workflow umano di `ai-ops/README.md` (Gate 1 / Gate 2 di Eros).

## Novità V1.1

Il runner ora legge **CHECKPOINT.md in modalità read-only** e include nel ticket
(sezione 3, "Project state snapshot from CHECKPOINT.md") un estratto sintetico di
STABLE / DONE / OPEN ISSUES / NEXT STEP, così ogni ticket porta con sé lo stato del
progetto al momento del run, senza dover aprire CHECKPOINT.md a parte.

- Il parsing è basato su heading Markdown `## ` con match sul nome della sezione
  (case-insensitive, `startsWith`): non è un parser Markdown completo.
- Ogni sezione è troncata a un massimo di 6 righe non vuote (con nota "righe omesse"
  se il contenuto è più lungo) — mai il contenuto integrale di CHECKPOINT.md.
- Se `CHECKPOINT.md` non esiste, il runner non crasha: scrive `CHECKPOINT.md not found`
  in ogni campo dello snapshot e continua a generare il ticket normalmente.
- Il runner non scrive mai su CHECKPOINT.md (SECURITY_POLICY.md regola 8): resta,
  come prima, solo patch suggerita nella sezione "Checkpoint decision" del ticket.

## Novità V1.2

- **Categorie nuove** in `CATEGORY_RULES`: `coding-plan` (piano, plan, prepara piano,
  micro-task, spec), `checkpoint`, `tv`, `spotify`, `supabase` — prima `spotify`/`supabase`
  esistevano solo come keyword protette (sempre `high`), non come categorie di
  classificazione. `product`/`qa` arricchite con "shuffle night", "checklist", "pilota".
- **Doc source vs target** (`detectDocRole`): se il task cita `docs/` o un file `.md`,
  il runner guarda le parole prima del riferimento per capire se è materiale di partenza
  ("basato su", "leggendo", "da", "secondo", "usando" → `docs-as-source`, non assegna la
  categoria `docs`) o l'oggetto da scrivere ("aggiorna", "scrivi", "crea", "documenta",
  "modifica" → `docs-as-target`).
- **Escalation condizionale** su keyword di area protetta (CLAUDE.md §5): prima sempre
  `high`; ora `high` solo se c'è anche un verbo di scrittura o la keyword è intrinsecamente
  un'azione (`deploy`, `vercel`, `produzione`, `package.json`, `migrazione`) — un task in
  sola lettura ("verifica Supabase realtime") scende a `medium` con motivo esplicito.
- **Override executor da nome agente esplicito**: se il task cita esattamente un nome tra
  `walbox-dev`, `walbox-qa-serata`, `walbox-hardening`, `walbox-product-owner`, quello vince
  sulla cascata — tranne quando il rischio è `high` o la categoria è `deploy`.
- **Nuova cascata executor** (in ordine): high/deploy → manual · agente esplicito → quello ·
  security → walbox-hardening · qa → walbox-qa-serata · coding/coding-plan/design → walbox-dev ·
  checkpoint o docs-as-target → docs/checkpoint operator · research/product/docs → ChatGPT.
- **Confidence + warnings** nel ticket (sezione 2): `Confidence` è `high`/`medium`/`low`
  deterministico; `Warnings` compare solo se presente (categorie multiple, docs-as-source,
  agente esplicito diverso dall'executor calcolato, dominio protetto senza categoria
  d'azione). Un warning forza sempre `Confidence` a un massimo di `medium`.
- **Golden set di regressione**: 6 task di riferimento (piano walbox-dev/docs-as-source,
  fix TV Poster, aggiorna CHECKPOINT, verifica Supabase read-only, benchmark, fix+verifica
  TV Poster) documentati con output atteso in `rules/task_classifier_rules.md` — da
  rieseguire (in `--dry-run`) dopo ogni modifica al classificatore per rilevare regressioni.

## Novità V1.2-F

- **`--dry-run` implementato**: nessuna scrittura in `ai-ops/tickets/`, solo riepilogo a
  console. Vedi sezione "Uso" sotto.
- **Precedenza executor corretta**: `coding` / `coding-plan` / `design` vincono su `qa`
  quando entrambe le categorie sono presenti nello stesso task (prima vinceva sempre `qa`,
  vedi `recommendExecutor` in `run.js` e Caso F del golden set in
  `rules/task_classifier_rules.md`). Resta invariato: high risk / deploy / agente esplicito
  continuano a vincere su tutto il resto.
- **Documentazione riallineata**: rimossa la nota "disallineamento noto" tra questo README
  e `rules/task_classifier_rules.md`, ormai obsoleta — i due file sono verificati allineati
  al 2026-07-05.

## Novità V1.3

- **Due campi nuovi nel ticket (sezione 2) e a console**: `Recommended skill` e
  `Prompt mode`, con motivazione (`Skill/mode reason`). Calcolati dalla nuova funzione
  pura `recommendSkillAndMode` in `run.js` con una **cascata a 11 regole a precedenza
  esplicita**: prima i trigger lessicali (diff/pre-commit → `diff-risk-reviewer` +
  `review_prompt`; context reset/handoff → `context-health-reset` + `handoff_prompt`;
  piano già approvato → `approval_prompt`), poi le condizioni su rischio, categorie,
  doc role e confidence (high/deploy → `approval_prompt`; qa/security puri →
  `quality-gate-verifier` + `review_prompt`; checkpoint/docs-target →
  `checkpoint_prompt`; micro-fix lessicale → `micro_fix_prompt`; coding-plan o coding
  multi-segnale → `/phase-plan` + `phase_plan_prompt`; coding singolo high-confidence →
  `micro_fix_prompt`; unclassified → `context-health-reset` + `handoff_prompt`;
  fallback → `handoff_prompt`). Tabella completa, trigger, assunzione approvata sulla
  regola 5 e limiti dei trigger frasali in `rules/task_classifier_rules.md`.
- **Puramente additivo**: categorie, rischio, executor, confidence e warnings V1.2
  restano identici — verificato sul golden set A–F, zero regressioni.
- **Golden set esteso a 13 casi** (A–M): i nuovi casi G–M coprono phase-plan,
  micro-fix, QA read-only, diff review, context reset, approval e unclassified —
  valori attesi in `rules/task_classifier_rules.md`.
- I due campi restavano **informativi**: fino a V1.3 il ticket non generava
  ancora prompt diversi per modo (il `claude_prompt_template.md` era usato
  sempre e solo lui) — risolto in V1.4, vedi sotto.

## Novità V1.4 — prompt differenziati per `prompt_mode`

- **Il prompt Claude ora dipende dal modo**: `resolvePromptTemplate(promptMode)`
  in `run.js` sceglie il template da usare per generare il prompt Claude
  (sezione 9 del ticket) invece di usare sempre lo stesso file.
- **Directory dei template per-modo**: `ai-ops/runner/templates/prompts/`.
  Convenzione di naming: `claude_prompt_<mode>.md`, dove `<mode>` è
  `prompt_mode` senza il suffisso `_prompt` (es. `micro_fix_prompt` →
  `claude_prompt_micro_fix.md`).
- **Fallback totale**: se il file specifico per un modo non esiste,
  `resolvePromptTemplate` ritorna `templates/claude_prompt_template.md`
  (lo stesso template usato da V1.1 a V1.3) — nessun crash, nessun
  comportamento diverso finché un template dedicato non viene creato.
- **Tutti e 6 i `prompt_mode` hanno oggi un template dedicato**, nessun
  fallback residuo sul golden set A–M:

  | prompt_mode | Template | Quando si usa |
  |---|---|---|
  | `micro_fix_prompt` | `claude_prompt_micro_fix.md` | fix diretto e localizzato, niente refactor/redesign/cleanup opportunistico |
  | `phase_plan_prompt` | `claude_prompt_phase_plan.md` | solo piano/audit read-only, nessuna modifica al codice in questo run |
  | `review_prompt` | `claude_prompt_review.md` | QA/diff-risk/audit read-only, verdetto accept / needs changes / split into next phase |
  | `checkpoint_prompt` | `claude_prompt_checkpoint.md` | aggiornamento documentale (tipicamente CHECKPOINT.md), scrittura diretta solo se lo scope la autorizza esplicitamente |
  | `approval_prompt` | `claude_prompt_approval.md` | corto: un piano è già stato discusso in sessione, il task è l'approvazione/delta da applicare |
  | `handoff_prompt` | `claude_prompt_handoff.md` | lungo: nuova sessione o contesto non affidabile, ricostruisce lo stato prima di agire |

- **Puramente additivo, come V1.3**: classificazione, rischio, executor,
  confidence, warnings, recommended_skill e prompt_mode restano identici —
  cambia solo *quale file* genera il testo del prompt nella sezione 9 del
  ticket. Verificato sul golden set A–M, 13/13 PASS, zero regressioni.
- **Il Runner resta un generatore di ticket, non un esecutore**: non chiama
  Claude, non installa niente, non fa API call. Copiare il prompt della
  sezione 9 in Claude Code resta un passo manuale del workflow umano
  (Gate 1 / Gate 2, vedi `ai-ops/README.md`).

## Novità V1.4.1-C — dominio QA: tooling interno vs app

- **Problema**: fino a V1.4.1-B, ogni task con categoria `qa` finiva sempre
  su `walbox-qa-serata` — pensato per il collaudo runtime della app
  Walbox/Jukebox (QR/staff/TV/Spotify), non per validare un tool Node/CLI
  interno come `ai-ops/runner` stesso. Esempio reale: "Verifica se V1.4 è
  pronta per push su origin/main." otteneva giustamente `review_prompt`, ma
  un executor non adatto.
- **Fix**: nuova funzione pura `detectQaDomain(rawTask, categories)` in
  `run.js`, calcolata in `main()` e passata a `recommendExecutor`/
  `buildWarnings`. Guarda due liste di keyword (`TOOLING_QA_KEYWORDS`,
  `APP_QA_KEYWORDS`) più le categorie già assegnate (`tv`/`spotify`/
  `supabase`/`design` contano come segnale app) per distinguere dominio
  `'tooling'` / `'app'` / `'mixed'` / nessun segnale (`null`).
- **Effetto**: solo quando il dominio è `'tooling'` puro (nessun segnale
  app), l'executor diventa
  `Claude Code (verifica manuale ai-ops/runner, nessun subagente dedicato)`
  invece di `walbox-qa-serata` — perché oggi non esiste un subagente
  dedicato alla QA del tooling interno in CLAUDE.md §2. In ogni altro caso
  (`'app'`, `'mixed'`, nessun segnale) l'executor resta invariato
  (`walbox-qa-serata`, default prudente). `'mixed'` aggiunge solo un
  warning ("dominio qa misto app+tooling: verificare a mano l'executor").
- **Puramente additivo**: non tocca `CATEGORY_RULES`, `assessRisk`,
  `HIGH_RISK_KEYWORDS`, `EXPLICIT_AGENTS` né `recommendSkillAndMode` —
  skill/prompt_mode restano identici. Nuovo Caso P nel golden set (vedi
  `rules/task_classifier_rules.md`), golden set A–O rieseguiti in
  `--dry-run`: 15/15 PASS, zero regressioni.
- **Limite noto**: euristica keyword-based, nessuna comprensione del
  contesto. Un task QA sull'app che nomina per caso parole come
  "push"/"branch"/"commit" senza nessuna `APP_QA_KEYWORDS` (né categorie
  tv/spotify/supabase/design) risulterebbe classificato come dominio
  `tooling` anche se in realtà riguarda la app — Eros deve validare
  l'executor nel ticket prima del Gate 1, come per gli altri limiti già
  noti (vedi "Limiti V1.4" sotto).

## Uso

```bash
node ai-ops/runner/run.js "Verifica TV Poster sync"
```

Output: un file `ai-ops/tickets/YYYY-MM-DD_<slug>.md` (con suffisso `-2`, `-3`… se esiste già)
e in console il path del ticket generato.

Con `--dry-run` (in qualsiasi posizione tra gli argomenti) il runner classifica e stampa
lo stesso riepilogo a console ma **non scrive nessun file** — utile per validare il
classificatore (es. sui golden case in `rules/task_classifier_rules.md`) senza dover
cancellare manualmente i ticket generati:

```bash
node ai-ops/runner/run.js "Verifica TV Poster sync" --dry-run
```

## Cosa genera il ticket

1. Task raw
2. Metadata: data, slug, categorie, rischio, executor consigliato, confidence, recommended skill + prompt mode con reason (V1.3), warnings (se presenti), doc role (se rilevato), requires approval
3. Project state snapshot da CHECKPOINT.md (STABLE/DONE/OPEN ISSUES/NEXT STEP, letto read-only — V1.1)
4. Fonti di stato da leggere (CHECKPOINT.md, CLAUDE.md, ai-ops/README.md, SECURITY_POLICY.md)
5. Routing decision (perché quel esecutore — dettaglio agenti: CLAUDE.md §2, non duplicato)
6. Scope consigliato (allowed / forbidden / out of scope)
7. Security reminders (richiami alle regole 1-10 di SECURITY_POLICY.md, non duplicata)
8. Quality gate coerente con le categorie
9. Prompt Claude Code pronto da copiare (il template usato dipende da `prompt_mode`, vedi V1.4 sopra)
10. Checkpoint decision (solo patch suggerita, mai update automatico)
11. Next step per Eros

## Struttura

```
runner/
├── README.md                          ← sei qui
├── run.js                             ← runner (Node, zero deps)
├── templates/
│   ├── ticket_template.md             ← struttura del ticket generato
│   ├── claude_prompt_template.md      ← prompt Claude Code, fallback base (V1.1-V1.3)
│   └── prompts/                       ← template per-modo (V1.4), uno per prompt_mode
│       ├── claude_prompt_micro_fix.md
│       ├── claude_prompt_phase_plan.md
│       ├── claude_prompt_review.md
│       ├── claude_prompt_checkpoint.md
│       ├── claude_prompt_approval.md
│       └── claude_prompt_handoff.md
└── rules/
    └── task_classifier_rules.md       ← documentazione keyword/rischio/routing/template
```

## Rapporto con il resto di ai-ops/

- `../templates/ticket.md` resta il template per la **pipeline manuale** (Research→…→Commit).
  Il ticket del runner è il **run log automatizzato** V1: formati diversi, stesso posto (`tickets/`).
- Routing agenti: fonte unica **CLAUDE.md §2** — qui solo referenziato.
- Regole di sicurezza: fonte unica **`../SECURITY_POLICY.md`** — qui solo richiamata.

## Limiti V1.4 (manuale per ora)

- La classificazione resta **rule-based su keyword locali**: nessun LLM, nessuna comprensione
  del contesto ("non toccare Spotify" matcha comunque `spotify`). Eros deve validare
  categorie/rischio/executor nel ticket prima del Gate 1.
  Lo snapshot da CHECKPOINT.md non influenza la classificazione/rischio: è solo contesto
  informativo aggiunto al ticket.
- Le keyword e le categorie sono **overfittate su Walbox** (nomi agente, gergo del progetto
  tipo "shuffle night"/"pilota"/"tv-poster"): il classificatore non generalizza ad altri
  progetti senza riscrivere `CATEGORY_RULES`/`EXPLICIT_AGENTS`.
- La lista `EXPLICIT_AGENTS` in `run.js` va tenuta manualmente in sync con gli agenti
  elencati in **CLAUDE.md §2**: un nuovo subagente non citato lì non viene mai riconosciuto
  come override, anche se il nome compare nel task.
- Confidence e warnings sono euristiche deterministiche su segnali noti (categorie multiple,
  doc role, agente esplicito, dominio senza azione): non coprono ogni caso ambiguo possibile,
  solo quelli osservati finora.
- Lo snapshot di CHECKPOINT.md è un'estrazione per heading (`## `), non un parser Markdown
  robusto: se una sezione viene rinominata o ristrutturata in modo molto diverso, il match
  `startsWith` sul titolo potrebbe non trovarla (il ticket riporterà "sezione non trovata").
- Nessuna esecuzione automatica del prompt: copia/incolla manuale, anche con template per-modo (V1.4).
- I 6 template per-modo sono testo statico da tenere manualmente coerente con
  `CLAUDE.md` §3/§5/§15 e con `ai-ops/SECURITY_POLICY.md`: se quelle regole
  cambiano, i template in `templates/prompts/` vanno rivisti a mano, uno per
  uno — nessuna generazione automatica dei template stessi.
- Sync manuale tra `run.js` e `rules/task_classifier_rules.md`: verificati allineati al
  2026-07-06 (V1.4-C3, inclusa la tabella `prompt_template` per i 13 golden case e il
  mapping dei 6 template) — va ri-verificato manualmente ad ogni futura modifica al
  classificatore o ai template.
