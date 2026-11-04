# RUNBOOK — Push Food Club (I-5)

_Stato: file locali pronti, **nulla deployato**. Ogni passo qui sotto è un gate di Eros._
Codice: `supabase/functions/send-food-club-push/` (`index.ts`, `logic.js`, `logic.test.js`).
SQL già nella migration `20261105102000_food_club_v1_identity_api.sql`: `food_club_push_claim_batch`,
`food_club_push_report`, `food_club_push_tick` (il cron NON è schedulato).

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

## 3. Cron (gate Eros, dopo §1 e §2)
```sql
SELECT cron.schedule('food-club-push', '*/5 * * * *',
  $$SELECT public.food_club_push_tick('https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-food-club-push')$$);
```
Il tick chiama la funzione solo se ci sono messaggi `queued` con `push_after <= now()`. Senza secret in Vault
scrive un WARNING e non chiama nulla. Per spegnere: `SELECT cron.unschedule('food-club-push');`.

## 4. Comportamento
- Batch da 50, budget ~25 s (il tick chiude a 30 s); i messaggi oltre budget tornano in coda (`time_budget`).
- Un invio per sottoscrizione (timeout 8 s, TTL 12 h), nessun retry interno: ritenta il DB ogni 5 min, max 3 tentativi.
- 404/410 → endpoint passati a `food_club_push_report`, che cancella la sottoscrizione.
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
