# WALBOX — CLAUDE OUTPUT CONTRACT
> Regole di risposta per Claude quando lavora su Walbox.  
> Obiettivo: meno token, meno confusione, più controllo.

---

## 1. Modalità standard

Ogni task deve dichiarare una modalità:

- `READ-ONLY AUDIT`
- `PLAN ONLY`
- `IMPLEMENTATION MICROPHASE`
- `QA / VERIFY`
- `DIFF REVIEW`
- `HANDOFF`

Se la modalità non è chiara, chiedere conferma prima di modificare file.

---

## 2. Output breve obbligatorio

Per audit e piano:

```md
## Risultato

## File letti

## Decisione

## Rischi

## Prossima microfase
```

Per implementazione:

```md
## File modificati

## Cosa è cambiato

## Test eseguiti

## Rischi residui

## Prossimo prompt
```

---

## 3. Regole anti-scope creep

Non aggiungere:

- nuove feature non richieste;
- refactor globale;
- nuovi pacchetti;
- nuove dipendenze;
- cambi Supabase non richiesti;
- cambi routing non approvati;
- Payment/Loyalty/CRM se il task è V1 Kitchen.

---

## 4. File protetti

Chiedere approvazione prima di modificare:

- `src/App.jsx`;
- `.env*`;
- `package.json`;
- `playwright.config.*`;
- Supabase client/auth files;
- migration SQL;
- route staff/customer già funzionanti;
- file TV/Jukebox se non sono nello scope.

---

## 5. Quality gates

Dopo implementazione:

1. `npm run build`;
2. test mirato se esiste;
3. diff review;
4. segnalazione rischi;
5. no commit automatico salvo richiesta.

---

## 6. Stop conditions

Fermati se:

- il task richiede modifiche a file protetti non autorizzati;
- il build fallisce per cause non legate alla modifica;
- servono credenziali/env mancanti;
- la modifica diventa più grande del previsto;
- trovi incoerenza tra documentazione e repo reale;
- non sai quale route è attiva.

---

## 7. Regola per Eros

Eros vuole prompt chirurgici, non piani enormi.

Alla fine di ogni risposta, fornire sempre:

```md
## Prompt prossimo step
[Prompt breve pronto da copiare]
```

---

## 8. Principio finale

Claude non deve “fare tanto”.

Claude deve fare la cosa giusta, piccola, verificata e reversibile.
