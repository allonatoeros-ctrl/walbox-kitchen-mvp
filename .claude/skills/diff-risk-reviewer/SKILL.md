---
name: diff-risk-reviewer
description: Verifica il diff Git file-per-file prima di commit, push, deploy, merge o handoff finale, controllando scope approvato, file inattesi, secret, regressioni, config sensibili e rischi residui in modalità read-only.
---

# Diff Risk Reviewer

## 1. Quando usare questa skill

Usa questa skill dopo:

```text
skills/quality-gate-verifier/SKILL.md
```

e prima di:

```text
commit
push
deploy
merge
handoff finale
```

Questa skill si usa nella fase:

```text
Read → Plan → Approve → Act → Build → Test → Quality Gates → Diff Review → Commit
```

Scopo operativo:

```text
Controllare il diff Git file-per-file prima del commit e decidere se Eros può approvare il prossimo gate.
```

Regola madre:

```text
Claude non ha finito quando dice "done".
Claude ha finito solo quando build, test, quality gates e diff review sono stati verificati e Eros approva il passo successivo.
```

Questa skill non verifica di nuovo tutti i quality gate.  
Questa skill controlla il diff finale e cerca rischi prima che le modifiche entrino in Git, deploy, merge o handoff.

Usala quando:

- Claude Code ha finito uno slice approvato;
- la skill `quality-gate-verifier` ha prodotto un report;
- esiste un diff Git da controllare;
- Eros deve decidere se committare;
- il lavoro tocca file applicativi, frontend, backend, API, database, auth, config, env, deploy o documentazione operativa;
- vuoi controllare se Claude ha modificato file fuori scope;
- vuoi individuare secret o cambiamenti sensibili prima del commit.

---

## 2. Quando NON usarla

Non usare questa skill per:

- implementare modifiche;
- correggere bug;
- formattare file;
- creare file;
- cancellare file;
- fare stage;
- fare commit;
- fare push;
- fare deploy;
- eseguire migrazioni;
- installare dipendenze;
- modificare config;
- sostituire la skill `quality-gate-verifier`;
- analizzare un progetto prima dell'implementazione;
- fare code review teorica senza diff reale;
- approvare automaticamente commit, push, deploy o merge.

Non usarla se non c'è un diff da verificare.

Se `git status` non mostra modifiche, output:

```text
Esito: BLOCCATO
Motivo: nessun diff da revisionare.
Decisione per Eros: FERMA
```

Se il diff è già staged e i comandi consentiti non permettono di ispezionare pienamente il contenuto staged, output:

```text
Esito: BLOCCATO
Motivo: modifiche staged presenti, ma la review deve essere completabile prima dello stage.
Decisione per Eros: FERMA
```

---

## 3. Input richiesti

Prima di iniziare, raccogli questi input.

```text
1. Task originale richiesto da Eros
2. Scope approvato da Eros
3. Piano approvato, se presente
4. File autorizzati alla modifica
5. File esplicitamente non autorizzati
6. Report di implementazione di Claude Code
7. Report della skill quality-gate-verifier
8. Comandi già eseguiti e risultati
9. Test/build/gate mancanti o falliti, se presenti
10. Stato Git corrente, se già disponibile
11. Target della review:
    - COMMIT
    - PUSH
    - DEPLOY
    - MERGE
    - HANDOFF
12. Vincoli specifici di Eros per questo task
```

Se mancano input critici, non inventare.

Input critici minimi:

```text
- scope approvato;
- report quality-gate-verifier o elenco gate eseguiti;
- lista file autorizzati, se esiste;
- diff Git ispezionabile;
- target della review.
```

Se manca lo scope approvato, la review può solo dire:

```text
Scope match: NON VERIFICABILE
Risk level: HIGH
Decisione per Eros: FERMA
```

---

## 4. Procedura operativa read-only

Lavora solo in modalità read-only.

Regole obbligatorie:

- non modificare file;
- non creare file;
- non cancellare file;
- non rinominare file;
- non spostare file;
- non formattare file;
- non installare dipendenze;
- non eseguire migrazioni;
- non eseguire test se non sono già stati approvati in un altro ciclo;
- non fare stage;
- non fare commit;
- non fare push;
- non fare deploy;
- non aprire o stampare secret in chiaro;
- non copiare valori sensibili nel report;
- non correggere problemi durante questa skill.

Sequenza operativa:

```text
1. Conferma target della review.
2. Conferma scope approvato.
3. Leggi il report quality-gate-verifier.
4. Esegui `git status`.
5. Esegui `git diff --stat`.
6. Esegui `git diff --name-only`.
7. Se appaiono file sensibili o fuori scope, fermati prima di stampare contenuti sensibili.
8. Esegui `git diff --check`.
9. Esegui `git diff`.
10. Analizza il diff file-per-file.
11. Confronta ogni file con lo scope approvato.
12. Controlla secret, config sensibili, database, auth e deploy.
13. Controlla se build/test/gate richiesti sono stati già eseguiti.
14. Assegna risk scoring.
15. Produci una decisione finale per Eros.
```

Regola pratica:

```text
Durante la diff review Claude Code osserva, classifica e segnala.
Non corregge.
```

---

## 5. Comandi consentiti

Usa solo questi comandi:

```bash
git status
git diff --stat
git diff --name-only
git diff --check
git diff
```

Nessun altro comando è consentito da questa skill.

Non usare:

```bash
git add
git commit
git push
git restore
git checkout
git reset
git clean
git rm
git mv
npm
pnpm
yarn
bun
pytest
supabase
vercel
docker
```

Se serve un comando non incluso nella lista consentita:

```text
1. Non eseguirlo.
2. Spiega perché servirebbe.
3. Segna la verifica come incompleta.
4. Assegna rischio coerente.
5. Dai a Eros una decisione tra quelle ammesse.
```

---

## 6. Analisi file-per-file del diff

Per ogni file modificato nel diff, controlla:

```text
1. Path del file
2. Tipo modifica:
   - modificato
   - creato
   - cancellato
   - rinominato/spostato
   - non determinabile dai comandi consentiti
3. Motivo dichiarato della modifica
4. Collegamento allo scope approvato
5. Cambiamento funzionale
6. Cambiamento tecnico
7. Rischio regressione
8. Rischio sicurezza
9. Rischio config/deploy/database/auth
10. Test/build/gate collegati
11. Esito file:
    - OK
    - WARNING
    - BLOCKING
```

Formato per ogni file:

```text
- `path/file`
  - Tipo modifica:
  - Cosa cambia:
  - Perché è nel diff:
  - Scope match: YES / PARTIAL / NO / UNKNOWN
  - Rischio: LOW / MEDIUM / HIGH / BLOCKER
  - Area sensibile: YES / NO
  - Test/build/gate collegati:
  - Problemi:
  - Decisione file: OK / WARNING / BLOCKING
```

Segnala come rischio almeno `MEDIUM` se:

- il file è modificato ma non era nella lista autorizzata;
- il file è collegato indirettamente allo scope ma non era previsto;
- il diff mescola feature, bugfix e refactor;
- il cambiamento è ampio rispetto al task;
- il file tocca comportamento runtime senza test collegato;
- il file è documentazione ma cambia istruzioni operative, deploy o sicurezza.

Segnala come `HIGH` o `BLOCKER` se:

- il file è fuori scope;
- il file è sensibile;
- il file può impattare produzione, database, auth, deploy o secrets;
- ci sono cancellazioni o rename non approvati;
- il diff introduce credenziali o token;
- il diff disabilita test, lint, typecheck o controlli;
- il diff cambia permessi, policy, ruoli, RLS o middleware auth senza approvazione esplicita.

---

## 7. Controlli su scope

Confronta il diff con lo scope approvato.

Controlla:

```text
- file modificati rispetto ai file autorizzati;
- file creati non dichiarati;
- file cancellati non dichiarati;
- rename o spostamenti non approvati;
- lockfile modificati;
- dipendenze aggiunte/rimosse;
- refactor non richiesti;
- modifiche a commenti/documentazione che cambiano il comportamento operativo;
- cambiamenti funzionali non citati nel report di implementazione;
- modifiche a più aree rispetto allo slice approvato.
```

Classifica lo scope match:

```text
MATCH
PARTIAL
DOES NOT MATCH
UNKNOWN
```

Regole:

```text
MATCH
```

Usalo solo se tutti i file e i cambiamenti sono coerenti con lo scope approvato.

```text
PARTIAL
```

Usalo se il task è in gran parte corretto ma include file o modifiche accessorie non chiaramente approvate.

```text
DOES NOT MATCH
```

Usalo se il diff supera lo scope, cambia aree non autorizzate o contiene refactor/feature non approvati.

```text
UNKNOWN
```

Usalo se lo scope approvato manca o non è abbastanza chiaro.

Stop immediato se:

```text
- scope mancante;
- file fuori scope;
- rename/spostamenti non approvati;
- cancellazioni non approvate;
- diff troppo ampio per lo slice;
- modifiche a database/auth/deploy/env non approvate.
```

---

## 8. Controlli su secret/security

Controlla sempre il diff per secret o segnali di esposizione.

Cerca nel diff:

```text
- API key reali;
- token;
- password;
- private key;
- service role key;
- JWT secret;
- OAuth client secret;
- webhook secret;
- database URL con credenziali;
- connection string;
- cookie secret;
- bearer token;
- valori `.env` reali;
- chiavi cloud;
- credenziali Supabase, Stripe, OpenAI, Anthropic, Vercel, GitHub o provider esterni;
- log che stampano token, sessioni, email private, payload sensibili o dati personali;
- commenti con credenziali o istruzioni insicure.
```

File sensibili da considerare sempre ad alto rischio:

```text
.env
.env.*
*.pem
*.key
*.p12
*.crt
id_rsa
id_ed25519
secrets.*
credentials.*
service-account*.json
supabase/.temp/*
```

Regole:

- se trovi un secret, non copiarlo nel report;
- maschera sempre eventuali valori visibili;
- indica solo file e tipo di rischio;
- assegna `BLOCKER`;
- decisione finale: `FERMA`.

Formato corretto:

```text
Secret/security:
- Secret found: YES
- Type: API key/token/password/private key/etc.
- Location: `path/file`
- Value: MASKED
- Risk: BLOCKER
- Action: FERMA. Non committare.
```

Se il diff tocca security/auth ma non mostra secret:

```text
Secret found: NO
Sensitive security area touched: YES
Risk: MEDIUM/HIGH secondo scope e test
```

---

## 9. Controlli su config/deploy/database/auth

Questa skill deve trattare come sensibili tutte le modifiche a:

### Config e build

```text
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lockb
tsconfig.json
jsconfig.json
vite.config.*
next.config.*
nuxt.config.*
astro.config.*
tailwind.config.*
postcss.config.*
eslint.config.*
.prettierrc*
babel.config.*
turbo.json
.env.example
```

Controlla:

- nuove dipendenze;
- dipendenze rimosse;
- script modificati;
- script che saltano test/build;
- config che indebolisce typecheck, lint o sicurezza;
- env documentate con valori reali invece di placeholder.

### Deploy/CI/CD

```text
vercel.json
netlify.toml
Dockerfile
docker-compose.*
.github/workflows/*
.gitlab-ci.yml
fly.toml
railway.json
render.yaml
Procfile
```

Controlla:

- comandi di build cambiati;
- variabili env aggiunte;
- permessi CI modificati;
- deploy target cambiato;
- preview/production confusi;
- step di test rimossi;
- cache o ignore che può nascondere file necessari.

### Database/Supabase

```text
supabase/**
migrations/**
prisma/**
drizzle/**
*.sql
schema.prisma
database.types.*
```

Controlla:

- migration nuove o modificate;
- drop/truncate/delete;
- RLS/policies;
- storage policies;
- service role;
- seed o dati iniziali;
- query che cambiano accesso ai dati;
- operazioni non reversibili;
- ambiente local/staging/production non chiaro.

### Auth/security

```text
middleware.*
auth.*
session.*
jwt.*
oauth.*
permissions.*
roles.*
rbac.*
app/**/login/**
app/**/signup/**
app/**/api/**
pages/api/**
```

Controlla:

- login/logout/signup;
- session handling;
- redirect auth;
- ruoli e permessi;
- controlli solo client-side;
- endpoint non protetti;
- cookie/sessione/JWT;
- bypass di middleware;
- service role usata lato client.

Regola di blocco:

```text
Se database, auth, deploy, env o config sensibile sono stati modificati senza approvazione esplicita, la decisione finale deve essere FERMA.
```

Se erano approvati ma non testati/verificati:

```text
Risk level: HIGH
Decisione per Eros: ESEGUI TEST oppure CORREGGI PRIMA
```

---

## 10. Controlli su test/build già eseguiti

Questa skill non esegue test o build.

Deve controllare se nel report precedente sono presenti prove per:

```text
- typecheck;
- lint/format check;
- unit test;
- integration test;
- build;
- e2e/browser;
- smoke test frontend;
- smoke test backend/API;
- database/Supabase verification;
- auth/security verification;
- deploy/predeploy check, se target è deploy.
```

Per ogni verifica, indica:

```text
- Eseguita: YES / NO / N/A / UNKNOWN
- Fonte prova: report quality-gate-verifier / output Claude / log incollato / non presente
- Esito: PASS / FAIL / N/A / UNKNOWN
- Rischio residuo: LOW / MEDIUM / HIGH
```

Regole:

- se mancano test/build per modifiche solo documentali, rischio `LOW` o `MEDIUM` secondo impatto;
- se mancano test/build per codice runtime, rischio minimo `MEDIUM`;
- se mancano test/build per database/auth/deploy/API, rischio minimo `HIGH`;
- se test o build sono falliti e non corretti, rischio `HIGH` o `BLOCKER`;
- se Claude ha disabilitato test, lint, typecheck o controlli, rischio `BLOCKER`;
- se la skill `quality-gate-verifier` non è stata eseguita, rischio minimo `MEDIUM`;
- se mancano prove critiche prima di commit, decisione finale `ESEGUI TEST` o `FERMA`.

---

## 11. Risk scoring

Assegna un risk level globale:

```text
LOW
MEDIUM
HIGH
BLOCKER
```

### LOW

Usa `LOW` quando:

```text
- il diff è piccolo;
- tutti i file sono nello scope approvato;
- nessun file sensibile è toccato;
- nessun secret;
- test/build/gate rilevanti sono passati o motivati;
- il cambiamento è reversibile;
- regressioni probabili basse;
- commit può essere proposto a Eros.
```

Decisione tipica:

```text
COMMIT
```

### MEDIUM

Usa `MEDIUM` quando:

```text
- il diff è probabilmente corretto ma mancano prove;
- alcuni file sono accessori o non perfettamente dichiarati;
- ci sono warning non bloccanti;
- test/build non sono completi ma il rischio è gestibile;
- il task tocca codice runtime senza verifica sufficiente;
- serve chiarire scope prima del commit.
```

Decisione tipica:

```text
ESEGUI TEST
CORREGGI PRIMA
RIDUCI SCOPE
```

### HIGH

Usa `HIGH` quando:

```text
- scope parzialmente superato;
- file sensibili modificati con approvazione poco chiara;
- database/auth/deploy/config toccati senza prove sufficienti;
- test/build mancanti su codice critico;
- diff ampio o difficile da revisionare;
- regressione probabile;
- cancellazioni, rename o spostamenti non chiaramente approvati;
- staged changes non ispezionabili con i comandi consentiti.
```

Decisione tipica:

```text
CORREGGI PRIMA
RIDUCI SCOPE
ROLLBACK
FERMA
```

### BLOCKER

Usa `BLOCKER` quando:

```text
- secret o credenziali nel diff;
- file fuori scope importanti;
- `.env` o file di credenziali modificati;
- database/auth/deploy/env modificati senza approvazione esplicita;
- build/test falliti e ignorati;
- controlli disabilitati per far passare il task;
- rischio produzione immediato;
- comandi distruttivi eseguiti o proposti senza approvazione;
- impossibile capire cosa sia cambiato;
- diff non ispezionabile.
```

Decisione obbligatoria:

```text
FERMA
```

---

## 12. Stop conditions

Ferma la review e produci subito report se trovi:

```text
- secret, token, password o credenziali nel diff;
- modifiche a `.env` o file di credenziali;
- file fuori scope;
- cancellazioni non approvate;
- rename/spostamenti non approvati;
- modifiche a database senza approvazione esplicita;
- modifiche ad auth/security senza approvazione esplicita;
- modifiche a deploy/CI/CD/env senza approvazione esplicita;
- lockfile modificati senza approvazione;
- test/build falliti e non risolti;
- quality-gate-verifier mancante per codice runtime;
- diff troppo ampio per lo scope;
- staged changes non ispezionabili con i comandi consentiti;
- conflitti, marker o whitespace error da `git diff --check`;
- impossibilità di determinare scope match.
```

Quando ti fermi:

```text
1. Non correggere.
2. Non fare stage.
3. Non committare.
4. Non continuare verso push/deploy/merge.
5. Spiega il blocco.
6. Dai una sola decisione per Eros.
```

---

## 13. Output format obbligatorio

Devi restituire esattamente questo formato.

````text
## Diff Risk Review Report

### 1. Esito
PASS / WARNING / BLOCCATO / NON SICURO

### 2. Target verificato
COMMIT / PUSH / DEPLOY / MERGE / HANDOFF

### 3. Risk level globale
LOW / MEDIUM / HIGH / BLOCKER

### 4. Scope match
MATCH / PARTIAL / DOES NOT MATCH / UNKNOWN

### 5. Comandi read-only eseguiti
- `git status`: PASS / WARNING / FAIL
- `git diff --stat`: PASS / WARNING / FAIL
- `git diff --name-only`: PASS / WARNING / FAIL
- `git diff --check`: PASS / WARNING / FAIL
- `git diff`: PASS / WARNING / FAIL

### 6. Diff summary
- File modificati:
- File creati:
- File cancellati:
- File rinominati/spostati:
- File inattesi: YES / NO / UNKNOWN
- File sensibili: YES / NO / UNKNOWN
- Diff troppo ampio: YES / NO

### 7. Analisi file-per-file
- `path/file`
  - Tipo modifica:
  - Cosa cambia:
  - Perché è nel diff:
  - Scope match: YES / PARTIAL / NO / UNKNOWN
  - Rischio: LOW / MEDIUM / HIGH / BLOCKER
  - Area sensibile: YES / NO
  - Test/build/gate collegati:
  - Problemi:
  - Decisione file: OK / WARNING / BLOCKING

### 8. Controllo scope
- Scope approvato:
- File autorizzati:
- File non autorizzati:
- Violazioni:
- Note:

### 9. Secret/security check
- Secret found: YES / NO / UNKNOWN
- Sensitive files touched: YES / NO / UNKNOWN
- Security concerns:
- Note:
- Valori sensibili riportati nel report: NO

### 10. Config/deploy/database/auth check
- Config sensibile toccata: YES / NO
- Deploy/CI/CD toccato: YES / NO
- Database/Supabase toccato: YES / NO
- Auth/security toccato: YES / NO
- Approvazione esplicita presente: YES / NO / N/A
- Rischi:

### 11. Test/build/gate evidence
- quality-gate-verifier eseguito: YES / NO / UNKNOWN
- Typecheck: PASS / FAIL / N/A / UNKNOWN
- Lint/format: PASS / FAIL / N/A / UNKNOWN
- Tests: PASS / FAIL / N/A / UNKNOWN
- Build: PASS / FAIL / N/A / UNKNOWN
- E2E/browser: PASS / FAIL / N/A / UNKNOWN
- Backend/API smoke: PASS / FAIL / N/A / UNKNOWN
- Database/Auth/Deploy checks: PASS / FAIL / N/A / UNKNOWN
- Verifiche mancanti:

### 12. Blocking issues
- ...

### 13. Non-blocking concerns
- ...

### 14. Safe to commit?
SÌ / NO

### 15. Commit message suggerito
```bash
type(scope): descrizione breve

- cosa cambia
- perché
- test eseguiti
```

Se non è safe to commit, scrivi:

```text
N/A — commit non consigliato finché i blocchi non sono risolti.
```

### 16. Decisione finale per Eros
COMMIT / ESEGUI TEST / CORREGGI PRIMA / RIDUCI SCOPE / ROLLBACK / FERMA

### 17. Motivo della decisione
[Spiegazione breve, concreta, verificabile.]

### 18. Prossimo step operativo
[Una sola azione concreta.]
````

Regole del formato:

- scegli una sola decisione finale;
- non usare decisioni diverse da quelle ammesse;
- non dichiarare `Safe to commit: SÌ` se esiste rischio `HIGH` o `BLOCKER`;
- non proporre commit se mancano prove critiche;
- non includere secret in chiaro;
- se il commit è consigliato, il commit message deve essere solo una proposta;
- Eros deve approvare prima di qualsiasi commit.

---

## 14. Decisioni finali possibili per Eros

Alla fine, scegli una sola decisione.

### COMMIT

Usa solo se:

```text
- risk level globale LOW;
- scope match MATCH;
- nessun file inatteso;
- nessun secret;
- nessun file sensibile non approvato;
- build/test/gate rilevanti passati o motivati;
- diff file-per-file coerente;
- nessun blocco;
- Eros deve solo approvare il commit.
```

Nota:

```text
COMMIT non significa che Claude può committare subito.
COMMIT significa: il diff sembra sicuro e Eros può approvare il commit.
```

### ESEGUI TEST

Usa se:

```text
- il diff sembra nello scope;
- non ci sono secret;
- non ci sono blocchi immediati;
- mancano test/build/gate rilevanti;
- servono prove prima del commit.
```

### CORREGGI PRIMA

Usa se:

```text
- ci sono problemi correggibili;
- il diff resta recuperabile;
- alcuni test/build falliscono;
- ci sono warning tecnici;
- serve una correzione piccola dentro lo scope approvato.
```

### RIDUCI SCOPE

Usa se:

```text
- il diff è troppo ampio;
- sono state mescolate troppe modifiche;
- ci sono refactor accessori;
- conviene separare il lavoro in più commit/slice;
- alcuni file possono essere esclusi dal task corrente.
```

### ROLLBACK

Usa se:

```text
- il diff è rischioso;
- la modifica rompe funzionalità;
- lo scope è stato superato in modo importante;
- è più sicuro tornare allo stato precedente che correggere sopra il diff attuale;
- ci sono cancellazioni/rename non approvati;
- il lavoro è confuso o non verificabile.
```

### FERMA

Usa se:

```text
- secret trovati;
- `.env` o credenziali toccate;
- database/auth/deploy/env modificati senza approvazione esplicita;
- rischio globale BLOCKER;
- diff non ispezionabile;
- scope mancante o non verificabile;
- file fuori scope critici;
- commit/push/deploy sarebbe non sicuro.
```

---

## 15. Esempio di utilizzo

Prompt da incollare in Claude Code:

```text
Use the skill `diff-risk-reviewer`.

Mode:
READ-ONLY DIFF REVIEW.

Target:
COMMIT

Task requested by Eros:
[INCOLLA TASK ORIGINALE]

Approved scope:
[INCOLLA SCOPE APPROVATO]

Approved plan:
[INCOLLA PIANO APPROVATO, SE PRESENTE]

Files approved:
[INCOLLA FILE APPROVATI]

Files not approved:
[INCOLLA FILE DA NON TOCCARE]

Implementation report:
[INCOLLA REPORT IMPLEMENTAZIONE CLAUDE CODE]

Quality Gate Verifier report:
[INCOLLA REPORT DELLA SKILL quality-gate-verifier]

Commands already run and results:
[INCOLLA COMANDI + RISULTATI]

Known risks:
[INCOLLA RISCHI NOTI]

Rules:
- Do not modify files.
- Do not create files.
- Do not delete files.
- Do not format files.
- Do not stage files.
- Do not commit.
- Do not push.
- Do not deploy.
- Use only:
  - `git status`
  - `git diff --stat`
  - `git diff --name-only`
  - `git diff --check`
  - `git diff`
- Compare the diff against the approved scope.
- Review every changed file.
- Check for secrets, sensitive config, database, auth, deploy and env changes.
- Check whether build/test/quality gates were already executed.
- If you find secrets, file fuori scope, database/auth/deploy/env non approvati, HIGH/BLOCKER risk, or missing critical evidence, stop.
- Return exactly the required Diff Risk Review Report.
- End with one decision only:
  COMMIT / ESEGUI TEST / CORREGGI PRIMA / RIDUCI SCOPE / ROLLBACK / FERMA.
```

Esempio di output atteso:

````text
## Diff Risk Review Report

### 1. Esito
PASS

### 2. Target verificato
COMMIT

### 3. Risk level globale
LOW

### 4. Scope match
MATCH

### 5. Comandi read-only eseguiti
- `git status`: PASS
- `git diff --stat`: PASS
- `git diff --name-only`: PASS
- `git diff --check`: PASS
- `git diff`: PASS

### 6. Diff summary
- File modificati: 2
- File creati: 0
- File cancellati: 0
- File rinominati/spostati: 0
- File inattesi: NO
- File sensibili: NO
- Diff troppo ampio: NO

### 7. Analisi file-per-file
- `src/components/Example.tsx`
  - Tipo modifica: modificato
  - Cosa cambia: aggiorna il comportamento approvato dello slice
  - Perché è nel diff: file incluso nello scope
  - Scope match: YES
  - Rischio: LOW
  - Area sensibile: NO
  - Test/build/gate collegati: typecheck PASS, build PASS
  - Problemi: nessuno
  - Decisione file: OK

### 8. Controllo scope
- Scope approvato: slice UI approvato da Eros
- File autorizzati: `src/components/Example.tsx`, `src/app/example/page.tsx`
- File non autorizzati: config, auth, database, deploy
- Violazioni: nessuna
- Note: diff coerente con lo scope

### 9. Secret/security check
- Secret found: NO
- Sensitive files touched: NO
- Security concerns: nessuna
- Note: nessun valore sensibile nel diff
- Valori sensibili riportati nel report: NO

### 10. Config/deploy/database/auth check
- Config sensibile toccata: NO
- Deploy/CI/CD toccato: NO
- Database/Supabase toccato: NO
- Auth/security toccato: NO
- Approvazione esplicita presente: N/A
- Rischi: nessuno

### 11. Test/build/gate evidence
- quality-gate-verifier eseguito: YES
- Typecheck: PASS
- Lint/format: PASS
- Tests: N/A
- Build: PASS
- E2E/browser: N/A
- Backend/API smoke: N/A
- Database/Auth/Deploy checks: N/A
- Verifiche mancanti: nessuna critica

### 12. Blocking issues
- Nessuno

### 13. Non-blocking concerns
- Nessuno

### 14. Safe to commit?
SÌ

### 15. Commit message suggerito
```bash
fix(example): aggiorna comportamento dello slice approvato

- aggiorna componente Example
- mantiene lo scope approvato
- verifiche: typecheck, lint, build
```

### 16. Decisione finale per Eros
COMMIT

### 17. Motivo della decisione
Diff piccolo, nello scope, verificato, senza secret e senza file sensibili.

### 18. Prossimo step operativo
Eros approva il commit oppure chiede modifiche prima del commit.
````

---

## 16. Regola finale

Questa skill è un gate di controllo, non un agente di modifica.

```text
Claude Code non deve modificare file durante la diff review.
Claude Code non deve fare stage, commit, push o deploy.
Claude Code deve solo leggere il diff, classificare il rischio e dare a Eros una decisione.
```

Se il diff è sicuro:

```text
Decisione per Eros: COMMIT
```

Se il diff non è sicuro:

```text
Decisione per Eros: ESEGUI TEST / CORREGGI PRIMA / RIDUCI SCOPE / ROLLBACK / FERMA
```
