# Scope Discipline — Regole sempre attive (Walbox)

> Queste regole valgono per OGNI conversazione in questo workspace.
> Non vanno ripetute nei prompt: Antigravity le legge da qui.
> Repo: walbox-from-zero-v2 · Stack: React/Vite.

## Lingua e output
- Rispondi sempre in **italiano**.
- Restituisci sempre i **nomi file esatti** e i percorsi completi (es. `src/pages/CustomerKitchenMenu.jsx`), mai descrizioni vaghe.
- A fine lavoro produci un report compatto:
  ```
  Fatto:
  File:
  Verifica:
  Problemi:
  Prossima mossa:
  ```

## Default: READ-ONLY
- Di default operi in **sola lettura**. Non modificare codice.
- Modifichi file SOLO se il prompt o il workflow corrente dichiara esplicitamente una **fase ACT** con i file in scope elencati.
- In assenza di una fase ACT esplicita: audita, proponi, NON scrivere.

## Scope
- Leggi e tocca **solo** i file indicati nello scope del task.
- **Non ispezionare file non collegati** allo scope.
- **Non fare repo scan ampi** né grep generici su tutto il progetto.
- Se per completare il task ti serve un file fuori scope: **fermati e chiedi**, non aprirlo di tua iniziativa.

## Confini di sicurezza (mai toccare senza richiesta esplicita)
- auth, database/Supabase, RLS, migration
- env, secrets, chiavi
- deploy (Vercel/produzione)
- pagamenti
- Git remoto / push
Se il task tocca una di queste aree: **fermati e segnala a Eros** prima di procedere.

## Stile delle modifiche (quando sei in fase ACT)
- Segui lo **stile esistente** del codice.
- Mantieni le modifiche **piccole e localizzate**.
- **Non introdurre refactor** non richiesti.
- **Non cambiare il layout** salvo richiesta esplicita.
- Non installare pacchetti non previsti senza chiedere.

## Dopo ogni modifica
- Verifica che **React/Vite compili** (nessun parse error).
- Controlla la **fine dei file** modificati (anti-troncamento): componente chiuso, export presente, graffe/parentesi/template coerenti. Non appendere `}` o `};` alla cieca.
- Segnala ogni file che potrebbe richiedere **revisione manuale**.

## Stop conditions
Fermati e riporta a Eros se:
- stai per toccare file fuori scope;
- compare un'azione su auth/db/env/deploy/pagamenti non prevista;
- un file sembra troncato e non ricostruibile con certezza;
- il diff mostra file inattesi;
- serve cambiare architettura rispetto al piano.

Formato stop:
```
FERMO.
Motivo:
Evidenza:
Prossima mossa consigliata:
```

## Confine finale
Questa è la sessione operativa. **Non dichiarare "done" come certificazione finale.**
Per chiudere un task servono quality gate e diff-risk review (Claude Code), poi l'approvazione di Eros.
