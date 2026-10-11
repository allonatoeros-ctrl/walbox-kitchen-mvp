# F6 Phase 2 — Vault secret & VAPID setup (runbook)

**AGGIORNATO 2026-09-24 (F6 closeout sprint).** Stato reale oggi: Edge Function `send-order-ready-push`
ACTIVE su `pcrqfdzipotprqtuemso`, 3 migration F6 già applicate al remoto, trigger DB→Edge Function
già live (URL già finalizzato in `20260924130000_kitchen_orders_ready_push_identity_v1.sql`, lo
step "sostituisci placeholder" sotto è quindi già fatto, lasciato solo come riferimento storico).
**Problema noto:** `KITCHEN_PUSH_WEBHOOK_SECRET` (Edge Function) risulta disallineato dal Vault
secret `kitchen_push_webhook_secret` — log reali mostrano `401 auth_rejected` su invocazioni vere
del trigger. Questo file resta documentazione operativa, non codice: nessun comando qui è stato
eseguito da Claude Code in questa sessione (il worktree corrente non ha CLI Supabase/Vercel né
tool per impostare secrets Edge Function/env Vercel — vedi
`ai-ops/reports/kitchen-f6-webpush-closeout-sprint-audit-20260924.md`). Da eseguire manualmente da
Eros. Il valore del secret non deve MAI comparire in un file committato.

## A. Rotazione webhook secret (risolve il mismatch noto)

### A.1 Genera un nuovo valore condiviso

```
openssl rand -base64 32
```

Copia l'output solo in un password manager / variabile d'ambiente locale, mai in un file del repo.

### A.2 Aggiorna il secret Edge Function

```
supabase secrets set KITCHEN_PUSH_WEBHOOK_SECRET=<valore appena generato> --project-ref pcrqfdzipotprqtuemso
```

### A.3 Aggiorna lo stesso valore in Supabase Vault (SQL Editor o CLI, MAI in una migration)

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'kitchen_push_webhook_secret'),
  '<stesso valore del passo A.1>'
);
```

Se la entry Vault non esistesse ancora (non dovrebbe, ma in caso): usa
`select vault.create_secret('<valore>', 'kitchen_push_webhook_secret');` invece.

### A.4 Smoke test

```
curl -i -X POST https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-order-ready-push
```
→ atteso `401 unauthorized` (nessun header Authorization).

```
curl -i -X POST https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-order-ready-push \
  -H "Authorization: Bearer <valore appena generato>" \
  -H "Content-Type: application/json" \
  -d '{"bad":"payload"}'
```
→ atteso: supera l'auth (non più 401), fallisce sulla validazione del body (400, `order_id`/
`ready_event_id` mancanti) — conferma che il secret combacia senza dover leggere nulla in chiaro
lato Claude Code.

### A.5 Verifica log

Supabase Studio → Edge Functions → `send-order-ready-push` → Logs, o
`mcp__supabase__query_logs` (read-only), per confermare che le invocazioni reali successive non
siano più `auth_rejected`.

## B. VAPID keypair

### B.1 Genera (se non già confermata esistente una coppia valida — verificare con Eros prima di
rigenerare, rigenerare invalida eventuali subscription già registrate lato client)

```
npx web-push generate-vapid-keys
```

### B.2 Configura sulla Edge Function

```
supabase secrets set VAPID_PUBLIC_KEY=<pubblica> VAPID_PRIVATE_KEY=<privata> VAPID_SUBJECT=mailto:allonatoeros@gmail.com --project-ref pcrqfdzipotprqtuemso
```

Mai stampare/loggare la chiave privata. Solo la pubblica esce da questo step (va al frontend, C).

## C. Frontend — Vercel env

```
vercel env add VITE_WEB_PUSH_VAPID_PUBLIC_KEY production
```
(incolla solo la chiave **pubblica** generata al passo B.1, project `walbox-from-zero-v2`)

Verifica:
```
vercel env ls production
```
→ deve comparire `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` nella lista (nomi soli, nessun valore va
stampato in chat/log).

## Ordine consigliato

1. Sezione A (rotazione + smoke) — risolve il mismatch noto, indipendente dal resto.
2. Sezione B (VAPID) — solo dopo conferma con Eros se una coppia esiste già o va generata ex-novo.
3. Sezione C (Vercel env) — richiede la chiave pubblica dello step B.
4. Solo dopo A+B+C: GATE FINALE con Eros per push `main` + deploy frontend (vedi CHECKPOINT.md →
   NEXT STEP → F6 Web Push).

Ogni singolo step richiede approvazione esplicita di Eros (CLAUDE.md §5/§10-11, aree protette
Supabase + secrets + Vercel). Nessuno step è stato eseguito da Claude Code in questa sessione.
