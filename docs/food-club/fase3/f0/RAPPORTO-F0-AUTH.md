# RAPPORTO F0 – Supabase Auth (anonimo → telefono) su stack locale isolato

Data: 2026-11-04. Stack: progetto `walbox-f0-auth`, porte +1000 (API 55321, DB 55322). CLI 2.117.0 (binario `/Users/erosallonato/.npm-global/bin/supabase`: nel repo `node_modules/.bin/supabase` NON esiste). Nessun file del repo modificato; nessun comando verso produzione.

## Esiti (run 2, config con `enable_confirmations = true`)

| Esp | Esito | Evidenza (VERIFICATO) |
|---|---|---|
| E1 | PASS | `signInAnonymously` -> uid `e7146d11`, is_anonymous=true (user e JWT). 2 ordini + 1 push inseriti e visibili con RLS. |
| E2 | PASS | `updateUser({phone})` -> `new_phone` valorizzato, `phone` vuoto. `verifyOtp(phone_change,123456)` ok. uid INVARIATO `e7146d11`, is_anonymous=false, ordini (2) e push (1) ancora visibili. Il claim JWT era già aggiornato (is_anonymous=false, phone) subito dopo verifyOtp: il client riceve nuova sessione dal verify, non serve refreshSession. Il VECCHIO access token anonimo: `getUser(oldToken)` restituisce lo stato aggiornato (is_anonymous=false, phone) perché getUser legge dal DB; usato come Bearer su PostgREST funziona ancora (2 ordini visibili, perché uid uguale, claim `is_anonymous` stantio dentro il vecchio JWT fino a scadenza). |
| E3 | PASS | Dispositivo B: `signInWithOtp`+`verifyOtp(sms)` -> stesso uid `e7146d11`, vede 2 ordini e 1 push. A e B restano entrambi loggati (getUser, refreshSession ok per entrambi): sessioni multiple contemporanee. |
| E4 | PASS (percorso proposto) | `updateUser({phone: già usato})` fallisce: **HTTP 422, code `phone_exists`, msg "A user with this phone number has already been registered"**; C resta anonimo (uid `3859f62c`). Percorso biglietto: `create_merge_ticket()` da anonimo ok (token 64 hex) -> `signInWithOtp`+`verifyOtp(sms)` sullo stesso client -> uid `e7146d11` (=A) -> `redeem_merge_ticket` ritorna 1 -> ordine da 99 ora visibile come ordine di A (totali [10,20,99]), visto sia da C che da A. L'utente anonimo C (`3859f62c`) resta in auth.users come orfano. |
| E5a riuso | PASS (fallisce) | `P0001 "biglietto gia usato"` |
| E5b scaduto | PASS (fallisce) | `P0001 "biglietto scaduto"` (expires_at forzato via psql) |
| E5c da anonimo | PASS (fallisce) | `42501 "serve utente non anonimo"` |
| E5d altro utente telefono (P2) | LIMITE confermato | RIESCE: moved=1, l'ordine passa all'utente `0f90b744`. Il ticket è un segreto al portatore. |
| E5e create da non anonimo | PASS (fallisce) | `42501 "solo utenti anonimi"` |
| E5f ruolo anon senza sessione | PASS (fallisce) | `42501 permission denied for function` (sia create che redeem) |
| E5 extra | PASS | select diretto su `identity_merge_tickets` da authenticated: `42501 permission denied for table`; token inventato: `P0002 "biglietto non valido"`; anonimo con telefono solo "pending" non può riscattare (`42501`). |
| E6 | PASS | Anonimo D con numero mai visto (P3): updateUser + verifyOtp phone_change -> uid invariato `2714c403`, is_anonymous=false, ordine visibile. |
| E7 | PASS (comportamento da conoscere) | `signInWithOtp` con numero nuovo su client anonimo: crea utente NUOVO (`8072118f`, uid diverso); l'anonimo `d7877fff` resta orfano in auth.users con il suo ordine, non più visibile al client (0 ordini). Nessun merge automatico. |
| E8 | PASS | Vedi tabella sotto. |

### E8 – auth.users a fine run 2
```
e7146d11 anon=false phone=393330000001 (A/B/C-dopo-login)
3859f62c anon=true  (C orfano, ticket riscattato)
56bc4130 anon=true  (E, ticket scaduto)
ec5967da anon=true  (F; ticket intercettato e riscattato da 0f90b744)
216b29d6 anon=true  (G)
0f90b744 anon=false phone=393330000002 (H)
5e5554dd anon=true  (K, phone pending non confermato)
2714c403 anon=false phone=393330000003 (D convertito)
d7877fff anon=true  (Q orfano, E7)
8072118f anon=false phone=393330000004 (utente nuovo E7)
```
Ordini finali: e7146d11 -> 10,20,99; 56bc4130 -> 7; 0f90b744 -> 5 (da F); 2714c403 -> 3; d7877fff -> 1.

## Differenze di config rispetto al repo
project_id `walbox-f0-auth`; tutte le porte +1000 (api, db, shadow, pooler, studio, local_smtp, analytics, edge inspector 8083->9083); `[auth] enable_anonymous_sign_ins=true`; `[auth.sms] enable_signup=true`; **`[auth.sms] enable_confirmations=true`** (repo: false, vedi sotto); `[auth.sms.test_otp]` 393330000001..05 = 123456; `[auth.sms.twilio] enabled=true, account_sid="ACtest", message_service_sid="MGtest", auth_token="test"`. Rate limit non toccati. `max_frequency` SMS = 5s: ho aggiunto attese di 5,5 s negli script (nel primo run C aveva preso `over_sms_send_rate_limit` 429, innocuo perché il verifyOtp successivo ha funzionato col codice test).

## Problemi incontrati / scoperte importanti
1. **`enable_confirmations = false` (valore nel config del repo) è pericoloso per questo flusso.** Run 1 (output in `out-run1-confirmations-false.txt`): `updateUser({phone})` su anonimo applica il telefono SUBITO, senza OTP: phone_confirmed_at valorizzato, is_anonymous=false, e `verifyOtp(phone_change)` poi fallisce con `otp_expired` 403. Quindi chiunque può "reclamare" un numero senza verificarlo (e bloccarlo per il vero proprietario: `phone_exists`; nel run 1 l'utente K ha preso P3 e E6 è fallito per questo). **VERIFICATO in locale; DA CONTROLLARE sul progetto di produzione** (impostazione "Confirm phone" del dashboard, non leggibile da qui): se in produzione è disattivata, il piano non è sicuro.
2. Il binario supabase non è in `walbox-kitchen-release/node_modules/.bin`: usato quello globale.
3. Sul vecchio JWT anonimo: il claim `is_anonymous` resta true dentro il token fino a scadenza/refresh. Chi usa il claim (come `create_merge_ticket`) vede lo stato del token, non del DB. Dopo la verifica il client ha già token nuovo, quindi in uso normale non è un problema.

## Limiti del prototipo (VERIFICATO salvo dove indicato)
- Ticket al portatore: chiunque abbia un telefono confermato e il token entro 10 minuti può spostare gli ordini dell'anonimo (E5d). Va tenuto solo in memoria/sessionStorage, mai in URL/log, scadenza breve. Mitigazione possibile (DEDOTTO, non testata): legare il riscatto al numero atteso o richiedere che il ticket sia usato nella stessa sessione di dispositivo.
- L'anonimo origine resta in auth.users (orfano, nessuna cancellazione fatta). Dopo il merge il suo vecchio token anonimo, finché vale, può ancora creare ordini a suo nome (DEDOTTO dal fatto che l'utente esiste ancora).
- `signInWithOtp` con numero nuovo da anonimo NON converte: crea un secondo utente (E7). L'app deve usare `updateUser({phone})` per il primo dispositivo e il flusso biglietto per i numeri già esistenti.
- Il `moved` ritornato somma ordini e push; push endpoint `unique` non è stato stressato (conflitto di endpoint tra anon e utente telefono non testato).
- Test su GoTrue locale con OTP finto: invio SMS reale, costi e rate limit di produzione (provider reale) NON verificati.

## File finali
- Config: `/private/tmp/claude-501/-Users-erosallonato-Desktop-02-PROGETTI-progetti-antigravity-progetti-walbox-kitchen-release/07a597af-bcfa-4251-aaf4-a6ac4a033d89/scratchpad/f0-auth/supabase/config.toml`
- Migration: `.../f0-auth/supabase/migrations/20261104000000_f0_schema.sql`
- Script: `.../f0-auth/run.mjs`
- Output: `.../f0-auth/out.txt` (run 2, confirmations=true), `.../f0-auth/out-run1-confirmations-false.txt` (run 1)

## Chiusura
Stack `walbox-f0-auth` fermato con `--no-backup`. Nessun file del repo modificato (git status invariato rispetto all'avvio). Nessun `rm`.
