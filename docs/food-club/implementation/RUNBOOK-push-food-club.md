# RUNBOOK — Push Food Club (I-5)

_Stato: file locali pronti, **nulla deployato**. Ogni passo qui sotto è un gate di Eros._
Codice: `supabase/functions/send-food-club-push/` (`index.ts`, `logic.js`, `logic.test.js`).
SQL: `20261109102000_food_club_v1_identity_api.sql` (prima versione) ridefinito da
`20261109110000_food_club_v1_push_delivery.sql` (regole di consegna con orario esplicito, orfani, lock per utente,
finestra 17-20, promo/winback, job pg_cron). Entrambe SOLO LOCALI. Prova locale end-to-end:
`tests/push-proof/run-deno-push-proof.sh` (Deno + vera web-push contro un push service finto).

## 0. Prerequisito bloccante (I-7)
La push "ordine pronto" esistente non è **mai** stata provata su telefono e le VAPID non sono verificate (A9).
Prima di questo runbook: prova reale di `send-order-ready-push` su iPhone e Android (vedi §5). Se fallisce,
fallisce anche il Club: stesso SW, stesse VAPID.

## 1. Secret (mai nel repo, mai in chat)
| Dove | Nome | Valore |
|---|---|---|
| Vault Supabase | `food_club_push_secret` | stringa casuale lunga (es. 48 byte base64), generata da Eros |
| Env Edge Function | `FOOD_CLUB_PUSH_SECRET` | **lo stesso valore** del secret Vault |
| Env Edge Function | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | già usate da `send-order-ready-push` (secret di progetto condivisi tra funzioni) |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` le inietta la piattaforma.
Senza `FOOD_CLUB_PUSH_SECRET` la funzione risponde 401 a tutto. Senza VAPID ogni messaggio reclamato viene chiuso
con `p_error='vapid_not_configured'` → `push_status='failed'`, nessun retry.

## 2. Deploy funzione (gate Eros)
```bash
npx supabase secrets set FOOD_CLUB_PUSH_SECRET=<valore>   # da terminale di Eros, non da agente
npx supabase functions deploy send-food-club-push --no-verify-jwt
```
`--no-verify-jwt`: l'auth è il Bearer condiviso (come `send-order-ready-push`, verify_jwt=false).
Verifica: `curl -X POST <URL> ` senza header → 401; con header giusto e coda vuota → 200 + log `empty_batch`.

## 3. Cron (creato dalla migration 20261109110000 al `db push`)
La migration schedula `food-club-push` (`*/5 * * * *` → `food_club_push_tick('https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-food-club-push')`)
(il winback **non** è schedulato: NEEDS_DECISION, vedi CLOUD_HANDOFF §8). Il job gira subito dopo il `db push`, ma **finché il secret Vault
`food_club_push_secret` non esiste** scrive solo un WARNING e non chiama nulla (provato su pg_cron/pg_net/Vault reali
dello stack Supabase locale, 2026-11-09). Il secret in Vault è quindi l'interruttore: va creato **per ultimo**, dopo §1
(env della funzione) e §2 (deploy). Spegnere: togliere il secret Vault (immediato) oppure
`SELECT cron.unschedule('food-club-push');` (migration dedicata).

## 4. Comportamento
- Batch da 50, budget ~25 s (il tick chiude a 30 s): un messaggio parte solo se restano almeno 8 s (un invio intero);
  gli altri tornano subito in coda con `time_budget`, **senza consumare un tentativo**.
- Un invio per sottoscrizione (timeout 8 s anche sotto Deno, TTL 12 h), nessun retry interno: ritenta il DB ogni 5 min,
  max 3 tentativi, poi `failed`. Messaggi rimasti `sending` > 10 min (funzione caduta): in coda se < 3 tentativi,
  altrimenti `failed` (`orphan_max_attempts`); il tick parte anche solo per recuperarli.
- 404/410 → endpoint passati a `food_club_push_report`, che cancella la sottoscrizione; se non ne resta nessuna
  `club`, il messaggio diventa `skipped` (`no_club_subscription`), senza retry.
- Due tick concorrenti non mandano due notifiche allo stesso utente (advisory lock per utente, test di concorrenza).
- Regole (D-19, valori proposti): fascia 22:30-10:00 (passano solo timbro e buono sbloccato), 1 notifica al giorno,
  `voucher_expiring` solo 17:00-20:00 e saltato a campagna spenta, buono già usato = niente avviso, promo/winback
  solo con consenso marketing valido al momento dell'invio e mai nell'ora di un ordine, promo max 1/7 giorni e 2/mese.
- **Da verificare al primo deploy**: sotto Deno CLI `web-push` richiede il permesso `--allow-sys` (legge `os.ca`);
  senza, ogni invio fallisce come `network`. Se i log della funzione mostrano `error_code: network` su tutti gli invii,
  è questo (Edge Runtime di Supabase non provato).
- Osservato nella prova locale: un endpoint che non risponde riceve la richiesta due volte prima del timeout (stesso
  `tag`: il telefono mostra una sola notifica). Causa non verificata.
- Payload: `{ title, body, tag: 'food-club-<kind>', url, data: { url, kind } }`; l'URL ha già `?n=<messageId>`.
- Log: una riga JSON per messaggio (`event_type: food_club_push`), mai endpoint/chiavi/testi.

## 5. Prova reale richiesta PRIMA di dichiararla funzionante
Dispositivi: **iPhone con iOS ≥ 16.4, Walbox installata sulla Home e aperta dall'icona** (in Safari la push su iOS
non esiste) + **un Android con Chrome**.
1. Ordine pronto (I-7): attiva notifiche dallo stato ordine → staff segna pronto → notifica arriva, click apre lo stato.
2. Club: membro iscritto con "Avvisi tessera e premi" attivo e sottoscrizione `club` → timbro → entro 5 min notifica
   "+1 TIMBRO"; click apre `/kitchen/club/tessera?n=…` (app in primo piano se già aperta).
3. Due messaggi dello stesso tipo: la seconda notifica sostituisce la prima (tag).
4. Disinstalla la PWA / revoca permesso → invio successivo: log con gone ≥ 1 e riga sottoscrizione cancellata.
5. Fascia 22:30-10:00: un `voucher_expiring` resta in coda fino alle 10:00.
Esito da annotare in `CHECKPOINT.md`. Finché i punti 1-2 non passano su entrambi i telefoni, la push resta "non verificata".
