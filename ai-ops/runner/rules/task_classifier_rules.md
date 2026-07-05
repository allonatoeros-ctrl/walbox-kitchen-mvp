# Task Classifier Rules — ai-factory-runner V1

> Documentazione umana delle regole di classificazione implementate in `../run.js`.
> **Fonte eseguibile: `run.js`** (costanti `CATEGORY_RULES`, `HIGH_RISK_KEYWORDS`, `RISK_BY_CATEGORY`).
> Se modifichi le keyword in un posto, aggiorna anche l'altro — nel V1 la sincronizzazione è manuale.

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
| product | roadmap, priorità, priorita, monetizzazione, prodotto, strategia, sprint, backlog, vision, pricing |
| coding | fix, fixa, bug, implementa, codice, refactor, hook, componente, feature, funzione, errore, crash, code |
| qa | verifica, verificare, test, testa, qa, stabile, controlla, collauda, e2e, regressione, smoke, sync, stress |
| design | visual, layout, ui, poster, design, grafica, stile, css, estetica, tv, schermo, mobile |
| docs | readme, documenta, documentazione, fonte, fonti, markdown, doc, docs, changelog, appunti |
| deploy | deploy, vercel, produzione, hosting, release, pubblica, rilascio |
| security | security, sicurezza, secrets, secret, env, policy, permissions, permessi, rls, abuso, hardening, spam |

## Risk level

Rischio base per categoria (vince il più alto tra le categorie assegnate):

| Categoria | Rischio base |
|---|---|
| research, product, design, docs | low |
| coding, qa | medium |
| deploy, security | high |

**Escalation a high** se il task contiene keyword di aree protette (CLAUDE.md §5), a prescindere dalla categoria:

```
supabase, spotify, auth, login, routing, route, env, database, db,
token, secret, secrets, deploy, vercel, produzione, package.json,
migrazione, rls
```

## Executor consigliato (precedenza dall'alto)

1. rischio `high` **o** categoria `deploy` → **manual approval required**
2. `security` → **Claude QA/hardening** (walbox-hardening)
3. `qa` → **Claude QA/hardening** (walbox-qa-serata)
4. `coding` o `design` → **Claude Code execution** (o Antigravity se visual-browser, CLAUDE.md §2)
5. `research` / `product` / `docs` → **ChatGPT research/product/review**
6. nessuna categoria → **manual approval required**

Il routing dettagliato agenti/subagenti **non è duplicato qui**: fonte unica CLAUDE.md §2.

## Limiti noti del V1

- Classificazione puramente lessicale: nessuna comprensione del contesto ("non toccare Spotify" matcha comunque `spotify` → high). Falsi positivi accettati per prudenza: meglio sovrastimare il rischio.
- Keyword generiche come `sync`, `tv`, `test` possono aggiungere categorie in eccesso — Eros corregge in sezione 2 del ticket prima del Gate 1.
- La sync tra questo file e `run.js` è manuale.
