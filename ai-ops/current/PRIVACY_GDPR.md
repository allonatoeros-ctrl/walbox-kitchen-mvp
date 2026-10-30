# PRIVACY / GDPR — file di stato

Audit completo e fonti: `ai-ops/reports/privacy-gdpr-audit-20261030.md` (gitignored). Leggere solo le sezioni 4 e 5 se serve.

## ORA
- Data: 2026-10-30 · Branch: `feat/restyling-hero` (working tree con altre modifiche non tue: mai `git add -A`, nessun commit senza OK di Eros).
- Fase: **Fase 1 chiusa e committata (30/10): `67a951c` font, `5675b4e` privacy, + commit docs. Nessun push.** Task 1–9 fatti + fix post review (V-01 opzione 2, V-02, push dopo ricarica, "Torna al menu"). Build PASS, test lib 215/217 (1 fail preesistente kitchenMenuCopy), lint: nessun errore nuovo. Visual: P0 0 · P1 0 · P2 3 · ENV_BLOCKER 2 (TV senza sessione staff, gate push senza VAPID). Report: `ai-ops/reports/privacy-fase1-20261030.md`, `ai-ops/reports/privacy-fase1-visual-20261030.md`. Nessun commit.
- DECISO V-01 (Eros 30/10, opzione 2): chip ALLERGIA tenuto; avviso e informativa dichiarano allergie = dato sanitario facoltativo, cancellato dopo 30 gg. **Non pubblicare prima della Fase 2** (la cancellazione a 30 gg oggi non esiste) e prima di compilare i `[[DA COMPILARE]]`.
- Aperti P2: V-03 avviso alcol allunga la barra checkout di ~46px; V-05 vecchio "CHIEDI AL BANCO" nelle card "allergeni da confermare"; V-06 gate push (dedotto, non visto). Mancano lupini e molluschi nella mappa allergeni. GRANT DELETE su `kitchen_push_subscriptions` da verificare (Fase 2).
- Prossimo passo: Fase 2 database (retention 30/90/180 gg, verifica GRANT DELETE push) con gate di Eros; prima di pubblicare compilare i `[[DA COMPILARE]]`. Push del branch: decisione di Eros.
- Da verificare in sola lettura (Fase 2): GRANT DELETE su `kitchen_push_subscriptions`. Mancano lupini e molluschi nella mappa allergeni.
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

## Fase 2 (database, gate di Eros) — non iniziata
Migration retention + cron di pulizia (nickname/note, raw payload SumUp, push, utenti anonimi, analytics promo), RPC admin "cerca per orderId+nickname → anonimizza/cancella" per i diritti, ridurre i log Vercel del body SumUp (`api/`, area protetta). Modello: sessione principale `/effort high`.

## Fase 3 (documenti) — non iniziata
`docs/privacy/`: registro trattamenti art. 30, procedura data breach (72 ore, servizi.gpdp.it/databreach), procedura diritti, bozza nomina art. 28 pub→Walbox, checklist DPA Supabase/Vercel/SumUp e regione dati. Poi revisione di un consulente privacy sul testo informativa. Modello: subagent Sonnet medium.

Modello/effort: Fase 1 Sonnet medium (sessione principale Opus medium coordina e rivede il diff).
