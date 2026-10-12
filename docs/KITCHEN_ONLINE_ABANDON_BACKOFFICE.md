# Kitchen — Chiusura automatica a 5 minuti (S6): attivazione e back-office

Creato 2026-10-12 (S6 di `docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md`). Per Eros: come si accende, come si controlla,
dove guardare le anomalie. Nessuna UI cassa: le anomalie dell'online non arrivano mai alla cassa.

## Come funziona (in breve)

- Ogni minuto Supabase (`pg_cron`) esegue `kitchen_online_abandon_sweep_tick()`: un solo controllo sul DB
  ("c'è un ordine online non pagato da più di 5 minuti?"). Se **no**, finisce lì: nessuna chiamata a Vercel né a SumUp.
- Se **sì**, chiama `/api/kitchen-online-abandon-sweep` su Vercel con un secret dedicato. Lo sweep, per ogni ordine:
  disattiva il checkout SumUp e lo rilegge → **pagato**: l'ordine va in cucina (`received`) · **chiuso / mai nato**:
  ordine `payment_abandoned` · **incerto** (SumUp non risponde, dati ambigui): non cambia nulla e riprova.
- Un ordine incerto da più di 15 minuti scrive **una** riga `online_abandon_stuck` nel log e da lì viene
  ricontrollato ogni 10 minuti (non ogni minuto), per non consumare chiamate.

## Attivazione (ordine obbligato, ogni passo è un gate di Eros)

1. **Secret.** Genera un valore casuale lungo (es. `openssl rand -hex 32` nel tuo terminale, non incollarlo in chat).
   - Vercel → progetto `walbox-from-zero-v2` → Settings → Environment Variables → `KITCHEN_ABANDON_SWEEP_SECRET`
     (Production) = quel valore.
   - Supabase → SQL Editor del progetto `pcrqfdzipotprqtuemso`:
     `select vault.create_secret('<valore>', 'kitchen_abandon_sweep_secret');`
   Stesso valore nei due posti. Non è `CRON_SECRET`: tenerli separati.
2. **Deploy API** (push su `main`). Poi smoke: `node scripts/post-deploy-smoke.mjs https://walbox-from-zero-v2.vercel.app`.
   Lo sweep deve rispondere `401 unauthorized`; `500 server_configuration_error` = env del passo 1 mancante
   (la env vale solo per i deploy fatti **dopo** averla creata).
3. **db push** della migration `20261012120000_kitchen_online_abandon_cron_v1.sql`
   (`npx supabase migration list --linked` prima e dopo). Da qui il job gira ogni minuto.
4. **Verifica consumo** (sola lettura, subito dopo e dopo la prima serata): query sotto.

Rollback del cron: `select cron.unschedule('kitchen-online-abandon-sweep');` (in una migration dedicata, gate di Eros).
Senza il secret nel Vault il tick non chiama nulla (scrive solo un WARNING nei log Postgres quando c'è lavoro).

## Query back-office (SQL Editor, sola lettura)

Anomalie dell'online, più recenti prima:

```sql
select created_at, order_id, action, reason, from_status, metadata
from public.kitchen_action_log
where action in ('online_abandon_stuck', 'payment_confirmed_after_abandon')
order by created_at desc
limit 50;
```

- `online_abandon_stuck`: ordine online rimasto incerto oltre 15 minuti (o con soldi da riconciliare). `reason`
  dice perché (es. `checkout_unverifiable`, `provider_ref_not_found`, `paid_needs_reconciliation_lost_race`,
  `order_has_succeeded_charge`). Controllare il checkout su SumUp e decidere a mano.
- `payment_confirmed_after_abandon`: SumUp ha incassato dopo che l'ordine era già annullato per tempo. I soldi
  sono registrati (charge `succeeded`), l'ordine resta annullato. Nessun rimborso automatico: decide Eros.

Ordini online ancora aperti adesso:

```sql
select id, created_at, now() - created_at as eta, total
from public.kitchen_orders
where status = 'pending_online_payment'
order by created_at;
```

Chiusure automatiche delle ultime 24 ore:

```sql
select count(*) as abbandonati
from public.kitchen_action_log
where action = 'online_payment_abandoned' and created_at > now() - interval '24 hours';
```

## Verifica consumo (S6 punto 5)

```sql
-- Job attivi
select jobid, jobname, schedule, active from cron.job;

-- Esecuzioni ultime 24 ore per esito (atteso: solo succeeded)
select j.jobname, d.status, count(*)
from cron.job_run_details d join cron.job j using (jobid)
where d.start_time > now() - interval '24 hours'
group by 1, 2 order by 1, 2;

-- Errori recenti del job
select start_time, status, return_message
from cron.job_run_details
where status <> 'succeeded' and start_time > now() - interval '2 days'
order by start_time desc limit 20;

-- Chiamate HTTP partite verso lo sweep (pg_net tiene le risposte per circa 6 ore)
select created, status_code, error_msg
from net._http_response
order by created desc limit 50;

-- Crescita dello storico: atteso stabile intorno a 7 x 1.440 righe (+ 7 del job di retention)
select count(*), min(start_time) from cron.job_run_details;
```

Atteso: con zero ordini online scaduti nessuna riga nuova in `net._http_response` e nessuna invocazione di
`/api/kitchen-online-abandon-sweep` nei log Vercel; invocazioni = minuti con almeno un ordine online scaduto.
