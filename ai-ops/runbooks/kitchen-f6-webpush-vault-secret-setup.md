# F6 Phase 2 — Vault secret & VAPID setup (runbook, NON eseguito)

Questo file è documentazione operativa, non codice: nessun comando qui è stato eseguito da
Claude Code in questa sessione. Da eseguire manualmente da Eros (o con approvazione esplicita
dedicata) solo al momento del Gate 2 di deploy — mai come parte di una migration versionata.

Contesto: `supabase/migrations/20260924130000_kitchen_orders_ready_push_identity_v1.sql` legge un
secret Vault di nome `kitchen_push_webhook_secret` per autenticare la chiamata
trigger → Edge Function. Il valore del secret non deve MAI comparire in un file committato.

## 1. Genera il secret condiviso (valore casuale, una tantum)

```
openssl rand -base64 32
```

Copia l'output solo in un password manager / variabile d'ambiente locale, mai in un file del repo.

## 2. Crea il secret in Supabase Vault (SQL Editor o CLI, MAI in una migration)

```sql
select vault.create_secret('<valore generato al passo 1>', 'kitchen_push_webhook_secret');
```

## 3. Configura lo stesso valore come secret della Edge Function

```
supabase secrets set KITCHEN_PUSH_WEBHOOK_SECRET=<stesso valore del passo 1> --project-ref <project-ref>
```

La Edge Function (`supabase/functions/send-order-ready-push/index.ts`) confronta l'header
`Authorization: Bearer <...>` in arrivo con questo valore — se non combaciano, `401`.

## 4. Genera e configura le chiavi VAPID (oggi assenti in ogni ambiente)

```
npx web-push generate-vapid-keys
```

- Pubblica → `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (env Vercel, già letta da `src/lib/webPush.js`).
- Privata → secret Edge Function:
  ```
  supabase secrets set VAPID_PRIVATE_KEY=<...> VAPID_PUBLIC_KEY=<...> VAPID_SUBJECT=mailto:<contatto reale> --project-ref <project-ref>
  ```

## 5. Sostituisci il placeholder URL nella migration

In `20260924130000_kitchen_orders_ready_push_identity_v1.sql`, la funzione
`kitchen_orders_ready_push_dispatch` contiene `v_edge_function_url text := '<KITCHEN_PUSH_EDGE_FUNCTION_URL>'`
— va sostituito con l'URL reale della Edge Function deployata
(`https://<project-ref>.supabase.co/functions/v1/send-order-ready-push`) prima di applicare la
migration. Non è un segreto, ma non ha senso fissarlo prima che la funzione sia effettivamente
deployata.

## Ordine di apply (nessuno step eseguito qui)

1. Deploy Edge Function (`supabase functions deploy send-order-ready-push`).
2. Step 3 e 4 sopra (secrets Edge Function).
3. Step 2 sopra (Vault secret DB-side).
4. Sostituisci il placeholder URL (step 5), poi `supabase db push` sulla migration.

Ogni singolo step richiede approvazione esplicita di Eros (CLAUDE.md §5/§10-11, aree protette
Supabase + secrets). Nessuno step è stato eseguito in questa sessione.
