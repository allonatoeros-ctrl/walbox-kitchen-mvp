# 05_AGENT_ROLES_AND_SUBAGENTS.md

Versione: 1.0  
Data creazione: 2026-06-02  
Area: AI Business Factory / Agents  
Completezza stimata: 88%

## Scopo

Definire la struttura degli agenti della **AI Business Factory**:

- ruoli chiari;
- confini chiari;
- task adatti a ogni agente;
- cosa ogni agente può fare;
- cosa ogni agente NON deve fare;
- quando usare sub-agents;
- quando NON usarli;
- come evitare caos, conflitti e spreco token;
- come applicarli a Walbox e nuovi business.

Regola centrale:

> Un agente non deve fare tutto. Un agente deve avere un mestiere.

## Sintesi brutale

Non serve un’AI gigante che fa tutto.  
Serve una squadra di agenti piccoli, ognuno con un ruolo preciso.

Esempio:

- Strategist Agent: decide cosa costruire.
- Research Agent: cerca fonti, competitor, docs.
- Product Manager Agent: spezza idee in roadmap.
- Frontend Agent: modifica UI.
- Backend Agent: lavora su API/database.
- QA Agent: trova rischi.
- Sales Agent: crea pitch.
- Token Saver Agent: sceglie modello/modalità.
- Documentation Agent: crea checkpoint e manuali.
- Walbox Specialist Agent: protegge e migliora Walbox come social experience.

## Regola madre

```text
Un agente = un ruolo + un obiettivo + confini + output atteso.
```

## Quando usare un sub-agent

- task ricorrente;
- competenza specifica;
- contesto da isolare;
- output sintetico;
- permessi/tool diversi;
- ricerca/copy/QA parallela;
- chat principale da tenere pulita.

## Quando NON usarlo

- task troppo semplice;
- basta un prompt diretto;
- non sai cosa vuoi;
- più agenti modificherebbero stessi file;
- serve decisione umana;
- manca output chiaro.

Regola anti-caos:

> Più agenti possono pensare in parallelo. Un solo agente alla volta dovrebbe modificare codice critico.

## Team agentico base

```text
1. Strategist Agent
2. Research Agent
3. Product Manager Agent
4. Frontend Agent
5. Backend Agent
6. QA Agent
7. Sales/Pitch Agent
8. Token Saver Agent
9. Documentation Agent
10. Security/Permissions Agent
11. Client Context Agent
12. Walbox Specialist Agent
```

## Strategist Agent

Trasforma idee confuse in direzione chiara.

Output:
1. problema reale;
2. target;
3. valore;
4. MVP minimo;
5. cosa evitare ora;
6. rischi;
7. agente successivo;
8. prossimo step singolo.

Prompt:

```text
Agisci come Strategist Agent.

Input:
[idea]

Output:
1. Problema reale
2. Target
3. Valore
4. MVP minimo
5. Cosa evitare ora
6. Rischi
7. Agente successivo da usare
8. Prossimo step singolo
```

## Research Agent

Cerca fonti, competitor, documentazione, benchmark e best practice.

Output:
- fonti;
- ranking qualità;
- cosa dice ogni fonte;
- utilità;
- regola operativa;
- cosa ignorare;
- prossimi file.

## Product Manager Agent

Trasforma strategia in roadmap, task e priorità.

Output:
1. MVP;
2. Non-MVP;
3. task immediati;
4. ordine;
5. dipendenze;
6. rischi;
7. definition of done;
8. prompt per agente tecnico.

## Frontend Agent

Lavora su UI, React components, CSS, responsive, layout e polish visivo.

Può fare:
- JSX/CSS;
- layout;
- responsive;
- componenti;
- stile;
- microcopy;
- classi CSS;
- miglioramenti visuali.

Non deve fare:
- backend;
- Supabase;
- Spotify API;
- routing;
- auth;
- env variables;
- schema database;
- refactor globale;
- modificare App.jsx se non richiesto.

Prompt:

```text
Agisci come Frontend Agent.

Modifica solo:
[file]

Obiettivo:
[obiettivo UI]

Vincoli:
- non modificare logica dati;
- non modificare state/useEffect/API;
- non toccare backend;
- non aggiungere dipendenze;
- non fare refactor.

Output:
1. piano breve;
2. patch minima;
3. file modificati;
4. test UI;
5. rischi residui.
```

## Backend Agent

Lavora su API, database, servizi, Supabase, Spotify, serverless functions, auth e integrazioni.

Non deve fare redesign UI, copy commerciale, modifiche estetiche o cambiare schema senza piano.

## QA Agent

Trova bug, regressioni, rischi, casi limite e problemi di flusso.

Prompt:

```text
Agisci come QA Agent.
Modalità read-only.

Controlla questa modifica/piano rispetto a:
- scope;
- file toccati;
- rischi;
- regressioni;
- mobile;
- build;
- flusso utente;
- Supabase/Spotify se coinvolti;
- test manuali.

Output:
1. verdict;
2. rischi;
3. cosa testare;
4. cosa non accettare;
5. fix consigliati.
```

## Sales / Pitch Agent

Trasforma il prodotto in proposta vendibile.

Per Walbox:

```text
Non vendere React, Supabase o Spotify API.
Vendi social experience, contenuti, atmosfera, test controllato.
```

## Token Saver Agent

Decide modello, livello, contesto necessario e rischio token.

Regola:

```text
task piccolo → contesto piccolo → modello economico
task rischioso → read-only → modello forte → patch minima
```

## Documentation Agent

Crea e aggiorna file `.md`, README, checkpoint, changelog, project context.

## Security / Permissions Agent

Valuta rischio, dati, permessi, segreti, azioni distruttive.

Usalo per env, API keys, database, email, pagamenti, social publishing, dati clienti, automazioni.

## Client Context Agent

Personalizza una proposta per un locale/cliente reale.

Output:
1. CLIENT_CONTEXT.md;
2. problema probabile;
3. valore più forte;
4. demo da mostrare;
5. obiezioni probabili;
6. linguaggio da usare;
7. linguaggio da evitare;
8. messaggio WhatsApp;
9. proposta test;
10. prossimo step.

## Walbox Specialist Agent

Lavora su Walbox come caso pilota, social experience e prodotto replicabile.

Quando usarlo:
- modifiche Walbox;
- pitch Walbox;
- clone per altro locale;
- mood/reaction;
- Live TV;
- dashboard;
- demo;
- asset commerciali;
- roadmap.

Protegge:

```text
src/App.jsx
src/services/walboxDb.js
src/services/spotifyApi.js
api/search.js
vercel.json
package.json
Supabase schema
Spotify auth flow
ManagerDashboard.jsx
```

Output:
1. priorità;
2. cosa non fare;
3. task tecnico se serve;
4. task commerciale;
5. prompt per Antigravity/Claude;
6. pitch/follow-up;
7. checkpoint.

## Matrice: quale agente usare?

| Situazione | Agente |
|---|---|
| Ho un’idea nuova | Strategist Agent |
| Devo capire se vale business | Strategist + Research |
| Devo spezzare in task | Product Manager |
| Devo fare ricerca fonti | Research |
| Devo modificare UI | Frontend |
| Devo lavorare su API/database | Backend |
| Devo testare rischi | QA |
| Devo fare pitch | Sales/Pitch |
| Devo non sprecare token | Token Saver |
| Devo aggiornare file .md | Documentation |
| Devo valutare permessi | Security |
| Devo personalizzare per cliente | Client Context |
| Devo lavorare su Walbox | Walbox Specialist |

## Livelli di autonomia

### Livello 0 — Read-only

QA, research, planning, sicurezza, bug complesso prima di patch.

### Livello 1 — Patch minima

Micro UI, testo, componenti piccoli.

### Livello 2 — Multi-file controllato

Feature media, API service, routing piccolo, solo dopo piano approvato.

### Livello 3 — Autonomia alta

Solo con repo pulito, test, rollback chiaro, task definito, niente dati sensibili.

Regola:

> Per Walbox ora usare soprattutto Livello 0 e Livello 1. Livello 2 solo con piano. Livello 3 non ancora.

## Sistema minimo per partire

```text
1. Strategist Agent
2. Frontend Agent
3. QA Agent
4. Token Saver Agent
5. Documentation Agent
```

Per Walbox aggiungi:

```text
Walbox Specialist Agent
Sales/Pitch Agent
Client Context Agent
```
