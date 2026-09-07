# Security Policy — AI Factory Router (Walbox)

> Policy minima per qualsiasi agente/router che esegua task all'interno di questo repo
> per conto della AI Business Factory (`ai-ops/`, vedi [README.md](README.md)).
> Non sostituisce CLAUDE.md — lo riafferma in forma di regole operative per il router.
> Audit di sicurezza applicativa (RLS, spam, contenuti pubblici) restano compito di `walbox-hardening`,
> non di questa policy.

---

## 1. Default: read-only

Ogni run del router parte in modalità read-only.
Nessuna scrittura su file, database o configurazione è consentita finché non è esplicitamente approvata da Eros per quel task specifico.

## 2. Write solo con approvazione

Scritture su file (creazione, modifica, rinomina, cancellazione) sono permesse solo:
- su file/cartelle esplicitamente elencati nello scope approvato del task;
- dopo che Eros ha approvato il plan (Gate 1, vedi `ai-ops/templates/ticket.md`).

Nessuna scrittura "di cortesia" fuori scope, anche se minima o apparentemente innocua.

## 3. No git push automatico

Il router non esegue mai `git push`. Commit e push restano decisioni umane di Eros (CLAUDE.md §11, §16).

## 4. No deploy automatico

Il router non esegue mai deploy (`vercel deploy` o equivalenti) e non modifica config di hosting/build/redirect.

## 5. No database write automatico

Il router non esegue mai scritture dirette su Supabase (insert/update/delete, migrazioni, modifiche a policy/RLS) per proprio conto. Le tabelle e le policy restano area protetta (CLAUDE.md §5).

### 5.1 Regola anti-drift del migration ledger (dal 2026-09-07)

Quando una migration viene approvata e applicata, **l'apply passa esclusivamente da `supabase db push --linked`**.
Sono vietati come canale di apply `mcp__supabase__apply_migration` e `supabase db query --linked -f <file>`:
generano una `version` nuova al momento dell'esecuzione invece di riusare quella del filename, quindi ogni
apply lascia nel ledger una riga che nessun file locale rivendica. È la causa provata dei due disallineamenti
del 2026-08-28 (8 righe) e del 2026-09-07 (6 righe).

Se un'emergenza approvata da Eros impone comunque un apply fuori da `db push`, la riconciliazione del ledger
(rinomina del file locale sulla version realmente registrata) va fatta **nello stesso task**, non rimandata.

Verifica minima prima di chiudere qualunque task che tocca `supabase/migrations/`:
`npx supabase migration list --linked` → zero righe pending e zero righe remote-only.

## 6. No modifica env/secrets

Il router non legge, stampa, crea o sovrascrive `.env`, `.env.local`, chiavi, token o segreti in nessuna forma, nemmeno parziale o mascherata.

## 7. Comandi consentiti (allowlist)

Il router può eseguire solo questi comandi senza chiedere approvazione aggiuntiva:

```bash
git status
git diff
git diff --stat
npm run build
npm test
npx playwright test
```

Qualsiasi altro comando (`git add`, `git commit`, `git push`, `git reset`, `npm install`, `rm`, `mv`, `curl`, `sudo`, comandi di deploy, ecc.) richiede approvazione esplicita di Eros, come da CLAUDE.md §11.

## 8. CHECKPOINT.md solo come patch suggerita

Il router non modifica mai direttamente `CHECKPOINT.md`. Ogni aggiornamento proposto va presentato come patch suggerita nel report finale, in attesa che Eros la applichi o la rifiuti.

## 9. Max 1 execution pass per run

Ogni run del router esegue al massimo un singolo passaggio di esecuzione (Act) sullo scope approvato. Se il task richiede più passaggi o si espande oltre lo scope iniziale, il router si ferma e richiede un nuovo ticket/nuova approvazione invece di incatenare più pass nello stesso run.

## 10. Stop obbligatorio dopo il final report

Al termine di ogni run, dopo aver prodotto il final report, il router si ferma. Non avvia autonomamente il task successivo, non incatena un altro ticket, non procede a commit/deploy/next-step senza che Eros lo richieda esplicitamente.

---

## Rimane fuori da questa policy

- Audit di sicurezza applicativa (RLS, spam, contenuti offensivi, superficie d'attacco cliente→TV) → agente `walbox-hardening`.
- Regole di scope generali per task non automatizzati (aree protette, workflow in 9 step, formato report) → CLAUDE.md.
- QA end-to-end del flusso prodotto → agente `walbox-qa-serata`.

Questa policy vale specificamente per un futuro **router** che smisti/esegua task in automatico; finché il router non esiste, resta un riferimento preparatorio.
