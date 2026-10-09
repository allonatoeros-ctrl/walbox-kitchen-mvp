---
name: e2e-real-local
description: Esegue gli E2E "real" di Walbox Kitchen (tests/e2e-real/) su Supabase LOCALE via OrbStack, senza che Eros debba ricordarlo. Usala per qualsiasi richiesta di E2E reali, gate S1/P2, verifica TV/Solo/Prep con sessione staff reale, Realtime o RLS su stack locale.
---

# E2E Real Local (OrbStack)

Eros ha OrbStack come runtime Docker: usalo SEMPRE per questi test, senza chiedere conferma sul runtime.
Mai Supabase remoto/production, mai `.env.local` (è un pull Vercel).

## 1. Pre-flight (read-only, obbligatorio)

1. `pwd`, `git branch --show-current`, `git status --short > <scratchpad>/status_before.txt` (WIP da preservare).
2. `docker context show` deve essere `orbstack`; `docker info` deve rispondere. Se no: chiedi a Eros di avviare OrbStack (`open -a OrbStack`) e fermati.
3. Porte 54321/54322 libere e nessun container Supabase di altri progetti attivo (`docker ps`). Se occupate da un altro progetto: STOP e chiedi.
4. Lo script `scripts/e2e-real-supabase-local.sh` usa workdir temporaneo, `project_id = walbox-kitchen-e2e-local`, `stop --no-backup` solo di quello; `playwright.real-local.config.js` rifiuta URL non locali. Rileggili solo se sono cambiati (`git diff HEAD -- scripts playwright.real-local.config.js`).

## 2. Prerequisiti

- Supabase CLI: se manca `supabase`, lo script usa `npx supabase` (cache npx, ufficiale). Non modificare package.json/lockfile.
- Chromium Playwright: se manca (`Executable doesn't exist`), `npx playwright install chromium` (cache utente, fuori dal repo).

## 3. Esecuzione

```
scripts/e2e-real-supabase-local.sh tests/e2e-real/<spec>.spec.js > <scratchpad>/e2e.log 2>&1
```

Timeout 600000, il primo avvio può scaricare immagini. Output su file, in chat solo il riepilogo (Silent First).
Spec noti: `kitchen-orders-p2-live-window.spec.js` (Solo/Storico/TV+Prep, login staff reale), `kitchen-real-order.spec.js`.

## 4. Post-run

- Lo stack si ferma da solo (trap); verifica `docker ps -a | grep e2e-local` = 0.
- `git status --short | diff - status_before.txt` deve essere identico; `test-results/` è ignorato.
- Non modificare test per farli passare; test non eseguiti = BLOCKED, mai PASS.
- Se emerge un bug: descrivi il fix minimo, non applicarlo senza Gate 1.

## 5. Limiti noti

Nessuno spec copre TV senza sessione, riconnessione Realtime, login dopo il mount, esclusione di `pending_online_payment`/`payment_abandoned`: coperti solo da `tests/unit/s1-staff-hardening.test.mjs`. Nuovi spec = file nuovi → serve approvazione.

## 6. Output

VERDETTO PASS/FAIL/BLOCKED · evidence (spec, n. test, ambiente) · regressioni · stato Git · COMMIT_READY/FIX_REQUIRED.
