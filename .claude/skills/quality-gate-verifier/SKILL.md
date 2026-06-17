---
name: quality-gate-verifier
description: Verifica se un task Claude Code è davvero completato prima di diff review, commit o deploy, controllando scope, comandi reali del progetto, build/test, security, rischi residui e approvazione di Eros.
---

# Quality Gate Verifier

## 1. Quando usare questa skill

Usa questa skill quando Claude Code dice che un task è completato, ma prima di:

- diff review finale;
- commit;
- push;
- deploy;
- merge;
- consegna a Eros;
- passaggio a un altro agente o subagent.

Regola madre:

```text
Claude non ha finito quando dice "done".
Claude ha finito solo quando i gate rilevanti sono passati, documentati e approvati da Eros.
```

Questa skill si usa nella fase:

```text
Read → Plan → Approve → Act → Build → Test → Quality Gates → Diff Review → Commit
```

Non usare questa skill per implementare nuove modifiche.  
Questa skill verifica, blocca o autorizza il passaggio alla fase successiva.

---

## 2. Input richiesti

Prima di iniziare, raccogli questi input.

```text
1. Task richiesto da Eros
2. Scope approvato da Eros
3. Piano approvato, se presente
4. File che Claude era autorizzato a modificare
5. File che Claude non doveva toccare
6. Output dell'implementazione
7. Comandi già eseguiti e risultati
8. Stato Git corrente
9. Eventuali errori, warning o rischi già noti
10. Target della verifica:
   - DIFF REVIEW
   - COMMIT
   - DEPLOY
   - HANDOFF
```

Se mancano input critici, non inventare.  
Segna il gate come `FAIL` o `N/A` solo se puoi motivarlo chiaramente.

---

## 3. Procedura operativa

### 3.1 Entra in verification mode

Lavora in modalità verifica.

Regole:

- non modificare file;
- non creare file;
- non cancellare file;
- non formattare file;
- non installare pacchetti;
- non eseguire migrazioni;
- non fare commit;
- non fare push;
- non fare deploy;
- non toccare secret, `.env`, credenziali o variabili ambiente;
- non correggere errori durante questa skill, salvo approvazione esplicita di Eros in un ciclo separato.

Obiettivo:

```text
Determinare se il task è davvero pronto per la prossima fase.
```

---

### 3.2 Rileva i comandi reali del progetto

Prima di proporre o usare comandi, rilevali dal progetto.

Leggi solo fonti reali, ad esempio:

```text
- README
- package.json
- pnpm-lock.yaml / package-lock.json / yarn.lock
- pyproject.toml
- requirements.txt
- Makefile
- turbo.json
- vite.config.*
- next.config.*
- playwright.config.*
- docs del progetto
- CLAUDE.md del progetto, se presente
```

Non inventare comandi.

Per ogni comando, indica:

```text
- comando rilevato
- file sorgente da cui è stato rilevato
- scopo
- se è sicuro eseguirlo ora
```

Se un comando non esiste, scrivi:

```text
N/A — comando non presente nel progetto. Non inventato.
```

---

### 3.3 Controlla lo scope

Verifica che le modifiche corrispondano allo scope approvato.

Controlla:

```text
- file modificati;
- file creati;
- file cancellati;
- file rinominati;
- file spostati;
- modifiche a lockfile;
- modifiche a config;
- modifiche a database/auth/deploy/env;
- refactor non richiesti;
- cambiamenti funzionali non dichiarati.
```

Se trovi file fuori scope, fermati.

---

### 3.4 Controlla i gate tecnici

Esegui solo comandi sicuri e rilevati dal progetto.

Ordine consigliato quando applicabile:

```text
1. command discovery
2. git status / diff summary
3. typecheck
4. lint / format check
5. test
6. build
7. e2e / browser smoke test, se UI/browser
8. backend/API smoke test, se backend/API
9. database/Supabase checks, se database/Supabase
10. auth/security checks, se auth/security
11. secret scan tramite diff e file modificati
```

Se un comando è rischioso, distruttivo, modifica dati o tocca servizi esterni, non eseguirlo senza approvazione di Eros.

---

### 3.5 Classifica ogni gate

Ogni gate deve avere uno stato:

```text
PASS
FAIL
N/A
```

Usa `N/A` solo quando il gate non si applica davvero al task.

Ogni `N/A` deve avere una spiegazione.

Formato minimo per ogni gate:

```text
Gate:
Stato:
Prova:
Rischio residuo:
Nota:
```

Esempi corretti:

```text
Typecheck:
Stato: N/A
Prova: package.json non contiene script typecheck e il progetto non usa TypeScript.
Rischio residuo: basso
Nota: Non invento comandi alternativi.
```

```text
UI/browser:
Stato: N/A
Prova: il task ha modificato solo documentazione interna.
Rischio residuo: assente
Nota: Nessun flusso browser coinvolto.
```

---

## 4. Gate da verificare

### 4.1 Approval gate

Verifica:

```text
- Eros ha approvato lo scope?
- Lo scope approvato è chiaro?
- Il task eseguito corrisponde allo scope?
```

PASS se:

```text
Scope approvato e rispettato.
```

FAIL se:

```text
Scope assente, ambiguo o superato.
```

---

### 4.2 Scope gate

Verifica:

```text
- nessun file fuori scope;
- nessun rename/spostamento non approvato;
- nessuna cancellazione non approvata;
- nessun refactor non richiesto;
- nessuna modifica funzionale non dichiarata.
```

Comandi tipici, se disponibili e sicuri:

```bash
git status
git diff --stat
git diff --name-only
```

PASS se i file modificati sono coerenti con il piano approvato.  
FAIL se compaiono file inattesi.

---

### 4.3 Command discovery gate

Verifica:

```text
- package manager rilevato;
- runtime rilevato;
- script disponibili letti da file reali;
- comandi mancanti dichiarati;
- nessun comando inventato.
```

PASS se i comandi sono stati rilevati dal progetto.  
FAIL se Claude ha assunto o inventato comandi.

---

### 4.4 Typecheck gate

Applicare se il progetto ha typecheck o equivalente.

Verifica:

```text
- comando reale rilevato;
- esito comando;
- errori;
- warning;
- se gli errori sono nuovi o preesistenti.
```

PASS se typecheck passa.  
FAIL se typecheck fallisce o viene aggirato.  
N/A se il progetto non ha typecheck né stack che lo richieda, con spiegazione.

---

### 4.5 Lint/format gate

Applicare se il progetto ha lint, format check o equivalente.

Verifica:

```text
- comando reale rilevato;
- esito comando;
- file toccati dal formatting;
- disable rule aggiunte;
- modifiche fuori scope causate da format.
```

PASS se lint/format passa.  
FAIL se fallisce, viene aggirato o modifica file fuori scope.  
N/A se il progetto non prevede lint/format check, con spiegazione.

---

### 4.6 Test gate

Applicare se esistono test o se il task richiede verifica funzionale.

Verifica:

```text
- test automatici disponibili;
- test rilevanti eseguiti;
- smoke test manuale documentato se mancano test automatici;
- failure comprese;
- test non rimossi o indeboliti.
```

PASS se i test rilevanti passano o la verifica alternativa è sufficiente.  
FAIL se test falliscono per causa non chiara o non sono stati eseguiti senza motivo.  
N/A solo per task senza impatto funzionale, con spiegazione.

---

### 4.7 Build gate

Applicare se esiste una build o equivalente.

Verifica:

```text
- comando reale rilevato;
- esito;
- warning importanti;
- workaround nascosti;
- modifiche a config build/deploy.
```

PASS se build passa.  
FAIL se build fallisce o la causa non è chiara.  
N/A se non esiste build nel progetto, con spiegazione.

---

### 4.8 Regression gate

Applicare sempre, con intensità proporzionata al task.

Verifica:

```text
- quali flussi potevano rompersi;
- quali flussi sono stati verificati;
- quali flussi non sono stati verificati;
- rischio residuo.
```

PASS se i flussi rilevanti sono verificati.  
FAIL se il task può aver rotto funzionalità e non c'è verifica.  
N/A solo per modifiche puramente documentali o metadata non runtime, con spiegazione.

---

### 4.9 Frontend/UI/browser gate

Applicare se il task tocca:

```text
- pagine;
- componenti;
- routing;
- layout;
- CSS;
- form;
- state management;
- client-side logic;
- browser behavior.
```

Verifica:

```text
- pagina caricata;
- console senza errori bloccanti;
- flusso principale testato;
- responsive minimo se rilevante;
- stati loading/error/success se rilevanti;
- Playwright o smoke test browser se disponibile.
```

PASS se il comportamento utente principale è verificato.  
FAIL se UI potenzialmente rotta e non verificata.  
N/A se il task non tocca frontend/browser, con spiegazione.

---

### 4.10 Backend/API gate

Applicare se il task tocca:

```text
- API routes;
- server actions;
- controller;
- service;
- webhook;
- integrazioni esterne;
- validazione input;
- logging;
- error handling.
```

Verifica:

```text
- contratto input/output;
- caso successo;
- caso errore;
- validazione;
- status/error format;
- log senza dati sensibili.
```

PASS se endpoint o azione sono verificati.  
FAIL se backend/API cambia senza test o smoke test.  
N/A se il task non tocca backend/API, con spiegazione.

---

### 4.11 Database/Supabase gate

Applicare se il task tocca:

```text
- schema;
- migration;
- query;
- RLS;
- policies;
- storage;
- seed;
- RPC;
- Supabase client/server;
- dati persistenti.
```

Verifica:

```text
- ambiente coinvolto: local / staging / production;
- tabelle coinvolte;
- operazioni: SELECT / INSERT / UPDATE / DELETE;
- migration necessaria;
- rollback documentato;
- RLS/policies se applicabili;
- nessun comando distruttivo non approvato.
```

STOP immediato se:

```text
- l'ambiente non è chiaro;
- il comando può modificare dati reali;
- serve accesso produzione non approvato;
- ci sono drop/truncate/delete non approvati;
- policy/RLS sembrano troppo permissive.
```

N/A se il task non tocca database/Supabase, con spiegazione.

---

### 4.12 Auth/security gate

Applicare se il task tocca:

```text
- login;
- logout;
- signup;
- sessioni;
- ruoli;
- permessi;
- middleware;
- OAuth;
- JWT;
- cookies;
- API keys;
- .env;
- security rules.
```

Verifica:

```text
- sessione;
- permessi lato server;
- nessun bypass client-side;
- nessun token in log;
- nessuna service role key nel client;
- nessuna modifica a env/secrets senza approvazione.
```

FAIL se il controllo è solo lato client o se c'è rischio di esposizione credenziali.  
N/A se il task non tocca auth/security, con spiegazione.

---

### 4.13 Secret gate

Applicare sempre.

Verifica:

```text
- git diff;
- file modificati;
- file creati;
- documentazione modificata;
- log riportati;
- env examples.
```

Cerca:

```text
- API key reali;
- token;
- password;
- private key;
- service role key;
- connection string;
- cookie/session secret;
- webhook secret;
- credenziali cloud;
- valori `.env` reali.
```

PASS se non ci sono secret.  
FAIL se trovi anche un solo secret reale o sospetto.

Se trovi secret, fermati.

Non stampare il secret completo nel report.  
Mascheralo così:

```text
sk-...abcd
```

---

### 4.14 Sensitive files gate

Applicare sempre.

Controlla modifiche a:

```text
.env
.env.*
*.pem
*.key
*.p12
*.cert
supabase/migrations/*
middleware.*
auth/*
security/*
vercel.json
netlify.toml
Dockerfile
docker-compose*
.github/workflows/*
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
```

PASS se nessun file sensibile è stato modificato o se la modifica era approvata e verificata.  
FAIL se file sensibili sono stati toccati senza approvazione.

---

### 4.15 Deploy readiness gate

Applicare solo se il target è deploy o release.

Verifica:

```text
- build passa;
- env richieste documentate senza valori reali;
- migration approvate, se presenti;
- rollback chiaro;
- config deploy verificata;
- nessun secret;
- nessun rischio medio/alto aperto;
- Eros ha approvato deploy.
```

PASS se deploy è sicuro.  
FAIL se manca qualunque requisito critico.  
N/A se non si sta preparando un deploy, con spiegazione.

---

## 5. Comandi consentiti

Questa skill non contiene una lista rigida di comandi di progetto.

Claude deve rilevare i comandi reali dal progetto e usarli solo se sicuri.

Comandi generalmente consentiti per verifica read-only:

```bash
pwd
ls
find . -maxdepth 3 -type f
git status
git branch --show-current
git diff --stat
git diff --name-only
git diff
git log --oneline -5
```

Comandi tecnici consentiti solo se rilevati nel progetto e coerenti con lo scope:

```text
- typecheck
- lint
- format check
- test
- build
- e2e
- browser smoke test
- API smoke test locale
```

Comandi che richiedono approvazione esplicita di Eros:

```text
- installare, aggiornare o rimuovere dipendenze;
- modificare lockfile;
- eseguire migrazioni;
- resettare database;
- scrivere su database o servizi esterni;
- usare credenziali reali;
- modificare env/secrets;
- eseguire script non documentati;
- generare file fuori scope;
- fare commit;
- fare push;
- aprire PR;
- fare deploy.
```

Comandi vietati durante questa skill:

```text
- commit;
- push;
- deploy;
- modifica file;
- cancellazione file;
- rename/move file;
- install senza approvazione;
- migration senza approvazione;
- comandi distruttivi;
- comandi che toccano produzione;
- stampa di secret completi.
```

---

## 6. Stop conditions

Fermati immediatamente se trovi una di queste condizioni:

```text
- secret reale o sospetto nel diff;
- file fuori scope modificati;
- file sensibili modificati senza approvazione;
- build fallita con causa non chiara;
- test falliti con causa non chiara;
- typecheck fallito;
- lint fallito in modo non compreso;
- database/auth/deploy/env toccati senza approvazione;
- comando richiesto non rilevato dal progetto;
- comando potenzialmente distruttivo;
- ambiente local/staging/production non chiaro;
- rischio residuo medio o alto;
- diff troppo ampio per essere verificato in modo affidabile;
- mancano prove verificabili;
- Claude ha disabilitato controlli per far passare il task;
- Claude ha rimosso o indebolito test;
- Eros non ha approvato il gate necessario.
```

Quando ti fermi:

```text
1. Non correggere.
2. Non committare.
3. Non pushare.
4. Non deployare.
5. Riporta il blocco.
6. Chiedi decisione a Eros.
```

---

## 7. Output format obbligatorio

Rispondi sempre con questo formato.

```text
## Quality Gate Verification Report

### 1. Stato finale
PASS / FAIL / BLOCCATO / PARZIALE / NON SICURO

### 2. Target verificato
DIFF REVIEW / COMMIT / DEPLOY / HANDOFF

### 3. Scope approvato
- Sintesi:
- Fonte approvazione:
- Match con implementazione: MATCH / PARTIAL / NO

### 4. Comandi rilevati dal progetto
- `comando`: scopo — fonte — eseguito SÌ/NO — risultato

### 5. Gate checklist

| Gate | Stato | Prova | Rischio residuo | Nota |
|---|---|---|---|---|
| Approval | PASS/FAIL/N/A | ... | ... | ... |
| Scope | PASS/FAIL/N/A | ... | ... | ... |
| Command discovery | PASS/FAIL/N/A | ... | ... | ... |
| Typecheck | PASS/FAIL/N/A | ... | ... | ... |
| Lint/format | PASS/FAIL/N/A | ... | ... | ... |
| Test | PASS/FAIL/N/A | ... | ... | ... |
| Build | PASS/FAIL/N/A | ... | ... | ... |
| Regression | PASS/FAIL/N/A | ... | ... | ... |
| Frontend/UI/browser | PASS/FAIL/N/A | ... | ... | ... |
| Backend/API | PASS/FAIL/N/A | ... | ... | ... |
| Database/Supabase | PASS/FAIL/N/A | ... | ... | ... |
| Auth/security | PASS/FAIL/N/A | ... | ... | ... |
| Secret | PASS/FAIL/N/A | ... | ... | ... |
| Sensitive files | PASS/FAIL/N/A | ... | ... | ... |
| Deploy readiness | PASS/FAIL/N/A | ... | ... | ... |

### 6. File modificati
- `path`: approvato SÌ/NO — rischio LOW/MEDIUM/HIGH — nota

### 7. Problemi bloccanti
- ...

### 8. Rischi residui
- Rischio:
  - Livello: LOW / MEDIUM / HIGH
  - Impatto:
  - Mitigazione:

### 9. Verifiche non eseguite
- Gate:
  - Motivo:
  - Rischio:
  - Prossima azione:

### 10. Safe to proceed?
SÌ / NO

### 11. Decisione richiesta a Eros
CONTINUA / ESEGUI TEST / FAI DIFF / FIX FIRST / COMMIT / DEPLOY / ROLLBACK / FERMA
```

Regola:

```text
Se anche un solo gate critico è FAIL, "Safe to proceed?" deve essere NO.
Se esiste rischio medio o alto non mitigato, "Safe to proceed?" deve essere NO.
Se trovi secret, "Safe to proceed?" deve essere NO.
```

---

## 8. Decisioni finali possibili per Eros

Alla fine, chiedi una sola decisione chiara.

### CONTINUA

Usa quando:

```text
Gate passati, nessun blocco, prossimo step non è Git/deploy.
```

### ESEGUI TEST

Usa quando:

```text
Mancano verifiche tecniche rilevanti prima di diff review o commit.
```

### FAI DIFF

Usa quando:

```text
Gate minimi passati e il task è pronto per diff risk review.
```

### FIX FIRST

Usa quando:

```text
Ci sono problemi correggibili nello scope approvato, ma non è sicuro procedere.
```

### COMMIT

Usa solo quando:

```text
Diff review già fatta, gate passati, nessun secret, nessun rischio medio/alto, Eros approva.
```

Claude non deve committare senza approvazione esplicita.

### DEPLOY

Usa solo quando:

```text
Release/deploy gate passati, build valida, env documentate, rollback chiaro, Eros approva.
```

Claude non deve deployare senza approvazione esplicita.

### ROLLBACK

Usa quando:

```text
Il diff è fuori scope, rischioso, confuso o rompe gate critici.
```

### FERMA

Usa quando:

```text
Secret, rischio medio/alto, ambiente non chiaro, build/test falliti senza causa chiara, file sensibili o fuori scope.
```

---

## 9. Esempio di utilizzo

Prompt da incollare in Claude Code:

```text
Use the skill `quality-gate-verifier`.

Target:
COMMIT

Task requested by Eros:
[INCOLLA TASK ORIGINALE]

Approved scope:
[INCOLLA SCOPE APPROVATO]

Files approved:
[INCOLLA FILE APPROVATI]

Files not approved:
[INCOLLA FILE DA NON TOCCARE]

Implementation report:
[INCOLLA REPORT DI CLAUDE]

Commands already run:
[INCOLLA COMANDI + RISULTATI]

Rules:
- Do not modify files.
- Do not stage files.
- Do not commit.
- Do not push.
- Do not deploy.
- Detect real commands from the project.
- If a gate does not apply, mark it N/A with explanation.
- If you find secrets, out-of-scope files, unclear build failure, unclear test failure, sensitive files without approval, or medium/high risk, stop.

Return exactly the required Quality Gate Verification Report.
```

Output atteso:

```text
## Quality Gate Verification Report

### 1. Stato finale
PASS

### 2. Target verificato
COMMIT

### 3. Scope approvato
- Sintesi: ...
- Fonte approvazione: ...
- Match con implementazione: MATCH

### 4. Comandi rilevati dal progetto
- `npm run typecheck`: typecheck — package.json — eseguito SÌ — PASS
- `npm run lint`: lint — package.json — eseguito SÌ — PASS
- `npm run build`: build — package.json — eseguito SÌ — PASS

### 5. Gate checklist
...

### 10. Safe to proceed?
SÌ

### 11. Decisione richiesta a Eros
FAI DIFF
```
