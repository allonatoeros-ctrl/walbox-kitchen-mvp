# PRIVACY / GDPR — file di stato

Audit completo e fonti: `ai-ops/reports/privacy-gdpr-audit-20261030.md` (gitignored). Leggere solo le sezioni 4 e 5 se serve.

## ORA
- Data: 2026-10-30 · Branch: `feat/restyling-hero` (working tree con altre modifiche non tue: mai `git add -A`, nessun commit senza OK di Eros).
- Fase: **Fase 1 chiusa e committata (30/10): `67a951c` font, `5675b4e` privacy, + commit docs. Nessun push.** Task 1–9 fatti + fix post review (V-01 opzione 2, V-02, push dopo ricarica, "Torna al menu"). Build PASS, test lib 215/217 (1 fail preesistente kitchenMenuCopy), lint: nessun errore nuovo. Visual: P0 0 · P1 0 · P2 3 · ENV_BLOCKER 2 (TV senza sessione staff, gate push senza VAPID). Report: `ai-ops/reports/privacy-fase1-20261030.md`, `ai-ops/reports/privacy-fase1-visual-20261030.md`. Nessun commit.
- DECISO V-01 (Eros 30/10, opzione 2): chip ALLERGIA tenuto; avviso e informativa dichiarano allergie = dato sanitario facoltativo, cancellato dopo 30 gg. **Non pubblicare prima della Fase 2** (la cancellazione a 30 gg oggi non esiste) e prima di compilare i `[[DA COMPILARE]]`.
- Aperti P2: V-03 avviso alcol allunga la barra checkout di ~46px; V-05 vecchio "CHIEDI AL BANCO" nelle card "allergeni da confermare"; V-06 gate push (dedotto, non visto). Mancano lupini e molluschi nella mappa allergeni. GRANT DELETE su `kitchen_push_subscriptions` da verificare (Fase 2).
- **GATE 1 FASE 2 APPROVATO (Eros 30/10, "Sì, giorni proposti"):** 2A + 2B + 2C. Giorni: nickname/note 30 · raw pagamenti 90 · analytics 90 · push 180 · **utenti anonimi 90** (inclusi in v1, Fanta non c'è più; prima 2A verifica i legami con gli ordini).
- **2A FATTO (30/10, MCP sola lettura, solo conteggi/nomi chiave):** I2 incoerenti 0; ordini 1337, >30gg 509 (450 delivered, 59 cancelled) → prima notte 509 anonimizzati; sessioni 0; pagamenti/webhook/push/analytics >soglia 0 (dati dal 18/09); utenti anonimi inattivi >90gg 259 (0 con ordini, push o pass promo; 0 staff). Raw SumUp: nessun dato del cliente nelle chiavi (solo checkout/merchant/transazione, niente carta). Push GRANT: anon/authenticated hanno tutto (default Supabase, RLS protegge; TRUNCATE non esposto da PostgREST) → nessuna azione. `kitchen_action_log.metadata.note` sempre null; `cancel_reason` testo staff (24 valori distinti) lasciato. FK verso auth.users: push/pass/staff CASCADE, ordini/sessioni/analytics SET NULL, service_state NO ACTION. postgres può DELETE su auth.users.
- **2B scritto (non committato):** `supabase/migrations/20261030140000_kitchen_privacy_retention_v1.sql` + `.test.js` (14/14). Scelta prudente: utenti con pass promo (anche usati) non vengono cancellati. Prova locale run 1 (report `ai-ops/reports/privacy-fase2-local-20261030.md`): trovati e corretti B1 (`CREATE EXTENSION pg_cron` ripetuto rompeva l'apply: righe tolte) e O2 (erase ora salta righe incoerenti I2); con il fix 24/24. Nota: in locale manca il trigger `updated_at` su `kitchen_orders`, in produzione c'è (`_walbox_set_updated_at`, drift noto) → in prod l'anonimizzazione aggiorna `updated_at`. **Run 2 sul file vero: PASS 11/11** (68 migration applicate, job attivo, I2 saltato in erase). Limite noto: erase lanciato proprio su un ordine incoerente I2 risponde ok senza anonimizzarlo (0 righe così in prod). Test statici migration 30/10: 30/30. Stack fermo.
- **COMMIT FATTI (30/10, OK Eros):** `39063d4` migration privacy, `b2eda7d` log api. Nessun push. **DB PUSH FATTO (30/10, OK Eros "Applica"):** precheck PASS (ref pcrqfdzipotprqtuemso, unica pending 20261030140000), postcheck PASS (ledger allineato, 2 funzioni presenti, job `kitchen-privacy-retention` `37 4 * * *` UTC attivo). Prima esecuzione: 31/10 04:37 UTC (anonimizza ~509 ordini, cancella ~259 anonimi). **Prossimo passo:** verificare domani l'esito del job (cron.job_run_details, sola lettura); poi push del branch/deploy (gate). Prima di pubblicare l'informativa: compilare i `[[DA COMPILARE]]`.
- **2C FATTO (non committato):** 5 `console.error` in `api/` (`_lib/sumupCheckout.js`, `kitchen-sumup-create-checkout.js`, `kitchen-sumup-webhook.js`, `kitchen-sumup-reconcile.js`, `kitchen-staff-sumup-reconcile.js`) ora loggano solo `{status, error_code, id, message}`; 5 righe, comportamento invariato (diff visto). Test api+lib 221/223 (fail noto kitchenMenuCopy), lint nessun errore nuovo. Preesistenti fuori scope: 3 fail in tests/unit pagamenti (anche su HEAD pulito). Report `ai-ops/reports/privacy-fase2-api-logs-20261030.md`. Gate che restano: commit, `db push`, push/deploy. Prima di pubblicare compilare i `[[DA COMPILARE]]`.
- Da verificare in sola lettura (Fase 2): GRANT DELETE su `kitchen_push_subscriptions`. Mancano lupini e molluschi nella mappa allergeni.
- Controllo pagamenti read-only (30/10): PASS, nessuna regressione, a SumUp non va il nickname. Aperti per Fase 2: P-01 contenuto `raw_payload` non verificato (serve 1 riga dal DB reale, gate), P-02 5 log di errore in `api/` stampano il body SumUp. Report: `ai-ops/reports/privacy-pagamenti-readonly-20261030.md`.
- Pulizia DB FATTA (30/10, vedi `DB_PULIZIA.md`): produzione = solo Kitchen, migration in `main`. Gli utenti anonimi rientrano nella Fase 2.
- Decisioni aperte: dati del pub (ragione sociale, P.IVA, contatti) → nel testo vanno segnaposto ben visibili `[[DA COMPILARE: ...]]`.

## Approvazioni di Eros (30/10, "accetto tutto")
1. Toccare `src/App.jsx` SOLO per aggiungere la rotta `/kitchen/privacy` (nessun altro cambio al routing).
2. Scaricare i font da fonte pubblica (Google Fonts / fontsource ufficiale) in `public/fonts/`, solo woff2, solo i pesi realmente usati. Il subagent elenca prima nome file, fonte e dimensioni nel suo report; i download sono approvati.
3. Raccomandazioni adottate: note libere = avviso semplice (nessun campo allergie); alcol = avviso + controllo documento al banco (nessuna conferma "ho 18 anni"); retention proposta 30 gg nickname/note, 90 gg raw pagamenti e utenti anonimi, 180 gg push (valori per Fase 2, da riconfermare nel gate).
4. Google Fonts: si fa il self-hosting (rischio NON accettato, si risolve).
Restano gate di Eros: commit, push, deploy, migration, qualsiasi modifica a `api/`, `supabase/`, `package.json`, `vercel.json`.

## Brief Fase 1 (completo, per subagent Sonnet medium)
Obiettivo: mettere l'app Kitchen in regola sul lato visibile senza cambiare layout né logica pagamenti.
File ammessi: `index.html`, `src/pages/KitchenTvScreen.css`, `public/fonts/*` (nuovi), `src/App.jsx` (solo rotta privacy), nuova pagina `src/pages/KitchenPrivacy.jsx` (+ css accanto), `src/components/kitchen/CustomerCheckout.jsx`, `src/components/kitchen/NotificationOptIn.jsx`, `src/hooks/useWebPushSubscription.js`, `src/hooks/useKitchenOrders.js` (solo pulizia cache al logout, se il logout è lì; altrimenti il file che lo gestisce), `src/lib/kitchenCheckout.js` (solo blocklist nickname), componente menu birre/checkout per l'avviso alcol, `src/components/kitchen/AllergenBadges.jsx` (solo dicitura). Vietato: `api/`, `supabase/`, `package.json`/lock, `vercel.json`, `.env*`, nuovi npm script.
Task:
1. **Font self-hosted.** grep dei font e dei pesi/stili realmente usati (index.html:14, KitchenTvScreen.css:1, CSS in src/). Scaricare solo quei woff2 in `public/fonts/`, aggiungere `@font-face` con `font-display: swap`, rimuovere `<link>`/`@import` verso fonts.googleapis.com e gstatic. Layout identico: stessi pesi.
2. **Informativa breve nel checkout**: sotto il campo nome e/o vicino al pulsante di invio, 2–3 righe in italiano + link "Informativa privacy" a `/kitchen/privacy`. Dire che il nome è visibile sulla TV del locale.
3. **Pagina `/kitchen/privacy`** (mobile-first 390/430, stile Walrus, leggibile): titolare `[[DA COMPILARE: ragione sociale, P.IVA, indirizzo, email]]`; dati trattati (nome/nickname, note, ordine e importi, pagamento tramite SumUp senza che il locale veda la carta, sessione anonima, notifiche push se attivate, memoria tecnica del browser); finalità e basi (contratto/ordine, obblighi fiscali, sicurezza/anti-abuso, consenso per le notifiche); destinatari (Supabase, Vercel, SumUp); conservazione: nickname e note 30 giorni, dati contabili secondo legge (10 anni, nei sistemi fiscali del locale), notifiche finché non disattivate o massimo 180 giorni; nessun cookie di tracciamento né profilazione; diritti e come esercitarli `[[DA COMPILARE: contatto]]`, reclamo al Garante (garanteprivacy.it); servizio per chi ha almeno 14 anni; data di aggiornamento. Link alla pagina anche in un punto fisso dell'app cliente (footer o menu), senza cambiare il layout esistente.
4. **Avviso sui dati sanitari** sotto il campo note: "Non scrivere dati sulla salute. Per allergie e intolleranze avvisa il personale al banco."
5. **Avviso alcol**: nella sezione birre e nel checkout se nel carrello c'è alcol: "Bevande alcoliche vietate ai minori di 18 anni. Al ritiro/servizio potrebbe essere richiesto un documento."
6. **Allergeni**: dicitura "Per allergeni e contaminazioni chiedi al personale" vicino ai badge; segnalare (non correggere da solo) le voci mancanti nella mappa dei 14 allergeni (lupini, molluschi) nel report.
7. **Push**: testo informativo breve nel gate di attivazione (cosa riceverai, che puoi disattivare) + pulsante/opzione per disattivare (`pushManager.unsubscribe` + cancellazione della riga tramite il canale già esistente per il proprietario; se serve una nuova RPC → STOP e segnalare, perché è database).
8. **Nickname**: blocklist semplice di parole offensive in `kitchenCheckout.js` con messaggio gentile; test unit accanto.
9. **Cache staff**: svuotare `walbox_kitchen_orders_demo` al logout staff.
Verifica: `npm run lint`, unit pertinenti (`node --test src/lib/*.test.js`), `VITE_SUPABASE_URL=http://127.0.0.1:54321 npm run build`. Poi `visual-reviewer` su 390/430 (cliente, checkout, pagina privacy) e `/kitchen/tv` prima/dopo per i font. Edge case da coprire: nickname con spazi/maiuscole/accenti nella blocklist; font mancante → fallback leggibile; push non supportato dal browser (iOS Safari non installato); carrello senza alcol → nessun avviso.
Output: report in `ai-ops/reports/privacy-fase1-<data>.md` (chat max 8 righe); diff file per file; nessun commit.

## Fase 2 (database, gate di Eros) — piano pronto, in attesa di Gate 1
Audit read-only fatto il 30/10 (solo migration e codice, nessuna query al DB reale).

**Trovato (VERIFICATO nel codice)**
- `kitchen_orders`: `nickname` NOT NULL (non si può mettere NULL → si sostituisce con `anonimo`), `note`, `customer_note`, `staff_note`.
- `kitchen_customer_sessions` (orfana) ha `nickname` NOT NULL.
- **Il rimborso legge `kitchen_payments.raw_last_event.transactions[0].id`** (`api/kitchen-sumup-refund.js:124`): svuotare il raw romperebbe i rimborsi → va **ridotto**, non azzerato.
- `kitchen_payment_webhook_events.raw_payload` NOT NULL: nessuno lo rilegge → `'{}'`.
- Push: policy DELETE "solo la propria" esiste; nessun GRANT esplicito sulla tabella (dipende dai default Supabase) → da verificare sul DB reale.
- Trigger `online_payment_lifecycle_guard` (I2): un UPDATE di nickname/note fallisce se una riga vecchia è incoerente (`paid` + `pending_online_payment`) → contare prima.
- DB condiviso con FantaWalrus (`0001_fanta_schema_v1` usa `auth.users`): cancellare utenti anonimi può toccare dati Fanta.
- pg_cron già attivo (job `kitchen-online-abandon-sweep`, `kitchen-cron-history-retention`).

**Passi**
- 2A (read-only su produzione, gate "DB reale"): via MCP solo lettura, nessun dato personale: GRANT su `kitchen_push_subscriptions`; **solo i nomi delle chiavi** di 1 `raw_last_event` (P-01); conteggio righe incoerenti I2; quante righe cadrebbero oggi in ogni regola; elenco job cron.
- 2B migration `<ts>_kitchen_privacy_retention_v1.sql` + `.test.js` (assert sul testo):
  - funzione `kitchen_privacy_retention_sweep()` SECURITY DEFINER, eseguibile solo da postgres (REVOKE da PUBLIC/anon/authenticated/service_role);
  - ordini > 30 gg: `nickname='anonimo'`, `note/customer_note/staff_note=NULL` (solo se non già fatto: idempotente). Importi, stati e date restano;
  - `kitchen_customer_sessions` > 30 gg: DELETE;
  - `raw_last_event` > 90 gg: ridotto a `{id, status, transactions:[{id, status, amount, currency}]}` (rimborso salvo);
  - `webhook_events.raw_payload` > 90 gg: `'{}'` (le righe restano, servono contro i duplicati);
  - push con `last_seen_at` > 180 gg: DELETE; analytics promo > 90 gg: DELETE;
  - job cron `kitchen-privacy-retention` ogni notte alle 04:37;
  - RPC `kitchen_privacy_erase_order(order_id, nickname)` per le richieste di cancellazione: anonimizza subito quell'ordine e cancella le push del suo cliente; solo service_role (la lancia Eros dal SQL editor). Procedura scritta in Fase 3.
  - Fuori: `kitchen_action_log` (nessun dato cliente visto), utenti anonimi (vedi decisione 2).
- 2C `api/` (P-02): 5 `console.error` loggano solo `status`, `error_code`, `id` invece del body SumUp. Commit separato.
- Verifica: lint, `node --test` migration + `api/_lib`, build con override; migration provata su Supabase locale (skill `e2e-real-local`) con ordini finti vecchi.
- Gate di Eros dopo la verifica: commit (2 commit: migration, api), poi `db push --linked` (skill `walbox-supabase-migration`) e push/deploy: decisioni separate.

**NEEDS_DECISION**
1. Riconferma giorni: nickname/note 30 · raw pagamenti 90 · analytics 90 · push 180.
2. Utenti anonimi: **consigliato escluderli dalla v1** (rischio dati FantaWalrus); si riprende con un task dedicato.
3. Chiedere al commercialista resta valido, ma il piano non cancella importi né ordini: nessun conflitto con la conservazione fiscale.

Modello/effort: 2A e 2B sessione principale con `/effort high` (dati e pagamenti); 2C subagent Sonnet medium; verifica a campione in sessione principale.

## Fase 3 (documenti) — non iniziata
`docs/privacy/`: registro trattamenti art. 30, procedura data breach (72 ore, servizi.gpdp.it/databreach), procedura diritti, bozza nomina art. 28 pub→Walbox, checklist DPA Supabase/Vercel/SumUp e regione dati. Poi revisione di un consulente privacy sul testo informativa. Modello: subagent Sonnet medium.

Modello/effort: Fase 1 Sonnet medium (sessione principale Opus medium coordina e rivede il diff).
